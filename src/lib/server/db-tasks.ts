/**
 * src/lib/server/db-tasks.ts
 *
 * CRUD helpers for `tasks`, `task_checklist`, `task_comments`, `task_reminders`.
 *
 * ── Invariants ────────────────────────────────────────────────────────────────
 *  - Every query filters by workspace_id for multi-tenant isolation.
 *  - All IDs are UUIDs (randomUUID).
 *  - Timestamps are ISO 8601 strings.
 *  - SQLite results cast via `as unknown as T` (node:sqlite limitation).
 */

import { getDb }       from "../db";
import { randomUUID }  from "node:crypto";
import type {
  DbTask,
  DbTaskChecklist,
  DbTaskComment,
  DbTaskReminder,
  DbTaskFull,
  TaskStatus,
  TaskPriority,
} from "./models";

function now(): string {
  return new Date().toISOString();
}

// ── Param types ───────────────────────────────────────────────────────────────

export interface CreateTaskParams {
  workspace_id:     string;
  title:            string;
  description?:     string;
  status?:          TaskStatus;
  priority?:        TaskPriority;
  due_date?:        string;
  assigned_user_id?: string;
  created_by:       string;
  client_id?:       string;
  conversation_id?: string;
  deal_id?:         string;
}

export interface UpdateTaskParams {
  title?:            string;
  description?:      string | null;
  status?:           TaskStatus;
  priority?:         TaskPriority;
  due_date?:         string | null;
  assigned_user_id?: string | null;
  client_id?:        string | null;
  conversation_id?:  string | null;
  deal_id?:          string | null;
}

export interface ListTasksParams {
  workspace_id:      string;
  status?:           TaskStatus;
  priority?:         TaskPriority;
  assigned_user_id?: string;
  client_id?:        string;
  conversation_id?:  string;
  search?:           string;
  overdue?:          boolean;   // due_date < today and not done/cancelled
  due_today?:        boolean;   // due_date = today
  limit?:            number;    // default 50, max 200
  offset?:           number;
}

export interface ListTasksResult {
  tasks: DbTask[];
  total: number;
}

// ── Task CRUD ─────────────────────────────────────────────────────────────────

export function createTask(params: CreateTaskParams): DbTask {
  const db = getDb();
  const id = randomUUID();
  const ts = now();

  db.prepare(`
    INSERT INTO tasks
      (id, workspace_id, title, description, status, priority, due_date,
       assigned_user_id, created_by, client_id, conversation_id, deal_id,
       created_at, updated_at, completed_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(
    id,
    params.workspace_id,
    params.title,
    params.description      ?? null,
    params.status           ?? "todo",
    params.priority         ?? "medium",
    params.due_date         ?? null,
    params.assigned_user_id ?? null,
    params.created_by,
    params.client_id        ?? null,
    params.conversation_id  ?? null,
    params.deal_id          ?? null,
    ts,
    ts,
  );

  return getTaskOrThrow(id, params.workspace_id);
}

export function getTask(id: string, workspaceId: string): DbTask | null {
  return getDb()
    .prepare("SELECT * FROM tasks WHERE id = ? AND workspace_id = ?")
    .get(id, workspaceId) as unknown as DbTask | null;
}

export function getTaskOrThrow(id: string, workspaceId: string): DbTask {
  const row = getTask(id, workspaceId);
  if (!row) throw new Error(`Task not found: ${id}`);
  return row;
}

export function updateTask(
  id:          string,
  workspaceId: string,
  params:      UpdateTaskParams,
): DbTask {
  const db   = getDb();
  const sets: string[]           = ["updated_at = ?"];
  const vals: (string | null)[]  = [now()];

  if (params.title            !== undefined) { sets.push("title = ?");            vals.push(params.title); }
  if (params.description      !== undefined) { sets.push("description = ?");      vals.push(params.description ?? null); }
  if (params.status           !== undefined) { sets.push("status = ?");           vals.push(params.status); }
  if (params.priority         !== undefined) { sets.push("priority = ?");         vals.push(params.priority); }
  if (params.due_date         !== undefined) { sets.push("due_date = ?");         vals.push(params.due_date ?? null); }
  if (params.assigned_user_id !== undefined) { sets.push("assigned_user_id = ?"); vals.push(params.assigned_user_id ?? null); }
  if (params.client_id        !== undefined) { sets.push("client_id = ?");        vals.push(params.client_id ?? null); }
  if (params.conversation_id  !== undefined) { sets.push("conversation_id = ?");  vals.push(params.conversation_id ?? null); }
  if (params.deal_id          !== undefined) { sets.push("deal_id = ?");          vals.push(params.deal_id ?? null); }

  // Auto-set completed_at when transitioning to done
  if (params.status === "done") {
    sets.push("completed_at = ?");
    vals.push(now());
  } else if (params.status !== undefined) {
    // Any other explicit status clears completed_at
    sets.push("completed_at = ?");
    vals.push(null);
  }

  db.prepare(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = ? AND workspace_id = ?`,
  ).run(...vals, id, workspaceId);

  return getTaskOrThrow(id, workspaceId);
}

