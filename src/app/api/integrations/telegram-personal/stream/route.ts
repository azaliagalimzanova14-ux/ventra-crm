/**
 * GET /api/integrations/telegram-personal/stream
 *
 * Server-Sent Events stream for real-time personal Telegram message delivery.
 *
 * Protocol:
 *   • On connect: sends a `dialogs_snapshot` event with all imported dialogs.
 *   • On new message: sends a `personal_update` event with dialog + message payload.
 *   • Every 25 s: sends a `: ping` comment to keep the connection alive.
 *
 * Requires: authenticated session.
 * workspaceId is taken from the authenticated session.
 */

import { NextRequest }               from "next/server";
import { requireAuth }               from "@/lib/server/auth-helpers";
import { subscribePersonalEvents, type PersonalStreamEvent } from "@/lib/personal-event-bus";
import { getPersonalDialogs }        from "@/lib/mtproto-db";

export const dynamic = "force-dynamic";

const PING_INTERVAL_MS = 25_000;

export async function GET(req: NextRequest): Promise<Response> {
  // Auth check — return 401 if not logged in
  let workspaceId: string;
  try {
    const auth   = await requireAuth(req);
    workspaceId  = auth.workspaceId;
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const ws = workspaceId;

  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null                 = null;

  const stream = new ReadableStream({
    start(controller) {
      function send(event: PersonalStreamEvent): void {
        try {
          const line = `event: personal_update\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(new TextEncoder().encode(line));
        } catch { /* client disconnected */ }
      }

      function ping(): void {
        try { controller.enqueue(new TextEncoder().encode(": ping\n\n")); }
        catch { /* client disconnected */ }
      }

      // 1. Snapshot: send current imported dialogs on connect
      try {
        const dialogs  = getPersonalDialogs(ws);
        const snapshot = `event: dialogs_snapshot\ndata: ${JSON.stringify({ dialogs, workspaceId: ws })}\n\n`;
        controller.enqueue(new TextEncoder().encode(snapshot));
      } catch { /* DB not ready */ }

      // 2. Subscribe to live updates
      unsubscribe = subscribePersonalEvents(ws, send);

      // 3. Keep-alive
      pingTimer = setInterval(ping, PING_INTERVAL_MS);
    },

    cancel() {
      if (pingTimer !== null) clearInterval(pingTimer);
      if (unsubscribe !== null) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream; charset=utf-8",
      "Cache-Control":     "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "Connection":        "keep-alive",
    },
  });
}
