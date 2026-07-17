/**
 * src/lib/server/db-sessions.ts
 *
 * CRUD helpers for the `sessions` table.
 *
 * Sessions use a 32-byte cryptographically random token stored as a 64-char
 * hex string. The token itself is the credential — never expose the session ID.
 *
 * Expiry: 30 days from creation (enforced at the SQL query level so expired
 * sessions are never returned, even if cleanup hasn't run yet).
 */

import { getDb } from "../db";
import { randomBytes, randomUUID } from "node:crypto";
import type { DbSession } from "./models";

const SESSION_EXPIRY_DAYS = 30;

function expiresAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_EXPIRY_DAYS);
  return d.toISOString();
}

function now(): string {
  return new Date().toISOString();
}

// ── Create ────────────────────────────────────────────────────────────────────

export interface CreateSessionParams {
  user_id:      string;
  workspace_id: string | null;
  user_agent?:  string;
  ip_address?:  string;
}

/**
 * Creates a new session and returns both the DB row and the raw token.
 * The token is returned only here — it is never stored in plaintext after this call.
 */
export function createSession(
  params: CreateSessionParams,
): { session: DbSession; token: string } {
  const db    = getDb();
  const id    = randomUUID();
  const token = randomBytes(32).toString("hex");
  const ts    = now();

  db.prepare(`
    INSERT INTO sessions
      (id, user_id, workspace_id, token, expires_at, created_at, user_agent, ip_address)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.user_id,
    params.workspace_id ?? null,
    token,
    expiresAt(),
    ts,
    params.user_agent  ?? null,
    params.ip_address  ?? null,
  );

  const session = db
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(id) as unknown as DbSession;

  return { session, token };
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Returns the session row for a given token, or null if not found / expired.
 * Expiry is enforced at the query level using SQLite's datetime() function.
 */
export function getSessionByToken(token: string): DbSession | null {
  const db = getDb();
  return (
    (db
      .prepare(
        "SELECT * FROM sessions WHERE token = ? AND expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now')",
      )
      .get(token) as unknown as DbSession | undefined) ?? null
  );
}

export function listUserSessions(userId: string): DbSession[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM sessions WHERE user_id = ? AND expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ORDER BY created_at DESC",
    )
    .all(userId) as unknown as DbSession[];
}

// ── Delete ────────────────────────────────────────────────────────────────────

export function deleteSessionByToken(token: string): void {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function deleteSessionById(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

/** Deletes all sessions for a user (logout all devices). */
export function deleteAllUserSessions(userId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

// ── Update ────────────────────────────────────────────────────────────────────

/**
 * Updates the workspace_id on an active session.
 * Called by POST /api/workspaces/switch after verifying the user is a member
 * of the target workspace.
 */
export function updateSessionWorkspace(token: string, workspaceId: string): void {
  const db = getDb();
  db.prepare("UPDATE sessions SET workspace_id = ? WHERE token = ?").run(workspaceId, token);
}

// ── Maintenance ───────────────────────────────────────────────────────────────

/**
 * Deletes all expired sessions from the database.
 * Safe to call on any schedule (idempotent).
 * Returns the number of rows deleted.
 */
export function cleanupExpiredSessions(): number {
  const db     = getDb();
  const result = db
    .prepare("DELETE FROM sessions WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now')")
    .run() as { changes: number };
  return result.changes;
}