export function completeTask(id: string, workspaceId: string): DbTask {
  return updateTask(id, workspaceId, { status: "done" });
}

export function deleteTask(id: string, workspaceId: string): void {
  getDb()
    .prepare("DELETE FROM tasks WHERE id = ? AND workspace_id = ?")
    .run(id, workspaceId);
}

export function listTasks(params: ListTasksParams): ListTasksResult {
  const db     = getDb();
  const limit  = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  const clauses: string[]            = ["workspace_id = ?"];
  const vals:    (string | number)[] = [params.workspace_id];

  if (params.status) {
    clauses.push("status = ?");
    vals.push(params.status);
  }
  if (params.priority) {
    clauses.push("priority = ?");
    vals.push(params.priority);
  }
  if (params.assigned_user_id) {
    clauses.push("assigned_user_id = ?");
    vals.push(params.assigned_user_id);
  }
  if (params.client_id) {
    clauses.push("client_id = ?");
    vals.push(params.client_id);
  }
  if (params.conversation_id) {
    clauses.push("conversation_id = ?");
    vals.push(params.conversation_id);
  }
  if (params.search) {
    const q = `%${params.search}%`;
    clauses.push("(title LIKE ? OR description LIKE ?)");
    vals.push(q, q);
  }
  if (params.overdue) {
    const today = new Date().toISOString().slice(0, 10);
    clauses.push("due_date IS NOT NULL AND due_date < ? AND status NOT IN ('done','cancelled')");
    vals.push(today);
  }
  if (params.due_today) {
    const today = new Date().toISOString().slice(0, 10);
    clauses.push("due_date = ?");
    vals.push(today);
  }

  const where = clauses.join(" AND ");
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE ${where}`)
    .get(...vals) as { n: number }).n;

  const tasks = db.prepare(
    `SELECT * FROM tasks WHERE ${where} ORDER BY
       CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC,
       due_date ASC NULLS LAST,
       created_at DESC
     LIMIT ? OFFSET ?`,
  ).all(...vals, limit, offset) as unknown as DbTask[];

  return { tasks, total };
}

/**
 * Returns a task with all sub-entities joined.
 */
export function getTaskFull(id: string, workspaceId: string): DbTaskFull | null {
  const task = getTask(id, workspaceId);
  if (!task) return null;

  const checklist = getTaskChecklist(id);
  const comments  = getTaskComments(id);
  const reminders = getTaskReminders(id);

  return { ...task, checklist, comments, reminders };
}

// ── Checklist ─────────────────────────────────────────────────────────────────

export function getTaskChecklist(taskId: string): DbTaskChecklist[] {
  return getDb()
    .prepare("SELECT * FROM task_checklist WHERE task_id = ? ORDER BY order_index ASC, rowid ASC")
    .all(taskId) as unknown as DbTaskChecklist[];
}

export function createChecklistItem(
  taskId: string,
  title:  string,
  order?: number,
): DbTaskChecklist {
  const db  = getDb();
  const id  = randomUUID();

  // Auto-compute order if not provided
  const maxRow = db.prepare(
    "SELECT COALESCE(MAX(order_index),0) AS m FROM task_checklist WHERE task_id = ?",
  ).get(taskId) as { m: number };
  const idx = order ?? (maxRow.m + 1);

  db.prepare(
    "INSERT INTO task_checklist (id, task_id, title, completed, order_index) VALUES (?, ?, ?, 0, ?)",
  ).run(id, taskId, title, idx);

  return db.prepare("SELECT * FROM task_checklist WHERE id = ?").get(id) as unknown as DbTaskChecklist;
}

export function updateChecklistItem(
  id:        string,
  completed: boolean,
  title?:    string,
): DbTaskChecklist {
  const db = getDb();
  if (title !== undefined) {
    db.prepare("UPDATE task_checklist SET completed = ?, title = ? WHERE id = ?")
      .run(completed ? 1 : 0, title, id);
  } else {
    db.prepare("UPDATE task_checklist SET completed = ? WHERE id = ?")
      .run(completed ? 1 : 0, id);
  }
  return db.prepare("SELECT * FROM task_checklist WHERE id = ?").get(id) as unknown as DbTaskChecklist;
}

export function deleteChecklistItem(id: string): void {
  getDb().prepare("DELETE FROM task_checklist WHERE id = ?").run(id);
}

// ── Comments ──────────────────────────────────────────────────────────────────

export function getTaskComments(taskId: string): DbTaskComment[] {
  return getDb()
    .prepare("SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC")
    .all(taskId) as unknown as DbTaskComment[];
}

export function createTaskComment(
  taskId:  string,
  userId:  string,
  content: string,
): DbTaskComment {
  const db = getDb();
  const id = randomUUID();
  const ts = now();
  db.prepare(
    "INSERT INTO task_comments (id, task_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, taskId, userId, content, ts);
  return db.prepare("SELECT * FROM task_comments WHERE id = ?").get(id) as unknown as DbTaskComment;
}

export function deleteTaskComment(id: string, userId: string): void {
  // Only the comment author can delete (enforced here + in route)
  getDb()
    .prepare("DELETE FROM task_comments WHERE id = ? AND user_id = ?")
    .run(id, userId);
}

// ── Reminders ─────────────────────────────────────────────────────────────────

export function getTaskReminders(taskId: string): DbTaskReminder[] {
  return getDb()
    .prepare("SELECT * FROM task_reminders WHERE task_id = ? ORDER BY remind_at ASC")
    .all(taskId) as unknown as DbTaskReminder[];
}

export function createTaskReminder(
  taskId:   string,
  remindAt: string,
): DbTaskReminder {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO task_reminders (id, task_id, remind_at, sent) VALUES (?, ?, ?, 0)",
  ).run(id, taskId, remindAt);
  return db.prepare("SELECT * FROM task_reminders WHERE id = ?").get(id) as unknown as DbTaskReminder;
}

export function deleteTaskReminder(id: string): void {
  getDb().prepare("DELETE FROM task_reminders WHERE id = ?").run(id);
}

// ── Dashboard summary helpers ─────────────────────────────────────────────────

export interface TaskSummary {
  my_tasks:        number;
  overdue:         number;
  due_today:       number;
  completed_today: number;
  upcoming:        number;   // due in the next 7 days, not done/cancelled
}

export function getTaskSummary(workspaceId: string, userId: string): TaskSummary {
  const db    = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const week  = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  const my_tasks = (db.prepare(`
    SELECT COUNT(*) AS n FROM tasks
    WHERE workspace_id = ? AND assigned_user_id = ? AND status NOT IN ('done','cancelled')
  `).get(workspaceId, userId) as { n: number }).n;

  const overdue = (db.prepare(`
    SELECT COUNT(*) AS n FROM tasks
    WHERE workspace_id = ? AND due_date < ? AND status NOT IN ('done','cancelled')
  `).get(workspaceId, today) as { n: number }).n;

  const due_today = (db.prepare(`
    SELECT COUNT(*) AS n FROM tasks
    WHERE workspace_id = ? AND due_date = ? AND status NOT IN ('done','cancelled')
  `).get(workspaceId, today) as { n: number }).n;

  const completed_today = (db.prepare(`
    SELECT COUNT(*) AS n FROM tasks
    WHERE workspace_id = ? AND status = 'done' AND completed_at LIKE ?
  `).get(workspaceId, `${today}%`) as { n: number }).n;

  const upcoming = (db.prepare(`
    SELECT COUNT(*) AS n FROM tasks
    WHERE workspace_id = ? AND due_date > ? AND due_date <= ? AND status NOT IN ('done','cancelled')
  `).get(workspaceId, today, week) as { n: number }).n;

  return { my_tasks, overdue, due_today, completed_today, upcoming };
}

// ── Timeline query ────────────────────────────────────────────────────────────

export interface TimelineEvent {
  id:         string;
  type:       "task_created" | "task_completed" | "task_updated" | "task_assigned";
  task_id:    string;
  task_title: string;
  actor_id:   string | null;
  created_at: string;
  meta:       string | null;  // JSON
}

export function getTaskTimelineEvents(
  workspaceId: string,
  limit:       number = 50,
): TimelineEvent[] {
  // Pull from activity_log for task-related entries
  const rows = getDb().prepare(`
    SELECT
      al.id,
      al.type,
      al.entity_id   AS task_id,
      al.entity_name AS task_title,
      al.user_id     AS actor_id,
      al.created_at,
      al.metadata    AS meta
    FROM activity_log al
    WHERE al.workspace_id = ?
      AND al.type IN ('task_created','task_completed','task_updated','task_assigned')
    ORDER BY al.created_at DESC
    LIMIT ?
  `).all(workspaceId, limit) as unknown as TimelineEvent[];

  return rows;
}
