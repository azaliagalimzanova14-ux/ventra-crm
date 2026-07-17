/**
 * POST /api/feedback — submit feedback (bug / feature / general)
 *
 * Requires: authenticated session.
 * Open to all roles (no permission gate — anyone can submit feedback).
 */

import { NextRequest, NextResponse }   from "next/server";
import { requireAuth, AuthError }      from "@/lib/server/auth-helpers";
import { saveFeedback }                from "@/lib/server/db-feedback";
import { trackEvent }                  from "@/lib/server/db-analytics";
import type { FeedbackTypeDb }         from "@/lib/server/models";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES: FeedbackTypeDb[] = ["bug", "feature", "general"];

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    const { workspaceId, userId } = auth;

    const body = await req.json() as {
      type:    FeedbackTypeDb;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      message: Record<string, any>;
    };

    if (!body.type || !ALLOWED_TYPES.includes(body.type)) {
      return NextResponse.json({ error: "Invalid feedback type" }, { status: 400 });
    }
    if (!body.message || typeof body.message !== "object") {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const record = saveFeedback({ workspaceId, userId, type: body.type, message: body.message });

    // Track analytics
    try {
      trackEvent({ workspaceId, userId, event: "feedback_submitted", properties: { type: body.type } });
    } catch { /* non-fatal */ }

    return NextResponse.json({ id: record.id, ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/feedback error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
