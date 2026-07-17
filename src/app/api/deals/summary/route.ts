/**
 * GET /api/deals/summary — pipeline summary for dashboard widgets
 *
 * Returns: { open_count, pipeline_value, won_count, won_revenue, forecast, currency }
 * Requires: deals.view
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { getDealPipelineSummary }                   from "@/lib/server/db-deals";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "deals.view");

    const summary = getDealPipelineSummary(auth.workspaceId);
    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/deals/summary]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
