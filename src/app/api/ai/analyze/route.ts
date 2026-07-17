/**
 * POST /api/ai/analyze
 *
 * Analyze a conversation: intent, sentiment, action items, buying signal.
 * Results are persisted to ai_analysis table for caching.
 *
 * Requires: ai.use
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { analyzeConversation }                      from "@/lib/ai/service";
import { saveAnalysis, getAnalysis }                from "@/lib/server/db-ai";
import { trackEvent }                              from "@/lib/server/db-analytics";
import { recordAiUsage }                           from "@/lib/server/db-ai-usage";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "ai.use");

    const body = await req.json() as {
      conversationId: string;
      messages: Array<{ role: "client" | "agent"; content: string }>;
      clientName: string;
      channel: string;
      forceRefresh?: boolean;
    };

    if (!body.conversationId || !Array.isArray(body.messages) || !body.clientName) {
      return NextResponse.json({ error: "conversationId, messages, clientName required" }, { status: 400 });
    }

    // Return cached result if fresh (< 10 min) and not forced
    if (!body.forceRefresh) {
      const cached = getAnalysis(auth.workspaceId, "conversation", body.conversationId, "conversation");
      if (cached) {
        const ageMs = Date.now() - new Date(cached.created_at).getTime();
        if (ageMs < 10 * 60 * 1000) {
          return NextResponse.json({ analysis: JSON.parse(cached.result_json), cached: true });
        }
      }
    }

    const analysis = await analyzeConversation({
      messages:   body.messages,
      clientName: body.clientName,
      channel:    body.channel ?? "telegram",
    });

    saveAnalysis({
      workspaceId:  auth.workspaceId,
      entityType:   "conversation",
      entityId:     body.conversationId,
      analysisType: "conversation",
      resultJson:   JSON.stringify(analysis),
      model:        analysis.model,
      provider:     analysis.provider,
    });

    // Track AI usage
    try {
      trackEvent({ workspaceId: auth.workspaceId, userId: auth.userId, event: "ai_used", properties: { feature: "conversation_analysis" } });
      if (analysis.provider !== "none") {
        recordAiUsage({ workspaceId: auth.workspaceId, userId: auth.userId, feature: "conversation_analysis", provider: analysis.provider, model: analysis.model, inputTokens: 0, outputTokens: 0 });
      }
    } catch { /* non-fatal */ }

    return NextResponse.json({ analysis, cached: false });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/ai/analyze error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
