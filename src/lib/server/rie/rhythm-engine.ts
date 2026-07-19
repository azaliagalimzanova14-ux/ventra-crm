/**
 * src/lib/server/rie/rhythm-engine.ts
 *
 * Relationship Rhythm Engine — Sprint 3.1
 *
 * Computes and caches per-client relationship rhythm and health score.
 * Purely deterministic — no AI calls required. Gracefully handles clients
 * with zero messages (returns null scores rather than crashing).
 *
 * Public API:
 *   getClientRhythm(workspaceId, clientId) — cached (60-min TTL) or fresh
 *   refreshRhythm(workspaceId, clientId)   — force recompute, ignore cache
 *
 * Health Score formula (approved by CTO, Sprint 3.1 team review):
 *   gap_ratio         = days_since_contact / silence_threshold
 *   engagement_factor = client_initiation_pct × 0.3 + 0.7
 *   recency_factor    = 1.0 if days_since_contact ≤ 7, else 0.9^(days − 7)
 *   health_score      = clamp(0, 100, round(
 *                         (100 − gap_ratio × 50) × engagement_factor × recency_factor
 *                       ))
 *
 * Server-only — do NOT import in client components.
 */

import { getDb }      from "../../db";
import { randomUUID } from "node:crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClientRhythm {
  clientId:             string;
  avgContactGapDays:    number | null;
  msgPerWeek:           number | null;
  lastContactAt:        string | null;
  lastClientMsgAt:      string | null;
  lastAgentMsgAt:       string | null;
  daysSinceContact:     number | null;
  silenceThresholdDays: number | null;
  clientInitiationPct:  number | null;
  healthScore:          number | null;
  healthLabel:          "strong" | "healthy" | "at_risk" | "critical" | null;
  sampleSize:           number;
  isOverdue:            boolean;
  updatedAt:            string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Cached row is considered fresh for this long. */
const CACHE_TTL_MS     = 60 * 60 * 1000;   // 60 minutes

/** Minimum messages before rhythm statistics are meaningful. */
const MIN_SAMPLES      = 2;

/** Floor on the silence threshold — even very frequent contacts get at least 3 days. */
const MIN_SILENCE_DAYS = 3;

// ── Private DB row type ───────────────────────────────────────────────────────

interface DbRhythmRow {
  id:                    string;
  workspace_id:          string;
  client_id:             string;
  avg_contact_gap_days:  number | null;
  msg_per_week:          number | null;
  last_contact_at:       string | null;
  last_client_msg_at:    string | null;
  last_agent_msg_at:     string | null;
  days_since_contact:    number | null;
  silence_threshold_days: number | null;
  client_initiation_pct: number | null;
  health_score:          number | null;
  health_label:          string | null;
  sample_size:           number;
  updated_at:            string;
}

// ── Private DB helpers ────────────────────────────────────────────────────────

function getRhythmRow(workspaceId: string, clientId: string): DbRhythmRow | null {
  const db  = getDb();
  const row = db
    .prepare(
      "SELECT * FROM rie_relationship_rhythms WHERE workspace_id = ? AND client_id = ?",
    )
    .get(workspaceId, clientId) as DbRhythmRow | undefined;
  return row ?? null;
}

interface ComputedData {
  avg_contact_gap_days:   number | null;
  msg_per_week:           number | null;
  last_contact_at:        string | null;
  last_client_msg_at:     string | null;
  last_agent_msg_at:      string | null;
  days_since_contact:     number | null;
  silence_threshold_days: number | null;
  client_initiation_pct:  number | null;
  health_score:           number | null;
  health_label:           string | null;
  sample_size:            number;
  updated_at:             string;
}

