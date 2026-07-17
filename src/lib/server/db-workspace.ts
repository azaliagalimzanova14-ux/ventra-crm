/**
 * src/lib/server/db-workspace.ts
 *
 * CRUD helpers for the `workspaces` and `workspace_members` tables.
 */

import { getDb } from "../db";
import { randomUUID } from "node:crypto";
import type {
  DbWorkspace,
  DbWorkspaceMember,
  MemberRole,
  MemberStatus,
  MemberWithUser,
  WorkspaceSettings,
} from "./models";

function now(): string {
  return new Date().toISOString();
}

// ── Slug helpers ──────────────────────────────────────────────────────────────

/**
 * Converts a workspace name to a URL-safe slug.
 * e.g. "Acme Corp!" → "acme-corp"
 */
export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    || "workspace";
}

/**
 * Returns a slug guaranteed to be unique in the workspaces table.
 * Appends -2, -3, … if there is a collision.
 */
export function uniqueSlug(base: string): string {
  const db = getDb();
  let candidate = base;
  let n = 2;
  while (true) {
    const exists = db
      .prepare("SELECT 1 FROM workspaces WHERE slug = ? LIMIT 1")
      .get(candidate) as { 1: number } | undefined;
    if (!exists) return candidate;
    candidate = `${base}-${n}`;
    n++;
  }
}

// ── Workspace CRUD ────────────────────────────────────────────────────────────

export interface CreateWorkspaceParams {
  name:     string;
  owner_id: string;
  slug?:    string;   // auto-derived from name if omitted
  plan?:    DbWorkspace["plan"];
  settings?: WorkspaceSettings;
}

export function createWorkspace(params: CreateWorkspaceParams): DbWorkspace {
  const db   = getDb();
  const id   = randomUUID();
  const ts   = now();
  const slug = uniqueSlug(params.slug ?? nameToSlug(params.name));

  db.prepare(`
    INSERT INTO workspaces
      (id, name, slug, plan, owner_id, logo_url, settings, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, NULL, ?, ?, ?)
  `).run(
    id,
    params.name,
    slug,
    params.plan ?? "free",
    params.owner_id,
    params.settings ? JSON.stringify(params.settings) : null,
    ts,
    ts,
  );

  return getWorkspaceByIdOrThrow(id);
}

export function getWorkspaceById(id: string): DbWorkspace | null {
  const db = getDb();
  return (
    (db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as DbWorkspace | undefined) ?? null
  );
}

export function getWorkspaceByIdOrThrow(id: string): DbWorkspace {
  const ws = getWorkspaceById(id);
  if (!ws) throw new Error(`Workspace not found: ${id}`);
  return ws;
}

export function getWorkspaceBySlug(slug: string): DbWorkspace | null {
  const db = getDb();
  return (
    (db.prepare("SELECT * FROM workspaces WHERE slug = ?").get(slug) as DbWorkspace | undefined) ?? null
  );
}

export interface UpdateWorkspaceParams {
  name?:     string;
  slug?:     string;
  logo_url?: string | null;
  settings?: WorkspaceSettings | null;
}

