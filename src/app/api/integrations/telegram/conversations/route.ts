/**
 * GET    /api/integrations/telegram/conversations  — all conversations, newest first
 * DELETE /api/integrations/telegram/conversations  — clear all data for the workspace
 *
 * Query params:
 *   ws — workspace ID (default: "default")
 *
 * Each conversation includes full sender info and the most recent 50 messages.
 * The Inbox page uses this for initial load; live updates come via SSE.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getTelegramConversations,
  clearTelegramConversations,
} from "@/lib/telegram-db";

const DEFAULT_WS = "default";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const wsId = req.nextUrl.searchParams.get("ws")?.trim() || DEFAULT_WS;
  return NextResponse.json({ conversations: getTelegramConversations(wsId) });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const wsId = req.nextUrl.searchParams.get("ws")?.trim() || DEFAULT_WS;
  clearTelegramConversations(wsId);
  return NextResponse.json({ ok: true });
}
