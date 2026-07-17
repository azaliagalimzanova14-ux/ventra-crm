/**
 * GET /api/integrations/telegram/stream/[wsId]
 *
 * Server-Sent Events endpoint for real-time Telegram message delivery.
 *
 * Protocol:
 *   • Client opens an EventSource to this URL.
 *   • Server immediately sends the current conversation list as the first event.
 *   • On every new Telegram message (published by the webhook handler), server
 *     pushes a `conversation_update` event containing the full updated list.
 *   • A `ping` comment is sent every 25 s to keep the connection alive through
 *     proxies and load balancers that close idle connections.
 *   • Client reconnects automatically (EventSource built-in behaviour).
 *
 * SSE wire format (text/event-stream):
 *   event: conversation_update\n
 *   data: {"type":"conversation_update","workspaceId":"...","conversations":[...],"timestamp":"..."}\n\n
 *
 *   : ping\n\n           ← keep-alive comment (no `event:` line → client ignores)
 *
 * Security:
 *   • If no bot is configured for the workspace the stream still opens (no
 *     conversations), so the UI can show the "not connected" empty state.
 *   • No sensitive data (tokens, secrets) is ever included in the stream.
 *
 * Multi-workspace:
 *   Each [wsId] has an isolated event emitter. A client for workspace "acme"
 *   never receives events for workspace "default".
 */

import { NextRequest } from "next/server";
import {
  subscribeTelegramEvents,
  type TelegramStreamEvent,
} from "@/lib/telegram-event-bus";
import { getTelegramConversations } from "@/lib/telegram-db";

// Prevent Next.js from statically optimising this route
export const dynamic = "force-dynamic";

const PING_INTERVAL_MS = 25_000;

export async function GET(
  _req:    NextRequest,
  context: { params: Promise<{ wsId: string }> },
): Promise<Response> {
  const { wsId } = await context.params;

  // ── Build ReadableStream ──────────────────────────────────────────────────
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null                 = null;

  const stream = new ReadableStream({
    start(controller) {
      // ── Helper: encode one SSE frame ──────────────────────────────────────
      function send(event: TelegramStreamEvent): void {
        try {
          const line = `event: conversation_update\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(new TextEncoder().encode(line));
        } catch {
          // Controller already closed — client disconnected
        }
      }

      function ping(): void {
        try {
          controller.enqueue(new TextEncoder().encode(": ping\n\n"));
        } catch {
          // Controller already closed
        }
      }

      // ── 1. Send current snapshot immediately on connect ───────────────────
      try {
        const initial = getTelegramConversations(wsId);
        send({
          type:          "conversation_update",
          workspaceId:   wsId,
          conversations: initial,
          timestamp:     new Date().toISOString(),
        });
      } catch {
        // DB not ready yet — client will receive first real event on next message
      }

      // ── 2. Subscribe to live updates ──────────────────────────────────────
      unsubscribe = subscribeTelegramEvents(wsId, send);

      // ── 3. Keep-alive ping every 25 s ─────────────────────────────────────
      pingTimer = setInterval(ping, PING_INTERVAL_MS);
    },

    cancel() {
      // Client disconnected — clean up
      if (pingTimer !== null) clearInterval(pingTimer);
      if (unsubscribe !== null) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":                "text/event-stream; charset=utf-8",
      "Cache-Control":               "no-cache, no-transform",
      "X-Accel-Buffering":           "no",   // Disable Nginx buffering
      "Connection":                  "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
