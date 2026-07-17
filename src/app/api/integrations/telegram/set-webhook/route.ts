/**
 * POST /api/integrations/telegram/set-webhook
 *
 * Registers (or updates) the Ventra webhook URL with Telegram.
 * The bot token is fetched server-side from the encrypted SQLite store — the
 * client NEVER sends the raw token.
 *
 * Request body: { workspaceId?, webhookUrl? }
 *   workspaceId — defaults to "default"; identifies which stored bot to use
 *   webhookUrl  — optional override; defaults to the canonical workspace URL
 *
 * Security:
 *   • Token is fetched from AES-256-GCM encrypted DB column, not from client.
 *   • Webhook secret is read from DB and sent to Telegram's secret_token param.
 *   • The registered webhook URL is persisted to DB after a successful call.
 *   • Token is NEVER logged (even in error branches).
 *
 * Errors:
 *   400 — no bot configured for workspace, or invalid webhookUrl
 *   502 — could not reach Telegram API
 *   200 with ok: false — Telegram returned an error
 */

import { NextRequest, NextResponse }                       from "next/server";
import { getBotToken, getBotWebhookSecret, updateBotWebhookUrl } from "@/lib/telegram-db";
import { getWebhookUrl }                                   from "@/lib/integrations";

const DEFAULT_WS = "default";

interface TelegramApiResponse {
  ok:           boolean;
  result?:      boolean;
  description?: string;
  error_code?:  number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Parse body ────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { workspaceId, webhookUrl: clientWebhookUrl } = (
    body && typeof body === "object" && !Array.isArray(body)
      ? body
      : {}
  ) as { workspaceId?: string; webhookUrl?: string };

  const wsId = (typeof workspaceId === "string" && workspaceId.trim())
    ? workspaceId.trim()
    : DEFAULT_WS;

  // ── Resolve token + secret from DB ───────────────────────────────────────
  const token = getBotToken(wsId);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: `No bot configured for workspace "${wsId}". Connect a bot first.` },
      { status: 400 },
    );
  }

  const secret = getBotWebhookSecret(wsId) ?? "";

  // ── Determine webhook URL ─────────────────────────────────────────────────
  // Use client-supplied URL only if it passes basic HTTPS validation.
  // Otherwise fall back to the canonical server-side URL for this workspace.
  const webhookUrl = clientWebhookUrl?.trim() || getWebhookUrl(wsId);

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch {
    return NextResponse.json({ ok: false, error: "webhookUrl is not a valid URL" }, { status: 400 });
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost") {
    return NextResponse.json({
      ok:    false,
      error: "Telegram requires HTTPS for webhook URLs (HTTP only allowed for localhost in dev)",
    }, { status: 400 });
  }

  // ── Build Telegram request ────────────────────────────────────────────────
  const tgParams: Record<string, string> = { url: webhookUrl };
  if (secret && /^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    tgParams["secret_token"] = secret;
  }
  const queryString = new URLSearchParams(tgParams).toString();

  // ── Call Telegram setWebhook ──────────────────────────────────────────────
  let tgRes: Response;
  try {
    tgRes = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook?${queryString}`,
      { method: "POST", cache: "no-store" },
    );
  } catch (err) {
    return NextResponse.json({
      ok:    false,
      error: `Could not reach Telegram API: ${err instanceof Error ? err.message : "Network error"}`,
    }, { status: 502 });
  }

  // ── Parse response ────────────────────────────────────────────────────────
  let data: TelegramApiResponse;
  try {
    data = await tgRes.json() as TelegramApiResponse;
  } catch {
    return NextResponse.json({
      ok:    false,
      error: `Telegram returned non-JSON response (HTTP ${tgRes.status})`,
    }, { status: 502 });
  }

  if (!data.ok) {
    return NextResponse.json({
      ok:    false,
      error: data.description ?? `Telegram error ${data.error_code ?? tgRes.status}`,
    });
  }

  // ── Persist registered URL ───────────────────────────────────────────────
  updateBotWebhookUrl(wsId, webhookUrl);

  return NextResponse.json({ ok: true, description: data.description ?? "Webhook was set", webhookUrl });
}
