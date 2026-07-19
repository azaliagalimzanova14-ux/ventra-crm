/**
 * GET /api/rie/weekly-review
 *
 * Returns the 7-day weekly review, AI-enriched with narrative and next-week focus.
 *
 * Flow:
 *   1. getWeeklyReview() — 4 SQL queries, fully deterministic
 *   2. generateWeeklyNarrative() — ONE AI call for narrative + nextWeekFocus
 *   3. Merge AI fields into the review object
 *
 * No cron, no cache, no background workers — on-demand only.
 * Requires: clients.view permission
 *
 * Response:
 *   200 { review: WeeklyReview }
 *   401/403/500 standard errors
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { getWeeklyReview }                         from "@/lib/server/rie/weekly-review-engine";
import { generateWeeklyNarrative }                 from "@/lib/ai/service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "clients.view");

    // Step 1: deterministic data
    const review = getWeeklyReview(auth.workspaceId);

    // Step 2: AI narrative
    const aiResult = await generateWeeklyNarrative({
      totalContacts:  review.totalContacts,
      totalMessages:  review.totalMessages,
      newClients:     review.newClients,
      tasksCompleted: review.tasksCompleted,
      healthImproved: review.healthImproved,
      healthDeclined: review.healthDeclined,
      topActivity:    review.topActivity.map((a) => ({
        clientName: a.clientName,
        msgCount:   a.msgCount,
      })),
      improved: review.improved.map((c) => ({
        clientName: c.clientName,
        current:    c.current,
      })),
      declined: review.declined.map((c) => ({
        clientName: c.clientName,
        current:    c.current,
      })),
      totalActive:   review.totalActive,
      strongCount:   review.strongCount,
      healthyCount:  review.healthyCount,
      atRiskCount:   review.atRiskCount,
      criticalCount: review.criticalCount,
    });

    // Step 3: merge
    const enriched = {
      ...review,
      narrative:     aiResult.narrative,
      nextWeekFocus: aiResult.nextWeekFocus,
      provider:      aiResult.provider,
    };

    return NextResponse.json({ review: enriched });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/rie/weekly-review]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
