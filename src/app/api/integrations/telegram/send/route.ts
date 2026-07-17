/**
 * POST /api/integrations/telegram/send
 *
 * Sends a text message or file to a Telegram chat via the Bot API.
 * Accepts multipart/form-data — file uploads use binary form fields.
 *
 * ── Authentication ────────────────────────────────────────────────────────────
 * The bot token is fetched server-side from the encrypted SQLite store.
 * Clients NEVER send the raw token — they pass workspaceId instead.
 *
 * ── Form fields ──────────────────────────────────────────────────────────────
 * workspaceId string  (optional, default "default") — workspace to look up bot
 * chatId      string  (required) — Telegram chat_id
 * text        string  (optional) — message text or caption
 * file        File    (optional) — attachment
 * kind        string  (optional) — "image" | "pdf" | "document" | "voice"
 *                                  (auto-detected from file mime if omitted)
 *
 * ── Routing ──────────────────────────────────────────────────────────────────
 * kind === "image"            → sendPhoto
 * kind === "voice"            → sendDocument (OGG/Opus conversion is v2)
 * kind === "pdf" | "document" → sendDocument
 * no file                     → sendMessage
 *
 * ── Mock mode ─────────────────────────────────────────────────────────────────
 * If no bot is configured for the workspace, simulates success without hitting Telegram.
 *
 * ── Response ─────────────────────────────────────────────────────────────────
 * Success: { ok: true, telegramMessageId: number, isMock: boolean }
 * Failure: { ok: false, error: string }
 */

import { NextRequest, NextResponse }         from "next/server";
import { upsertTelegramConversation, getBotToken, getTelegramConversation, getTelegramConversations } from "@/lib/telegram-db";
import { publishTelegramEvent }              from "@/lib/telegram-event-bus";
import type { TelegramInboxMessage }         from "@/lib/telegram-types";
import { kindFromMime }                      from "@/lib/attachment-types";
import { upsertConversation, touchConversation } from "@/lib/server/db-conversations";
import { createMessage }                         from "@/lib/server/db-messages";

const DEFAULT_WS = "default";

/** Bridge an outbound Telegram message into the unified messages table (best-effort). */
function bridgeOutboundToUnified(
  wsId:   string,
  chatId: number,
  text:   string,
  sentAt: string,
): void {
  try {
    const conv = upsertConversation({
      workspace_id: wsId,
      channel:      "telegram",
      external_id:  String(chatId),
      title:        "",
    });
    createMessage({
      workspace_id:    wsId,
      conversation_id: conv.id,
      sender_type:     "agent",
      content:         text,
      created_at:      sentAt,
    });
    touchConversation(conv.id, wsId, text, sentAt);
  } catch { /* best-effort */ }
}

