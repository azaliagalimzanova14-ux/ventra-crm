/**
 * src/lib/server/db-messages.ts
 *
 * CRUD helpers for the `messages` table (unified inbox).
 * Each message belongs to a conversation and carries sender_type for role rendering.
 */

import { getDb }      from "../db";
import { randomUUID } from "node:crypto";
import type {
  DbMessage,
  SenderType,
} from "./models";

function now(): string {
  return new Date().toISOString();
}

// ── Write ─────────────────────────────────────────────────────────────────────

export interface CreateMessageParams {
  workspace_id:    string;
  conversation_id: string;
  sender_type:     SenderType;
  sender_id?:      string;     // user_id for agent messages
  content:         string;
  attachments?:    unknown[];  // will be JSON-stringified
  metadata?:       Record<string, unknown>;
  created_at?:     string;     // override timestamp (for Telegram bridging)
}

export function createMessage(params: CreateMessageParams): DbMessage {
  const db  = getDb();
  const id  = randomUUID();
  const ts  = params.created_at ?? now();

  db.prepare(`
    INSERT INTO messages
      (id, workspace_id, conversation_id, sender_type, sender_id,
       content, attachments, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.workspace_id,
    params.conversation_id,
    params.sender_type,
    params.sender_id      ?? null,
    params.content,
    params.attachments    ? JSON.stringify(params.attachments) : null,
    params.metadata       ? JSON.stringify(params.metadata)    : null,
    ts,
  );

  return getMessageOrThrow(id);
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function getMessageOrThrow(id: string): DbMessage {
  const row = getDb()
    .prepare("SELECT * FROM messages WHERE id = ?")
    .get(id) as DbMessage | null | undefined;
  if (!row) throw new Error(`Message not found: ${id}`);
  return row;
}

export interface ListMessagesParams {
  conversation_id: string;
  workspace_id:    string;
  /** Max number of messages to return (default 50, max 200). */
  limit?:          number;
  /** Cursor: created_at of the oldest message already loaded (for loading older messages). */
  before?:         string;
}

/** Returns messages oldest-first (natural thread order). */
export function listMessages(params: ListMessagesParams): DbMessage[] {
  const db    = getDb();
  const limit = Math.min(params.limit ?? 50, 200);

  if (params.before) {
    // Load messages older than cursor (oldest-first)
    const rows = db.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ? AND workspace_id = ? AND created_at < ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(params.conversation_id, params.workspace_id, params.before, limit) as unknown as DbMessage[];
    return rows.reverse();
  }

  return db.prepare(`
    SELECT * FROM messages
    WHERE  conversation_id = ? AND workspace_id = ?
    ORDER  BY created_at DESC
    LIMIT  ?
  `).all(params.conversation_id, params.workspace_id, limit) as unknown as DbMessage[];
  // Note: returns newest-first; caller can reverse for thread display
}

/** Return messages newest-first for the thread (most recent `limit` messages). */
export function listMessagesNewestFirst(params: ListMessagesParams): DbMessage[] {
  return listMessages(params);
}

/** Return messages oldest-first (natural read order). */
export function listMessagesOldestFirst(params: ListMessagesParams): DbMessage[] {
  const rows = listMessages(params);
  return rows.reverse();
}

export function countMessages(conversationId: string, workspaceId: string): number {
  const r = getDb()
    .prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND workspace_id = ?")
    .get(conversationId, workspaceId) as { n: number };
  return r.n;
}

/** Parse the attachments JSON blob safely. */
export function parseAttachments(msg: DbMessage): unknown[] {
  if (!msg.attachments) return [];
  try { return JSON.parse(msg.attachments) as unknown[]; } catch { return []; }
}

/** Parse the metadata JSON blob safely. */
export function parseMetadata(msg: DbMessage): Record<string, unknown> {
  if (!msg.metadata) return {};
  try { return JSON.parse(msg.metadata) as Record<string, unknown>; } catch { return {}; }
}
