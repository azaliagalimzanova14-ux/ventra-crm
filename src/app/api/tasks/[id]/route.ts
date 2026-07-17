/**
 * GET    /api/tasks/[id] — get task with checklist, comments, reminders
 * PATCH  /api/tasks/[id] — update task (assign-only → tasks.assign; otherwise tasks.edit)
 * DELETE /api/tasks/[id] — delete task (requires tasks.delete)
 */

import { NextRequest, NextResponse }               from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { getTaskFull, updateTask, deleteTask }      from "@/lib/server/db-tasks";
import { logActivity }                              from "@/lib/server/db-activity";
import { trackEvent }                              from "@/lib/server/db-analytics";
import { completeOnboardingStep }                  from "@/lib/server/db-onboarding";
import type { TaskStatus, TaskPriority }            from "@/lib/server/models";

export const dynamic = "force-dynamic";

// ── GET /api/tasks/[id] ───────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "tasks.view");
    const { id } = await context.params;

    const task = getTaskFull(id, auth.workspaceId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/tasks/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PATCH /api/tasks/[id] ─────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    const { id } = await context.params;

    const body = await req.json() as {
      title?:            string;
      description?:      string | null;
      status?:           TaskStatus;
      priority?:         TaskPriority;
      due_date?:         string | null;
      assigned_user_id?: string | null;
      client_id?:        string | null;
      conversation_id?:  string | null;
      deal_id?:          string | null;
    };

    const keys = Object.keys(body);

    // Determine which permission is required
    if (keys.length === 1 && keys[0] === "assigned_user_id") {
      assertPermission(auth, "tasks.assign");
    } else if (keys.length === 1 && keys[0] === "status" && body.status === "done") {
      assertPermission(auth, "tasks.complete");
    } else {
      assertPermission(auth, "tasks.edit");
    }

    const existing = getTaskFull(id, auth.workspaceId);
    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const updated = updateTask(id, auth.workspaceId, body);

    // Determine activity type
    let activityType: "task_updated" | "task_completed" | "task_assigned" = "task_updated";
    if (body.status === "done") activityType = "task_completed";
    else if (keys.length === 1 && keys[0] === "assigned_user_id") activityType = "task_assigned";

    logActivity({
      workspace_id: auth.workspaceId,
      user_id:      auth.userId,
      type:         activityType,
      entity_type:  "task",
      entity_id:    updated.id,
      entity_name:  updated.title,
      detail:
        activityType === "task_completed"
          ? `Completed task "${updated.title}"`
          : activityType === "task_assigned"
          ? `Assigned task "${updated.title}" to user ${updated.assigned_user_id ?? "nobody"}`
          : `Updated task "${updated.title}"`,
    });

    if (body.status === "done") {
      try {
        trackEvent({ workspaceId: auth.workspaceId, userId: auth.userId, event: "task_completed" });
        completeOnboardingStep(auth.workspaceId, "create_task");
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({ task: updated });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[PATCH /api/tasks/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── DELETE /api/tasks/[id] ────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "tasks.delete");
    const { id } = await context.params;

    const existing = getTaskFull(id, auth.workspaceId);
    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    deleteTask(id, auth.workspaceId);

    logActivity({
      workspace_id: auth.workspaceId,
      user_id:      auth.userId,
      type:         "task_deleted",
      entity_type:  "task",
      entity_id:    id,
      entity_name:  existing.title,
      detail:       `Deleted task "${existing.title}"`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[DELETE /api/tasks/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
