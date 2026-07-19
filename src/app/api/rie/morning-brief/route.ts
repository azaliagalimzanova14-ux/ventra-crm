/**
 * GET /api/rie/morning-brief
 *
 * Returns the Morning Brief for the authenticated workspace.
 *
 * Reads pre-computed rhythm rows (single JOIN query).
 * Makes one AI call for the greeting + 3 priorities.
 * Falls back to deterministic text when AI is unavailable.
 *
 * On-demand only — no cron, no cache, no background workers.
 *
 * Requires: clients.view permission
 *
 * Response:
 *   200 { brief: MorningBrief }
 *   401 — unauthenticated
 *   403 — insufficient permission
 *   500 — internal error
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { getMorningBrief }                          from "@/lib/server/rie/morning-brief-engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "clients.view");

    const brief = await getMorningBrief(auth.workspaceId);

    return NextResponse.json({ brief });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/rie/morning-brief]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
