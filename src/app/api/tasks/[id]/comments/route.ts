/**
 * POST   /api/tasks/[id]/comments — add a comment
 * DELETE /api/tasks/[id]/comments — delete a comment (body: { commentId })
 *
 * Users may only delete their own comments (enforced in db helper + here).
 */

import { NextRequest, NextResponse }               from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { getTask, createTaskComment, deleteTaskComment } from "@/lib/server/db-tasks";

export const dynamic = "force-dynamic";

async function resolveTask(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth   = await requireAuth(req);
  const { id } = await context.params;
  const task   = getTask(id, auth.workspaceId);
  if (!task) throw Object.assign(new Error("Task not found"), { status: 404 });
  return { auth, task };
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { auth, task } = await resolveTask(req, context);
    assertPermission(auth, "tasks.view"); // anyone who can view can comment

    const body = await req.json() as { content?: string };
    const content = body.content?.trim() ?? "";
    if (!content) return NextResponse.json({ error: "content is required" }, { status: 400 });

    const comment = createTaskComment(task.id, auth.userId, content);
    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const e = err as { status?: number };
    if (e.status === 404) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    console.error("[POST /api/tasks/[id]/comments]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { auth, task } = await resolveTask(req, context);
    void task;

    const body = await req.json() as { commentId?: string };
    if (!body.commentId) return NextResponse.json({ error: "commentId is required" }, { status: 400 });

    deleteTaskComment(body.commentId, auth.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const e = err as { status?: number };
    if (e.status === 404) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    console.error("[DELETE /api/tasks/[id]/comments]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
