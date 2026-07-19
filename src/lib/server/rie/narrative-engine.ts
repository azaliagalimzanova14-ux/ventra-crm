/**
 * src/lib/server/rie/narrative-engine.ts
 *
 * Relationship Narrative Engine — Sprint 3.1
 *
 * Orchestrates deterministic pre-processing + AI natural language generation.
 *
 * What this engine does (deterministic — no AI):
 *   buildEvidence()        — assemble EvidenceItem[] from ClientRhythm
 *   computeConfidence()    — 0–100 score from sample size, recency, evidence count
 *   buildSignalVersion()   — 16-char SHA-256 prefix of input hash
 *
 * What the AI does (natural language only):
 *   narrative              — 2–3 sentence relationship status in Ventra voice
 *   recommended_action     — 1 specific next step
 *   risk_level             — enum derived from health, validated against our range
 *   momentum               — enum derived from health trend
 *
 * AI NEVER computes: Health Score, Confidence Score, or Evidence items.
 *
 * Stale-while-revalidate:
 *   - signal_version matches existing row → return immediately (cache hit)
 *   - signal_version differs              → return stale + regenerate async (no await)
 *   - no row exists                       → generate synchronously, save, return
 *
 * Server-only — do NOT import in client components.
 */

import { createHash }                                from "node:crypto";
import { getClientRhythm }                           from "./rhythm-engine";
import type { ClientRhythm }                         from "./rhythm-engine";
import { getCurrentNarrative, saveNarrative }        from "./db-rie";
import { generateRelationshipNarrative }             from "../../ai/service";
import { getClientContext }                          from "./context-builder";

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_SAMPLES = 2;

// ── Public types ──────────────────────────────────────────────────────────────

export interface EvidenceItem {
  type:   "health_score" | "days_since_contact" | "overdue" | "client_initiated" | "cadence" | "sample_size";
  label:  string;
  value:  string;
  weight: "high" | "medium" | "low";
}

export interface NarrativeResult {
  entityType:          string;
  entityId:            string;
  narrative:           string;
  recommendedAction:   string;
  riskLevel:           "high" | "medium" | "low";
  momentum:            "accelerating" | "stable" | "declining" | "dormant";
  relationshipHealth:  string;
  confidenceScore:     number;
  evidence:            EvidenceItem[];
  signalVersion:       string;
  model:               string | null;
  provider:            string | null;
  generatedAt:         string;
  isStale:             boolean;
}

// ── Evidence (deterministic) ──────────────────────────────────────────────────

/**
 * Assembles the evidence array from a ClientRhythm.
 * Pure function — same input always produces the same output.
 * AI never reads this logic; the items are passed as structured context.
 */
