/**
 * src/lib/server/rie/morning-brief-engine.ts
 *
 * Morning Brief Engine — Sprint 3.2 Batch A
 *
 * Aggregates existing RIE rhythm data into a scannable daily brief.
 *
 * Design principles:
 *   - ONE SQL query: a LEFT JOIN of clients + rie_relationship_rhythms
 *   - No per-client computation — reads pre-computed cached rhythm rows only
 *   - No new health score logic — reuses what the Rhythm Engine already stored
 *   - ONE AI call for the entire brief (greeting + 3 priorities)
 *   - On-demand: no cron, no cache, no background workers
 *
 * Server-only — do NOT import in client components.
 */

import { getDb }                          from "../../db";
import { generateMorningBriefPriorities } from "../../ai/service";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BriefClient {
  id:                   string;
  name:                 string;
  healthLabel:          "strong" | "healthy" | "at_risk" | "critical" | null;
  daysSinceContact:     number | null;
  silenceThresholdDays: number | null;
  isOverdue:            boolean;
  overdueRatio:         number | null;  // daysSinceContact / silenceThresholdDays
  sampleSize:           number;
}

export interface MorningBrief {
  generatedAt:          string;
  greeting:             string;           // AI opening sentence
  needsAttention:       BriefClient[];    // critical + at_risk, max 5
  overdueRelationships: BriefClient[];    // overdue but healthy/strong, max 5
  recentPositive:       BriefClient[];    // healthy/strong, contacted ≤ 3 days, max 3
  topPriorities:        string[];         // 3 specific action strings (AI or deterministic)
  clientCount:          number;           // total active clients
  trackedCount:         number;           // clients with rhythm data (sampleSize ≥ 2)
  provider:             string | null;    // AI provider used, or null for deterministic
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
}

// ── Batch query ───────────────────────────────────────────────────────────────

/**
 * Returns all active clients joined with their cached rhythm row (if any).
 * Ordered: worst health first, then by days since contact descending.
 * This is the only query in the engine — O(1) database round trips.
 */
function fetchClientRhythmSummaries(workspaceId: string): RawRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      c.id,
      c.name,
      r.health_label,
      r.health_score,
      r.days_since_contact,
      r.silence_threshold_days,
      COALESCE(r.sample_size, 0) AS sample_size
    FROM clients c
    LEFT JOIN rie_relationship_rhythms r
      ON  r.client_id    = c.id
      AND r.workspace_id = c.workspace_id
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

// ── Row → BriefClient ─────────────────────────────────────────────────────────

function toBriefClient(row: RawRow): BriefClient {
  const days      = row.days_since_contact;
  const threshold = row.silence_threshold_days;
  const isOverdue =
    days !== null && threshold !== null && days > threshold;
  const overdueRatio =
    isOverdue && threshold !== null && days !== null
      ? Math.round((days / threshold) * 10) / 10
      : null;

  return {
    id:                   row.id,
    name:                 row.name,
    healthLabel:          (row.health_label ?? null) as BriefClient["healthLabel"],
    daysSinceContact:     days !== null ? Math.round(days * 10) / 10 : null,
    silenceThresholdDays: threshold,
    isOverdue,
    overdueRatio,
    sampleSize:           row.sample_size ?? 0,
  };
}

// ── Deterministic fallback priorities ─────────────────────────────────────────

