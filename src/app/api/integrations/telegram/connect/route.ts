/**
 * /api/integrations/telegram/connect
 *
 * Server-side bot registration — stores the encrypted token in SQLite.
 * The raw token NEVER leaves this endpoint; only a masked version is returned.
 *
 * POST  — register / update a bot for the workspace
 * GET   — return current bot config (masked)
 * DELETE — remove bot config (disconnect)
 *
 * ── POST body ─────────────────────────────────────────────────────────────────
 * {
 *   token:       string   — raw bot token (validated before storage)
 *   botUsername: string   — @username (without @)
 *   botName?:    string   — display name from getMe
 *   botId?:      string   — numeric bot ID from getMe
 *   workspaceId?: string  — defaults to "default"
 * }
 *
 * ── POST response ─────────────────────────────────────────────────────────────
 * { ok: true, botUsername, botName, botId, tokenMasked, workspaceId, webhookUrl }
 */

import { NextRequest, NextResponse } from "next/server";
import { validateTokenFormat, getWebhookUrl }  from "@/lib/integrations";
import { saveBot, getBot, disconnectBot }       from "@/lib/telegram-db";

const DEFAULT_WS = "default";

// ── POST — register bot ───────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "Expected a JSON object" }, { status: 400 });
  }

  const {
    token,
    botUsername,
    botName,
    botId,
    workspaceId = DEFAULT_WS,
  } = body as {
    token?:        string;
    botUsername?:  string;
    botName?:      string;
    botId?:        string;
    workspaceId?:  string;
  };

  if (!token || typeof token !== "string") {
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
  }

  if (!validateTokenFormat(token)) {
    return NextResponse.json({ ok: false, error: "Invalid token format" }, { status: 400 });
  }

  if (!botUsername || typeof botUsername !== "string" || !botUsername.trim()) {
    return NextResponse.json({ ok: false, error: "Missing botUsername" }, { status: 400 });
  }

  const wsId = typeof workspaceId === "string" && workspaceId.trim()
    ? workspaceId.trim()
    : DEFAULT_WS;

  try {
    const bot = saveBot({
      workspaceId: wsId,
      token,
      botUsername:  botUsername.replace(/^@/, ""),
      botName:      botName  ?? "",
      botId:        botId    ?? "",
    });

    const webhookUrl = getWebhookUrl(wsId);

    return NextResponse.json({
      ok:          true,
      botUsername:  bot.botUsername,
      botName:      bot.botName,
      botId:        bot.botId,
      tokenMasked:  bot.tokenMasked,
      workspaceId:  bot.workspaceId,
      webhookUrl,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save bot configuration";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// ── GET — return current config ───────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url  = new URL(req.url);
  const wsId = url.searchParams.get("ws") ?? DEFAULT_WS;

  const bot = getBot(wsId);
  if (!bot) {
    return NextResponse.json({ ok: false, connected: false, bot: null });
  }

  return NextResponse.json({
    ok:          true,
    connected:   bot.status === "connected",
    bot: {
      botUsername:  bot.botUsername,
      botName:      bot.botName,
      botId:        bot.botId,
      tokenMasked:  bot.tokenMasked,
      workspaceId:  bot.workspaceId,
      webhookUrl:   bot.webhookUrl,
      connectedAt:  bot.connectedAt,
    },
  });
}

// ── DELETE — disconnect bot ───────────────────────────────────────────────────

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const url  = new URL(req.url);
  const wsId = url.searchParams.get("ws") ?? DEFAULT_WS;

  disconnectBot(wsId);
  return NextResponse.json({ ok: true, disconnected: true });
}
