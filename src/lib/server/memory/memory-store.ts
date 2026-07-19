/**
 * src/lib/server/memory/memory-store.ts
 *
 * Founder Memory — Sprint 4
 *
 * Persistent workspace-level context entries the AI uses in every
 * assistant response. Free-form text facts the founder wants the AI
 * to always know (e.g. "Company is a B2B SaaS startup", "Goal Q3: $50K MRR").
 *
 * Design:
 *   ONE table: workspace_memory (created by migration v17)
 *   Soft cap: 20 entries per workspace (enforced in createEntry)
 *   All queries synchronous (DatabaseSync)
 *   Never throws — best-effort reads return empty array on any error
 *
 * Server-only — do NOT import in client components.
 */

import { randomUUID } from "node:crypto";
import { getDb }      from "../../db";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  id:          string;
  workspaceId: string;
  content:     string;
  createdAt:   string;
  updatedAt:   string;
}

const MAX_ENTRIES = 20;

// ── Raw DB row ────────────────────────────────────────────────────────────────

interface RawRow {
  id:           string;
  workspace_id: string;
  content:      string;
  created_at:   string;
  updated_at:   string;
}

function toEntry(row: RawRow): MemoryEntry {
  return {
    id:          row.id,
    workspaceId: row.workspace_id,
    content:     row.content,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns all memory entries for the workspace, newest first.
 * Returns empty array on any error.
 */
export function getAllEntries(workspaceId: string): MemoryEntry[] {
  try {
    const db   = getDb();
    const rows = db.prepare(`
      SELECT id, workspace_id, content, created_at, updated_at
      FROM   workspace_memory
      WHERE  workspace_id = ?
      ORDER  BY created_at DESC
    `).all(workspaceId) as unknown as RawRow[];
    return rows.map(toEntry);
  } catch {
    return [];
  }
}

/**
 * Creates a new memory entry. Returns null if:
 *   - Content is empty after trimming
 *   - Workspace already has MAX_ENTRIES entries
 */
export function createEntry(workspaceId: string, content: string): MemoryEntry | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const db = getDb();

  const count = (db.prepare(
    "SELECT COUNT(*) AS n FROM workspace_memory WHERE workspace_id = ?",
  ).get(workspaceId) as { n: number }).n;
  if (count >= MAX_ENTRIES) return null;

  const id  = randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO workspace_memory (id, workspace_id, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, workspaceId, trimmed.slice(0, 500), now, now);

  return {
    id,
    workspaceId,
    content:   trimmed.slice(0, 500),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Deletes a memory entry. Returns true if a row was deleted, false otherwise.
 */
export function deleteEntry(workspaceId: string, id: string): boolean {
  const db     = getDb();
  const result = db.prepare(
    "DELETE FROM workspace_memory WHERE id = ? AND workspace_id = ?",
  ).run(id, workspaceId);
  return (result as { changes: number }).changes > 0;
}

/**
 * Returns all memory entries as a formatted context string for AI injection.
 * Returns empty string if no entries exist.
 */
export function buildMemoryContext(workspaceId: string): string {
  const entries = getAllEntries(workspaceId);
  if (entries.length === 0) return "";
  return "Founder context (always keep in mind):\n" +
    entries.map((e, i) => `${i + 1}. ${e.content}`).join("\n");
}
