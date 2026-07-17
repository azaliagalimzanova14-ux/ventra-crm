/**
 * src/lib/server/db-clients.ts
 *
 * CRUD helpers for the `clients`, `client_contacts`, and `client_tags` tables.
 *
 * ── Invariants ────────────────────────────────────────────────────────────────
 *  - Every query requires workspace_id to enforce workspace isolation.
 *  - No cross-workspace joins are ever made here.
 *  - All IDs are UUIDs (randomUUID).
 *  - Timestamps are ISO 8601 strings.
 */

import { getDb }       from "../db";
import { randomUUID }  from "node:crypto";
import type {
  DbClient,
  DbClientContact,
  DbClientTag,
  DbClientFull,
  ClientStatus,
  ClientSource,
} from "./models";

function now(): string {
  return new Date().toISOString();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateClientParams {
  workspace_id:     string;
  name:             string;
  company?:         string;
  email?:           string;
  phone?:           string;
  position?:        string;
  source?:          ClientSource;
  status?:          ClientStatus;
  assigned_user_id?: string;
  notes?:           string;
  tags?:            string[];
}

export interface UpdateClientParams {
  name?:             string;
  company?:          string | null;
  email?:            string | null;
  phone?:            string | null;
  position?:         string | null;
  source?:           ClientSource | null;
  status?:           ClientStatus;
  assigned_user_id?: string | null;
  notes?:            string | null;
}

export interface ListClientsParams {
  workspace_id:      string;
  search?:           string;
  status?:           ClientStatus;
  assigned_user_id?: string;
  limit?:            number;    // default 50, max 200
  offset?:           number;
}

export interface ListClientsResult {
  clients: DbClient[];
  total:   number;
}

// ── Client CRUD ───────────────────────────────────────────────────────────────

export function createClient(params: CreateClientParams): DbClient {
  const db = getDb();
  const id = randomUUID();
  const ts = now();

  db.prepare(`
    INSERT INTO clients
      (id, workspace_id, name, company, email, phone, position, source,
       status, assigned_user_id, notes, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.workspace_id,
    params.name,
    params.company          ?? null,
    params.email            ?? null,
    params.phone            ?? null,
    params.position         ?? null,
    params.source           ?? null,
    params.status           ?? "active",
    params.assigned_user_id ?? null,
    params.notes            ?? null,
    ts,
    ts,
  );

  // Seed tags if provided
  if (params.tags && params.tags.length > 0) {
    for (const tag of params.tags) {
      setClientTag(id, params.workspace_id, tag);
    }
  }

  return getClientOrThrow(id, params.workspace_id);
}

export function getClient(id: string, workspaceId: string): DbClient | null {
  return getDb()
    .prepare("SELECT * FROM clients WHERE id = ? AND workspace_id = ?")
    .get(id, workspaceId) as unknown as DbClient | null;
}

export function getClientOrThrow(id: string, workspaceId: string): DbClient {
  const row = getClient(id, workspaceId);
  if (!row) throw new Error(`Client not found: ${id}`);
  return row;
}

export function getClientByEmail(
  workspaceId: string,
  email: string,
): DbClient | null {
  return getDb()
    .prepare(
      "SELECT * FROM clients WHERE workspace_id = ? AND email = ? COLLATE NOCASE LIMIT 1",
    )
    .get(workspaceId, email) as unknown as DbClient | null;
}

export function updateClient(
  id:          string,
  workspaceId: string,
  params:      UpdateClientParams,
): DbClient {
  const db   = getDb();
  const sets: string[] = ["updated_at = ?"];
  const vals: (string | null)[] = [now()];

  if (params.name             !== undefined) { sets.push("name = ?");             vals.push(params.name); }
  if (params.company          !== undefined) { sets.push("company = ?");          vals.push(params.company ?? null); }
  if (params.email            !== undefined) { sets.push("email = ?");            vals.push(params.email ?? null); }
  if (params.phone            !== undefined) { sets.push("phone = ?");            vals.push(params.phone ?? null); }
  if (params.position         !== undefined) { sets.push("position = ?");         vals.push(params.position ?? null); }
  if (params.source           !== undefined) { sets.push("source = ?");           vals.push(params.source ?? null); }
  if (params.status           !== undefined) { sets.push("status = ?");           vals.push(params.status); }
  if (params.assigned_user_id !== undefined) { sets.push("assigned_user_id = ?"); vals.push(params.assigned_user_id ?? null); }
  if (params.notes            !== undefined) { sets.push("notes = ?");            vals.push(params.notes ?? null); }

  db.prepare(
    `UPDATE clients SET ${sets.join(", ")} WHERE id = ? AND workspace_id = ?`,
  ).run(...vals, id, workspaceId);

  return getClientOrThrow(id, workspaceId);
}

export function deleteClient(id: string, workspaceId: string): void {
  getDb()
    .prepare("DELETE FROM clients WHERE id = ? AND workspace_id = ?")
    .run(id, workspaceId);
}

export function listClients(params: ListClientsParams): ListClientsResult {
  const db      = getDb();
  const limit   = Math.min(params.limit ?? 50, 200);
  const offset  = params.offset ?? 0;

  const clauses: string[]           = ["workspace_id = ?"];
  const vals:    (string | number)[] = [params.workspace_id];

  if (params.status) {
    clauses.push("status = ?");
    vals.push(params.status);
  }
  if (params.assigned_user_id) {
    clauses.push("assigned_user_id = ?");
    vals.push(params.assigned_user_id);
  }
  if (params.search) {
    const q = `%${params.search}%`;
    clauses.push("(name LIKE ? OR company LIKE ? OR email LIKE ? OR phone LIKE ?)");
    vals.push(q, q, q, q);
  }

  const where = clauses.join(" AND ");
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM clients WHERE ${where}`)
    .get(...vals) as { n: number }).n;

  const clients = db.prepare(
    `SELECT * FROM clients WHERE ${where} ORDER BY name ASC LIMIT ? OFFSET ?`,
  ).all(...vals, limit, offset) as unknown as DbClient[];

  return { clients, total };
}

