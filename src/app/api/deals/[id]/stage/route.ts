/**
 * PATCH /api/deals/[id]/stage — move a deal to a different stage
 *
 * Requires: deals.edit (or deals.close if moving to a won/lost stage)
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { moveDealStage, getDealStage }              from "@/lib/server/db-deals";
import { logActivity }                              from "@/lib/server/db-activity";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    const { id } = await context.params;
    const body = await req.json() as { stage_id?: string };

    const stageId = body.stage_id?.trim();
    if (!stageId) {
      return NextResponse.json({ error: "stage_id is required" }, { status: 400 });
    }

    // Check if this is a closing move (won/lost stage) to require deals.close
    const stage = getDealStage(stageId, auth.workspaceId);
    if (!stage) {
      return NextResponse.json({ error: "Stage not found" }, { status: 404 });
    }

    if (stage.is_won || stage.is_lost) {
      assertPermission(auth, "deals.close");
    } else {
      assertPermission(auth, "deals.edit");
    }

    const deal = moveDealStage(id, auth.workspaceId, stageId);

    const actType = stage.is_won ? "deal_won" : stage.is_lost ? "deal_lost" : "deal_stage_changed";
    logActivity({
      workspace_id: auth.workspaceId,
      user_id:      auth.userId,
      type:         actType,
      entity_type:  "deal",
      entity_id:    id,
      entity_name:  deal.title,
      detail:       `Moved deal "${deal.title}" to ${stage.name}`,
    });

    return NextResponse.json({ deal });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[PATCH /api/deals/[id]/stage]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