interface TelegramApiResult {
  ok:      boolean;
  result?: { message_id: number; chat: { id: number }; date: number; text?: string };
  error_code?:  number;
  description?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Parse multipart form ──────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid multipart form data" }, { status: 400 });
  }

  const wsId      = (formData.get("workspaceId") as string | null)?.trim() || DEFAULT_WS;
  const chatIdRaw = formData.get("chatId");
  const text      = (formData.get("text") as string | null)?.trim() ?? "";
  const file      = formData.get("file") as File | null;
  const kindRaw   = formData.get("kind") as string | null;

  const chatId = typeof chatIdRaw === "string" ? Number(chatIdRaw) : NaN;
  if (isNaN(chatId)) {
    return NextResponse.json({ ok: false, error: "chatId must be a number" }, { status: 400 });
  }

  if (!text && !file) {
    return NextResponse.json({ ok: false, error: "Either text or file is required" }, { status: 400 });
  }

  // Determine attachment kind
  const kind = kindRaw ?? (file ? kindFromMime(file.type) : null);

  // ── Resolve token server-side ─────────────────────────────────────────────
  const token = getBotToken(wsId);

  // ── Mock mode (no bot configured) ─────────────────────────────────────────
  if (!token) {
    const mockId = Math.floor(Math.random() * 900_000) + 100_000;
    const sentAt = new Date().toISOString();
    const displayText = text || (file ? `[${file.name}]` : "[message]");

    const outbound: TelegramInboxMessage = {
      id:               `tg_out_mock_${mockId}`,
      updateId:         0,
      chatId,
      chatType:         "private",
      senderName:       "You (mock)",
      senderTelegramId: 0,
      text:             displayText,
      receivedAt:       sentAt,
      direction:        "outbound",
      isSimulated:      true,
      ...(file && {
        attachment: {
          kind:      (kind ?? "document") as "image" | "pdf" | "document" | "voice",
          name:      file.name,
          mimeType:  file.type,
          sizeBytes: file.size,
        },
      }),
    };
    upsertTelegramConversation(outbound, wsId);
    bridgeOutboundToUnified(wsId, chatId, displayText, sentAt);
    try { publishTelegramEvent(wsId, getTelegramConversations(wsId)); } catch { /* best-effort */ }

    return NextResponse.json({ ok: true, telegramMessageId: mockId, isMock: true });
  }

  // ── Resolve conversation chatType from SQLite ─────────────────────────────
  // Outbound messages are replies to existing chats. Look up the stored chatType
  // (private / group / supergroup / channel) so the DB record stays correct for
  // group/supergroup conversations. Falls back to "private" if the conversation
  // doesn't exist yet (shouldn't happen for real bots, only in edge cases).
  const existingConv   = getTelegramConversation(chatId, wsId);
  const resolvedChatType = existingConv?.chatType ?? "private";

  // ── Real Bot API call ─────────────────────────────────────────────────────
  if (!file) {
    // Text-only: use sendMessage JSON
    let apiResult: TelegramApiResult;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096) }),
      });
      apiResult = await res.json() as TelegramApiResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      return NextResponse.json({ ok: false, error: `Telegram API unreachable: ${msg}` }, { status: 502 });
    }

    if (!apiResult.ok || !apiResult.result) {
      return NextResponse.json(
        { ok: false, error: apiResult.description ?? `Telegram error ${apiResult.error_code ?? "unknown"}` },
        { status: 400 },
      );
    }

    const r    = apiResult.result;
    const sent = new Date(r.date * 1000).toISOString();
    upsertTelegramConversation(
      {
        id: `tg_out_${r.message_id}`, updateId: 0, chatId: r.chat.id,
        chatType: resolvedChatType, senderName: "You", senderTelegramId: 0,
        text: r.text ?? text, receivedAt: sent, direction: "outbound", isSimulated: false,
      },
      wsId,
    );
    bridgeOutboundToUnified(wsId, r.chat.id, r.text ?? text, sent);
    try { publishTelegramEvent(wsId, getTelegramConversations(wsId)); } catch { /* best-effort */ }

    return NextResponse.json({ ok: true, telegramMessageId: r.message_id, isMock: false });
  }

  // File upload — build multipart for Telegram
  let apiPath: string;
  const tgFormData = new FormData();
  tgFormData.append("chat_id", chatId.toString());

  if (kind === "image") {
    apiPath = "sendPhoto";
    tgFormData.append("photo", new Blob([await file.arrayBuffer()], { type: file.type }), file.name);
    if (text) tgFormData.append("caption", text.slice(0, 1024));
  } else {
    apiPath = "sendDocument";
    tgFormData.append("document", new Blob([await file.arrayBuffer()], { type: file.type }), file.name);
    if (text) tgFormData.append("caption", text.slice(0, 1024));
  }

  let apiResult: TelegramApiResult;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${apiPath}`, {
      method: "POST",
      body:   tgFormData,
    });
    apiResult = await res.json() as TelegramApiResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return NextResponse.json({ ok: false, error: `Telegram API unreachable: ${msg}` }, { status: 502 });
  }

  if (!apiResult.ok || !apiResult.result) {
    return NextResponse.json(
      { ok: false, error: apiResult.description ?? `Telegram error ${apiResult.error_code ?? "unknown"}` },
      { status: 400 },
    );
  }

  const r    = apiResult.result;
  const sent = new Date(r.date * 1000).toISOString();

  const displayTextFile = text || `[${file.name}]`;
  upsertTelegramConversation(
    {
      id: `tg_out_${r.message_id}`, updateId: 0, chatId: r.chat.id,
      chatType: resolvedChatType, senderName: "You", senderTelegramId: 0,
      text: displayTextFile,
      receivedAt: sent, direction: "outbound", isSimulated: false,
      attachment: {
        kind:      (kind ?? "document") as "image" | "pdf" | "document" | "voice",
        name:      file.name,
        mimeType:  file.type,
        sizeBytes: file.size,
      },
    },
    wsId,
  );
  bridgeOutboundToUnified(wsId, r.chat.id, displayTextFile, sent);
  try { publishTelegramEvent(wsId, getTelegramConversations(wsId)); } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, telegramMessageId: r.message_id, isMock: false });
}
