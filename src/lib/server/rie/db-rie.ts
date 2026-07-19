/**
 * src/lib/server/rie/db-rie.ts
 *
 * Database helpers for rie_relationship_narratives.
 *
 * Two functions:
 *   getCurrentNarrative — fetch the active row for an entity
 *   saveNarrative       — retire the old row, insert a new current row
 *
 * Server-only — do NOT import in client components.
 */

import { getDb }      from "../../db";
import { randomUUID } from "node:crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DbNarrativeRow {
  id:                  string;
  workspace_id:        string;
  entity_type:         string;
  entity_id:           string;
  narrative:           string;
  recommended_action:  string;
  risk_level:          string;
  momentum:            string;
  relationship_health: string;
  confidence_score:    number;
  evidence_json:       string;   // JSON-encoded EvidenceItem[]
  signal_version:      string;   // 16-char SHA-256 prefix of input hash
  model:               string | null;
  provider:            string | null;
  generated_at:        string;
  is_current:          number;   // SQLite INTEGER: 1 = current, 0 = archived
}

export interface SaveNarrativeParams {
  workspaceId:         string;
  entityType:          string;
  entityId:            string;
  narrative:           string;
  recommendedAction:   string;
  riskLevel:           string;
  momentum:            string;
  relationshipHealth:  string;
  confidenceScore:     number;
  evidenceJson:        string;
  signalVersion:       string;
  model:               string | null;
  provider:            string | null;
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Returns the current (is_current = 1) narrative row for an entity, or null.
 */
export function getCurrentNarrative(
  workspaceId: string,
  entityType:  string,
  entityId:    string,
): DbNarrativeRow | null {
  const db  = getDb();
  const row = db
    .prepare(`
      SELECT * FROM rie_relationship_narratives
      WHERE  workspace_id = ?
        AND  entity_type  = ?
        AND  entity_id    = ?
        AND  is_current   = 1
      LIMIT 1
    `)
    .get(workspaceId, entityType, entityId) as DbNarrativeRow | undefined;
  return row ?? null;
}

/**
 * Saves a new narrative row for an entity.
 * The previous current row (if any) is archived (is_current = 0).
 * Runs in a single transaction for atomic retire + insert.
 */
export function saveNarrative(params: SaveNarrativeParams): void {
  const db  = getDb();
  const id  = randomUUID() as string;
  const now = new Date().toISOString();

  db.exec("BEGIN");
  try {
    // Archive the previous current row
    db
      .prepare(`
        UPDATE rie_relationship_narratives
        SET    is_current = 0
        WHERE  workspace_id = ?
          AND  entity_type  = ?
          AND  entity_id    = ?
          AND  is_current   = 1
      `)
      .run(params.workspaceId, params.entityType, params.entityId);

    // Insert the new current row
    db
      .prepare(`
        INSERT INTO rie_relationship_narratives (
          id, workspace_id, entity_type, entity_id,
          narrative, recommended_action, risk_level, momentum, relationship_health,
          confidence_score, evidence_json, signal_version,
          model, provider, generated_at, is_current
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `)
      .run(
        id,
        params.workspaceId,
        params.entityType,
        params.entityId,
        params.narrative,
        params.recommendedAction,
        params.riskLevel,
        params.momentum,
        params.relationshipHealth,
        params.confidenceScore,
        params.evidenceJson,
        params.signalVersion,
        params.model,
        params.provider,
        now,
      );

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
