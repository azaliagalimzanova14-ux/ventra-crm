/**
 * GET /api/rie/portfolio
 *
 * Returns the Portfolio Intelligence snapshot for the authenticated workspace.
 *
 * Reads pre-computed rhythm + narrative rows (one SQL JOIN query).
 * No AI calls — purely deterministic categorization.
 * On-demand: no cron, no cache, no background workers.
 *
 * Requires: clients.view permission
 *
 * Response:
 *   200 { portfolio: Portfolio }
 *   401 — unauthenticated
 *   403 — insufficient permission
 *   500 — internal error
 */

import { NextRequest, NextResponse }               from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { getPortfolio }                            from "@/lib/server/rie/portfolio-engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "clients.view");

    const portfolio = getPortfolio(auth.workspaceId);

    return NextResponse.json({ portfolio });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/rie/portfolio]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
