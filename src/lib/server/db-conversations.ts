/**
 * src/lib/server/db-conversations.ts
 *
 * CRUD helpers for the `conversations` table (unified inbox).
 * All functions scope to workspace_id for multi-tenant isolation.
 */

import { getDb }        from "../db";
import { randomUUID }   from "node:crypto";
import type {
  DbConversation,
  ConversationChannel,
  ConversationStatus,
} from "./models";

function now(): string {
  return new Date().toISOString();
}

// ── Write ─────────────────────────────────────────────────────────────────────

export interface CreateConversationParams {
  workspace_id:      string;
  channel:           ConversationChannel;
  external_id?:      string;
  title?:            string;
  client_id?:        string;
  assigned_user_id?: string;
  status?:           ConversationStatus;
  /** Free-form JSON metadata (e.g. `{ personal: true }` for personal-account Telegram chats). */
  metadata?:         Record<string, unknown>;
}

/** Insert a new conversation row. Throws if UNIQUE(workspace_id, channel, external_id) conflicts. */
export function createConversation(params: CreateConversationParams): DbConversation {
  const db = getDb();
  const id = randomUUID();
  const ts = now();

  db.prepare(`
    INSERT INTO conversations
      (id, workspace_id, client_id, channel, external_id, title,
       assigned_user_id, status, last_message_at, last_message_text, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)
  `).run(
    id,
    params.workspace_id,
    params.client_id        ?? null,
    params.channel,
    params.external_id      ?? null,
    params.title            ?? "",
    params.assigned_user_id ?? null,
    params.status           ?? "open",
    params.metadata         ? JSON.stringify(params.metadata) : null,
    ts,
    ts,
  );

  return getConversationOrThrow(id);
}

/**
 * Find-or-create a conversation by (workspace_id, channel, external_id).
 * If external_id is null/undefined, always creates a new conversation.
 * Updates title if the conversation already exists (sender name can change).
 */
export function upsertConversation(params: CreateConversationParams): DbConversation {
  const db = getDb();

  if (params.external_id) {
    const existing = getConversationByExternal(
      params.workspace_id,
      params.channel,
      params.external_id,
    );

    if (existing) {
      // Update mutable fields: title (sender name) + metadata + client_id
      const updates: string[] = ["updated_at = ?"];
      const vals: (string | null)[] = [now()];

      if (params.title && params.title !== existing.title) {
        updates.push("title = ?");
        vals.push(params.title);
      }
      if (params.metadata) {
        // Merge incoming metadata with existing so we don't clobber keys
        let merged: Record<string, unknown> = {};
        try { merged = JSON.parse(existing.metadata ?? "{}") as Record<string, unknown>; } catch { /* ignore */ }
        Object.assign(merged, params.metadata);
        updates.push("metadata = ?");
        vals.push(JSON.stringify(merged));
      }
      if (params.client_id && !existing.client_id) {
        // Only set client_id if it isn't already linked (don't override manual assignments)
        updates.push("client_id = ?");
        vals.push(params.client_id);
      }

      vals.push(existing.id);
      db.prepare(`UPDATE conversations SET ${updates.join(", ")} WHERE id = ?`).run(...vals);
      return getConversationOrThrow(existing.id);
    }
  }

  return createConversation(params);
}

export interface UpdateConversationParams {
  title?:            string;
  client_id?:        string | null;
  assigned_user_id?: string | null;
  status?:           ConversationStatus;
  last_message_at?:  string;
  last_message_text?: string;
}

export function updateConversation(
  id:          string,
  workspaceId: string,
  params:      UpdateConversationParams,
): DbConversation {
  const db  = getDb();
  const sets: string[] = ["updated_at = ?"];
  const vals: (string | null)[] = [now()];

  if (params.title            !== undefined) { sets.push("title = ?");              vals.push(params.title); }
  if (params.client_id        !== undefined) { sets.push("client_id = ?");          vals.push(params.client_id); }
  if (params.assigned_user_id !== undefined) { sets.push("assigned_user_id = ?");   vals.push(params.assigned_user_id); }
  if (params.status           !== undefined) { sets.push("status = ?");             vals.push(params.status); }
  if (params.last_message_at  !== undefined) { sets.push("last_message_at = ?");    vals.push(params.last_message_at); }
  if (params.last_message_text !== undefined) { sets.push("last_message_text = ?"); vals.push(params.last_message_text); }

  db.prepare(`UPDATE conversations SET ${sets.join(", ")} WHERE id = ? AND workspace_id = ?`)
    .run(...vals, id, workspaceId);

  return getConversationOrThrow(id);
}

