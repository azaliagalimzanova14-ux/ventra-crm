/**
 * GET /api/rie/opportunities
 *
 * Returns AI-enriched relationship opportunities for the workspace.
 *
 * Flow:
 *   1. detectOpportunities() — deterministic SQL, no AI
 *   2. generateOpportunityInsights() — ONE AI call for all insights
 *   3. Merge insights into opportunities
 *
 * No cron, no cache, no background workers — on-demand only.
 * Requires: clients.view permission
 *
 * Response:
 *   200 { generatedAt, opportunities, clientCount, aiProvider }
 *   401/403/500 standard errors
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { detectOpportunities }                     from "@/lib/server/rie/opportunity-engine";
import { generateOpportunityInsights }             from "@/lib/ai/service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "clients.view");

    // Step 1: deterministic detection
    const result = detectOpportunities(auth.workspaceId);

    if (result.opportunities.length === 0) {
      return NextResponse.json({
        generatedAt:   result.generatedAt,
        opportunities: [],
        clientCount:   result.clientCount,
        aiProvider:    "none",
      });
    }

    // Step 2: ONE AI call to explain all signals
    const aiResult = await generateOpportunityInsights(
      result.opportunities.map((o) => ({
        id:               o.id,
        clientName:       o.clientName,
        type:             o.type,
        healthLabel:      o.healthLabel,
        daysSinceContact: o.daysSinceContact,
        overdueRatio:     o.overdueRatio,
        momentum:         o.momentum,
      })),
    );

    // Step 3: merge — update insight field on each opportunity
    const enriched = result.opportunities.map((o) => ({
      ...o,
      insight: aiResult.insights[o.id] ?? "",
    }));

    return NextResponse.json({
      generatedAt:   result.generatedAt,
      opportunities: enriched,
      clientCount:   result.clientCount,
      aiProvider:    aiResult.provider,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/rie/opportunities]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
