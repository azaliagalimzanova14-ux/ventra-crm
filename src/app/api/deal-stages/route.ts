/**
 * GET /api/deal-stages — list all deal stages for the current workspace
 *
 * Requires: deals.view
 * Auto-seeds default stages if none exist (idempotent).
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { listDealStages }                           from "@/lib/server/db-deals";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "deals.view");

    const stages = listDealStages(auth.workspaceId);
    return NextResponse.json({ stages });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/deal-stages]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
