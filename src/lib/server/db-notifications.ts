/**
 * src/lib/server/db-notifications.ts
 *
 * CRUD helpers for the `notifications` and `notification_preferences` tables.
 */

import { getDb } from "../db";
import { randomUUID } from "node:crypto";
import type {
  DbNotification,
  DbNotificationPreference,
  Notification,
  NotificationKind,
  NotificationCategory,
  NotificationPriority,
} from "./models";

function now(): string {
  return new Date().toISOString();
}

/** Converts a DbNotification (read: 0|1) to Notification (read: boolean). */
function toNotification(row: DbNotification): Notification {
  return { ...row, read: row.read === 1 };
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface UpsertNotificationParams {
  id:           string;         // deterministic, entity-based ID (idempotent upsert)
  workspace_id: string;
  user_id:      string;
  kind:         NotificationKind;
  category:     NotificationCategory;
  priority:     NotificationPriority;
  title:        string;
  body:         string;
  href:         string;
  entity_id?:   string;
}

/**
 * Insert-or-update a notification by its deterministic `id`.
 * If the notification already exists and is unread, updates title/body/priority.
 * If it's already read, leaves it untouched (avoids re-surfacing dismissed items).
 */
export function upsertNotification(params: UpsertNotificationParams): DbNotification {
  const db = getDb();

  db.prepare(`
    INSERT INTO notifications
      (id, workspace_id, user_id, kind, category, priority, title, body, href, entity_id, read, created_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    ON CONFLICT(id) DO UPDATE SET
      kind     = excluded.kind,
      priority = excluded.priority,
      title    = excluded.title,
      body     = excluded.body,
      href     = excluded.href
    WHERE notifications.read = 0
  `).run(
    params.id,
    params.workspace_id,
    params.user_id,
    params.kind,
    params.category,
    params.priority,
    params.title,
    params.body,
    params.href,
    params.entity_id ?? null,
    now(),
  );

  return getNotificationByIdOrThrow(params.id);
}

export function createNotification(params: Omit<UpsertNotificationParams, "id">): DbNotification {
  return upsertNotification({ ...params, id: randomUUID() });
}

export function getNotificationById(id: string): DbNotification | null {
  const db = getDb();
  return (
    (db
      .prepare("SELECT * FROM notifications WHERE id = ?")
      .get(id) as DbNotification | undefined) ?? null
  );
}

export function getNotificationByIdOrThrow(id: string): DbNotification {
  const n = getNotificationById(id);
  if (!n) throw new Error(`Notification not found: ${id}`);
  return n;
}

export interface ListNotificationsParams {
  workspace_id: string;
  user_id:      string;
  category?:    NotificationCategory;
  read?:        boolean;
  limit?:       number;   // default 50, max 200
  cursor?:      string;   // created_at of last seen row
}

export function listNotifications(params: ListNotificationsParams): Notification[] {
  const db    = getDb();
  const limit = Math.min(params.limit ?? 50, 200);

  const clauses: string[] = [
    "workspace_id = ?",
    "user_id      = ?",
  ];
  const values: (string | number)[] = [params.workspace_id, params.user_id];

  if (params.category !== undefined) {
    clauses.push("category = ?");
    values.push(params.category);
  }
  if (params.read !== undefined) {
    clauses.push("read = ?");
    values.push(params.read ? 1 : 0);
  }
  if (params.cursor) {
    clauses.push("created_at < ?");
    values.push(params.cursor);
  }

  const sql = `
    SELECT * FROM notifications
    WHERE  ${clauses.join(" AND ")}
    ORDER  BY read ASC, created_at DESC
    LIMIT  ?
  `;

  const rows = db.prepare(sql).all(...values, limit) as unknown as DbNotification[];
  return rows.map(toNotification);
}

export function countUnread(workspaceId: string, userId: string): number {
  const db  = getDb();
  const row = db
    .prepare(
      "SELECT COUNT(*) AS n FROM notifications WHERE workspace_id = ? AND user_id = ? AND read = 0",
    )
    .get(workspaceId, userId) as { n: number };
  return row.n;
}

export function markNotificationRead(id: string, userId: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE notifications
    SET    read = 1, read_at = ?
    WHERE  id = ? AND user_id = ?
  `).run(now(), id, userId);
}

export function markAllNotificationsRead(
  workspaceId: string,
  userId:      string,
): number {
  const db     = getDb();
  const result = db.prepare(`
    UPDATE notifications
    SET    read = 1, read_at = ?
    WHERE  workspace_id = ? AND user_id = ? AND read = 0
  `).run(now(), workspaceId, userId) as { changes: number };
  return result.changes;
}

export function deleteNotification(id: string, userId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM notifications WHERE id = ? AND user_id = ?").run(id, userId);
}

// ── Notification Preferences ──────────────────────────────────────────────────

const DEFAULT_CATEGORIES: NotificationCategory[] = [
  "task", "deal", "client", "lead", "ai", "team", "system",
];

export function getNotificationPreferences(
  userId:      string,
  workspaceId: string,
): DbNotificationPreference[] {
  const db   = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM notification_preferences WHERE user_id = ? AND workspace_id = ? ORDER BY category",
    )
    .all(userId, workspaceId) as unknown as DbNotificationPreference[];

  // Return defaults for any category not yet stored
  const stored = new Set(rows.map((r) => r.category));
  const defaults: DbNotificationPreference[] = DEFAULT_CATEGORIES
    .filter((c) => !stored.has(c))
    .map((category) => ({
      user_id:      userId,
      workspace_id: workspaceId,
      category,
      in_app:       1,
      email:        0,
    }));

  return [...rows, ...defaults].sort((a, b) =>
    a.category.localeCompare(b.category),
  );
}

export interface UpdatePreferenceParams {
  category: NotificationCategory;
  in_app?:  boolean;
  email?:   boolean;
}

export function upsertNotificationPreference(
  userId:      string,
  workspaceId: string,
  params:      UpdatePreferenceParams,
): DbNotificationPreference {
  const db = getDb();

  db.prepare(`
    INSERT INTO notification_preferences (user_id, workspace_id, category, in_app, email)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, workspace_id, category) DO UPDATE SET
      in_app = COALESCE(excluded.in_app, notification_preferences.in_app),
      email  = COALESCE(excluded.email,  notification_preferences.email)
  `).run(
    userId,
    workspaceId,
    params.category,
    params.in_app !== undefined ? (params.in_app ? 1 : 0) : null,
    params.email  !== undefined ? (params.email  ? 1 : 0) : null,
  );

  return db
    .prepare(
      "SELECT * FROM notification_preferences WHERE user_id = ? AND workspace_id = ? AND category = ?",
    )
    .get(userId, workspaceId, params.category) as unknown as DbNotificationPreference;
}

// ── Maintenance ───────────────────────────────────────────────────────────────

/**
 * Deletes read notifications older than `days` days.
 * Keeps all unread notifications indefinitely.
 */
export function pruneOldNotifications(
  workspaceId: string,
  days = 90,
): number {
  const db        = getDb();
  const threshold = new Date(Date.now() - days * 86_400_000).toISOString();
  const result    = db.prepare(`
    DELETE FROM notifications
    WHERE workspace_id = ? AND read = 1 AND created_at < ?
  `).run(workspaceId, threshold) as { changes: number };
  return result.changes;
}
