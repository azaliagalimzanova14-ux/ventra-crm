/**
 * src/lib/server/rie/opportunity-engine.ts
 *
 * Opportunity Detection Engine — Sprint 4
 *
 * Detects relationship opportunities from pre-computed RIE data.
 * All categorization is deterministic — no AI.
 * AI is called ONCE (in service.ts) to explain all detected opportunities.
 *
 * Opportunity types:
 *   "re_engagement"  — health declining/at_risk, was recently active; reach
 *                      out before silence becomes critical
 *   "approaching"    — healthy client, days_since_contact > 60% of threshold;
 *                      proactive check-in window
 *   "momentum_up"    — narrative momentum is accelerating; celebrate progress
 *                      or deepen the relationship
 *   "waiting_reply"  — client initiated last contact (pct > 60%), no agent
 *                      response in > 3 days; reciprocity signal
 *
 * Design:
 *   ONE SQL query: three-way LEFT JOIN (clients + rhythms + narratives)
 *   Reuses the portfolio-engine JOIN pattern — no duplicate SQL
 *   Hard caps: max 3 per type, max 12 total
 *
 * Server-only — do NOT import in client components.
 */

import { getDb } from "../../db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OpportunityType =
  | "re_engagement"
  | "approaching"
  | "momentum_up"
  | "waiting_reply";

export interface Opportunity {
  id:               string;  // client id
  clientName:       string;
  type:             OpportunityType;
  healthLabel:      "strong" | "healthy" | "at_risk" | "critical" | null;
  daysSinceContact: number | null;
  overdueRatio:     number | null;  // days / threshold — only for re_engagement
  momentum:         string | null;
  insight:          string;   // filled by AI; empty until enriched
}

export interface OpportunityResult {
  generatedAt:   string;
  opportunities: Opportunity[];
  clientCount:   number;       // total active clients scanned
}

// ── Raw DB row ────────────────────────────────────────────────────────────────

interface RawRow {
  id:                     string;
  name:                   string;
  health_label:           string | null;
  health_score:           number | null;
  days_since_contact:     number | null;
  silence_threshold_days: number | null;
  sample_size:            number;
  client_initiation_pct:  number | null;
  last_agent_msg_at:      string | null;
  momentum:               string | null;
}

// ── Opportunity predicates ────────────────────────────────────────────────────

function isReEngagement(row: RawRow): boolean {
  if (!row.days_since_contact || !row.silence_threshold_days) return false;
  if (row.sample_size < 2) return false;
  const ratio = row.days_since_contact / row.silence_threshold_days;
  // Between 70% and 120% of threshold — about to cross or just crossed it
  return (
    ratio >= 0.7 &&
    ratio <= 1.2 &&
    (row.health_label === "at_risk" || row.health_label === "critical" ||
     row.momentum === "declining" || row.momentum === "dormant")
  );
}

function isApproaching(row: RawRow): boolean {
  if (!row.days_since_contact || !row.silence_threshold_days) return false;
  if (row.sample_size < 2) return false;
  const ratio = row.days_since_contact / row.silence_threshold_days;
  return (
    ratio >= 0.55 && ratio < 0.7 &&
    (row.health_label === "healthy" || row.health_label === "strong")
  );
}

function isMomentumUp(row: RawRow): boolean {
  if (row.sample_size < 2) return false;
  return (
    row.momentum === "accelerating" &&
    (row.health_label === "healthy" || row.health_label === "strong")
  );
}

function isWaitingReply(row: RawRow): boolean {
  if (!row.client_initiation_pct || !row.last_agent_msg_at) return false;
  if (row.sample_size < 2) return false;
  const daysSinceAgentMsg = Math.round(
    (Date.now() - new Date(row.last_agent_msg_at).getTime()) / 86_400_000,
  );
  return row.client_initiation_pct > 0.6 && daysSinceAgentMsg >= 3;
}

// ── Batch query ───────────────────────────────────────────────────────────────

function fetchRows(workspaceId: string): RawRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      c.id,
      c.name,
      r.health_label,
      r.health_score,
      r.days_since_contact,
      r.silence_threshold_days,
      COALESCE(r.sample_size, 0) AS sample_size,
      r.client_initiation_pct,
      r.last_agent_msg_at,
      n.momentum
    FROM clients c
    LEFT JOIN rie_relationship_rhythms r
      ON  r.client_id    = c.id
      AND r.workspace_id = c.workspace_id
    LEFT JOIN rie_relationship_narratives n
      ON  n.entity_id    = c.id
      AND n.workspace_id = c.workspace_id
      AND n.entity_type  = 'client'
      AND n.is_current   = 1
    WHERE c.workspace_id = ?
      AND c.status       = 'active'
    ORDER BY r.days_since_contact DESC
  `).all(workspaceId) as unknown as RawRow[];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Detects relationship opportunities for the workspace.
 * All returned opportunities have insight = "" — caller must call
 * generateOpportunityInsights() from service.ts to populate them.
 */
export function detectOpportunities(workspaceId: string): OpportunityResult {
  const generatedAt = new Date().toISOString();
  const rows        = fetchRows(workspaceId);
  const clientCount = rows.length;

  const reEngagement: Opportunity[] = [];
  const approaching:  Opportunity[] = [];
  const momentumUp:   Opportunity[] = [];
  const waitingReply: Opportunity[] = [];

  const seen = new Set<string>();

  for (const row of rows) {
    if (seen.has(row.id)) continue;

    const threshold = row.silence_threshold_days;
    const days      = row.days_since_contact;
    const ratio     = threshold && days ? Math.round((days / threshold) * 10) / 10 : null;

    const base: Omit<Opportunity, "type" | "overdueRatio"> = {
      id:               row.id,
      clientName:       row.name,
      healthLabel:      (row.health_label ?? null) as Opportunity["healthLabel"],
      daysSinceContact: days !== null ? Math.round(days * 10) / 10 : null,
      momentum:         row.momentum,
      insight:          "",
    };

    if (isReEngagement(row) && reEngagement.length < 3) {
      reEngagement.push({ ...base, type: "re_engagement", overdueRatio: ratio });
      seen.add(row.id);
    } else if (isWaitingReply(row) && waitingReply.length < 3) {
      waitingReply.push({ ...base, type: "waiting_reply", overdueRatio: null });
      seen.add(row.id);
    } else if (isApproaching(row) && approaching.length < 3) {
      approaching.push({ ...base, type: "approaching", overdueRatio: ratio });
      seen.add(row.id);
    } else if (isMomentumUp(row) && momentumUp.length < 3) {
      momentumUp.push({ ...base, type: "momentum_up", overdueRatio: null });
      seen.add(row.id);
    }
  }

  // Order: urgent first — re_engagement → waiting_reply → approaching → momentum_up
  const opportunities = [
    ...reEngagement,
    ...waitingReply,
    ...approaching,
    ...momentumUp,
  ].slice(0, 12);

  return { generatedAt, opportunities, clientCount };
}
