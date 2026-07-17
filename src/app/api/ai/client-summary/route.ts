/**
 * POST /api/ai/client-summary
 *
 * Generate an AI relationship summary for a client.
 * Results cached in ai_analysis (entity_type=client, analysis_type=client_summary).
 *
 * Requires: ai.use
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { generateClientSummary }                    from "@/lib/ai/service";
import { saveAnalysis, getAnalysis }                from "@/lib/server/db-ai";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "ai.use");

    const body = await req.json() as {
      clientId:         string;
      clientName:       string;
      company?:         string;
      recentMessages?:  string[];
      dealCount?:       number;
      taskCount?:       number;
      daysSinceContact?: number;
      forceRefresh?:    boolean;
    };

    if (!body.clientId || !body.clientName) {
      return NextResponse.json({ error: "clientId and clientName required" }, { status: 400 });
    }

    // Return cached if < 30 min
    if (!body.forceRefresh) {
      const cached = getAnalysis(auth.workspaceId, "client", body.clientId, "client_summary");
      if (cached) {
        const ageMs = Date.now() - new Date(cached.created_at).getTime();
        if (ageMs < 30 * 60 * 1000) {
          return NextResponse.json({ summary: JSON.parse(cached.result_json), cached: true });
        }
      }
    }

    const summary = await generateClientSummary({
      clientName:       body.clientName,
      company:          body.company,
      recentMessages:   body.recentMessages   ?? [],
      dealCount:        body.dealCount        ?? 0,
      taskCount:        body.taskCount        ?? 0,
      daysSinceContact: body.daysSinceContact ?? 0,
    });

    saveAnalysis({
      workspaceId:  auth.workspaceId,
      entityType:   "client",
      entityId:     body.clientId,
      analysisType: "client_summary",
      resultJson:   JSON.stringify(summary),
      model:        summary.model,
      provider:     summary.provider,
    });

    return NextResponse.json({ summary, cached: false });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/ai/client-summary error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
