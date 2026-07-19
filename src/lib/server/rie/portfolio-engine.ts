/**
 * src/lib/server/rie/portfolio-engine.ts
 *
 * Portfolio Intelligence Engine — Sprint 3.2 Feature 4
 *
 * Extends the morning-brief batch JOIN pattern to answer workspace-level questions:
 *   • Which relationships are improving?
 *   • Which are declining?
 *   • Which are overdue?
 *   • Which recovered recently?
 *
 * Design:
 *   ONE SQL query: three-way JOIN of clients + rhythms + narratives (current only)
 *   NO new health calculations — reads pre-computed health_label and momentum
 *   NO AI calls — purely deterministic categorization
 *
 * Server-only — do NOT import in client components.
 */

import { getDb } from "../../db";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PortfolioClient {
  id:                   string;
  name:                 string;
  healthLabel:          "strong" | "healthy" | "at_risk" | "critical" | null;
  healthScore:          number | null;
  daysSinceContact:     number | null;
  silenceThresholdDays: number | null;
  isOverdue:            boolean;
  overdueRatio:         number | null;
  sampleSize:           number;
  momentum:             "accelerating" | "stable" | "declining" | "dormant" | null;
  lastContactAt:        string | null;
}

export interface Portfolio {
  generatedAt:   string;
  improving:     PortfolioClient[];   // accelerating momentum, healthy or strong
  declining:     PortfolioClient[];   // declining/dormant momentum OR critical/at_risk
  overdue:       PortfolioClient[];   // isOverdue (all health labels)
  recentContact: PortfolioClient[];   // contacted in last 7 days, healthy/strong
  untracked:     number;              // active clients with no rhythm data yet
  totalActive:   number;
}

// ── Private DB row type ───────────────────────────────────────────────────────

interface RawRow {
  id:                    string;
  name:                  string;
  health_label:          string | null;
  health_score:          number | null;
  days_since_contact:    number | null;
  silence_threshold_days: number | null;
  sample_size:           number;
  momentum:              string | null;
  last_contact_at:       string | null;
}

// ── Row → PortfolioClient ─────────────────────────────────────────────────────

function toPortfolioClient(row: RawRow): PortfolioClient {
  const days      = row.days_since_contact;
  const threshold = row.silence_threshold_days;
  const isOverdue = days !== null && threshold !== null && days > threshold;
  const overdueRatio =
    isOverdue && threshold !== null && days !== null
      ? Math.round((days / threshold) * 10) / 10
      : null;

  return {
    id:                   row.id,
    name:                 row.name,
    healthLabel:          (row.health_label ?? null) as PortfolioClient["healthLabel"],
    healthScore:          row.health_score,
    daysSinceContact:     days !== null ? Math.round(days * 10) / 10 : null,
    silenceThresholdDays: threshold,
    isOverdue,
    overdueRatio,
    sampleSize:           row.sample_size ?? 0,
    momentum:             (row.momentum ?? null) as PortfolioClient["momentum"],
    lastContactAt:        row.last_contact_at,
  };
}

// ── Batch query ───────────────────────────────────────────────────────────────

function fetchPortfolioRows(workspaceId: string): RawRow[] {
  const db = getDb();

  return db.prepare(`
    SELECT
      c.id,
      c.name,
      r.health_label,
      r.health_score,
      r.days_since_contact,
      r.silence_threshold_days,
      COALESCE(r.sample_size, 0)  AS sample_size,
      r.last_contact_at,
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
    ORDER BY
      CASE r.health_label
        WHEN 'critical' THEN 1
        WHEN 'at_risk'  THEN 2
        WHEN 'healthy'  THEN 3
        WHEN 'strong'   THEN 4
        ELSE 5
      END ASC,
      r.days_since_contact DESC
  `).all(workspaceId) as unknown as RawRow[];
}

// ── Categorization ────────────────────────────────────────────────────────────

/**
 * "Improving" = momentum accelerating AND health is healthy or strong.
 * Excludes overdue clients (overdue + accelerating is contradictory signal).
 */
function isImproving(c: PortfolioClient): boolean {
  return (
    c.momentum === "accelerating" &&
    (c.healthLabel === "healthy" || c.healthLabel === "strong") &&
    !c.isOverdue &&
    c.sampleSize >= 2
  );
}

/**
 * "Declining" = declining/dormant momentum, OR health is critical/at_risk.
 * Excludes the improving set to avoid duplicates.
 */
function isDeclining(c: PortfolioClient): boolean {
  if (isImproving(c)) return false;
  return (
    c.momentum === "declining" ||
    c.momentum === "dormant" ||
    c.healthLabel === "critical" ||
    c.healthLabel === "at_risk"
  );
}

/**
 * "Recent contact" = last contact within 7 days, healthy or strong, NOT overdue.
 * Excludes clients already in improving (would be duplicate).
 */
function isRecentContact(c: PortfolioClient): boolean {
  return (
    c.daysSinceContact !== null &&
    c.daysSinceContact <= 7 &&
    (c.healthLabel === "strong" || c.healthLabel === "healthy") &&
    !c.isOverdue
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the Portfolio Intelligence snapshot for a workspace.
 * Reads pre-computed rhythm + narrative rows (two LEFT JOINs, one query).
 * Pure deterministic — no AI calls.
 */
export function getPortfolio(workspaceId: string): Portfolio {
  const generatedAt = new Date().toISOString();
  const rows        = fetchPortfolioRows(workspaceId);
  const clients     = rows.map(toPortfolioClient);

  const totalActive = clients.length;
  const untracked   = clients.filter((c) => c.sampleSize < 2).length;
  const tracked     = clients.filter((c) => c.sampleSize >= 2);

  const improving     = tracked.filter(isImproving).slice(0, 10);
  const improvingIds  = new Set(improving.map((c) => c.id));

  const declining     = tracked.filter((c) => isDeclining(c) && !improvingIds.has(c.id)).slice(0, 10);
  const declinedIds   = new Set(declining.map((c) => c.id));

  const overdue = clients
    .filter((c) => c.isOverdue && !improvingIds.has(c.id))
    .sort((a, b) => (b.overdueRatio ?? 0) - (a.overdueRatio ?? 0))
    .slice(0, 10);

  const overdueIds = new Set(overdue.map((c) => c.id));

  const recentContact = tracked
    .filter((c) =>
      isRecentContact(c) &&
      !improvingIds.has(c.id) &&
      !declinedIds.has(c.id) &&
      !overdueIds.has(c.id),
    )
    .slice(0, 8);

  return {
    generatedAt,
    improving,
    declining,
    overdue,
    recentContact,
    untracked,
    totalActive,
  };
}
