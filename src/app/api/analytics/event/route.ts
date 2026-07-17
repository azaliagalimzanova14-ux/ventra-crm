/**
 * POST /api/analytics/event — track a product analytics event
 *
 * Lightweight fire-and-forget endpoint. Always returns 200 (even on DB error)
 * so client-side tracking never blocks the UI.
 *
 * Requires: authenticated session.
 */

import { NextRequest, NextResponse }   from "next/server";
import { requireAuth, AuthError }      from "@/lib/server/auth-helpers";
import { trackEvent }                  from "@/lib/server/db-analytics";
import type { AnalyticsEvent }         from "@/lib/server/models";

export const dynamic = "force-dynamic";

const ALLOWED_EVENTS: AnalyticsEvent[] = [
  "conversation_opened",
  "message_sent",
  "client_created",
  "deal_created",
  "task_completed",
  "ai_used",
  "feedback_submitted",
  "demo_loaded",
  "onboarding_step_completed",
];

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    const { workspaceId, userId } = auth;

    const body = await req.json() as {
      event:       AnalyticsEvent;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties?: Record<string, any>;
    };

    if (!body.event || !ALLOWED_EVENTS.includes(body.event)) {
      return NextResponse.json({ ok: false, error: "Unknown event" }, { status: 400 });
    }

    trackEvent({ workspaceId, userId, event: body.event, properties: body.properties });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // Swallow tracking errors silently on server
    console.warn("POST /api/analytics/event error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
