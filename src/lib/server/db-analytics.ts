/**
 * src/lib/server/db-analytics.ts
 *
 * DB helpers for the `events` table (product analytics).
 * Server-only — do NOT import in client components.
 */

import { getDb }      from "../db";
import { randomUUID } from "node:crypto";
import type { DbEvent, AnalyticsEvent } from "./models";

export interface TrackEventParams {
  workspaceId: string;
  userId:      string | null;
  event:       AnalyticsEvent;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties?: Record<string, any>;
}

export function trackEvent(params: TrackEventParams): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO events (id, workspace_id, user_id, event, properties, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    params.workspaceId,
    params.userId,
    params.event,
    params.properties ? JSON.stringify(params.properties) : null,
    new Date().toISOString(),
  );
}

export interface EventCount {
  event: AnalyticsEvent;
  count: number;
}

/** Aggregate event counts for a workspace (last N days). */
export function getEventCounts(
  workspaceId: string,
  days = 30,
): EventCount[] {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  return getDb()
    .prepare(
      `SELECT event, COUNT(*) AS count
       FROM events
       WHERE workspace_id = ? AND created_at >= ?
       GROUP BY event
       ORDER BY count DESC`,
    )
    .all(workspaceId, since) as unknown as EventCount[];
}

/** Recent raw events for a workspace. */
export function listRecentEvents(
  workspaceId: string,
  limit = 200,
): DbEvent[] {
  return getDb()
    .prepare(
      `SELECT id, workspace_id, user_id, event, properties, created_at
       FROM events
       WHERE workspace_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(workspaceId, limit) as unknown as DbEvent[];
}
