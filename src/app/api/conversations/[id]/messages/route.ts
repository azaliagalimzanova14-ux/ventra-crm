/**
 * GET  /api/conversations/[id]/messages — list messages in a conversation
 * POST /api/conversations/[id]/messages — send a message
 *
 * GET query params:
 *   limit  — default 50, max 200
 *   before — ISO cursor (load older messages)
 *
 * POST body (JSON):
 *   { content: string }
 *
 * For Telegram conversations, POST also calls the Telegram Bot API to deliver
 * the message. For other channels, the message is stored only.
 *
 * Requires: authenticated session (any role).
 */

import { NextResponse }               from "next/server";
import { requireAuth, AuthError }     from "@/lib/server/auth-helpers";
import { getConversation, parseConversationMetadata } from "@/lib/server/db-conversations";
import {
  createMessage,
  listMessagesOldestFirst,
  parseAttachments,
  parseMetadata,
}                                     from "@/lib/server/db-messages";
import { touchConversation }          from "@/lib/server/db-conversations";
import { getBotToken }                from "@/lib/telegram-db";
import { sendPersonalMessage }        from "@/lib/mtproto-client";
import {
  getEmailAccount,
  getDecryptedTokens,
  updateEmailTokens,
  isTokenExpired,
}                                     from "@/lib/server/db-email";
import { GmailProvider }              from "@/lib/gmail-provider";
import { listMessages }               from "@/lib/server/db-messages";

// ── GET /api/conversations/[id]/messages ──────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth   = await requireAuth(request);
    const { id } = await params;

    const conv = getConversation(id, auth.workspaceId);
    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const url    = new URL(request.url);
    const limit  = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
    const before = url.searchParams.get("before") || undefined;

    const messages = listMessagesOldestFirst({
      conversation_id: id,
      workspace_id:    auth.workspaceId,
      limit,
      before,
    });

    return NextResponse.json({
      messages: messages.map((m) => ({
        id:          m.id,
        senderType:  m.sender_type,
        senderId:    m.sender_id,
        content:     m.content,
        attachments: parseAttachments(m),
        metadata:    parseMetadata(m),
        createdAt:   m.created_at,
      })),
      conversationId: id,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/conversations/[id]/messages]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/conversations/[id]/messages ─────────────────────────────────────

interface PostBody {
  content: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth   = await requireAuth(request);
    const { id } = await params;

    const conv = getConversation(id, auth.workspaceId);
    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const body    = await request.json() as PostBody;
    const content = body.content?.trim() ?? "";
    if (!content) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const sentAt = new Date().toISOString();

    // ── Channel delivery ───────────────────────────────────────────────────────
    let telegramMessageId: number | null = null;
    let emailMessageId:    string | null = null;
    let deliveryError: string | null = null;

    if (conv.channel === "email" && conv.external_id) {
      // Email: send via Gmail API
      const account = getEmailAccount(auth.workspaceId, "gmail");
      if (!account) {
        return NextResponse.json({ error: "Gmail not connected" }, { status: 424 });
      }

      let tokens = getDecryptedTokens(auth.workspaceId, "gmail");
      if (!tokens) {
        return NextResponse.json({ error: "Failed to decrypt Gmail tokens" }, { status: 500 });
      }

      const emailProvider = new GmailProvider();

      // Auto-refresh if expired
      if (isTokenExpired(account) && tokens.refreshToken) {
        try {
          const fresh = await emailProvider.refreshTokens(tokens.refreshToken);
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

      // Derive threading metadata from conversation + most recent inbound message
      const convMeta  = parseConversationMetadata(conv);
      const subject   = `Re: ${String(convMeta.subject ?? "(no subject)")}`;
      const toEmail   = String(convMeta.from ?? "");

      // Find the latest inbound message to build In-Reply-To / References
      const recentMsgs = listMessages({
        workspace_id:    auth.workspaceId,
        conversation_id: id,
        limit:           50,
      });
      let inReplyTo:  string | undefined;
      let references: string | undefined;
      for (const m of recentMsgs) {
        if (m.sender_type === "client") {
          try {
            const meta = JSON.parse(m.metadata ?? "{}") as {
              message_id?: string;
              references?: string;
            };
            if (meta.message_id) {
              inReplyTo  = meta.message_id;
              references = meta.references
                ? `${meta.references} ${meta.message_id}`
                : meta.message_id;
            }
          } catch { /* skip */ }
          break; // most recent client message found (listMessages returns newest-first)
        }
      }

      if (!toEmail) {
        deliveryError = "Cannot determine recipient email from conversation metadata";
      } else {
        try {
          emailMessageId = await emailProvider.sendReply(tokens.accessToken, {
            to:         toEmail,
            subject,
            body:       content,
            threadId:   conv.external_id,
            inReplyTo,
            references,
          });
        } catch (sendErr) {
          deliveryError = sendErr instanceof Error ? sendErr.message : "Gmail send error";
        }
      }

    } else if (conv.channel === "telegram" && conv.external_id) {
      const convMeta  = parseConversationMetadata(conv);
      const isPersonal = convMeta.personal === true;

      if (isPersonal) {
        // Personal account: send via MTProto GramJS (throws on error, returns msgId)
        try {
          telegramMessageId = await sendPersonalMessage(auth.workspaceId, conv.external_id, content);
        } catch (sendErr) {
          deliveryError = sendErr instanceof Error ? sendErr.message : "Personal Telegram error";
        }
      } else {
        // Bot API: send via HTTP
        const chatId = Number(conv.external_id);
        const token  = getBotToken(auth.workspaceId) ?? getBotToken("default");

        if (token && !isNaN(chatId)) {
          try {
            interface TgResult { ok: boolean; result?: { message_id: number }; description?: string }
            const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({ chat_id: chatId, text: content.slice(0, 4096) }),
            });
            const tgRes = await res.json() as TgResult;
            if (tgRes.ok && tgRes.result) {
              telegramMessageId = tgRes.result.message_id;
            } else {
              deliveryError = tgRes.description ?? "Telegram delivery failed";
            }
          } catch (fetchErr) {
            deliveryError = fetchErr instanceof Error ? fetchErr.message : "Network error";
          }
        }
        // If no token (mock mode) or delivery fails, we still store the message.
      }
    }

    // ── Persist to unified messages ────────────────────────────────────────────
    const msg = createMessage({
      workspace_id:    auth.workspaceId,
      conversation_id: id,
      sender_type:     "agent",
      sender_id:       auth.userId,
      content,
      metadata: {
        ...(telegramMessageId ? { tg_msg_id: telegramMessageId }   : {}),
        ...(emailMessageId    ? { gmail_msg_id: emailMessageId }    : {}),
        ...(deliveryError     ? { delivery_error: deliveryError }   : {}),
      },
      created_at: sentAt,
    });

    touchConversation(id, auth.workspaceId, content, sentAt);

    return NextResponse.json({
      message: {
        id:          msg.id,
        senderType:  msg.sender_type,
        senderId:    msg.sender_id,
        content:     msg.content,
        attachments: [],
        metadata:    parseMetadata(msg),
        createdAt:   msg.created_at,
      },
      telegramMessageId,
      emailMessageId,
      deliveryError,
    }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[POST /api/conversations/[id]/messages]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