export function buildEvidence(rhythm: ClientRhythm): EvidenceItem[] {
  const items: EvidenceItem[] = [];

  if (rhythm.healthScore !== null) {
    items.push({
      type:   "health_score",
      label:  "Relationship Health",
      value:  `${rhythm.healthScore}/100 (${rhythm.healthLabel ?? "unknown"})`,
      weight: "high",
    });
  }

  if (rhythm.daysSinceContact !== null) {
    const days = Math.round(rhythm.daysSinceContact);
    items.push({
      type:   "days_since_contact",
      label:  "Last Contact",
      value:  days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`,
      weight: "high",
    });
  }

  if (rhythm.isOverdue && rhythm.daysSinceContact !== null && rhythm.silenceThresholdDays !== null) {
    const factor = Math.round((rhythm.daysSinceContact / rhythm.silenceThresholdDays) * 10) / 10;
    items.push({
      type:   "overdue",
      label:  "Overdue",
      value:  `${factor}× past normal cadence`,
      weight: "high",
    });
  }

  if (rhythm.clientInitiationPct !== null) {
    const pct = Math.round(rhythm.clientInitiationPct * 100);
    items.push({
      type:   "client_initiated",
      label:  "Client Initiates",
      value:  `${pct}% of messages`,
      weight: "medium",
    });
  }

  if (rhythm.avgContactGapDays !== null) {
    const gap = Math.round(rhythm.avgContactGapDays * 10) / 10;
    items.push({
      type:   "cadence",
      label:  "Avg Cadence",
      value:
        gap < 1
          ? `every ${Math.round(gap * 24)} hours`
          : gap === 1
          ? "daily"
          : `every ${gap} days`,
      weight: "medium",
    });
  }

  items.push({
    type:   "sample_size",
    label:  "Messages Analyzed",
    value:  String(rhythm.sampleSize),
    weight: "low",
  });

  return items;
}

// ── Confidence (deterministic) ────────────────────────────────────────────────

/**
 * Computes a confidence score 0–100 from sample size, recency, and evidence count.
 * Pure function — no AI required, no external dependencies.
 *
 *   base            = logarithmic growth against sample size (plateaus at 90)
 *   recency penalty = applied when last contact is stale (>30 days or >90 days)
 *   evidence bonus  = +2 per evidence item, capped at +10
 */
export function computeConfidence(
  sampleSize:       number,
  daysSinceContact: number | null,
  evidenceCount:    number,
): number {
  if (sampleSize < MIN_SAMPLES) return 0;

  const base = Math.min(90, Math.round(Math.log(sampleSize + 1) / Math.log(101) * 90));

  const recency =
    daysSinceContact === null ? 1.0 :
    daysSinceContact > 90     ? 0.5 :
    daysSinceContact > 30     ? 0.8 :
    1.0;

  const evidenceBonus = Math.min(10, evidenceCount * 2);

  return Math.max(0, Math.min(100, Math.round(base * recency + evidenceBonus)));
}

// ── Signal version ────────────────────────────────────────────────────────────

/**
 * Returns a 16-character hex prefix of a SHA-256 hash of the narrative inputs.
 * When this hash changes, the cached narrative is considered stale.
 * Rounding is applied so minor floating-point drift does not invalidate the cache.
 */
export function buildSignalVersion(
  workspaceId: string,
  entityType:  string,
  entityId:    string,
  rhythm:      ClientRhythm,
): string {
  const payload = JSON.stringify({
    workspaceId,
    entityType,
    entityId,
    healthScore:          rhythm.healthScore,
    healthLabel:          rhythm.healthLabel,
    daysSinceContact:
      rhythm.daysSinceContact !== null ? Math.round(rhythm.daysSinceContact) : null,
    sampleSize:           rhythm.sampleSize,
    isOverdue:            rhythm.isOverdue,
    silenceThresholdDays:
      rhythm.silenceThresholdDays !== null
        ? Math.round(rhythm.silenceThresholdDays * 10) / 10
        : null,
    clientInitiationPct:
      rhythm.clientInitiationPct !== null
        ? Math.round(rhythm.clientInitiationPct * 100) / 100
        : null,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

// ── Fallback derivations (used when AI is unavailable) ────────────────────────

function deriveRiskLevel(rhythm: ClientRhythm): "high" | "medium" | "low" {
  if (rhythm.healthLabel === "critical" || rhythm.healthLabel === "at_risk") return "high";
  if (rhythm.healthLabel === "healthy")                                       return "medium";
  return "low";
}

function deriveMomentum(
  rhythm: ClientRhythm,
): "accelerating" | "stable" | "declining" | "dormant" {
  if (rhythm.sampleSize < MIN_SAMPLES || rhythm.healthScore === null) return "dormant";
  if (rhythm.healthLabel === "strong")                                 return "accelerating";
  if (rhythm.healthLabel === "healthy")                                return "stable";
  if (rhythm.healthLabel === "at_risk")                                return "declining";
  return "dormant";
}

function buildFallbackNarrativeText(
  clientName: string,
  rhythm:     ClientRhythm,
): { narrative: string; recommended_action: string } {
  if (rhythm.healthScore === null || rhythm.sampleSize < MIN_SAMPLES) {
    // Single message — give context-aware advice instead of "send an opening message"
    if (rhythm.sampleSize === 1) {
      if (rhythm.clientInitiationPct === 0) {
        // Agent sent the opening message; no client reply yet
        return {
          narrative:
            `Only your opening message to ${clientName} is on record — wait for a reply before relationship health can be evaluated.`,
          recommended_action:
            `Give ${clientName} time to respond before following up.`,
        };
      } else {
        // Client reached out first; no agent reply yet
        return {
          narrative:
            `${clientName} reached out first — only their opening message is on record. Reply to start the conversation and build rhythm.`,
          recommended_action:
            `Reply to ${clientName}'s message to start the conversation.`,
        };
      }
    }
    return {
      narrative:
        `${clientName} has fewer than ${MIN_SAMPLES} messages on record — not enough data to assess the relationship.`,
      recommended_action:
        `Send an opening message to ${clientName} to start building rhythm.`,
    };
  }

  const days   = rhythm.daysSinceContact !== null ? Math.round(rhythm.daysSinceContact) : 0;
  const label  = rhythm.healthLabel;
  const dLabel = days === 1 ? "1 day" : `${days} days`;

  if (label === "critical") {
    const factor =
      rhythm.silenceThresholdDays !== null && rhythm.daysSinceContact !== null
        ? (Math.round((rhythm.daysSinceContact / rhythm.silenceThresholdDays) * 10) / 10).toFixed(1)
        : null;
    return {
      narrative:
        `${clientName} is critical — ${dLabel} without contact${factor ? `, ${factor}× past your normal cadence` : ""}.`,
      recommended_action:
        `Reach out to ${clientName} today — this relationship needs immediate attention.`,
    };
  }

  if (label === "at_risk") {
    return {
      narrative:
        `${clientName} is at risk — ${dLabel} since last contact${rhythm.isOverdue ? ", overdue by your normal cadence" : ""}.`,
      recommended_action:
        `Check in with ${clientName} this week before the relationship turns critical.`,
    };
  }

  return {
    narrative:
      `${clientName} is ${label ?? "active"} — last contact ${dLabel} ago, health score ${rhythm.healthScore}/100.`,
    recommended_action:
      `Maintain your current cadence with ${clientName}.`,
  };
}

