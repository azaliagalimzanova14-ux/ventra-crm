/**
 * src/lib/server/rie/context-builder.ts
 *
 * Shared Context Builder — Sprint 3.2 Feature 2
 *
 * Collects a normalized context snapshot for a client from existing tables.
 * Pure data collection — no AI calls, no new calculations.
 *
 * Used by:
 *   - narrative-engine.ts   → passes context to AI for specific recommendations
 *   - ClientTimeline.tsx     → surfaces via /api/clients/[id]/timeline
 *
 * Engineering rules:
 *   - ONE query per data type (messages, tasks, notes) — no N+1 patterns
 *   - All queries scope to workspace_id
 *   - Message content truncated to 150 chars for AI prompt safety
 *   - Never calls getClientRhythm() — rhythm is separate from context
 *
 * Server-only — do NOT import in client components.
 */

import { getDb } from "../../db";

// ── Public types ──────────────────────────────────────────────────────────────

export interface ContextMessage {
  role:      "client" | "agent";    // 'client' sender, anything else is 'agent'
  content:   string;                // truncated to 150 chars
  createdAt: string;                // ISO 8601
  channel:   string;                // conversation channel (telegram / email / etc.)
}

export interface ContextTask {
  title:   string;
  dueDate: string | null;
  status:  string;
}

export interface ClientContext {
  recentMessages: ContextMessage[];  // last 5 messages, newest first
  openTasks:      ContextTask[];     // open/in_progress tasks linked to client, max 3
  notes:          string | null;     // clients.notes free-text field
}

// ── Private DB row types ──────────────────────────────────────────────────────

interface MsgRow {
  sender_type: string;
  content:     string;
  created_at:  string;
  channel:     string;
}

interface TaskRow {
  title:    string;
  due_date: string | null;
  status:   string;
}

interface NoteRow {
  notes: string | null;
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Returns a normalized context snapshot for a client.
 *
 * Runs 3 lightweight queries:
 *   1. Last 5 messages across all conversations for this client
 *   2. Up to 3 open/in-progress tasks linked to this client
 *   3. Client notes (single column from clients table)
 *
 * Never throws — returns empty defaults on any error.
 */
export function getClientContext(
  workspaceId: string,
  clientId:    string,
): ClientContext {
  const db = getDb();

  // ── 1. Recent messages ────────────────────────────────────────────────────
  let recentMessages: ContextMessage[] = [];
  try {
    const rows = db.prepare(`
      SELECT
        m.sender_type,
        substr(m.content, 1, 150) AS content,
        m.created_at,
        c.channel
      FROM   messages       m
      JOIN   conversations  c ON m.conversation_id = c.id
      WHERE  c.workspace_id = ?
        AND  c.client_id    = ?
        AND  m.content      != ''
      ORDER  BY m.created_at DESC
      LIMIT  5
    `).all(workspaceId, clientId) as unknown as MsgRow[];

    recentMessages = rows.map((r) => ({
      role:      r.sender_type === "client" ? "client" : "agent",
      content:   r.content.trim(),
      createdAt: r.created_at,
      channel:   r.channel,
    }));
  } catch { /* best-effort — never block narrative generation */ }

  // ── 2. Open tasks ─────────────────────────────────────────────────────────
  let openTasks: ContextTask[] = [];
  try {
    const rows = db.prepare(`
      SELECT title, due_date, status
      FROM   tasks
      WHERE  workspace_id = ?
        AND  client_id    = ?
        AND  status       NOT IN ('done', 'cancelled')
      ORDER  BY
        CASE WHEN due_date IS NOT NULL THEN 0 ELSE 1 END,
        due_date ASC
      LIMIT  3
    `).all(workspaceId, clientId) as unknown as TaskRow[];

    openTasks = rows.map((r) => ({
      title:   r.title,
      dueDate: r.due_date,
      status:  r.status,
    }));
  } catch { /* best-effort */ }

  // ── 3. Client notes ───────────────────────────────────────────────────────
  let notes: string | null = null;
  try {
    const row = db.prepare(
      "SELECT notes FROM clients WHERE id = ? AND workspace_id = ?",
    ).get(clientId, workspaceId) as NoteRow | undefined;
    notes = row?.notes ?? null;
  } catch { /* best-effort */ }

  return { recentMessages, openTasks, notes };
}
