/**
 * POST /api/errors — log a client-side error for error monitoring
 *
 * Called from the global error boundary. Auth is optional (errors may occur
 * before auth context is available), so we try to get context but don't require it.
 */

import { NextRequest, NextResponse }   from "next/server";
import { requireAuth }                 from "@/lib/server/auth-helpers";
import { logSystemError }              from "@/lib/server/db-errors";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as {
      error: string;
      page?:  string;
      stack?: string;
    };

    if (!body.error) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // Best-effort auth — don't reject if not logged in
    let workspaceId: string | null = null;
    let userId: string | null      = null;

    try {
      const auth = await requireAuth(req);
      workspaceId = auth.workspaceId;
      userId      = auth.userId;
    } catch { /* no auth context — that's fine */ }

    logSystemError({
      workspaceId,
      userId,
      error: body.error.slice(0, 2000),
      page:  body.page  ?? null,
      stack: body.stack ? body.stack.slice(0, 5000) : null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn("POST /api/errors failed:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
