/**
 * src/lib/server/rie/weekly-review-engine.ts
 *
 * Weekly Review Engine — Sprint 4
 *
 * Extends the morning-brief batch JOIN pattern to a 7-day lookback.
 * Answers: what happened this week? what should matter next week?
 *
 * Data gathered (deterministic):
 *   - Conversations/contacts this week (message activity from messages table)
 *   - Health changes: clients whose rhythm was updated this week
 *   - Tasks completed this week
 *   - New clients added this week
 *   - Portfolio snapshot (counts by health label)
 *
 * AI call: ONE call to generateWeeklyNarrative() produces the narrative
 * and next-week focus sentence. Everything else is deterministic.
 *
 * Design:
 *   THREE queries (bounded result sets, indexed)
 *   Reuses existing tables: clients, rie_relationship_rhythms, messages,
 *   tasks — no new schema
 *
 * Server-only — do NOT import in client components.
 */

import { getDb } from "../../db";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WeeklyHealthChange {
  clientId:   string;
  clientName: string;
  previous:   string | null;
  current:    string | null;
  direction:  "improved" | "declined" | "unchanged";
}

export interface WeeklyClientActivity {
  clientId:   string;
  clientName: string;
  msgCount:   number;
  lastChannel: string | null;
}

export interface WeeklyReview {
  generatedAt:      string;
  weekStart:        string;   // ISO date 7 days ago
  weekEnd:          string;   // ISO date today
  // Deterministic stats
  totalContacts:    number;   // clients contacted this week
  totalMessages:    number;   // total messages sent/received
  newClients:       number;   // clients created this week
  tasksCompleted:   number;   // tasks completed this week
  healthImproved:   number;   // clients whose health label improved
  healthDeclined:   number;   // clients whose health label declined
  // Top active clients (max 5)
  topActivity:      WeeklyClientActivity[];
  // Health changes (max 5 each direction)
  improved:         WeeklyHealthChange[];
  declined:         WeeklyHealthChange[];
  // Portfolio snapshot
  totalActive:      number;
  strongCount:      number;
  healthyCount:     number;
  atRiskCount:      number;
  criticalCount:    number;
  // AI-filled (empty until enriched)
  narrative:        string;
  nextWeekFocus:    string;
  provider:         string | null;
}

// ── Raw DB row types ──────────────────────────────────────────────────────────

interface ActivityRow {
  client_id:    string;
  client_name:  string;
  msg_count:    number;
  last_channel: string | null;
}

interface HealthRow {
  client_id:    string;
  client_name:  string;
  health_label: string | null;
  updated_at:   string;
}

interface TaskRow {
  id: string;
}

interface ClientRow {
  id: string;
}

interface PortfolioRow {
  health_label: string | null;
  cnt:          number;
}

// ── Queries ───────────────────────────────────────────────────────────────────

function getWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function getWeeklyReview(workspaceId: string): WeeklyReview {
  const db         = getDb();
  const generatedAt = new Date().toISOString();
  const weekStart  = getWeekStart();
  const weekEnd    = new Date().toISOString();

  // ── Query 1: Message activity this week by client ─────────────────────────
  const activityRows = db.prepare(`
    SELECT
      cl.id                                   AS client_id,
      cl.name                                 AS client_name,
      COUNT(m.id)                             AS msg_count,
      MAX(co.channel)                         AS last_channel
    FROM messages m
    JOIN conversations co
      ON  co.id           = m.conversation_id
      AND co.workspace_id = ?
    JOIN clients cl
      ON  cl.id           = co.client_id
      AND cl.workspace_id = ?
    WHERE m.created_at >= ?
    GROUP BY cl.id, cl.name
    ORDER BY msg_count DESC
    LIMIT 10
  `).all(workspaceId, workspaceId, weekStart) as unknown as ActivityRow[];

  const topActivity: WeeklyClientActivity[] = activityRows.slice(0, 5).map((r) => ({
    clientId:    r.client_id,
    clientName:  r.client_name,
    msgCount:    r.msg_count,
    lastChannel: r.last_channel,
  }));

  const totalContacts = activityRows.length;
  const totalMessages = activityRows.reduce((s, r) => s + r.msg_count, 0);

  // ── Query 2: Portfolio health snapshot + clients updated this week ────────
  const healthRows = db.prepare(`
    SELECT
      c.id          AS client_id,
      c.name        AS client_name,
      r.health_label,
      r.updated_at
    FROM clients c
    JOIN rie_relationship_rhythms r
      ON  r.client_id    = c.id
      AND r.workspace_id = c.workspace_id
    WHERE c.workspace_id = ?
      AND c.status       = 'active'
    ORDER BY r.updated_at DESC
  `).all(workspaceId) as unknown as HealthRow[];

  // Portfolio counts
  let totalActive = 0, strongCount = 0, healthyCount = 0, atRiskCount = 0, criticalCount = 0;
  const portfolioRows = db.prepare(`
    SELECT health_label, COUNT(*) AS cnt
    FROM   rie_relationship_rhythms r
    JOIN   clients c ON c.id = r.client_id AND c.workspace_id = r.workspace_id
    WHERE  r.workspace_id = ? AND c.status = 'active'
    GROUP  BY health_label
  `).all(workspaceId) as unknown as PortfolioRow[];

  for (const r of portfolioRows) {
    totalActive += r.cnt;
    if (r.health_label === "strong")   strongCount   += r.cnt;
    if (r.health_label === "healthy")  healthyCount  += r.cnt;
    if (r.health_label === "at_risk")  atRiskCount   += r.cnt;
    if (r.health_label === "critical") criticalCount += r.cnt;
  }

  // Clients whose rhythm was updated this week — treat as "health changed"
  // We don't store previous health label, so we detect updated_at in window
  const recentlyUpdated = healthRows.filter((r) => r.updated_at >= weekStart);
  const improved: WeeklyHealthChange[] = [];
  const declined: WeeklyHealthChange[] = [];

  // Heuristic: accelerating/stable label in this period = improved signal
  // Use health label as proxy (strong/healthy = improved side, at_risk/critical = declined)
  for (const r of recentlyUpdated.slice(0, 10)) {
    const dir =
      r.health_label === "strong" || r.health_label === "healthy"
        ? "improved"
        : r.health_label === "at_risk" || r.health_label === "critical"
        ? "declined"
        : "unchanged";

    const change: WeeklyHealthChange = {
      clientId:   r.client_id,
      clientName: r.client_name,
      previous:   null,
      current:    r.health_label,
      direction:  dir,
    };
    if (dir === "improved" && improved.length < 5)  improved.push(change);
    if (dir === "declined" && declined.length < 5)  declined.push(change);
  }

  // ── Query 3: Tasks completed this week ────────────────────────────────────
  const taskRows = db.prepare(`
    SELECT id FROM tasks
    WHERE workspace_id = ?
      AND status       = 'done'
      AND updated_at  >= ?
  `).all(workspaceId, weekStart) as unknown as TaskRow[];

  const tasksCompleted = taskRows.length;

  // ── Query 4: New clients this week ────────────────────────────────────────
  const newClientRows = db.prepare(`
    SELECT id FROM clients
    WHERE workspace_id = ?
      AND created_at  >= ?
  `).all(workspaceId, weekStart) as unknown as ClientRow[];

  const newClients = newClientRows.length;

  return {
    generatedAt,
    weekStart,
    weekEnd,
    totalContacts,
    totalMessages,
    newClients,
    tasksCompleted,
    healthImproved:  improved.length,
    healthDeclined:  declined.length,
    topActivity,
    improved,
    declined,
    totalActive,
    strongCount,
    healthyCount,
    atRiskCount,
    criticalCount,
    narrative:     "",
    nextWeekFocus: "",
    provider:      null,
  };
}
