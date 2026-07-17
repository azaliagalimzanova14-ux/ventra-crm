/**
 * GET  /api/deals — list deals (filters: status, stage_id, client_id, search, pagination)
 * POST /api/deals — create a new deal
 *
 * GET  requires: deals.view
 * POST requires: deals.create
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { listDeals, createDeal }                    from "@/lib/server/db-deals";
import { logActivity }                              from "@/lib/server/db-activity";
import { trackEvent }                              from "@/lib/server/db-analytics";
import { completeOnboardingStep }                  from "@/lib/server/db-onboarding";
import type { DealStatus }                          from "@/lib/server/models";

export const dynamic = "force-dynamic";

// ── GET /api/deals ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "deals.view");

    const url             = new URL(req.url);
    const status          = url.searchParams.get("status")           ?? undefined;
    const stage_id        = url.searchParams.get("stage_id")         ?? undefined;
    const client_id       = url.searchParams.get("client_id")        ?? undefined;
    const assigned        = url.searchParams.get("assigned_user_id") ?? undefined;
    const conversation_id = url.searchParams.get("conversation_id")  ?? undefined;
    const search          = url.searchParams.get("search")           ?? undefined;
    const limit  = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit")  ?? "50", 10) || 50));
    const offset = Math.max(0,               parseInt(url.searchParams.get("offset") ?? "0",  10) || 0);

    const { deals, total } = listDeals({
      workspace_id:     auth.workspaceId,
      status:           status as DealStatus | undefined,
      stage_id,
      client_id,
      assigned_user_id: assigned,
      conversation_id,
      search,
      limit,
      offset,
    });

    return NextResponse.json({ deals, total, limit, offset });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/deals]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/deals ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "deals.create");

    const body = await req.json() as {
      title?:            string;
      client_id?:        string;
      stage_id?:         string;
      value?:            number;
      currency?:         string;
      probability?:      number;
      expected_close?:   string;
      assigned_user_id?: string;
      conversation_id?:  string;
      description?:      string;
    };

    const title = body.title?.trim() ?? "";
    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const deal = createDeal({
      workspace_id:     auth.workspaceId,
      title,
      client_id:        body.client_id        || undefined,
      stage_id:         body.stage_id         || undefined,
      value:            body.value            ?? 0,
      currency:         body.currency         || "USD",
      probability:      body.probability      ?? 0,
      expected_close:   body.expected_close   || undefined,
      assigned_user_id: body.assigned_user_id || undefined,
      conversation_id:  body.conversation_id  || undefined,
      description:      body.description      || undefined,
      created_by:       auth.userId,
    });

    logActivity({
      workspace_id: auth.workspaceId,
      user_id:      auth.userId,
      type:         "deal_created",
      entity_type:  "deal",
      entity_id:    deal.id,
      entity_name:  deal.title,
      detail:       `Created deal "${deal.title}"`,
    });

    try {
      trackEvent({ workspaceId: auth.workspaceId, userId: auth.userId, event: "deal_created" });
      completeOnboardingStep(auth.workspaceId, "create_deal");
    } catch { /* non-fatal */ }

    return NextResponse.json({ deal }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[POST /api/deals]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