/** Stamp last_message_at + last_message_text after a new message is inserted. */
export function touchConversation(
  id:          string,
  workspaceId: string,
  messageText: string,
  messageAt:   string,
): void {
  getDb().prepare(`
    UPDATE conversations
    SET last_message_at   = ?,
        last_message_text = ?,
        updated_at        = ?
    WHERE id = ? AND workspace_id = ?
  `).run(messageAt, messageText.slice(0, 200), messageAt, id, workspaceId);
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function getConversation(
  id:          string,
  workspaceId: string,
): DbConversation | null {
  return getDb()
    .prepare("SELECT * FROM conversations WHERE id = ? AND workspace_id = ?")
    .get(id, workspaceId) as DbConversation | null | undefined ?? null;
}

export function getConversationOrThrow(id: string): DbConversation {
  const row = getDb()
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(id) as DbConversation | null | undefined;
  if (!row) throw new Error(`Conversation not found: ${id}`);
  return row;
}

export function getConversationByExternal(
  workspaceId: string,
  channel:     ConversationChannel,
  externalId:  string,
): DbConversation | null {
  return getDb()
    .prepare("SELECT * FROM conversations WHERE workspace_id = ? AND channel = ? AND external_id = ?")
    .get(workspaceId, channel, externalId) as DbConversation | null | undefined ?? null;
}

// ── List / filter ─────────────────────────────────────────────────────────────

export interface ListConversationsParams {
  workspace_id:     string;
  channel?:         ConversationChannel;
  status?:          ConversationStatus;
  assigned_user_id?: string;    // pass user_id to filter "assigned to me"
  client_id?:       string;     // filter by linked CRM client
  search?:          string;
  limit?:           number;
  /** ISO string — conversations with last_message_at < cursor (for keyset pagination) */
  cursor?:          string;
}

export interface ListConversationsResult {
  conversations: DbConversation[];
  total:         number;
}

export function listConversations(
  params: ListConversationsParams,
): ListConversationsResult {
  const db     = getDb();
  const limit  = Math.min(params.limit ?? 30, 100);
  const clauses: string[] = ["workspace_id = ?"];
  const values:  (string | number)[] = [params.workspace_id];

  if (params.channel) {
    clauses.push("channel = ?");
    values.push(params.channel);
  }
  if (params.status) {
    clauses.push("status = ?");
    values.push(params.status);
  }
  if (params.assigned_user_id) {
    clauses.push("assigned_user_id = ?");
    values.push(params.assigned_user_id);
  }
  if (params.client_id) {
    clauses.push("client_id = ?");
    values.push(params.client_id);
  }
  if (params.search) {
    clauses.push("(title LIKE ? OR last_message_text LIKE ?)");
    const q = `%${params.search}%`;
    values.push(q, q);
  }
  if (params.cursor) {
    clauses.push("(last_message_at < ? OR last_message_at IS NULL)");
    values.push(params.cursor);
  }

  const where = clauses.join(" AND ");
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM conversations WHERE ${where}`)
    .get(...values) as { n: number }).n;

  const conversations = db.prepare(`
    SELECT * FROM conversations
    WHERE  ${where}
    ORDER  BY COALESCE(last_message_at, created_at) DESC
    LIMIT  ?
  `).all(...values, limit) as unknown as DbConversation[];

  return { conversations, total };
}

/** Parse the metadata JSON blob of a conversation safely. */
export function parseConversationMetadata(conv: DbConversation): Record<string, unknown> {
  if (!conv.metadata) return {};
  try { return JSON.parse(conv.metadata) as Record<string, unknown>; } catch { return {}; }
}

/** Count conversations per workspace (with optional filters). */
export function countConversations(
  workspaceId: string,
  status?: ConversationStatus,
): number {
  const db = getDb();
  if (status) {
    const r = db
      .prepare("SELECT COUNT(*) AS n FROM conversations WHERE workspace_id = ? AND status = ?")
      .get(workspaceId, status) as { n: number };
    return r.n;
  }
  const r = db
    .prepare("SELECT COUNT(*) AS n FROM conversations WHERE workspace_id = ?")
    .get(workspaceId) as { n: number };
  return r.n;
}
