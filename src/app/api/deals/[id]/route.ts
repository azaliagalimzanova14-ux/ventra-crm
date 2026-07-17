/**
 * GET    /api/deals/[id] — get a single deal (full)
 * PATCH  /api/deals/[id] — update deal fields
 * DELETE /api/deals/[id] — delete a deal
 *
 * GET    requires: deals.view
 * PATCH  requires: deals.edit  (or deals.assign if only assigned_user_id changes)
 * DELETE requires: deals.delete
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { getDealFull, updateDeal, deleteDeal }       from "@/lib/server/db-deals";
import { logActivity }                              from "@/lib/server/db-activity";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// ── GET /api/deals/[id] ───────────────────────────────────────────────────────

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "deals.view");
    const { id } = await context.params;

    const deal = getDealFull(id, auth.workspaceId);
    if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ deal });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/deals/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PATCH /api/deals/[id] ─────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    const { id } = await context.params;
    const body = await req.json() as Record<string, unknown>;

    // Smart permission routing
    const keys = Object.keys(body);
    if (keys.length === 1 && keys[0] === "assigned_user_id") {
      assertPermission(auth, "deals.assign");
    } else {
      assertPermission(auth, "deals.edit");
    }

    const deal = updateDeal(id, auth.workspaceId, {
      title:            typeof body.title            === "string" ? body.title            : undefined,
      client_id:        "client_id"        in body   ? (body.client_id        as string | null) : undefined,
      value:            typeof body.value            === "number" ? body.value            : undefined,
      currency:         typeof body.currency         === "string" ? body.currency         : undefined,
      probability:      typeof body.probability      === "number" ? body.probability      : undefined,
      expected_close:   "expected_close"   in body   ? (body.expected_close   as string | null) : undefined,
      assigned_user_id: "assigned_user_id" in body   ? (body.assigned_user_id as string | null) : undefined,
      conversation_id:  "conversation_id"  in body   ? (body.conversation_id  as string | null) : undefined,
      description:      "description"      in body   ? (body.description      as string | null) : undefined,
    });

    const actType = keys.includes("assigned_user_id") ? "deal_assigned" : "deal_updated";
    logActivity({
      workspace_id: auth.workspaceId,
      user_id:      auth.userId,
      type:         actType,
      entity_type:  "deal",
      entity_id:    id,
      entity_name:  deal.title,
      detail:       `Updated deal "${deal.title}"`,
    });

    return NextResponse.json({ deal });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[PATCH /api/deals/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── DELETE /api/deals/[id] ────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "deals.delete");
    const { id } = await context.params;

    const deal = getDealFull(id, auth.workspaceId);
    if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });

    deleteDeal(id, auth.workspaceId);

    logActivity({
      workspace_id: auth.workspaceId,
      user_id:      auth.userId,
      type:         "deal_deleted",
      entity_type:  "deal",
      entity_id:    id,
      entity_name:  deal.title,
      detail:       `Deleted deal "${deal.title}"`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[DELETE /api/deals/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
