/**
 * src/lib/server/db-feedback.ts
 *
 * DB helpers for the `feedback` table.
 * Server-only — do NOT import in client components.
 */

import { getDb }      from "../db";
import { randomUUID } from "node:crypto";
import type { DbFeedback, FeedbackTypeDb } from "./models";

export interface SaveFeedbackParams {
  workspaceId: string;
  userId:      string | null;
  type:        FeedbackTypeDb;
  /** Rich structured object (will be JSON-encoded). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message:     Record<string, any>;
}

export function saveFeedback(params: SaveFeedbackParams): DbFeedback {
  const db = getDb();
  const id  = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO feedback (id, workspace_id, user_id, type, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, params.workspaceId, params.userId, params.type, JSON.stringify(params.message), now);

  return {
    id,
    workspace_id: params.workspaceId,
    user_id:      params.userId,
    type:         params.type,
    message:      JSON.stringify(params.message),
    created_at:   now,
  };
}

export function listFeedback(
  workspaceId: string,
  limit = 100,
): DbFeedback[] {
  return getDb()
    .prepare(
      `SELECT id, workspace_id, user_id, type, message, created_at
       FROM feedback
       WHERE workspace_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(workspaceId, limit) as unknown as DbFeedback[];
}

export function countFeedback(workspaceId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM feedback WHERE workspace_id = ?")
    .get(workspaceId) as { n: number };
  return row.n;
}