function upsertRhythmRow(
  workspaceId: string,
  clientId:    string,
  data:        ComputedData,
): void {
  const db       = getDb();
  const existing = getRhythmRow(workspaceId, clientId);
  const id       = existing?.id ?? (randomUUID() as string);

  db.prepare(`
    INSERT INTO rie_relationship_rhythms (
      id, workspace_id, client_id,
      avg_contact_gap_days, msg_per_week,
      last_contact_at, last_client_msg_at, last_agent_msg_at,
      days_since_contact, silence_threshold_days,
      client_initiation_pct, health_score, health_label,
      sample_size, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, client_id) DO UPDATE SET
      avg_contact_gap_days   = excluded.avg_contact_gap_days,
      msg_per_week           = excluded.msg_per_week,
      last_contact_at        = excluded.last_contact_at,
      last_client_msg_at     = excluded.last_client_msg_at,
      last_agent_msg_at      = excluded.last_agent_msg_at,
      days_since_contact     = excluded.days_since_contact,
      silence_threshold_days = excluded.silence_threshold_days,
      client_initiation_pct  = excluded.client_initiation_pct,
      health_score           = excluded.health_score,
      health_label           = excluded.health_label,
      sample_size            = excluded.sample_size,
      updated_at             = excluded.updated_at
  `).run(
    id, workspaceId, clientId,
    data.avg_contact_gap_days, data.msg_per_week,
    data.last_contact_at,      data.last_client_msg_at, data.last_agent_msg_at,
    data.days_since_contact,   data.silence_threshold_days,
    data.client_initiation_pct, data.health_score, data.health_label,
    data.sample_size, data.updated_at,
  );
}

// ── Health Score formula ──────────────────────────────────────────────────────

function computeHealthScore(
  daysSinceContact:    number,
  silenceThreshold:    number,
  clientInitiationPct: number,
): number {
  const gapRatio         = daysSinceContact / Math.max(1, silenceThreshold);
  const engagementFactor = clientInitiationPct * 0.3 + 0.7;
  const recencyFactor    = daysSinceContact <= 7
    ? 1.0
    : Math.pow(0.9, daysSinceContact - 7);

  return Math.max(0, Math.min(100,
    Math.round((100 - gapRatio * 50) * engagementFactor * recencyFactor),
  ));
}

function toHealthLabel(
  score: number,
): "strong" | "healthy" | "at_risk" | "critical" {
  if (score >= 80) return "strong";
  if (score >= 60) return "healthy";
  if (score >= 40) return "at_risk";
  return "critical";
}

// ── Core computation ──────────────────────────────────────────────────────────

interface MsgRow {
  sender_type: string;
  created_at:  string;
}

function computeRhythm(workspaceId: string, clientId: string): ComputedData {
  const db  = getDb();
  const now = new Date();

  // Fetch all messages for this client across all conversations, oldest first.
  // sender_type: 'client' | 'agent' | 'bot' | 'system'
  const rows = db.prepare(`
    SELECT m.sender_type, m.created_at
    FROM   messages       m
    JOIN   conversations  c ON m.conversation_id = c.id
    WHERE  c.workspace_id = ?
      AND  c.client_id    = ?
    ORDER  BY m.created_at ASC
  `).all(workspaceId, clientId) as unknown as MsgRow[];

  const sample_size = rows.length;
  const updatedAt   = now.toISOString();

  // No messages → return empty rhythm (all nulls)
  if (sample_size === 0) {
    return {
      avg_contact_gap_days:   null,
      msg_per_week:           null,
      last_contact_at:        null,
      last_client_msg_at:     null,
      last_agent_msg_at:      null,
      days_since_contact:     null,
      silence_threshold_days: null,
      client_initiation_pct:  null,
      health_score:           null,
      health_label:           null,
      sample_size:            0,
      updated_at:             updatedAt,
    };
  }

  // ── Timestamp arrays by sender ────────────────────────────────────────────
  const allMs    = rows.map((r) => new Date(r.created_at).getTime());
  const clientMs = rows
    .filter((r) => r.sender_type === "client")
    .map((r) => new Date(r.created_at).getTime());
  const agentMs  = rows
    .filter((r) => r.sender_type === "agent" || r.sender_type === "bot")
    .map((r) => new Date(r.created_at).getTime());

  const lastContactAt   = new Date(Math.max(...allMs)).toISOString();
  const lastClientMsgAt = clientMs.length > 0
    ? new Date(Math.max(...clientMs)).toISOString()
    : null;
  const lastAgentMsgAt  = agentMs.length > 0
    ? new Date(Math.max(...agentMs)).toISOString()
    : null;

  const daysSinceContact = (now.getTime() - Math.max(...allMs)) / 86_400_000;

  // ── Client initiation percentage ──────────────────────────────────────────
  const clientInitiationPct = clientMs.length / sample_size;

  // ── Average contact gap (consecutive message gaps) ────────────────────────
  let avgContactGapDays: number | null = null;
  if (sample_size >= MIN_SAMPLES) {
    let totalGapMs = 0;
    for (let i = 1; i < allMs.length; i++) {
      totalGapMs += (allMs[i] as number) - (allMs[i - 1] as number);
    }
    avgContactGapDays = totalGapMs / (allMs.length - 1) / 86_400_000;
  }

  // ── Messages per week ─────────────────────────────────────────────────────
  let msgPerWeek: number | null = null;
  if (sample_size >= MIN_SAMPLES) {
    const weeksElapsed = (now.getTime() - (allMs[0] as number)) / (7 * 86_400_000);
    msgPerWeek = weeksElapsed > 0 ? sample_size / weeksElapsed : null;
  }

  // ── Silence threshold = 2× avg gap, floored at MIN_SILENCE_DAYS ──────────
  const silenceThresholdDays = avgContactGapDays !== null
    ? Math.max(MIN_SILENCE_DAYS, avgContactGapDays * 2)
    : null;

  // ── Health Score — only computed when we have enough data ─────────────────
  let health_score: number | null = null;
  let health_label: string | null = null;
  if (sample_size >= MIN_SAMPLES && silenceThresholdDays !== null) {
    const score  = computeHealthScore(
      daysSinceContact,
      silenceThresholdDays,
      clientInitiationPct,
    );
    health_score = score;
    health_label = toHealthLabel(score);
  }

  return {
    avg_contact_gap_days:   avgContactGapDays,
    msg_per_week:           msgPerWeek,
    last_contact_at:        lastContactAt,
    last_client_msg_at:     lastClientMsgAt,
    last_agent_msg_at:      lastAgentMsgAt,
    days_since_contact:     Math.round(daysSinceContact * 10) / 10,
    silence_threshold_days: silenceThresholdDays,
    client_initiation_pct:  clientInitiationPct,
    health_score,
    health_label,
    sample_size,
    updated_at:             updatedAt,
  };
}

