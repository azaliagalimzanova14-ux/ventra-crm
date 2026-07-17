/**
 * src/lib/gmail-provider.ts
 *
 * Gmail implementation of the EmailProvider interface.
 * Uses native fetch to the Gmail REST API — no googleapis package required.
 *
 * ── OAuth scopes ──────────────────────────────────────────────────────────────
 *  gmail.modify    — read + send emails (includes gmail.readonly + gmail.send)
 *  userinfo.email  — read profile email
 *  userinfo.profile — read display name
 *
 * ── Environment variables ─────────────────────────────────────────────────────
 *  GOOGLE_CLIENT_ID       — OAuth 2.0 client ID from Google Cloud Console
 *  GOOGLE_CLIENT_SECRET   — OAuth 2.0 client secret
 *  NEXT_PUBLIC_APP_URL    — app base URL (e.g. http://localhost:3000)
 *                           Used to build the OAuth redirect URI.
 *
 * ── Outlook swap ─────────────────────────────────────────────────────────────
 *  Replace Google endpoints with Microsoft Graph API equivalents and
 *  implement a new OutlookProvider class with the same interface.
 *
 * NOTE: This file is Node.js-only. Never import from client components.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  EmailProvider,
  EmailProfile,
  EmailThread,
  EmailMessage,
  EmailAttachment,
  SendParams,
  SyncOptions,
  TokenSet,
} from "./email-provider";

// ── Google API endpoints ──────────────────────────────────────────────────────

const GOOGLE_AUTH_URL   = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL  = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GMAIL_BASE        = "https://gmail.googleapis.com/gmail/v1/users/me";
const PEOPLE_URL        = "https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

// ── Helpers ───────────────────────────────────────────────────────────────────

function getClientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_CLIENT_ID env var is not set");
  return id;
}

function getClientSecret(): string {
  const s = process.env.GOOGLE_CLIENT_SECRET;
  if (!s) throw new Error("GOOGLE_CLIENT_SECRET env var is not set");
  return s;
}

/** Decode a base64url-encoded string to UTF-8. */
function base64urlDecode(encoded: string): string {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

/** Encode a UTF-8 string to base64url. */
function base64urlEncode(text: string): string {
  return Buffer.from(text, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Parse the value of an email header (case-insensitive name search). */
function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** Map MIME type to a display kind. */
function mimeToKind(mimeType: string): EmailAttachment["kind"] {
  if (mimeType.startsWith("image/"))                                    return "image";
  if (mimeType === "application/pdf")                                   return "pdf";
  if (mimeType.startsWith("audio/"))                                    return "voice";
  if (
    mimeType.includes("word") ||
    mimeType.includes("excel") ||
    mimeType.includes("powerpoint") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("presentation") ||
    mimeType === "application/msword" ||
    mimeType === "text/plain" ||
    mimeType === "text/csv"
  ) return "document";
  return "other";
}

/**
 * Recursively collect all attachment parts from a Gmail message payload.
 * An attachment part has `body.attachmentId` (instead of inline `body.data`).
 */
function collectAttachments(part: any, out: EmailAttachment[]): void {
  if (!part) return;

  // Leaf node with an attachmentId — this is an attachment
  if (part.body?.attachmentId && part.filename) {
    const mimeType: string = part.mimeType ?? "application/octet-stream";
    out.push({
      attachmentId: part.body.attachmentId as string,
      filename:     part.filename as string,
      mimeType,
      size:         (part.body.size as number) ?? 0,
      kind:         mimeToKind(mimeType),
    });
    return;
  }

  // Recurse into multipart containers
  if (Array.isArray(part.parts)) {
    for (const p of part.parts as any[]) {
      collectAttachments(p, out);
    }
  }
}

/** Parse "Display Name <email@example.com>" or bare "email". */
function parseFrom(raw: string): { name: string; email: string } {
  const m = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  const emailOnly = raw.trim();
  return { name: emailOnly.split("@")[0] ?? "", email: emailOnly };
}

/**
 * Recursively extract the plain-text body from a Gmail message part tree.
 * Prefers text/plain; falls back to stripping HTML from text/html.
 */
function extractBody(part: any): string {
  if (!part) return "";

  // Leaf node with data
  if (part.body?.data) {
    const decoded = base64urlDecode(part.body.data as string);
    if (part.mimeType === "text/plain") return decoded.trim();
    if (part.mimeType === "text/html") {
      // Strip HTML tags for a rough plain-text fallback
      return decoded
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
    }
  }

  // multipart/* — search parts
  if (part.parts && Array.isArray(part.parts)) {
    // Prefer text/plain found anywhere in the tree
    for (const p of part.parts as any[]) {
      if (p.mimeType === "text/plain" && p.body?.data) {
        return base64urlDecode(p.body.data as string).trim();
      }
    }
    // Fall back: first non-empty part
    for (const p of part.parts as any[]) {
      const text = extractBody(p);
      if (text) return text;
    }
  }

  return "";
}

// ── GmailProvider ─────────────────────────────────────────────────────────────

export class GmailProvider implements EmailProvider {
  readonly name = "gmail" as const;

  // ── OAuth ────────────────────────────────────────────────────────────────

  buildAuthUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id:     getClientId(),
      redirect_uri:  redirectUri,
      response_type: "code",
      scope:         SCOPES,
      access_type:   "offline",   // request refresh_token
      prompt:        "consent",   // force consent to always get refresh_token
      state,
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<TokenSet> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     getClientId(),
        client_secret: getClientSecret(),
        redirect_uri:  redirectUri,
        grant_type:    "authorization_code",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gmail token exchange failed: ${err}`);
    }

    const data = await res.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    return {
      accessToken:  data.access_token,
      refreshToken: data.refresh_token,
      expiresAt:    data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined,
      scope: data.scope,
    };
  }

  async refreshTokens(refreshToken: string): Promise<TokenSet> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id:     getClientId(),
        client_secret: getClientSecret(),
        grant_type:    "refresh_token",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gmail token refresh failed: ${err}`);
    }

    const data = await res.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    return {
      accessToken:  data.access_token,
      refreshToken: data.refresh_token, // Google may rotate it
      expiresAt:    data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined,
    };
  }

  // ── Profile ──────────────────────────────────────────────────────────────

  async getProfile(accessToken: string): Promise<EmailProfile> {
    // Use Gmail profile endpoint (simpler than People API for our needs)
    const res = await fetch(`${GMAIL_BASE}/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Gmail profile fetch failed: ${res.status}`);
    const data = await res.json() as { emailAddress: string };

    // Also try People API for display name
    let displayName = data.emailAddress.split("@")[0] ?? "";
    try {
      const peopleRes = await fetch(PEOPLE_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (peopleRes.ok) {
        const pd = await peopleRes.json() as {
          names?: Array<{ displayName?: string }>;
        };
        displayName = pd.names?.[0]?.displayName ?? displayName;
      }
    } catch { /* best-effort */ }

    return {
      email:       data.emailAddress,
      displayName,
      provider:    "gmail",
    };
  }

  // ── Sync ─────────────────────────────────────────────────────────────────

  async syncThreads(accessToken: string, opts: SyncOptions = {}): Promise<EmailThread[]> {
    const maxResults = opts.maxResults ?? 50;

    // 1. List thread IDs from INBOX
    const listParams = new URLSearchParams({
      labelIds:   "INBOX",
      maxResults: String(maxResults),
    });
    if (opts.sinceDate) {
      // Gmail uses epoch seconds in the `after` query param
      const epochSec = Math.floor(new Date(opts.sinceDate).getTime() / 1000);
      listParams.set("q", `after:${epochSec}`);
    }

    const listRes = await fetch(
      `${GMAIL_BASE}/threads?${listParams.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!listRes.ok) throw new Error(`Gmail thread list failed: ${listRes.status}`);

    const listData = await listRes.json() as {
      threads?: Array<{ id: string; snippet: string }>;
    };
    const threadMeta = listData.threads ?? [];

    // 2. Fetch full thread data for each (capped to avoid rate limit in dev)
    const threads: EmailThread[] = [];

    for (const meta of threadMeta) {
      try {
        const thread = await this.fetchThread(accessToken, meta.id);
        if (thread) threads.push(thread);
      } catch {
        // Skip threads that fail (permissions, deleted, etc.)
      }
    }

    return threads;
  }

  private async fetchThread(accessToken: string, threadId: string): Promise<EmailThread | null> {
    const res = await fetch(
      `${GMAIL_BASE}/threads/${threadId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;

    const data = await res.json() as {
      id:       string;
      snippet:  string;
      messages: any[];
    };

    const messages: EmailMessage[] = [];
    let fromEmail = "";
    let fromName  = "";
    const participants = new Set<string>();
    let lastDate = "";

    for (const msg of data.messages ?? []) {
      const headers: Array<{ name: string; value: string }> = msg.payload?.headers ?? [];
      const rawFrom   = getHeader(headers, "from");
      const rawTo     = getHeader(headers, "to");
      const subject   = getHeader(headers, "subject");
      const dateStr   = getHeader(headers, "date");
      const msgId     = getHeader(headers, "message-id");
      const references = getHeader(headers, "references");

      const { name, email } = parseFrom(rawFrom);
      const toEmail = parseFrom(rawTo).email;

      // Determine outbound: message sent by the workspace Gmail account
      // Heuristic: labelIds includes "SENT"
      const labelIds: string[] = msg.labelIds ?? [];
      const isOutbound = labelIds.includes("SENT");

      const body = extractBody(msg.payload);
      const date = dateStr
        ? new Date(dateStr).toISOString()
        : new Date().toISOString();

      // Collect attachment parts
      const attachments: EmailAttachment[] = [];
      collectAttachments(msg.payload, attachments);

      if (date > lastDate) lastDate = date;
      if (email) participants.add(email);
      if (!fromEmail && !isOutbound) { fromEmail = email; fromName = name; }

      messages.push({
        id:          msg.id as string,
        threadId,
        fromEmail:   email,
        fromName:    name,
        toEmail,
        subject,
        body,
        date,
        isOutbound,
        messageId:   msgId || undefined,
        references:  references || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
    }

    // Sort oldest-first
    messages.sort((a, b) => a.date.localeCompare(b.date));

    const actualSubject = messages[0]?.subject ?? "(no subject)";

    return {
      id:           threadId,
      subject:      actualSubject,
      snippet:      data.snippet,
      fromEmail:    fromEmail || (participants.values().next().value ?? ""),
      fromName:     fromName,
      participants: [...participants],
      lastDate:     lastDate || new Date().toISOString(),
      messages,
    };
  }

  // ── Send ─────────────────────────────────────────────────────────────────

  async sendReply(accessToken: string, params: SendParams): Promise<string> {
    // Build RFC 2822 MIME message
    const headers = [
      `To: ${params.to}`,
      `Subject: ${params.subject}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      ...(params.inReplyTo  ? [`In-Reply-To: ${params.inReplyTo}`]  : []),
      ...(params.references ? [`References: ${params.references}`]  : []),
    ].join("\r\n");

    const mimeMsg = `${headers}\r\n\r\n${params.body}`;
    const raw     = base64urlEncode(mimeMsg);

    const body: Record<string, string> = { raw };
    if (params.threadId) body.threadId = params.threadId;

    const res = await fetch(`${GMAIL_BASE}/messages/send`, {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gmail send failed: ${err}`);
    }

    const data = await res.json() as { id: string };
    return data.id;
  }

  // ── Revoke ───────────────────────────────────────────────────────────────

  async revokeToken(token: string): Promise<void> {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
    });
    // Best-effort — don't throw if revocation fails
  }
}
