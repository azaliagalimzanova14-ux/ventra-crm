/**
 * GET  /api/tasks — list tasks (filters: status, priority, assigned, client, search, pagination)
 * POST /api/tasks — create a new task
 *
 * GET  requires: tasks.view
 * POST requires: tasks.create
 */

import { NextRequest, NextResponse }               from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { listTasks, createTask }                    from "@/lib/server/db-tasks";
import { logActivity }                              from "@/lib/server/db-activity";
import { completeOnboardingStep }                  from "@/lib/server/db-onboarding";
import type { TaskStatus, TaskPriority }            from "@/lib/server/models";

export const dynamic = "force-dynamic";

// ── GET /api/tasks ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "tasks.view");

    const url             = new URL(req.url);
    const status          = url.searchParams.get("status")           ?? undefined;
    const priority        = url.searchParams.get("priority")         ?? undefined;
    const assigned        = url.searchParams.get("assigned_user_id") ?? undefined;
    const client_id       = url.searchParams.get("client_id")        ?? undefined;
    const conversation_id = url.searchParams.get("conversation_id")  ?? undefined;
    const search          = url.searchParams.get("search")           ?? undefined;
    const overdue         = url.searchParams.get("overdue") === "true";
    const due_today       = url.searchParams.get("due_today") === "true";
    const limit  = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit")  ?? "50",  10) || 50));
    const offset = Math.max(0,               parseInt(url.searchParams.get("offset") ?? "0",   10) || 0);

    const { tasks, total } = listTasks({
      workspace_id:      auth.workspaceId,
      status:            status   as TaskStatus   | undefined,
      priority:          priority as TaskPriority | undefined,
      assigned_user_id:  assigned,
      client_id,
      conversation_id,
      search,
      overdue,
      due_today,
      limit,
      offset,
    });

    return NextResponse.json({ tasks, total, limit, offset });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/tasks]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/tasks ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "tasks.create");

    const body = await req.json() as {
      title?:            string;
      description?:      string;
      status?:           TaskStatus;
      priority?:         TaskPriority;
      due_date?:         string;
      assigned_user_id?: string;
      client_id?:        string;
      conversation_id?:  string;
      deal_id?:          string;
    };

    const title = body.title?.trim() ?? "";
    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const task = createTask({
      workspace_id:     auth.workspaceId,
      title,
      description:      body.description      || undefined,
      status:           body.status           || "todo",
      priority:         body.priority         || "medium",
      due_date:         body.due_date         || undefined,
      assigned_user_id: body.assigned_user_id || undefined,
      created_by:       auth.userId,
      client_id:        body.client_id        || undefined,
      conversation_id:  body.conversation_id  || undefined,
      deal_id:          body.deal_id          || undefined,
    });

    logActivity({
      workspace_id: auth.workspaceId,
      user_id:      auth.userId,
      type:         "task_created",
      entity_type:  "task",
      entity_id:    task.id,
      entity_name:  task.title,
      detail:       `Created task "${task.title}"`,
    });

    try {
      completeOnboardingStep(auth.workspaceId, "create_task");
    } catch { /* non-fatal */ }

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[POST /api/tasks]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