export function updateWorkspace(id: string, params: UpdateWorkspaceParams): DbWorkspace {
  const db = getDb();

  const fields: string[] = [];
  const values: (string | null)[] = [];

  if (params.name     !== undefined) { fields.push("name = ?");     values.push(params.name); }
  if (params.slug     !== undefined) { fields.push("slug = ?");     values.push(params.slug); }
  if (params.logo_url !== undefined) { fields.push("logo_url = ?"); values.push(params.logo_url); }

  if (params.settings !== undefined) {
    fields.push("settings = ?");
    values.push(params.settings === null ? null : JSON.stringify(params.settings));
  }

  if (fields.length === 0) return getWorkspaceByIdOrThrow(id);

  fields.push("updated_at = ?");
  values.push(now());
  values.push(id);

  db.prepare(`UPDATE workspaces SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return getWorkspaceByIdOrThrow(id);
}

/** Parse the settings JSON blob; returns an empty object on null/invalid JSON. */
export function parseWorkspaceSettings(ws: DbWorkspace): WorkspaceSettings {
  if (!ws.settings) return {};
  try {
    return JSON.parse(ws.settings) as WorkspaceSettings;
  } catch {
    return {};
  }
}

// ── Workspace Members CRUD ────────────────────────────────────────────────────

export interface CreateMemberParams {
  workspace_id:  string;
  email:         string;
  role:          MemberRole;
  invited_by:    string;   // user_id of the inviter
  user_id?:      string;   // set when invite is immediately accepted (e.g. owner)
  status?:       MemberStatus;
  display_name?: string;   // pre-join name for invited members without a user record
}

export function createMember(params: CreateMemberParams): DbWorkspaceMember {
  const db = getDb();
  const id = randomUUID();
  const ts = now();

  db.prepare(`
    INSERT INTO workspace_members
      (id, workspace_id, user_id, email, display_name, role, status, invited_by, invited_at, joined_at, last_active_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.workspace_id,
    params.user_id     ?? null,
    params.email.toLowerCase().trim(),
    params.display_name ?? null,
    params.role,
    params.status      ?? "invited",
    params.invited_by,
    ts,
    params.status === "active" ? ts : null,
    params.status === "active" ? ts : null,
  );

  return getMemberByIdOrThrow(id);
}

export function getMemberById(id: string): DbWorkspaceMember | null {
  const db = getDb();
  return (
    (db
      .prepare("SELECT * FROM workspace_members WHERE id = ?")
      .get(id) as DbWorkspaceMember | undefined) ?? null
  );
}

export function getMemberByIdOrThrow(id: string): DbWorkspaceMember {
  const m = getMemberById(id);
  if (!m) throw new Error(`WorkspaceMember not found: ${id}`);
  return m;
}

export function getMemberByEmail(
  workspaceId: string,
  email: string,
): DbWorkspaceMember | null {
  const db = getDb();
  return (
    (db
      .prepare(
        "SELECT * FROM workspace_members WHERE workspace_id = ? AND email = ? LIMIT 1",
      )
      .get(workspaceId, email.toLowerCase().trim()) as DbWorkspaceMember | undefined) ?? null
  );
}

export function getMemberByUserId(
  workspaceId: string,
  userId: string,
): DbWorkspaceMember | null {
  const db = getDb();
  return (
    (db
      .prepare(
        "SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ? LIMIT 1",
      )
      .get(workspaceId, userId) as DbWorkspaceMember | undefined) ?? null
  );
}

/** List all workspaces a user belongs to (as active member). */
export function listUserWorkspaces(userId: string): DbWorkspace[] {
  const db = getDb();
  return db.prepare(`
    SELECT w.* FROM workspaces w
    JOIN   workspace_members m ON m.workspace_id = w.id
    WHERE  m.user_id = ? AND m.status = 'active'
    ORDER  BY w.name
  `).all(userId) as unknown as DbWorkspace[];
}

/** List all members of a workspace, joined with user data. */
export function listWorkspaceMembers(workspaceId: string): MemberWithUser[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      m.*,
      u.name       AS user_name,
      u.avatar_url AS user_avatar_url
    FROM  workspace_members m
    LEFT  JOIN users u ON u.id = m.user_id
    WHERE m.workspace_id = ?
    ORDER BY
      CASE m.role
        WHEN 'owner'         THEN 1
        WHEN 'admin'         THEN 2
        WHEN 'team_lead'     THEN 3
        WHEN 'sales_manager' THEN 4
        ELSE 5
      END,
      m.invited_at
  `).all(workspaceId) as unknown as MemberWithUser[];
}

export interface UpdateMemberParams {
  role?:           MemberRole;
  status?:         MemberStatus;
  user_id?:        string | null;
  display_name?:   string | null;
  joined_at?:      string | null;
  last_active_at?: string | null;
}

export function updateMember(id: string, params: UpdateMemberParams): DbWorkspaceMember {
  const db = getDb();

  const fields: string[] = [];
  const values: (string | null)[] = [];

  if (params.role           !== undefined) { fields.push("role = ?");           values.push(params.role); }
  if (params.status         !== undefined) { fields.push("status = ?");         values.push(params.status); }
  if (params.user_id        !== undefined) { fields.push("user_id = ?");        values.push(params.user_id); }
  if (params.display_name   !== undefined) { fields.push("display_name = ?");   values.push(params.display_name); }
  if (params.joined_at      !== undefined) { fields.push("joined_at = ?");      values.push(params.joined_at); }
  if (params.last_active_at !== undefined) { fields.push("last_active_at = ?"); values.push(params.last_active_at); }

  if (fields.length === 0) return getMemberByIdOrThrow(id);

  values.push(id);
  db.prepare(`UPDATE workspace_members SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return getMemberByIdOrThrow(id);
}

export function deleteMember(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM workspace_members WHERE id = ?").run(id);
}

/** Activates a pending member (sets status=active, user_id, joined_at). */
export function activateMember(id: string, userId: string): DbWorkspaceMember {
  return updateMember(id, {
    status:    "active",
    user_id:   userId,
    joined_at: new Date().toISOString(),
  });
}
