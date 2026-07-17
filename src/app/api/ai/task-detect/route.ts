/**
 * POST /api/ai/task-detect
 *
 * Extract actionable tasks from conversation text using AI.
 *
 * Requires: ai.use
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { detectTasksFromText }                      from "@/lib/ai/service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "ai.use");

    const body = await req.json() as {
      text:        string;
      clientName?: string;
    };

    if (!body.text) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }

    const result = await detectTasksFromText({
      text:       body.text,
      clientName: body.clientName ?? "the client",
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/ai/task-detect error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
