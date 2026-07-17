/**
 * GET /api/tasks/summary
 *
 * Returns task counts for the current user's dashboard widgets.
 * Response: { my_tasks, overdue, due_today, completed_today, upcoming }
 */

import { NextRequest, NextResponse }               from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { getTaskSummary }                          from "@/lib/server/db-tasks";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "tasks.view");

    const summary = getTaskSummary(auth.workspaceId, auth.userId);
    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/tasks/summary]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
