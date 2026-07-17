/**
 * src/lib/email-provider.ts
 *
 * Provider-agnostic interface for email integrations.
 * Current implementation: Gmail (see gmail-provider.ts).
 * Future: Outlook (replace endpoints with Microsoft Graph API).
 *
 * ── Design goals ──────────────────────────────────────────────────────────────
 *  1. No provider-specific details leak into calling code (routes, DB helpers).
 *  2. Token management (refresh, expiry check) is the provider's responsibility.
 *  3. Threading model maps to unified conversations: thread_id → external_id.
 *  4. All network calls are async; failures propagate as typed errors.
 */

// ── Shared types ──────────────────────────────────────────────────────────────

export type EmailProviderName = "gmail" | "outlook";

export interface TokenSet {
  accessToken:    string;
  refreshToken?:  string;
  expiresAt?:     string;  // ISO 8601
  scope?:         string;
}

export interface EmailProfile {
  email:        string;
  displayName:  string;
  provider:     EmailProviderName;
}

export interface SyncOptions {
  maxResults?: number;
  sinceDate?:  string;  // ISO 8601 — only threads newer than this
}

export interface EmailAttachment {
  attachmentId: string;  // Gmail attachment ID (used to fetch bytes)
  filename:     string;
  mimeType:     string;
  size:         number;  // bytes
  /** Derived convenience kind for UI rendering */
  kind:         "image" | "pdf" | "document" | "voice" | "other";
}

export interface EmailMessage {
  id:           string;   // provider message ID
  threadId:     string;
  fromEmail:    string;
  fromName:     string;
  toEmail:      string;
  subject:      string;
  body:         string;   // plain-text body
  date:         string;   // ISO 8601
  isOutbound:   boolean;
  messageId?:   string;   // RFC 2822 Message-ID header (for threading)
  references?:  string;   // RFC 2822 References header
  attachments?: EmailAttachment[];
}

export interface EmailThread {
  id:           string;  // provider thread ID
  subject:      string;
  snippet:      string;
  fromEmail:    string;  // first sender's email
  fromName:     string;
  participants: string[];
  lastDate:     string;
  messages:     EmailMessage[];
}

export interface SendParams {
  to:           string;
  subject:      string;
  body:         string;
  threadId?:    string;   // existing thread to reply into
  inReplyTo?:   string;   // RFC 2822 In-Reply-To header value
  references?:  string;   // RFC 2822 References header value
}

// ── Provider interface ────────────────────────────────────────────────────────

export interface EmailProvider {
  readonly name: EmailProviderName;

  /** Build the OAuth authorization URL for the consent screen. */
  buildAuthUrl(redirectUri: string, state: string): string;

  /** Exchange an authorization code for tokens (server-side only). */
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet>;

  /** Use a refresh_token to get a new access_token. */
  refreshTokens(refreshToken: string): Promise<TokenSet>;

  /** Fetch the authenticated user's email profile. */
  getProfile(accessToken: string): Promise<EmailProfile>;

  /** Fetch inbox threads and their messages. */
  syncThreads(accessToken: string, opts?: SyncOptions): Promise<EmailThread[]>;

  /** Send an email (or reply to a thread). Returns the sent message ID. */
  sendReply(accessToken: string, params: SendParams): Promise<string>;

  /** Revoke the access token (called on disconnect). */
  revokeToken(token: string): Promise<void>;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export { GmailProvider } from "./gmail-provider";

export function getEmailProvider(name: EmailProviderName = "gmail"): EmailProvider {
  // Dynamically require to keep the factory client-safe at import time
  // (actual implementation is Node-only but the interface is universal)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GmailProvider } = require("./gmail-provider") as { GmailProvider: new () => EmailProvider };
  if (name === "gmail") return new GmailProvider();
  throw new Error(`Email provider "${name}" is not yet implemented`);
}
