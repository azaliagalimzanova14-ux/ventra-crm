/**
 * src/lib/server/db-ai.ts
 *
 * Database helpers for AI analysis results and reply suggestions.
 * All queries are workspace-scoped for tenant isolation.
 *
 * Server-only — do NOT import in client components.
 */

import { getDb }         from "../db";
import type { DbAiAnalysis, DbAiSuggestion, AiAnalysisType, AiSuggestionType } from "./models";

import { randomUUID } from "node:crypto";

// ── AI Analysis ───────────────────────────────────────────────────────────────

export interface SaveAnalysisParams {
  workspaceId:  string;
  entityType:   string;
  entityId:     string;
  analysisType: AiAnalysisType;
  resultJson:   string;
  model:        string | null;
  provider:     string | null;
}

/**
 * Save an AI analysis result, replacing any existing result for the same
 * (workspace, entityType, entityId, analysisType) combination.
 */
export function saveAnalysis(params: SaveAnalysisParams): DbAiAnalysis {
  const db = getDb();
  const id = randomUUID() as string;
  const now = new Date().toISOString();

  // Delete existing analysis for this entity+type (keep only latest)
  db.prepare(`
    DELETE FROM ai_analysis
    WHERE workspace_id = ? AND entity_type = ? AND entity_id = ? AND analysis_type = ?
  `).run(params.workspaceId, params.entityType, params.entityId, params.analysisType);

  db.prepare(`
    INSERT INTO ai_analysis (id, workspace_id, entity_type, entity_id, analysis_type, result_json, model, provider, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, params.workspaceId, params.entityType, params.entityId, params.analysisType, params.resultJson, params.model, params.provider, now);

  return {
    id,
    workspace_id:  params.workspaceId,
    entity_type:   params.entityType,
    entity_id:     params.entityId,
    analysis_type: params.analysisType,
    result_json:   params.resultJson,
    model:         params.model,
    provider:      params.provider,
    created_at:    now,
  };
}

/**
 * Get the latest analysis for an entity+type, or null if none exists.
 */
export function getAnalysis(
  workspaceId:  string,
  entityType:   string,
  entityId:     string,
  analysisType: AiAnalysisType,
): DbAiAnalysis | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM ai_analysis
    WHERE workspace_id = ? AND entity_type = ? AND entity_id = ? AND analysis_type = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(workspaceId, entityType, entityId, analysisType);
  return (row as DbAiAnalysis | undefined) ?? null;
}

/**
 * List recent analyses for a workspace, optionally filtered by analysisType.
 */
export function listAnalyses(
  workspaceId:  string,
  analysisType?: AiAnalysisType,
  limit = 20,
): DbAiAnalysis[] {
  const db = getDb();
  if (analysisType) {
    return db.prepare(`
      SELECT * FROM ai_analysis
      WHERE workspace_id = ? AND analysis_type = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(workspaceId, analysisType, limit) as unknown as DbAiAnalysis[];
  }
  return db.prepare(`
    SELECT * FROM ai_analysis
    WHERE workspace_id = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(workspaceId, limit) as unknown as DbAiAnalysis[];
}

// ── AI Suggestions ────────────────────────────────────────────────────────────

export interface SaveSuggestionParams {
  workspaceId:    string;
  conversationId: string;
  type:           AiSuggestionType;
  content:        string;
}

/**
 * Save a new AI reply suggestion for a conversation.
 * Replaces any existing suggestion of the same type for the same conversation.
 */
export function saveSuggestion(params: SaveSuggestionParams): DbAiSuggestion {
  const db = getDb();
  const id = randomUUID() as string;
  const now = new Date().toISOString();

  // Remove previous suggestion of same type for this conversation
  db.prepare(`
    DELETE FROM ai_suggestions
    WHERE workspace_id = ? AND conversation_id = ? AND type = ?
  `).run(params.workspaceId, params.conversationId, params.type);

  db.prepare(`
    INSERT INTO ai_suggestions (id, workspace_id, conversation_id, type, content, accepted, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(id, params.workspaceId, params.conversationId, params.type, params.content, now);

  return {
    id,
    workspace_id:    params.workspaceId,
    conversation_id: params.conversationId,
    type:            params.type,
    content:         params.content,
    accepted:        0,
    created_at:      now,
  };
}

/**
 * Get all suggestions for a conversation.
 */
export function getSuggestionsForConversation(
  workspaceId:    string,
  conversationId: string,
): DbAiSuggestion[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM ai_suggestions
    WHERE workspace_id = ? AND conversation_id = ?
    ORDER BY created_at DESC
  `).all(workspaceId, conversationId) as unknown as DbAiSuggestion[];
}

/**
 * Mark a suggestion as accepted (user used it to send a reply).
 */
export function acceptSuggestion(
  id:          string,
  workspaceId: string,
): void {
  const db = getDb();
  db.prepare(`
    UPDATE ai_suggestions SET accepted = 1 WHERE id = ? AND workspace_id = ?
  `).run(id, workspaceId);
}

/**
 * Delete all suggestions for a conversation (e.g. after a reply is sent).
 */
export function clearSuggestionsForConversation(
  workspaceId:    string,
  conversationId: string,
): void {
  const db = getDb();
  db.prepare(`
    DELETE FROM ai_suggestions WHERE workspace_id = ? AND conversation_id = ?
  `).run(workspaceId, conversationId);
}
