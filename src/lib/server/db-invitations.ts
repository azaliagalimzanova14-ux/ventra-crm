/**
 * src/lib/server/db-invitations.ts
 *
 * CRUD helpers for the `invitations` table.
 */

import { getDb } from "../db";
import { randomUUID, randomBytes } from "node:crypto";
import type { DbInvitation, InvitationWithStatus, MemberRole } from "./models";

function now(): string {
  return new Date().toISOString();
}

/** Generates a secure 32-byte hex token for invite links. */
export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

/** Returns an ISO string 7 days from now. */
function expiresAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString();
}

// ── Create ────────────────────────────────────────────────────────────────────

export interface CreateInvitationParams {
  workspace_id: string;
  email:        string;
  role:         MemberRole;
  invited_by:   string;  // user_id
}

export function createInvitation(params: CreateInvitationParams): DbInvitation {
  const db    = getDb();
  const id    = randomUUID();
  const token = generateInviteToken();
  const ts    = now();

  // If an active invite for this email+workspace already exists, revoke it
  db.prepare(`
    UPDATE invitations
    SET    revoked_at = ?
    WHERE  workspace_id = ? AND email = ? AND accepted_at IS NULL AND revoked_at IS NULL
  `).run(ts, params.workspace_id, params.email.toLowerCase().trim());

  db.prepare(`
    INSERT INTO invitations
      (id, workspace_id, email, role, token, invited_by, expires_at, created_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.workspace_id,
    params.email.toLowerCase().trim(),
    params.role,
    token,
    params.invited_by,
    expiresAt(),
    ts,
  );

  return getInvitationByIdOrThrow(id);
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function getInvitationById(id: string): DbInvitation | null {
  const db = getDb();
  return (
    (db
      .prepare("SELECT * FROM invitations WHERE id = ?")
      .get(id) as DbInvitation | undefined) ?? null
  );
}

export function getInvitationByIdOrThrow(id: string): DbInvitation {
  const inv = getInvitationById(id);
  if (!inv) throw new Error(`Invitation not found: ${id}`);
  return inv;
}

export function getInvitationByToken(token: string): DbInvitation | null {
  const db = getDb();
  return (
    (db
      .prepare("SELECT * FROM invitations WHERE token = ?")
      .get(token) as DbInvitation | undefined) ?? null
  );
}

/** Lists ALL invitations for a workspace (most recent first, limit 100). */
export function listWorkspaceInvitations(workspaceId: string): InvitationWithStatus[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM invitations
    WHERE  workspace_id = ?
    ORDER  BY created_at DESC
    LIMIT  100
  `).all(workspaceId) as unknown as DbInvitation[];
  return rows.map(withStatus);
}

/** Lists all non-revoked, non-accepted invitations for a workspace. */
export function listPendingInvitations(workspaceId: string): DbInvitation[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM invitations
    WHERE  workspace_id = ?
      AND  accepted_at IS NULL
      AND  revoked_at  IS NULL
    ORDER  BY created_at DESC
  `).all(workspaceId) as unknown as DbInvitation[];
}

/** Computes the status of an invitation. */
export function getInvitationStatus(
  inv: DbInvitation,
): InvitationWithStatus["status"] {
  if (inv.revoked_at)  return "revoked";
  if (inv.accepted_at) return "accepted";
  if (new Date(inv.expires_at) < new Date()) return "expired";
  return "pending";
}

/** Returns an invitation with a computed `status` field. */
export function withStatus(inv: DbInvitation): InvitationWithStatus {
  return { ...inv, status: getInvitationStatus(inv) };
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function acceptInvitation(token: string): DbInvitation {
  const db  = getDb();
  const inv = getInvitationByToken(token);
  if (!inv) throw new Error("Invitation not found");
  if (getInvitationStatus(inv) !== "pending") {
    throw new Error("Invitation is not pending");
  }

  db.prepare("UPDATE invitations SET accepted_at = ? WHERE id = ?")
    .run(now(), inv.id);

  return getInvitationByIdOrThrow(inv.id);
}

export function revokeInvitation(id: string): DbInvitation {
  const db = getDb();
  db.prepare("UPDATE invitations SET revoked_at = ? WHERE id = ?")
    .run(now(), id);
  return getInvitationByIdOrThrow(id);
}

/**
 * Re-creates an invitation (new token, new expiry) for the same email+workspace+role.
 * The old invitation is revoked.
 */
export function resendInvitation(
  id: string,
  invitedBy: string,
): DbInvitation {
  const db  = getDb();
  const old = getInvitationByIdOrThrow(id);

  // Revoke the old one
  db.prepare("UPDATE invitations SET revoked_at = ? WHERE id = ?")
    .run(now(), id);

  // Create a fresh invitation
  return createInvitation({
    workspace_id: old.workspace_id,
    email:        old.email,
    role:         old.role,
    invited_by:   invitedBy,
  });
}

// ── Maintenance ───────────────────────────────────────────────────────────────

/**
 * Marks all expired-but-not-yet-marked invitations as expired.
 * Safe to run on any schedule (idempotent).
 */
export function cleanupExpiredInvitations(): number {
  const db     = getDb();
  const result = db.prepare(`
    UPDATE invitations
    SET    revoked_at = ?
    WHERE  expires_at < ?
      AND  accepted_at IS NULL
      AND  revoked_at  IS NULL
  `).run(now(), now()) as { changes: number };
  return result.changes;
}
