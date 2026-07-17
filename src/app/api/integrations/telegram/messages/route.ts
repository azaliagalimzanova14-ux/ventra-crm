/**
 * GET    /api/integrations/telegram/messages  — messages for a workspace or chat
 * DELETE /api/integrations/telegram/messages  — clear all messages for the workspace
 *
 * Query params:
 *   ws     — workspace ID (default: "default")
 *   chatId — optional Telegram chat_id (number); when present, returns only
 *             messages for that conversation (newest first, up to 50)
 *
 * Without chatId: returns all messages for the workspace (up to 500).
 * With    chatId: returns messages for that specific conversation only.
 */

import { NextRequest, NextResponse }                             from "next/server";
import { getTelegramMessages, clearTelegramMessages,
         getTelegramConversation }                               from "@/lib/telegram-db";
import type { TelegramInboxMessage }                             from "@/lib/telegram-types";

const DEFAULT_WS = "default";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const wsId      = req.nextUrl.searchParams.get("ws")?.trim() || DEFAULT_WS;
  const chatIdRaw = req.nextUrl.searchParams.get("chatId");

  let messages: TelegramInboxMessage[];

  if (chatIdRaw !== null) {
    const chatId = Number(chatIdRaw);
    if (isNaN(chatId)) {
      return NextResponse.json(
        { ok: false, error: "chatId must be a number" },
        { status: 400 },
      );
    }
    // getTelegramConversation returns messages newest-first, capped at MAX_MESSAGES_PER_CONV
    const conv = getTelegramConversation(chatId, wsId);
    messages   = conv?.messages ?? [];
  } else {
    messages = getTelegramMessages(wsId);
  }

  return NextResponse.json({ messages });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const wsId = req.nextUrl.searchParams.get("ws")?.trim() || DEFAULT_WS;
  clearTelegramMessages(wsId);
  return NextResponse.json({ ok: true, cleared: true });
}
