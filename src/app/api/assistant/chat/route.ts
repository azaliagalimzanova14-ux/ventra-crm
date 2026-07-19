/**
 * POST /api/assistant/chat
 *
 * Real AI response endpoint for the AI Workspace chat.
 * Replaces the rule-based generateResponse() when AI is available.
 *
 * Request body: { message: string }
 *
 * Flow:
 *   1. Fetch founder memory context (buildMemoryContext)
 *   2. Fetch portfolio snapshot (getPortfolio) → convert to text summary
 *   3. Call generateAssistantResponse() — ONE AI call
 *
 * Response:
 *   200 { response: string; provider: string; model: string }
 *   400 { error: "Message is required" }
 *   503 { error: "AI not available" }   — triggers client fallback to rule-based
 *   401/403/500 standard errors
 *
 * No cron, no cache, no background workers — on-demand only.
 * Requires: clients.view permission
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { buildMemoryContext }                       from "@/lib/server/memory/memory-store";
import { getPortfolio }                            from "@/lib/server/rie/portfolio-engine";
import { generateAssistantResponse }               from "@/lib/ai/service";

export const dynamic = "force-dynamic";

/** Converts the portfolio snapshot to a short text block for AI grounding. */
function buildPortfolioSummary(workspaceId: string): string {
  try {
    const p = getPortfolio(workspaceId);
    const lines: string[] = [
      `Total active clients: ${p.totalActive}`,
    ];
    if (p.overdue.length > 0) {
      lines.push(`Overdue relationships: ${p.overdue.map((c) => c.name).slice(0, 5).join(", ")}`);
    }
    if (p.declining.length > 0) {
      lines.push(`Declining relationships: ${p.declining.map((c) => c.name).slice(0, 5).join(", ")}`);
    }
    if (p.improving.length > 0) {
      lines.push(`Improving relationships: ${p.improving.map((c) => c.name).slice(0, 5).join(", ")}`);
    }
    if (p.untracked > 0) {
      lines.push(`Clients without tracking data: ${p.untracked}`);
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "clients.view");

    const body    = await req.json() as { message?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Gather grounding context
    const memoryContext    = buildMemoryContext(auth.workspaceId);
    const portfolioSummary = buildPortfolioSummary(auth.workspaceId);

    // AI call
    const result = await generateAssistantResponse({
      message,
      memoryContext,
      portfolioSummary,
    });

    if (result.provider === "none") {
      // Signal client to fall back to rule-based response
      return NextResponse.json({ error: "AI not available" }, { status: 503 });
    }

    return NextResponse.json({
      response: result.response,
      provider: result.provider,
      model:    result.model,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[POST /api/assistant/chat]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
