/**
 * POST /api/ai/suggest-reply
 *
 * Generate 3 AI reply options (professional, friendly, short) for a conversation.
 * Saves results to ai_suggestions table.
 *
 * Requires: ai.use
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { generateReplyOptions }                     from "@/lib/ai/service";
import { saveSuggestion, getSuggestionsForConversation } from "@/lib/server/db-ai";

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
      agentName?: string;
      forceRefresh?: boolean;
    };

    if (!body.conversationId || !Array.isArray(body.messages) || !body.clientName) {
      return NextResponse.json({ error: "conversationId, messages, clientName required" }, { status: 400 });
    }

    // Return cached suggestions if < 5 min old and not forced
    if (!body.forceRefresh) {
      const cached = getSuggestionsForConversation(auth.workspaceId, body.conversationId);
      if (cached.length > 0) {
        const ageMs = Date.now() - new Date(cached[0].created_at).getTime();
        if (ageMs < 5 * 60 * 1000) {
          return NextResponse.json({
            suggestions: cached.map((s) => ({ id: s.id, style: s.type, content: s.content })),
            cached: true,
          });
        }
      }
    }

    const result = await generateReplyOptions({
      messages:   body.messages,
      clientName: body.clientName,
      channel:    body.channel ?? "telegram",
      agentName:  body.agentName,
    });

    // Persist each option
    const saved = await Promise.all(
      result.options.map(async (opt) => {
        const row = saveSuggestion({
          workspaceId:    auth.workspaceId,
          conversationId: body.conversationId,
          type:           opt.style,
          content:        opt.content,
        });
        return { id: row.id, style: opt.style, label: opt.label, content: opt.content };
      }),
    );

    return NextResponse.json({ suggestions: saved, context: result.context, cached: false });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/ai/suggest-reply error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
