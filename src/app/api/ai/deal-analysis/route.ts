/**
 * POST /api/ai/deal-analysis
 *
 * Analyze deal health: score, risks, opportunities, next actions.
 * Results cached in ai_analysis (entity_type=deal, analysis_type=deal_health).
 *
 * Requires: ai.use
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { analyzeDeal }                              from "@/lib/ai/service";
import { saveAnalysis, getAnalysis }                from "@/lib/server/db-ai";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "ai.use");

    const body = await req.json() as {
      dealId:          string;
      title:           string;
      stage:           string;
      value:           number;
      currency:        string;
      probability:     number;
      expectedClose?:  string | null;
      daysSinceUpdate: number;
      clientName?:     string | null;
      description?:    string | null;
      forceRefresh?:   boolean;
    };

    if (!body.dealId || !body.title) {
      return NextResponse.json({ error: "dealId and title required" }, { status: 400 });
    }

    // Return cached if < 30 min
    if (!body.forceRefresh) {
      const cached = getAnalysis(auth.workspaceId, "deal", body.dealId, "deal_health");
      if (cached) {
        const ageMs = Date.now() - new Date(cached.created_at).getTime();
        if (ageMs < 30 * 60 * 1000) {
          return NextResponse.json({ analysis: JSON.parse(cached.result_json), cached: true });
        }
      }
    }

    const analysis = await analyzeDeal({
      title:           body.title,
      stage:           body.stage,
      value:           body.value        ?? 0,
      currency:        body.currency     ?? "USD",
      probability:     body.probability  ?? 0,
      expectedClose:   body.expectedClose  ?? null,
      daysSinceUpdate: body.daysSinceUpdate ?? 0,
      clientName:      body.clientName     ?? null,
      description:     body.description    ?? null,
    });

    saveAnalysis({
      workspaceId:  auth.workspaceId,
      entityType:   "deal",
      entityId:     body.dealId,
      analysisType: "deal_health",
      resultJson:   JSON.stringify(analysis),
      model:        analysis.model,
      provider:     analysis.provider,
    });

    return NextResponse.json({ analysis, cached: false });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/ai/deal-analysis error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
