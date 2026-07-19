/**
 * POST /api/integrations/email/send
 *
 * Sends an email reply via Gmail API, then saves the outbound message
 * to the unified messages table.
 *
 * Body:
 *   {
 *     conversationId: string,   — unified conversation ID
 *     to:             string,   — recipient email
 *     subject:        string,
 *     body:           string,   — plain-text content
 *     threadId?:      string,   — Gmail thread ID (for "Reply" into existing thread)
 *     inReplyTo?:     string,   — RFC 2822 Message-ID of the message being replied to
 *     references?:    string,   — RFC 2822 References chain
 *   }
 *
 * Response: { ok: true, gmailMessageId: string }
 *
 * Requires: authenticated session + any role (sending a reply is a normal action).
 */

import { NextRequest, NextResponse }     from "next/server";
import { requireAuth, AuthError }        from "@/lib/server/auth-helpers";
import {
  getEmailAccount,
  getDecryptedTokens,
  updateEmailTokens,
  isTokenExpired,
}                                        from "@/lib/server/db-email";
import { GmailProvider }                 from "@/lib/gmail-provider";
import { getConversation }               from "@/lib/server/db-conversations";
import { createMessage }                 from "@/lib/server/db-messages";
import { refreshRhythm }                from "@/lib/server/rie/rhythm-engine";

export const dynamic = "force-dynamic";

interface SendEmailBody {
  conversationId: string;
  to:             string;
  subject:        string;
  body:           string;
  threadId?:      string;
  inReplyTo?:     string;
  references?:    string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    const body = await req.json() as SendEmailBody;

    const { conversationId, to, subject, body: emailBody } = body;
    if (!conversationId || !to || !subject || !emailBody) {
      return NextResponse.json(
        { error: "conversationId, to, subject, and body are required" },
        { status: 400 },
      );
    }

    // Verify the conversation belongs to this workspace
    const conv = getConversation(conversationId, auth.workspaceId);
    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    if (conv.channel !== "email") {
      return NextResponse.json(
        { error: "This route is for email conversations only" },
        { status: 400 },
      );
    }

    // Load tokens
    const account = getEmailAccount(auth.workspaceId, "gmail");
    if (!account) {
      return NextResponse.json({ error: "Gmail not connected" }, { status: 404 });
    }

    let tokens = getDecryptedTokens(auth.workspaceId, "gmail");
    if (!tokens) {
      return NextResponse.json({ error: "Failed to decrypt tokens" }, { status: 500 });
    }

    const provider = new GmailProvider();

    // Auto-refresh if needed
    if (isTokenExpired(account) && tokens.refreshToken) {
      try {
        const fresh = await provider.refreshTokens(tokens.refreshToken);
        updateEmailTokens(
          auth.workspaceId,
          "gmail",
          fresh.accessToken,
          fresh.refreshToken,
          fresh.expiresAt,
        );
        tokens = {
          accessToken:  fresh.accessToken,
          refreshToken: fresh.refreshToken ?? tokens.refreshToken,
          expiresAt:    fresh.expiresAt ?? null,
        };
      } catch {
        return NextResponse.json(
          { error: "Token refresh failed — please reconnect Gmail" },
          { status: 401 },
        );
      }
    }

    // Send via Gmail API
    const gmailMessageId = await provider.sendReply(tokens.accessToken, {
      to,
      subject,
      body:       emailBody,
      threadId:   body.threadId,
      inReplyTo:  body.inReplyTo,
      references: body.references,
    });

    // Save outbound message to unified inbox
    const now = new Date().toISOString();
    createMessage({
      workspace_id:    auth.workspaceId,
      conversation_id: conversationId,
      sender_type:     "agent",
      sender_id:       auth.userId,
      content:         emailBody,
      metadata:        {
        gmail_msg_id: gmailMessageId,
        subject,
        to,
        thread_id:    body.threadId,
        in_reply_to:  body.inReplyTo,
      },
      created_at: now,
    });

    // Refresh rhythm after outbound email — fire-and-forget, never blocks response
    if (conv.client_id) {
      try { refreshRhythm(auth.workspaceId, conv.client_id); }
      catch (e) { console.error("[RIE] refreshRhythm after email send:", e); }
    }

    return NextResponse.json({ ok: true, gmailMessageId });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[Email send]", err);
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }
}