/**
 * Load a client with all contacts and tags included.
 */
export function getClientFull(id: string, workspaceId: string): DbClientFull | null {
  const client = getClient(id, workspaceId);
  if (!client) return null;

  const contacts = getClientContacts(id, workspaceId);
  const tags     = getClientTagValues(id, workspaceId);

  return { ...client, contacts, tags };
}

// ── Contacts ──────────────────────────────────────────────────────────────────

export function getClientContacts(
  clientId:    string,
  workspaceId: string,
): DbClientContact[] {
  return getDb()
    .prepare(
      "SELECT * FROM client_contacts WHERE client_id = ? AND workspace_id = ? ORDER BY is_primary DESC, type ASC",
    )
    .all(clientId, workspaceId) as unknown as DbClientContact[];
}

export function upsertClientContact(
  clientId:    string,
  workspaceId: string,
  type:        string,
  value:       string,
  isPrimary:   boolean = false,
): DbClientContact {
  const db  = getDb();
  const existing = db.prepare(
    "SELECT * FROM client_contacts WHERE client_id = ? AND type = ? AND value = ?",
  ).get(clientId, type, value) as unknown as DbClientContact | undefined;

  if (existing) {
    if (isPrimary && !existing.is_primary) {
      db.prepare(
        "UPDATE client_contacts SET is_primary = 1 WHERE id = ?",
      ).run(existing.id);
    }
    return { ...existing, is_primary: isPrimary ? 1 : existing.is_primary };
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO client_contacts (id, client_id, workspace_id, type, value, is_primary)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, clientId, workspaceId, type, value, isPrimary ? 1 : 0);

  return db.prepare("SELECT * FROM client_contacts WHERE id = ?").get(id) as unknown as DbClientContact;
}

export function deleteClientContact(
  contactId:   string,
  workspaceId: string,
): void {
  getDb()
    .prepare(
      "DELETE FROM client_contacts WHERE id = ? AND workspace_id = ?",
    )
    .run(contactId, workspaceId);
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export function getClientTagValues(
  clientId:    string,
  workspaceId: string,
): string[] {
  const rows = getDb()
    .prepare(
      "SELECT tag FROM client_tags WHERE client_id = ? AND workspace_id = ? ORDER BY tag ASC",
    )
    .all(clientId, workspaceId) as Array<{ tag: string }>;
  return rows.map((r) => r.tag);
}

export function setClientTag(
  clientId:    string,
  workspaceId: string,
  tag:         string,
): DbClientTag {
  const db  = getDb();
  const trimmed = tag.trim().toLowerCase();
  if (!trimmed) throw new Error("Tag cannot be empty");

  const existing = db.prepare(
    "SELECT * FROM client_tags WHERE client_id = ? AND tag = ?",
  ).get(clientId, trimmed) as unknown as DbClientTag | undefined;

  if (existing) return existing;

  const id = randomUUID();
  db.prepare(
    "INSERT INTO client_tags (id, client_id, workspace_id, tag) VALUES (?, ?, ?, ?)",
  ).run(id, clientId, workspaceId, trimmed);

  return db.prepare("SELECT * FROM client_tags WHERE id = ?").get(id) as unknown as DbClientTag;
}

export function removeClientTag(
  clientId:    string,
  workspaceId: string,
  tag:         string,
): void {
  getDb()
    .prepare(
      "DELETE FROM client_tags WHERE client_id = ? AND workspace_id = ? AND tag = ?",
    )
    .run(clientId, workspaceId, tag.trim().toLowerCase());
}

export function replaceClientTags(
  clientId:    string,
  workspaceId: string,
  tags:        string[],
): void {
  const db = getDb();
  db.prepare("DELETE FROM client_tags WHERE client_id = ? AND workspace_id = ?").run(clientId, workspaceId);
  for (const tag of tags) {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed) continue;
    const id = randomUUID();
    db.prepare(
      "INSERT OR IGNORE INTO client_tags (id, client_id, workspace_id, tag) VALUES (?, ?, ?, ?)",
    ).run(id, clientId, workspaceId, trimmed);
  }
}

// ── Workspace-level tag list (for autocomplete) ───────────────────────────────

export function listWorkspaceTags(workspaceId: string): string[] {
  const rows = getDb()
    .prepare(
      "SELECT DISTINCT tag FROM client_tags WHERE workspace_id = ? ORDER BY tag ASC",
    )
    .all(workspaceId) as Array<{ tag: string }>;
  return rows.map((r) => r.tag);
}

// ── Email-based client lookup (for inbox matching) ───────────────────────────

/**
 * Find a client by matching their primary email address.
 * Used by the inbox to auto-link conversations.
 */
export function findClientByContactEmail(
  workspaceId: string,
  email:       string,
): DbClient | null {
  const db = getDb();
  const contact = db.prepare(`
    SELECT cc.client_id
    FROM   client_contacts cc
    WHERE  cc.workspace_id = ?
      AND  cc.type = 'email'
      AND  LOWER(cc.value) = LOWER(?)
    LIMIT 1
  `).get(workspaceId, email) as { client_id: string } | undefined;

  if (!contact) return getClientByEmail(workspaceId, email);
  return getClient(contact.client_id, workspaceId);
}
