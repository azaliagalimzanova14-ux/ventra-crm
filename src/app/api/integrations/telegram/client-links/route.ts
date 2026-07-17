/**
 * /api/integrations/telegram/client-links
 *
 * Server-side persistence for the chatId → CRM clientId mapping.
 * Replaces localStorage as the source of truth for client-Telegram links so
 * links survive browser storage being cleared and work across browsers.
 *
 * GET  ?ws=default                               → all links for workspace
 * POST { workspaceId, chatId, clientId, … }      → upsert a link
 * DELETE ?ws=default&chatId=<number>             → remove a specific link
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getClientLinks,
  saveClientLink,
  getClientLink,
  deleteClientLink,
} from "@/lib/telegram-db";

const DEFAULT_WS = "default";

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ws = req.nextUrl.searchParams.get("ws") ?? DEFAULT_WS;
  const links = getClientLinks(ws);
  return NextResponse.json({ ok: true, links });
}

// ── POST ──────────────────────────────────────────────────────────────────────

interface SaveLinkBody {
  workspaceId?:   string;
  chatId:         number;
  clientId:       string;
  clientName?:    string;
  clientAvatar?:  string;
  clientCompany?: string;
  isAutoCreated?: boolean;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: SaveLinkBody;
  try {
    body = await req.json() as SaveLinkBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.chatId !== "number" || !body.clientId) {
    return NextResponse.json(
      { ok: false, error: "chatId (number) and clientId (string) are required" },
      { status: 400 },
    );
  }

  const wsId = body.workspaceId ?? DEFAULT_WS;

  saveClientLink({
    workspaceId:   wsId,
    chatId:        body.chatId,
    clientId:      body.clientId,
    clientName:    body.clientName    ?? "",
    clientAvatar:  body.clientAvatar  ?? "",
    clientCompany: body.clientCompany ?? "",
    isAutoCreated: body.isAutoCreated ?? false,
  });

  // Return the actual DB record so the response timestamp matches what's stored.
  const link = getClientLink(body.chatId, wsId);
  return NextResponse.json({ ok: true, link });
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const ws      = req.nextUrl.searchParams.get("ws")     ?? DEFAULT_WS;
  const chatRaw = req.nextUrl.searchParams.get("chatId") ?? "";
  const chatId  = Number(chatRaw);

  if (isNaN(chatId) || chatId === 0) {
    return NextResponse.json({ ok: false, error: "chatId must be a non-zero number" }, { status: 400 });
  }

  deleteClientLink(chatId, ws);
  return NextResponse.json({ ok: true });
}
