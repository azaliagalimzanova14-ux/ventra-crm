/**
 * src/lib/server/db-activity.ts
 *
 * CRUD helpers for the `activity_log` table.
 *
 * All CRM mutations should call `logActivity()` after making their change.
 * The helpers here are intentionally simple: no side-effects beyond the DB write.
 */

import { getDb } from "../db";
import { randomUUID } from "node:crypto";
import type {
  DbActivityEntry,
  ActivityType,
  ActivityEntityType,
} from "./models";

function now(): string {
  return new Date().toISOString();
}

// ── Write ─────────────────────────────────────────────────────────────────────

export interface LogActivityParams {
  workspace_id:  string;
  user_id?:      string;          // null for system-generated events
  type:          ActivityType;
  entity_type?:  ActivityEntityType;
  entity_id?:    string;
  entity_name?:  string;
  detail?:       string;          // human-readable, e.g. "moved from Proposal to Won"
  metadata?:     Record<string, unknown>;
}

export function logActivity(params: LogActivityParams): DbActivityEntry {
  const db = getDb();
  const id = randomUUID();

  db.prepare(`
    INSERT INTO activity_log
      (id, workspace_id, user_id, type, entity_type, entity_id, entity_name, detail, metadata, created_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.workspace_id,
    params.user_id     ?? null,
    params.type,
    params.entity_type ?? null,
    params.entity_id   ?? null,
    params.entity_name ?? null,
    params.detail      ?? null,
    params.metadata    ? JSON.stringify(params.metadata) : null,
    now(),
  );

  return getActivityEntryOrThrow(id);
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function getActivityEntryOrThrow(id: string): DbActivityEntry {
  const db  = getDb();
  const row = db
    .prepare("SELECT * FROM activity_log WHERE id = ?")
    .get(id) as DbActivityEntry | undefined;
  if (!row) throw new Error(`ActivityEntry not found: ${id}`);
  return row;
}

export interface ListActivityParams {
  workspace_id:  string;
  user_id?:      string;
  entity_type?:  ActivityEntityType;
  entity_id?:    string;
  types?:        ActivityType[];
  /** ISO string — return entries created after this timestamp */
  after?:        string;
  limit?:        number;   // default 20, max 100
  /** cursor: the created_at value of the last seen row (for pagination) */
  cursor?:       string;
}

export function listActivity(params: ListActivityParams): DbActivityEntry[] {
  const db       = getDb();
  const limit    = Math.min(params.limit ?? 20, 100);
  const clauses: string[] = ["workspace_id = ?"];
  const values:  (string | number)[] = [params.workspace_id];

  if (params.user_id) {
    clauses.push("user_id = ?");
    values.push(params.user_id);
  }
  if (params.entity_type) {
    clauses.push("entity_type = ?");
    values.push(params.entity_type);
  }
  if (params.entity_id) {
    clauses.push("entity_id = ?");
    values.push(params.entity_id);
  }
  if (params.types && params.types.length > 0) {
    const placeholders = params.types.map(() => "?").join(", ");
    clauses.push(`type IN (${placeholders})`);
    values.push(...params.types);
  }
  if (params.after) {
    clauses.push("created_at > ?");
    values.push(params.after);
  }
  if (params.cursor) {
    clauses.push("created_at < ?");
    values.push(params.cursor);
  }

  const sql = `
    SELECT * FROM activity_log
    WHERE  ${clauses.join(" AND ")}
    ORDER  BY created_at DESC
    LIMIT  ?
  `;

  return db.prepare(sql).all(...values, limit) as unknown as DbActivityEntry[];
}

// ── Page-based list (for activity log UI) ─────────────────────────────────────

export interface ActivityPage {
  entries: DbActivityEntry[];
  total:   number;
  page:    number;
  pages:   number;
}

/**
 * Returns a page of activity entries for a workspace, newest first.
 * Joins nothing — caller resolves user names from returned user_ids.
 */
export function listActivityPage(
  workspaceId: string,
  page    = 1,
  perPage = 20,
): ActivityPage {
  const db     = getDb();
  const offset = (Math.max(1, page) - 1) * Math.min(perPage, 100);
  const limit  = Math.min(perPage, 100);

  const entries = db.prepare(`
    SELECT * FROM activity_log
    WHERE  workspace_id = ?
    ORDER  BY created_at DESC
    LIMIT  ? OFFSET ?
  `).all(workspaceId, limit, offset) as unknown as DbActivityEntry[];

  const { n } = db.prepare(
    "SELECT COUNT(*) AS n FROM activity_log WHERE workspace_id = ?",
  ).get(workspaceId) as { n: number };

  return {
    entries,
    total: n,
    page:  Math.max(1, page),
    pages: Math.max(1, Math.ceil(n / limit)),
  };
}

/** Count unread/total activity entries for a workspace (for badge display). */
export function countActivity(workspaceId: string): number {
  const db  = getDb();
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM activity_log WHERE workspace_id = ?")
    .get(workspaceId) as { n: number };
  return row.n;
}

/** Parse the metadata JSON blob safely. */
export function parseActivityMetadata(
  entry: DbActivityEntry,
): Record<string, unknown> {
  if (!entry.metadata) return {};
  try {
    return JSON.parse(entry.metadata) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ── Maintenance ───────────────────────────────────────────────────────────────

/**
 * Deletes activity entries older than `days` days for a workspace.
 * Default: 365 days.
 */
export function pruneOldActivity(workspaceId: string, days = 365): number {
  const db        = getDb();
  const threshold = new Date(Date.now() - days * 86_400_000).toISOString();
  const result    = db.prepare(`
    DELETE FROM activity_log
    WHERE workspace_id = ? AND created_at < ?
  `).run(workspaceId, threshold) as { changes: number };
  return result.changes;
}
