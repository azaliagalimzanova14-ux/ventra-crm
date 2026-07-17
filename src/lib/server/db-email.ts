/**
 * src/lib/server/db-email.ts
 *
 * CRUD helpers for the `email_accounts` table.
 * OAuth tokens are stored AES-256-GCM encrypted — never in plaintext.
 *
 * Workspace isolation: every function scopes to workspace_id.
 * MVP: one account per workspace per provider (UNIQUE constraint in schema).
 */

import { getDb }        from "../db";
import { randomUUID }   from "node:crypto";
import { encryptToken, decryptToken } from "../crypto-token";
import type { DbEmailAccount, EmailProviderName } from "./models";

function now(): string {
  return new Date().toISOString();
}

// ── Write ─────────────────────────────────────────────────────────────────────

export interface SaveEmailAccountParams {
  workspaceId:    string;
  userId:         string;
  provider:       EmailProviderName;
  email:          string;
  displayName?:   string;
  accessToken:    string;   // plaintext — will be encrypted before storage
  refreshToken?:  string;   // plaintext
  expiresAt?:     string;   // ISO 8601
  scope?:         string;
}

/**
 * Upsert an email account for a workspace+provider pair.
 * Encrypts both tokens before writing.
 */
export function saveEmailAccount(params: SaveEmailAccountParams): DbEmailAccount {
  const db = getDb();
  const id = randomUUID();
  const ts = now();

  const encryptedAccess  = encryptToken(params.accessToken);
  const encryptedRefresh = params.refreshToken ? encryptToken(params.refreshToken) : null;

  // UPSERT: update existing row if (workspace_id, provider) already exists
  db.prepare(`
    INSERT INTO email_accounts
      (id, workspace_id, user_id, provider, email, display_name,
       access_token, refresh_token, token_expires_at, scope, connected_at, last_sync_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(workspace_id, provider) DO UPDATE SET
      user_id          = excluded.user_id,
      email            = excluded.email,
      display_name     = excluded.display_name,
      access_token     = excluded.access_token,
      refresh_token    = excluded.refresh_token,
      token_expires_at = excluded.token_expires_at,
      scope            = excluded.scope,
      connected_at     = excluded.connected_at
  `).run(
    id,
    params.workspaceId,
    params.userId,
    params.provider,
    params.email,
    params.displayName ?? null,
    encryptedAccess,
    encryptedRefresh,
    params.expiresAt ?? null,
    params.scope     ?? null,
    ts,
  );

  const row = getEmailAccount(params.workspaceId, params.provider);
  if (!row) throw new Error("Failed to save email account");
  return row;
}

/**
 * Update stored tokens after a refresh (access_token always changes,
 * refresh_token may be rotated in some providers).
 */
export function updateEmailTokens(
  workspaceId:    string,
  provider:       EmailProviderName,
  accessToken:    string,
  refreshToken?:  string,
  expiresAt?:     string,
): void {
  const db             = getDb();
  const encAccess      = encryptToken(accessToken);
  const encRefresh     = refreshToken ? encryptToken(refreshToken) : undefined;

  if (encRefresh !== undefined) {
    db.prepare(`
      UPDATE email_accounts
      SET access_token = ?, refresh_token = ?, token_expires_at = ?
      WHERE workspace_id = ? AND provider = ?
    `).run(encAccess, encRefresh, expiresAt ?? null, workspaceId, provider);
  } else {
    db.prepare(`
      UPDATE email_accounts
      SET access_token = ?, token_expires_at = ?
      WHERE workspace_id = ? AND provider = ?
    `).run(encAccess, expiresAt ?? null, workspaceId, provider);
  }
}

/** Stamp last_sync_at to now. */
export function touchEmailSync(workspaceId: string, provider: EmailProviderName): void {
  getDb().prepare(`
    UPDATE email_accounts SET last_sync_at = ? WHERE workspace_id = ? AND provider = ?
  `).run(now(), workspaceId, provider);
}

/** Delete the email account (e.g. on disconnect). */
export function deleteEmailAccount(workspaceId: string, provider: EmailProviderName): void {
  getDb().prepare(
    "DELETE FROM email_accounts WHERE workspace_id = ? AND provider = ?",
  ).run(workspaceId, provider);
}

// ── Read ──────────────────────────────────────────────────────────────────────

/** Get the raw (encrypted) DB row. */
export function getEmailAccount(
  workspaceId: string,
  provider:    EmailProviderName = "gmail",
): DbEmailAccount | null {
  return getDb()
    .prepare("SELECT * FROM email_accounts WHERE workspace_id = ? AND provider = ?")
    .get(workspaceId, provider) as DbEmailAccount | null | undefined ?? null;
}

// ── Decryption helpers ────────────────────────────────────────────────────────

export interface DecryptedTokens {
  accessToken:    string;
  refreshToken:   string | null;
  expiresAt:      string | null;
}

/**
 * Returns decrypted tokens for an email account.
 * Returns null if no account is found.
 */
export function getDecryptedTokens(
  workspaceId: string,
  provider:    EmailProviderName = "gmail",
): DecryptedTokens | null {
  const row = getEmailAccount(workspaceId, provider);
  if (!row) return null;

  try {
    return {
      accessToken:  decryptToken(row.access_token),
      refreshToken: row.refresh_token ? decryptToken(row.refresh_token) : null,
      expiresAt:    row.token_expires_at,
    };
  } catch {
    return null;
  }
}

/**
 * Check whether the stored access token has expired (or will expire in the next
 * 2 minutes to avoid using a token that expires mid-request).
 */
export function isTokenExpired(account: DbEmailAccount): boolean {
  if (!account.token_expires_at) return false; // no expiry set — assume valid
  const expiresMs = new Date(account.token_expires_at).getTime();
  return expiresMs - Date.now() < 2 * 60 * 1000; // 2-minute buffer
}
