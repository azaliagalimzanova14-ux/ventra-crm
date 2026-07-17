/**
 * src/lib/server/db-errors.ts
 *
 * DB helpers for the `system_errors` table.
 * Server-only — do NOT import in client components.
 */

import { getDb }      from "../db";
import { randomUUID } from "node:crypto";
import type { DbSystemError } from "./models";

export interface LogErrorParams {
  workspaceId?: string | null;
  userId?:      string | null;
  error:        string;
  page?:        string | null;
  stack?:       string | null;
}

export function logSystemError(params: LogErrorParams): DbSystemError {
  const db  = getDb();
  const id  = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO system_errors (id, workspace_id, user_id, error, page, stack, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.workspaceId ?? null,
    params.userId      ?? null,
    params.error,
    params.page        ?? null,
    params.stack       ?? null,
    now,
  );

  return {
    id,
    workspace_id: params.workspaceId ?? null,
    user_id:      params.userId      ?? null,
    error:        params.error,
    page:         params.page        ?? null,
    stack:        params.stack       ?? null,
    created_at:   now,
  };
}

export function listSystemErrors(
  workspaceId: string,
  limit = 100,
): DbSystemError[] {
  return getDb()
    .prepare(
      `SELECT id, workspace_id, user_id, error, page, stack, created_at
       FROM system_errors
       WHERE workspace_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(workspaceId, limit) as unknown as DbSystemError[];
}