// ── Core generation ───────────────────────────────────────────────────────────

async function generateAndSave(
  workspaceId:   string,
  entityType:    string,
  entityId:      string,
  clientName:    string,
  rhythm:        ClientRhythm,
  evidence:      EvidenceItem[],
  confidence:    number,
  signalVersion: string,
): Promise<void> {
  // Collect context (messages, tasks, notes) for context-aware recommendations
  // best-effort — never block generation if context fails
  const context = getClientContext(workspaceId, entityId);

  const aiResult = await generateRelationshipNarrative({
    clientName,
    healthScore:          rhythm.healthScore,
    healthLabel:          rhythm.healthLabel,
    daysSinceContact:     rhythm.daysSinceContact,
    silenceThresholdDays: rhythm.silenceThresholdDays,
    isOverdue:            rhythm.isOverdue,
    clientInitiationPct:  rhythm.clientInitiationPct,
    avgContactGapDays:    rhythm.avgContactGapDays,
    sampleSize:           rhythm.sampleSize,
    evidence,
    recentMessages:       context.recentMessages,
    openTasks:            context.openTasks,
    notes:                context.notes,
  });

  // If AI was unavailable (provider="none"), use deterministic fallback text
  const fallback     = buildFallbackNarrativeText(clientName, rhythm);
  const narrative    = aiResult.narrative           || fallback.narrative;
  const action       = aiResult.recommended_action  || fallback.recommended_action;
  const risk         = aiResult.risk_level          || deriveRiskLevel(rhythm);
  const momentum     = aiResult.momentum            || deriveMomentum(rhythm);

  saveNarrative({
    workspaceId,
    entityType,
    entityId,
    narrative,
    recommendedAction:   action,
    riskLevel:           risk,
    momentum,
    relationshipHealth:  rhythm.healthLabel ?? "unknown",
    confidenceScore:     confidence,
    evidenceJson:        JSON.stringify(evidence),
    signalVersion,
    model:               aiResult.model !== "none" ? aiResult.model : null,
    provider:            aiResult.provider !== "none" ? aiResult.provider : null,
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the current narrative for a client.
 *
 * Stale-while-revalidate behaviour:
 *   1. signal_version matches existing row → return immediately (cache hit)
 *   2. signal_version differs from existing → return stale immediately,
 *      fire-and-forget regeneration (no await)
 *   3. No row exists → generate synchronously, save, return
 */
export async function getClientNarrative(
  workspaceId: string,
  clientId:    string,
  clientName:  string,
): Promise<NarrativeResult> {
  const entityType    = "client";
  const rhythm        = getClientRhythm(workspaceId, clientId);
  const evidence      = buildEvidence(rhythm);
  const confidence    = computeConfidence(rhythm.sampleSize, rhythm.daysSinceContact, evidence.length);
  const signalVersion = buildSignalVersion(workspaceId, entityType, clientId, rhythm);
  const existing      = getCurrentNarrative(workspaceId, entityType, clientId);

  // ── 1. Cache hit ───────────────────────────────────────────────────────────
  if (existing && existing.signal_version === signalVersion) {
    return {
      entityType,
      entityId:            clientId,
      narrative:           existing.narrative,
      recommendedAction:   existing.recommended_action,
      riskLevel:           existing.risk_level as NarrativeResult["riskLevel"],
      momentum:            existing.momentum   as NarrativeResult["momentum"],
      relationshipHealth:  existing.relationship_health,
      confidenceScore:     existing.confidence_score,
      evidence:            JSON.parse(existing.evidence_json) as EvidenceItem[],
      signalVersion:       existing.signal_version,
      model:               existing.model,
      provider:            existing.provider,
      generatedAt:         existing.generated_at,
      isStale:             false,
    };
  }

  // ── 2. Stale — return immediately, regenerate async ───────────────────────
  if (existing) {
    void generateAndSave(
      workspaceId, entityType, clientId, clientName,
      rhythm, evidence, confidence, signalVersion,
    ).catch((err: unknown) => {
      console.error("[narrative-engine] background regeneration failed:", err);
    });

    return {
      entityType,
      entityId:            clientId,
      narrative:           existing.narrative,
      recommendedAction:   existing.recommended_action,
      riskLevel:           existing.risk_level as NarrativeResult["riskLevel"],
      momentum:            existing.momentum   as NarrativeResult["momentum"],
      relationshipHealth:  existing.relationship_health,
      // Return freshly computed deterministic fields even for stale row
      confidenceScore:     confidence,
      evidence,
      signalVersion:       existing.signal_version,
      model:               existing.model,
      provider:            existing.provider,
      generatedAt:         existing.generated_at,
      isStale:             true,
    };
  }

  // ── 3. Cold start — generate synchronously ────────────────────────────────
  await generateAndSave(
    workspaceId, entityType, clientId, clientName,
    rhythm, evidence, confidence, signalVersion,
  );

  const saved = getCurrentNarrative(workspaceId, entityType, clientId);

  // TypeScript safety guard — saved should always be set after generateAndSave
  if (!saved) {
    const fallback = buildFallbackNarrativeText(clientName, rhythm);
    return {
      entityType,
      entityId:            clientId,
      narrative:           fallback.narrative,
      recommendedAction:   fallback.recommended_action,
      riskLevel:           deriveRiskLevel(rhythm),
      momentum:            deriveMomentum(rhythm),
      relationshipHealth:  rhythm.healthLabel ?? "unknown",
      confidenceScore:     confidence,
      evidence,
      signalVersion,
      model:               null,
      provider:            null,
      generatedAt:         new Date().toISOString(),
      isStale:             false,
    };
  }

  return {
    entityType,
    entityId:            clientId,
    narrative:           saved.narrative,
    recommendedAction:   saved.recommended_action,
    riskLevel:           saved.risk_level as NarrativeResult["riskLevel"],
    momentum:            saved.momentum   as NarrativeResult["momentum"],
    relationshipHealth:  saved.relationship_health,
    confidenceScore:     saved.confidence_score,
    evidence:            JSON.parse(saved.evidence_json) as EvidenceItem[],
    signalVersion:       saved.signal_version,
    model:               saved.model,
    provider:            saved.provider,
    generatedAt:         saved.generated_at,
    isStale:             false,
  };
}
