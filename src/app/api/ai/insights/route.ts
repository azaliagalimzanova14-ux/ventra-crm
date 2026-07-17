/**
 * GET /api/ai/insights
 *
 * Generate workspace-level AI sales insights for the dashboard.
 * Pulls live metrics, then calls the AI service.
 *
 * Requires: ai.use
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { generateDashboardInsights }                from "@/lib/ai/service";
import { saveAnalysis, getAnalysis }                from "@/lib/server/db-ai";
import { getDealPipelineSummary, listDeals }        from "@/lib/server/db-deals";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "ai.use");

    const url          = new URL(req.url);
    const forceRefresh = url.searchParams.get("refresh") === "true";

    // Return cached if < 30 min
    if (!forceRefresh) {
      const cached = getAnalysis(auth.workspaceId, "workspace", auth.workspaceId, "dashboard_insights");
      if (cached) {
        const ageMs = Date.now() - new Date(cached.created_at).getTime();
        if (ageMs < 30 * 60 * 1000) {
          return NextResponse.json({ insights: JSON.parse(cached.result_json), cached: true });
        }
      }
    }

    // Gather workspace metrics
    const summary = getDealPipelineSummary(auth.workspaceId);

    // Find stale open deals (no update in 14+ days)
    const { deals: openDeals } = listDeals({
      workspace_id: auth.workspaceId,
      status: "open",
      limit: 100,
      offset: 0,
    });

    const now = Date.now();
    const staleDeals = openDeals
      .filter((d) => {
        const ageMs = now - new Date(d.updated_at).getTime();
        return ageMs > 14 * 24 * 60 * 60 * 1000;
      })
      .slice(0, 5)
      .map((d) => ({
        title:           d.title,
        daysSinceUpdate: Math.floor((now - new Date(d.updated_at).getTime()) / 86_400_000),
        value:           d.value,
      }));

    const insights = await generateDashboardInsights({
      openDeals:       summary.open_count,
      pipelineValue:   summary.pipeline_value,
      wonRevenue:      summary.won_revenue,
      currency:        summary.currency,
      inactiveClients: 0,   // extended in future milestones
      overdueTaskCount: 0,  // extended in future milestones
      staleDeals,
    });

    saveAnalysis({
      workspaceId:  auth.workspaceId,
      entityType:   "workspace",
      entityId:     auth.workspaceId,
      analysisType: "dashboard_insights",
      resultJson:   JSON.stringify(insights),
      model:        insights.model,
      provider:     insights.provider,
    });

    return NextResponse.json({ insights, cached: false });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/ai/insights error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