// ── Map to public type ────────────────────────────────────────────────────────

function toClientRhythm(clientId: string, data: ComputedData): ClientRhythm {
  const overdue =
    data.days_since_contact     !== null &&
    data.silence_threshold_days !== null &&
    data.days_since_contact      > data.silence_threshold_days;

  return {
    clientId,
    avgContactGapDays:    data.avg_contact_gap_days,
    msgPerWeek:           data.msg_per_week,
    lastContactAt:        data.last_contact_at,
    lastClientMsgAt:      data.last_client_msg_at,
    lastAgentMsgAt:       data.last_agent_msg_at,
    daysSinceContact:     data.days_since_contact,
    silenceThresholdDays: data.silence_threshold_days,
    clientInitiationPct:  data.client_initiation_pct,
    healthScore:          data.health_score,
    healthLabel:          data.health_label as ClientRhythm["healthLabel"],
    sampleSize:           data.sample_size,
    isOverdue:            overdue,
    updatedAt:            data.updated_at,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the cached rhythm if it is less than 60 minutes old.
 * Recomputes and persists otherwise.
 */
export function getClientRhythm(
  workspaceId: string,
  clientId:    string,
): ClientRhythm {
  const cached = getRhythmRow(workspaceId, clientId);

  if (cached) {
    const ageMs = Date.now() - new Date(cached.updated_at).getTime();
    if (ageMs < CACHE_TTL_MS) {
      // Return the cached row mapped through the same public type
      return toClientRhythm(clientId, {
        avg_contact_gap_days:   cached.avg_contact_gap_days,
        msg_per_week:           cached.msg_per_week,
        last_contact_at:        cached.last_contact_at,
        last_client_msg_at:     cached.last_client_msg_at,
        last_agent_msg_at:      cached.last_agent_msg_at,
        days_since_contact:     cached.days_since_contact,
        silence_threshold_days: cached.silence_threshold_days,
        client_initiation_pct:  cached.client_initiation_pct,
        health_score:           cached.health_score,
        health_label:           cached.health_label,
        sample_size:            cached.sample_size,
        updated_at:             cached.updated_at,
      });
    }
  }

  const data = computeRhythm(workspaceId, clientId);
  upsertRhythmRow(workspaceId, clientId, data);
  return toClientRhythm(clientId, data);
}

/**
 * Forces rhythm recomputation regardless of cache age.
 * Called fire-and-forget from message/conversation routes (Batch 3).
 */
export function refreshRhythm(
  workspaceId: string,
  clientId:    string,
): void {
  const data = computeRhythm(workspaceId, clientId);
  upsertRhythmRow(workspaceId, clientId, data);
}
