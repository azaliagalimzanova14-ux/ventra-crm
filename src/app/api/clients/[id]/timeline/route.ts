/**
 * GET /api/clients/[id]/timeline
 *
 * Returns a chronological relationship timeline for a single client.
 *
 * Three event types merged and sorted newest-first:
 *
 *   "health"   — a narrative snapshot row (relationship_health + narrative preview)
 *                from rie_relationship_narratives (both current and archived rows)
 *
 *   "contact"  — a day's worth of messages compressed into one event
 *                (date, count, first sender, last message preview)
 *
 *   "task"     — a task creation or completion event
 *
 * Query params:
 *   limit  — default 40, max 80
 *
 * Requires: clients.view permission
 *
 * Response:
 *   200 { events: TimelineEvent[], clientName: string }
 *   400 — missing / invalid id
 *   401 — unauthenticated
 *   403 — insufficient permission
 *   404 — client not found in this workspace
 *   500 — internal error
 */

import { NextRequest, NextResponse }               from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { getDb }                                   from "@/lib/db";

export const dynamic = "force-dynamic";

// ── Public event type ──────────────────────────────────────────────────────────

export interface TimelineEvent {
  id:        string;
  kind:      "health" | "contact" | "task";
  timestamp: string;                                     // ISO 8601 — sort key
  // health event
  healthLabel?: string;
  narrative?:   string;
  momentum?:    string;
  confidence?:  number;
  // contact event
  messageCount?: number;
  lastPreview?:  string;
  initiator?:    "client" | "agent" | "mixed";
  channel?:      string;
  // task event
  taskTitle?:  string;
  taskStatus?: string;
}

// ── Private DB row types ───────────────────────────────────────────────────────

interface NarrativeRow {
  id:                  string;
  relationship_health: string;
  narrative:           string;
  momentum:            string;
  confidence_score:    number;
  generated_at:        string;
}

interface DayRow {
  day:           string;
  message_count: number;
  last_preview:  string;
  client_count:  number;
  agent_count:   number;
  channel:       string;
  first_msg_at:  string;
}

interface TaskRow {
  id:         string;
  title:      string;
  status:     string;
  updated_at: string;
  created_at: string;
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function GET(
  req:     NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "clients.view");

    const { id: clientId } = await context.params;
    if (!clientId) {
      return NextResponse.json({ error: "Missing client id" }, { status: 400 });
    }

    const db = getDb();

    // Verify client exists in this workspace
    const clientRow = db
      .prepare("SELECT id, name FROM clients WHERE id = ? AND workspace_id = ?")
      .get(clientId, auth.workspaceId) as { id: string; name: string } | undefined;

    if (!clientRow) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const url   = new URL(req.url);
    const limit = Math.min(80, Math.max(1, parseInt(url.searchParams.get("limit") ?? "40", 10) || 40));

    const events: TimelineEvent[] = [];

    // ── 1. Narrative health snapshots (all rows — history + current) ─────────
    const narrativeRows = db.prepare(`
      SELECT
        id,
        relationship_health,
        substr(narrative, 1, 200) AS narrative,
        momentum,
        confidence_score,
        generated_at
      FROM rie_relationship_narratives
      WHERE workspace_id = ?
        AND entity_type  = 'client'
        AND entity_id    = ?
      ORDER BY generated_at DESC
      LIMIT 25
    `).all(auth.workspaceId, clientId) as unknown as NarrativeRow[];

    for (const row of narrativeRows) {
      events.push({
        id:          `h:${row.id}`,
        kind:        "health",
        timestamp:   row.generated_at,
        healthLabel: row.relationship_health,
        narrative:   row.narrative,
        momentum:    row.momentum,
        confidence:  row.confidence_score,
      });
    }

    // ── 2. Contact events — daily message summary ────────────────────────────
    const dayRows = db.prepare(`
      SELECT
        date(m.created_at)                     AS day,
        COUNT(*)                               AS message_count,
        substr(MAX(m.content), 1, 100)         AS last_preview,
        SUM(CASE WHEN m.sender_type = 'client' THEN 1 ELSE 0 END) AS client_count,
        SUM(CASE WHEN m.sender_type != 'client' THEN 1 ELSE 0 END) AS agent_count,
        MAX(c.channel)                         AS channel,
        MIN(m.created_at)                      AS first_msg_at
      FROM   messages       m
      JOIN   conversations  c ON m.conversation_id = c.id
      WHERE  c.workspace_id = ?
        AND  c.client_id    = ?
        AND  m.content      != ''
      GROUP  BY date(m.created_at)
      ORDER  BY day DESC
      LIMIT  ?
    `).all(auth.workspaceId, clientId, limit) as unknown as DayRow[];

    for (const row of dayRows) {
      const initiator: "client" | "agent" | "mixed" =
        row.client_count > 0 && row.agent_count > 0 ? "mixed" :
        row.client_count > 0 ? "client" : "agent";

      events.push({
        id:           `c:${row.day}`,
        kind:         "contact",
        timestamp:    row.first_msg_at,   // use first message of the day as anchor
        messageCount: row.message_count,
        lastPreview:  row.last_preview,
        initiator,
        channel:      row.channel,
      });
    }

    // ── 3. Task events ────────────────────────────────────────────────────────
    const taskRows = db.prepare(`
      SELECT id, title, status, updated_at, created_at
      FROM   tasks
      WHERE  workspace_id = ?
        AND  client_id    = ?
      ORDER  BY updated_at DESC
      LIMIT  15
    `).all(auth.workspaceId, clientId) as unknown as TaskRow[];

    for (const row of taskRows) {
      // Use updated_at for done/cancelled tasks (completion event), created_at otherwise
      const ts = (row.status === "done" || row.status === "cancelled")
        ? row.updated_at
        : row.created_at;

      events.push({
        id:         `t:${row.id}`,
        kind:       "task",
        timestamp:  ts,
        taskTitle:  row.title,
        taskStatus: row.status,
      });
    }

    // ── Merge & sort newest-first ─────────────────────────────────────────────
    events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return NextResponse.json({
      events:     events.slice(0, limit),
      clientName: clientRow.name,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/clients/[id]/timeline]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
