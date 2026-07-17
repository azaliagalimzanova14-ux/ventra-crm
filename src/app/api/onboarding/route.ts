/**
 * GET  /api/onboarding  — get progress for the current workspace
 * PATCH /api/onboarding — mark a step completed
 *
 * Requires: authenticated session with an active workspace.
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireAuth, AuthError }                    from "@/lib/server/auth-helpers";
import {
  getOnboardingProgress,
  completeOnboardingStep,
  ALL_ONBOARDING_STEPS,
} from "@/lib/server/db-onboarding";
import { trackEvent }                               from "@/lib/server/db-analytics";
import type { OnboardingStep }                      from "@/lib/server/models";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    const { workspaceId } = auth;

    const rows = getOnboardingProgress(workspaceId);

    // Derive summary
    const completed = rows.filter((r) => r.completed === 1).length;
    const total     = ALL_ONBOARDING_STEPS.length;

    return NextResponse.json({
      steps:      rows.map((r) => ({ step: r.step, completed: r.completed === 1, completedAt: r.completed_at })),
      completed,
      total,
      isDone:     completed >= total,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/onboarding error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    const { workspaceId, userId } = auth;

    const body = await req.json() as { step: OnboardingStep };

    if (!body.step || !ALL_ONBOARDING_STEPS.includes(body.step)) {
      return NextResponse.json({ error: "Invalid step" }, { status: 400 });
    }

    completeOnboardingStep(workspaceId, body.step);

    // Track analytics event
    try {
      trackEvent({
        workspaceId,
        userId,
        event:       "onboarding_step_completed",
        properties:  { step: body.step },
      });
    } catch { /* non-fatal */ }

    const rows      = getOnboardingProgress(workspaceId);
    const completed = rows.filter((r) => r.completed === 1).length;

    return NextResponse.json({
      step:      body.step,
      completed: true,
      progress:  { completed, total: ALL_ONBOARDING_STEPS.length },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("PATCH /api/onboarding error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