function buildFallbackPriorities(
  needsAttention:       BriefClient[],
  overdueRelationships: BriefClient[],
  recentPositive:       BriefClient[],
  clientCount:          number,
): { greeting: string; priorities: string[] } {
  const priorities: string[] = [];

  // Priority 1: most urgent attention item
  const top = needsAttention[0];
  if (top) {
    const days  = top.daysSinceContact !== null ? Math.round(top.daysSinceContact) : "?";
    const ratio = top.overdueRatio ? `, ${top.overdueRatio}× past your normal cadence` : "";
    priorities.push(
      `Reach out to ${top.name} today — ${days} days without contact${ratio}.`,
    );
  }

  // Priority 2: first overdue non-attention item
  const overdueTop = overdueRelationships[0];
  if (overdueTop) {
    const days = overdueTop.daysSinceContact !== null
      ? Math.round(overdueTop.daysSinceContact)
      : "?";
    priorities.push(
      `Check in with ${overdueTop.name} this week — ${days} days since last contact, past normal cadence.`,
    );
  } else if (needsAttention[1]) {
    const second = needsAttention[1];
    const days   = second.daysSinceContact !== null ? Math.round(second.daysSinceContact) : "?";
    priorities.push(
      `Follow up with ${second.name} — ${days} days since last contact.`,
    );
  }

  // Priority 3: positive or general
  const positive = recentPositive[0];
  if (positive) {
    priorities.push(
      `${positive.name} is engaged — consider deepening the conversation while momentum is high.`,
    );
  } else if (priorities.length < 3) {
    if (clientCount === 0) {
      priorities.push("Add your first client to start tracking relationship health.");
    } else {
      priorities.push(
        "All tracked relationships are within normal cadence — good time to prospect new clients.",
      );
    }
  }

  // Pad to exactly 3
  while (priorities.length < 3) {
    priorities.push("Review your client list and identify any relationships to strengthen this week.");
  }

  // Greeting
  let greeting = "Your relationship portfolio needs attention today.";
  if (needsAttention.length === 0 && overdueRelationships.length === 0) {
    greeting = "All relationships are on track — focus on growth today.";
  } else if (needsAttention.length >= 3) {
    greeting = `${needsAttention.length} relationships need immediate attention.`;
  } else if (needsAttention.length > 0) {
    greeting = `${needsAttention[0]?.name ?? "A client"} needs your attention today.`;
  } else if (overdueRelationships.length > 0) {
    greeting = `${overdueRelationships.length} relationship${overdueRelationships.length > 1 ? "s are" : " is"} past the expected check-in window.`;
  }

  return { greeting, priorities: priorities.slice(0, 3) };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generates the Morning Brief for a workspace.
 *
 * Reads pre-computed rhythm rows from SQLite (one JOIN query).
 * Makes one AI call to produce the greeting and three priorities.
 * Falls back to deterministic text when AI is unavailable.
 */
export async function getMorningBrief(workspaceId: string): Promise<MorningBrief> {
  const generatedAt = new Date().toISOString();
  const rows        = fetchClientRhythmSummaries(workspaceId);
  const clients     = rows.map(toBriefClient);

  const clientCount  = clients.length;
  const trackedCount = clients.filter((c) => c.sampleSize >= 2).length;

  // ── Section: Needs Attention (critical + at_risk) ─────────────────────────
  const needsAttention = clients
    .filter((c) => c.healthLabel === "critical" || c.healthLabel === "at_risk")
    .slice(0, 5);

  const needsAttentionIds = new Set(needsAttention.map((c) => c.id));

  // ── Section: Overdue (past cadence, healthy/strong) ───────────────────────
  const overdueRelationships = clients
    .filter((c) => c.isOverdue && !needsAttentionIds.has(c.id))
    .sort((a, b) => (b.overdueRatio ?? 0) - (a.overdueRatio ?? 0))
    .slice(0, 5);

  const overdueIds = new Set(overdueRelationships.map((c) => c.id));

  // ── Section: Recent Positive (healthy/strong, contacted ≤ 3 days) ────────
  const recentPositive = clients
    .filter((c) =>
      (c.healthLabel === "strong" || c.healthLabel === "healthy") &&
      c.daysSinceContact !== null &&
      c.daysSinceContact <= 3 &&
      !c.isOverdue &&
      !needsAttentionIds.has(c.id) &&
      !overdueIds.has(c.id),
    )
    .slice(0, 3);

  // ── Generate brief text (AI or deterministic) ─────────────────────────────
  const aiResult = await generateMorningBriefPriorities({
    clientCount,
    trackedCount,
    needsAttention: needsAttention.map((c) => ({
      name:      c.name,
      label:     c.healthLabel ?? "unknown",
      daysSince: c.daysSinceContact !== null ? Math.round(c.daysSinceContact) : null,
      ratio:     c.overdueRatio,
    })),
    overdueRelationships: overdueRelationships.map((c) => ({
      name:      c.name,
      daysSince: c.daysSinceContact !== null ? Math.round(c.daysSinceContact) : null,
      ratio:     c.overdueRatio,
    })),
    recentPositive: recentPositive.map((c) => ({ name: c.name })),
  });

  // Use AI result if available, otherwise deterministic
  let greeting:     string;
  let topPriorities: string[];
  let provider:     string | null;

  if (aiResult.provider !== "none" && aiResult.priorities.length > 0) {
    greeting      = aiResult.greeting;
    topPriorities = aiResult.priorities.slice(0, 3);
    provider      = aiResult.provider;
  } else {
    const fallback = buildFallbackPriorities(
      needsAttention, overdueRelationships, recentPositive, clientCount,
    );
    greeting      = fallback.greeting;
    topPriorities = fallback.priorities;
    provider      = null;
  }

  return {
    generatedAt,
    greeting,
    needsAttention,
    overdueRelationships,
    recentPositive,
    topPriorities,
    clientCount,
    trackedCount,
    provider,
  };
}
