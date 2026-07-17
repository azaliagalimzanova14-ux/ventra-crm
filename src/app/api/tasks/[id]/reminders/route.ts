/**
 * POST   /api/tasks/[id]/reminders — create a reminder (body: { remind_at: ISO string })
 * DELETE /api/tasks/[id]/reminders — delete a reminder  (body: { reminderId })
 */

import { NextRequest, NextResponse }               from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { getTask, createTaskReminder, deleteTaskReminder } from "@/lib/server/db-tasks";

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
    assertPermission(auth, "tasks.edit");

    const body = await req.json() as { remind_at?: string };
    const remindAt = body.remind_at?.trim() ?? "";
    if (!remindAt) return NextResponse.json({ error: "remind_at is required" }, { status: 400 });

    const reminder = createTaskReminder(task.id, remindAt);
    return NextResponse.json({ reminder }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const e = err as { status?: number };
    if (e.status === 404) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    console.error("[POST /api/tasks/[id]/reminders]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { auth, task } = await resolveTask(req, context);
    assertPermission(auth, "tasks.edit");
    void task;

    const body = await req.json() as { reminderId?: string };
    if (!body.reminderId) return NextResponse.json({ error: "reminderId is required" }, { status: 400 });

    deleteTaskReminder(body.reminderId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const e = err as { status?: number };
    if (e.status === 404) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    console.error("[DELETE /api/tasks/[id]/reminders]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
