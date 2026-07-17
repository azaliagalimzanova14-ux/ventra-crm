/**
 * src/lib/server/db-users.ts
 *
 * CRUD helpers for the `users` table.
 * All functions are synchronous (node:sqlite DatabaseSync API).
 */

import { getDb } from "../db";
import { randomUUID } from "node:crypto";
import type { DbUser } from "./models";

function now(): string {
  return new Date().toISOString();
}

// ── Create ────────────────────────────────────────────────────────────────────

export interface CreateUserParams {
  name:          string;
  email:         string;
  password_hash: string;
  avatar_url?:   string;
  phone?:        string;
  bio?:          string;
  timezone?:     string;
  locale?:       string;
}

export function createUser(params: CreateUserParams): DbUser {
  const db = getDb();
  const id = randomUUID();
  const ts = now();

  db.prepare(`
    INSERT INTO users
      (id, name, email, password_hash, avatar_url, phone, bio, timezone, locale, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.name,
    params.email.toLowerCase().trim(),
    params.password_hash,
    params.avatar_url   ?? null,
    params.phone        ?? null,
    params.bio          ?? null,
    params.timezone     ?? "UTC",
    params.locale       ?? "en",
    ts,
    ts,
  );

  return getUserByIdOrThrow(id);
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function getUserById(id: string): DbUser | null {
  const db = getDb();
  return (
    (db.prepare("SELECT * FROM users WHERE id = ?").get(id) as DbUser | undefined) ?? null
  );
}

export function getUserByIdOrThrow(id: string): DbUser {
  const user = getUserById(id);
  if (!user) throw new Error(`User not found: ${id}`);
  return user;
}

export function getUserByEmail(email: string): DbUser | null {
  const db = getDb();
  return (
    (db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email.toLowerCase().trim()) as DbUser | undefined) ?? null
  );
}

export function listUsers(ids: string[]): DbUser[] {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => "?").join(", ");
  return db
    .prepare(`SELECT * FROM users WHERE id IN (${placeholders}) ORDER BY name`)
    .all(...ids) as unknown as DbUser[];
}

// ── Update ────────────────────────────────────────────────────────────────────

export interface UpdateUserParams {
  name?:       string;
  avatar_url?: string | null;
  phone?:      string | null;
  bio?:        string | null;
  timezone?:   string;
  locale?:     string;
}

export function updateUser(id: string, params: UpdateUserParams): DbUser {
  const db = getDb();

  const fields: string[] = [];
  const values: (string | null)[] = [];

  if (params.name       !== undefined) { fields.push("name = ?");       values.push(params.name); }
  if (params.avatar_url !== undefined) { fields.push("avatar_url = ?"); values.push(params.avatar_url); }
  if (params.phone      !== undefined) { fields.push("phone = ?");      values.push(params.phone); }
  if (params.bio        !== undefined) { fields.push("bio = ?");        values.push(params.bio); }
  if (params.timezone   !== undefined) { fields.push("timezone = ?");   values.push(params.timezone); }
  if (params.locale     !== undefined) { fields.push("locale = ?");     values.push(params.locale); }

  if (fields.length === 0) return getUserByIdOrThrow(id);

  fields.push("updated_at = ?");
  values.push(now());
  values.push(id);

  db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return getUserByIdOrThrow(id);
}

export function updatePasswordHash(id: string, password_hash: string): void {
  const db = getDb();
  db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .run(password_hash, now(), id);
}

export function updateLastActive(userId: string, workspaceId: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE workspace_members
    SET    last_active_at = ?
    WHERE  user_id = ? AND workspace_id = ?
  `).run(now(), userId, workspaceId);
}

// ── Delete ────────────────────────────────────────────────────────────────────

export function deleteUser(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

// ── Existence checks ──────────────────────────────────────────────────────────

export function emailExists(email: string): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT 1 FROM users WHERE email = ? LIMIT 1")
    .get(email.toLowerCase().trim()) as { 1: number } | undefined;
  return row !== undefined;
}
