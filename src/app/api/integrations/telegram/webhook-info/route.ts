/**
 * GET /api/integrations/telegram/webhook-info
 *
 * Returns the current webhook status from Telegram's getWebhookInfo API.
 * The bot token is fetched server-side from the encrypted SQLite store.
 * Clients pass ?ws={workspaceId} — NOT the raw token.
 *
 * Query params:
 *   ws — workspace ID (default: "default")
 *
 * Response:
 *   200 { ok: true,  webhookInfo: TelegramWebhookInfo }
 *   200 { ok: false, error: string }   — Telegram API error (e.g. wrong token)
 *   400                                — No bot configured for workspace
 *   502                                — Could not reach Telegram API
 */

import { NextRequest, NextResponse } from "next/server";
import { getBotToken }               from "@/lib/telegram-db";
import type { TelegramWebhookInfo }  from "@/lib/telegram-types";

const DEFAULT_WS = "default";

interface TelegramWebhookInfoResponse {
  ok:           boolean;
  result?:      TelegramWebhookInfo;
  description?: string;
  error_code?:  number;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url  = new URL(req.url);
  const wsId = url.searchParams.get("ws")?.trim() || DEFAULT_WS;

  // ── Resolve token server-side ─────────────────────────────────────────────
  const token = getBotToken(wsId);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: `No bot configured for workspace "${wsId}". Connect a bot first.` },
      { status: 400 },
    );
  }

  // ── Call Telegram getWebhookInfo ──────────────────────────────────────────
  let tgRes: Response;
  try {
    tgRes = await fetch(
      `https://api.telegram.org/bot${token}/getWebhookInfo`,
      { cache: "no-store" },
    );
  } catch (err) {
    return NextResponse.json({
      ok:    false,
      error: `Could not reach Telegram API: ${err instanceof Error ? err.message : "Network error"}`,
    }, { status: 502 });
  }

  // ── Parse response ────────────────────────────────────────────────────────
  let data: TelegramWebhookInfoResponse;
  try {
    data = await tgRes.json() as TelegramWebhookInfoResponse;
  } catch {
    return NextResponse.json({
      ok:    false,
      error: `Telegram returned non-JSON response (HTTP ${tgRes.status})`,
    }, { status: 502 });
  }

  if (!data.ok || !data.result) {
    return NextResponse.json({
      ok:    false,
      error: data.description ?? `Telegram error ${data.error_code ?? tgRes.status}`,
    });
  }

  return NextResponse.json({ ok: true, webhookInfo: data.result });
}
