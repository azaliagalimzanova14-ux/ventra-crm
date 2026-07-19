/**
 * GET  /api/memory — list all memory entries for the workspace
 * POST /api/memory — create a new memory entry  { content: string }
 *
 * Requires: workspace membership (clients.view permission)
 *
 * Response shapes:
 *   GET  200 { entries: MemoryEntry[] }
 *   POST 201 { entry: MemoryEntry }
 *   POST 409 { error: "Memory limit reached (20 entries)" }
 *   POST 400 { error: "Content is required" }
 *   401/403/500 standard errors
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { getAllEntries, createEntry }               from "@/lib/server/memory/memory-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "clients.view");

    const entries = getAllEntries(auth.workspaceId);
    return NextResponse.json({ entries });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/memory]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "clients.view");

    const body    = await req.json() as { content?: unknown };
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const entry = createEntry(auth.workspaceId, content);
    if (!entry) {
      return NextResponse.json(
        { error: "Memory limit reached (20 entries)" },
        { status: 409 },
      );
    }

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[POST /api/memory]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
