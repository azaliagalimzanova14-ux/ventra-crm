/**
 * POST   /api/tasks/[id]/checklist      — add a checklist item
 * PATCH  /api/tasks/[id]/checklist      — update a checklist item (body: { itemId, completed, title? })
 * DELETE /api/tasks/[id]/checklist      — delete a checklist item (body: { itemId })
 */

import { NextRequest, NextResponse }               from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import {
  getTask,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
} from "@/lib/server/db-tasks";

export const dynamic = "force-dynamic";

async function resolveTask(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth  = await requireAuth(req);
  const { id } = await context.params;
  const task  = getTask(id, auth.workspaceId);
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

    const body = await req.json() as { title?: string; order?: number };
    const title = body.title?.trim() ?? "";
    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

    const item = createChecklistItem(task.id, title, body.order);
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const e = err as { status?: number; message?: string };
    if (e.status === 404) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    console.error("[POST /api/tasks/[id]/checklist]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { auth, task } = await resolveTask(req, context);
    assertPermission(auth, "tasks.edit");
    void task;

    const body = await req.json() as { itemId?: string; completed?: boolean; title?: string };
    if (!body.itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 });

    const item = updateChecklistItem(body.itemId, body.completed ?? false, body.title);
    return NextResponse.json({ item });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const e = err as { status?: number };
    if (e.status === 404) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    console.error("[PATCH /api/tasks/[id]/checklist]", err);
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

    const body = await req.json() as { itemId?: string };
    if (!body.itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 });

    deleteChecklistItem(body.itemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const e = err as { status?: number };
    if (e.status === 404) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    console.error("[DELETE /api/tasks/[id]/checklist]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
