/**
 * src/lib/db/migrations.ts
 *
 * Versioned migration runner for Block 1 schema.
 *
 * Design:
 *   • schema_migrations table tracks applied versions.
 *   • Each migration runs exactly once; safe to call runBlock1Migrations()
 *     as many times as needed (idempotent).
 *   • DDL uses IF NOT EXISTS / IF EXISTS everywhere possible.
 *   • ALTER TABLE column additions use safeAddColumn() which silently
 *     ignores "duplicate column" errors — idempotent even outside the tracker.
 *   • Existing Telegram tables are never touched.
 */

import { DatabaseSync } from "node:sqlite";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Add a column to a table, silently ignoring "duplicate column name" errors.
 * SQLite does not support `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.
 */
function safeAddColumn(
  db: DatabaseSync,
  table: string,
  column: string,
  definition: string,
): void {
  try {
    db.exec(`ALTER TABLE "${table}" ADD COLUMN ${column} ${definition}`);
  } catch {
    // Column already exists — intentionally ignored.
  }
}

/** Returns true if the given migration version has already been applied. */
function isApplied(db: DatabaseSync, version: string): boolean {
  const row = db
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(version) as { version: string } | undefined;
  return row !== undefined;
}

/** Records a migration version as applied. */
function markApplied(db: DatabaseSync, version: string): void {
  db.prepare(
    "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)",
  ).run(version);
}

// ── Migration: 001 — users & sessions ─────────────────────────────────────────

function migration001(db: DatabaseSync): void {
  if (isApplied(db, "001_block1_users_sessions")) return;

  db.exec(`
    -- Users: authenticated principals (replace localStorage auth in M2)
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_url    TEXT,
      phone         TEXT,
      bio           TEXT,
      timezone      TEXT NOT NULL DEFAULT 'UTC',
      locale        TEXT NOT NULL DEFAULT 'en',
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
      ON users(email);

    -- Sessions: server-side HTTP-only cookie sessions (replace sessionStorage in M2)
    CREATE TABLE IF NOT EXISTS sessions (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id  TEXT,
      token         TEXT NOT NULL,
      expires_at    TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      user_agent    TEXT,
      ip_address    TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token
      ON sessions(token);

    CREATE INDEX IF NOT EXISTS idx_sessions_user
      ON sessions(user_id, expires_at);

    CREATE INDEX IF NOT EXISTS idx_sessions_ws
      ON sessions(workspace_id);
  `);

  markApplied(db, "001_block1_users_sessions");
}

// ── Migration: 002 — workspace extension & membership ─────────────────────────

function migration002(db: DatabaseSync): void {
  if (isApplied(db, "002_block1_workspace_members")) return;

  // Extend the existing workspaces table (created in db.ts original migration).
  // owner_id is nullable so the legacy 'default' row can exist without a real user.
  safeAddColumn(db, "workspaces", "slug",       "TEXT NOT NULL DEFAULT ''");
  safeAddColumn(db, "workspaces", "plan",       "TEXT NOT NULL DEFAULT 'free'");
  safeAddColumn(db, "workspaces", "owner_id",   "TEXT");
  safeAddColumn(db, "workspaces", "logo_url",   "TEXT");
  safeAddColumn(db, "workspaces", "settings",   "TEXT NOT NULL DEFAULT '{}'");
  safeAddColumn(db, "workspaces", "updated_at", "TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))");

  // Back-fill slug for the pre-existing legacy 'default' workspace.
  db.exec(`
    UPDATE workspaces SET slug = id WHERE slug = '' OR slug IS NULL;
  `);

  // Enforce slug uniqueness via index (can't add UNIQUE constraint via ALTER TABLE in SQLite).
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug);
  `);

  db.exec(`
    -- Workspace members: workspace ↔ user many-to-many with role + status.
    -- user_id is nullable: invited members have no account until they accept.
    CREATE TABLE IF NOT EXISTS workspace_members (
      id              TEXT PRIMARY KEY,
      workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
      email           TEXT NOT NULL,
      role            TEXT NOT NULL CHECK(role IN ('owner','admin','team_lead','sales_manager')),
      status          TEXT NOT NULL DEFAULT 'invited' CHECK(status IN ('active','invited','inactive')),
      invited_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
      invited_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      joined_at       TEXT,
      last_active_at  TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_members_ws_email
      ON workspace_members(workspace_id, email);

    CREATE INDEX IF NOT EXISTS idx_ws_members_user
      ON workspace_members(user_id);

    CREATE INDEX IF NOT EXISTS idx_ws_members_ws_status
      ON workspace_members(workspace_id, status);

    -- Invitations: token-based invite links (7-day expiry).
    -- Separate from workspace_members so we can track token lifecycle.
    CREATE TABLE IF NOT EXISTS invitations (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      email         TEXT NOT NULL,
      role          TEXT NOT NULL CHECK(role IN ('owner','admin','team_lead','sales_manager')),
      token         TEXT NOT NULL,
      invited_by    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at    TEXT NOT NULL,
      accepted_at   TEXT,
      revoked_at    TEXT,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_token
      ON invitations(token);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_ws_email
      ON invitations(workspace_id, email);

    CREATE INDEX IF NOT EXISTS idx_invitations_ws_active
      ON invitations(workspace_id, accepted_at, revoked_at, expires_at);
  `);

  markApplied(db, "002_block1_workspace_members");
}

// ── Migration: 003 — activity log & notifications ────────────────────────────

function migration003(db: DatabaseSync): void {
  if (isApplied(db, "003_block1_activity_notifications")) return;

  db.exec(`
    -- Unified activity log: all CRM + team events in one table.
    -- Replaces the localStorage ventra_activity_log cap-50 store.
    CREATE TABLE IF NOT EXISTS activity_log (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
      type          TEXT NOT NULL,
      entity_type   TEXT,
      entity_id     TEXT,
      entity_name   TEXT,
      detail        TEXT,
      metadata      TEXT,           -- JSON blob
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_activity_ws_created
      ON activity_log(workspace_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_activity_ws_type
      ON activity_log(workspace_id, type, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_activity_ws_user
      ON activity_log(workspace_id, user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_activity_entity
      ON activity_log(workspace_id, entity_type, entity_id);

    -- Persisted notifications (replaces derived generateNotifications()).
    -- One row per user per notification event; updated on re-generation.
    CREATE TABLE IF NOT EXISTS notifications (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind          TEXT NOT NULL CHECK(kind IN ('danger','warning','opportunity','action','ok')),
      category      TEXT NOT NULL CHECK(category IN ('task','deal','client','lead','ai','team','system')),
      priority      TEXT NOT NULL CHECK(priority IN ('urgent','high','medium','low')),
      title         TEXT NOT NULL,
      body          TEXT NOT NULL,
      href          TEXT NOT NULL,
      entity_id     TEXT,
      read          INTEGER NOT NULL DEFAULT 0 CHECK(read IN (0,1)),
      read_at       TEXT,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_notif_user_ws
      ON notifications(user_id, workspace_id, read, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_notif_ws_category
      ON notifications(workspace_id, category, created_at DESC);

    -- Per-user, per-workspace notification channel preferences.
    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      category      TEXT NOT NULL CHECK(category IN ('task','deal','client','lead','ai','team','system')),
      in_app        INTEGER NOT NULL DEFAULT 1 CHECK(in_app IN (0,1)),
      email         INTEGER NOT NULL DEFAULT 0 CHECK(email IN (0,1)),
      PRIMARY KEY (user_id, workspace_id, category)
    );
  `);

  markApplied(db, "003_block1_activity_notifications");
}

// ── Migration: 004 — future-proof stubs ──────────────────────────────────────

function migration004(db: DatabaseSync): void {
  if (isApplied(db, "004_block1_future_stubs")) return;

  db.exec(`
    -- Organizations: enterprise tier, one org → many workspaces.
    -- Not wired to API yet; schema is stable so future Block can add FK from workspaces.
    CREATE TABLE IF NOT EXISTS organizations (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      plan          TEXT NOT NULL DEFAULT 'enterprise',
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    -- API keys: workspace-scoped keys for future public API.
    CREATE TABLE IF NOT EXISTS api_keys (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      key_prefix    TEXT NOT NULL,     -- first 8 chars shown in UI (e.g. "vnt_xxxx")
      key_hash      TEXT NOT NULL,     -- bcrypt hash of the full key
      scopes        TEXT NOT NULL DEFAULT '[]',  -- JSON array of permission scopes
      last_used_at  TEXT,
      expires_at    TEXT,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_ws
      ON api_keys(workspace_id);

    CREATE INDEX IF NOT EXISTS idx_api_keys_prefix
      ON api_keys(key_prefix);

    -- Audit log: immutable append-only record of security-relevant actions.
    -- More granular than activity_log; includes before/after change diffs.
    CREATE TABLE IF NOT EXISTS audit_log (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
      action        TEXT NOT NULL,         -- e.g. "user.login", "member.role_changed"
      resource_type TEXT,
      resource_id   TEXT,
      changes       TEXT,                  -- JSON { before, after }
      ip_address    TEXT,
      user_agent    TEXT,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_ws_created
      ON audit_log(workspace_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_audit_user
      ON audit_log(user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_audit_resource
      ON audit_log(workspace_id, resource_type, resource_id);
  `);

  markApplied(db, "004_block1_future_stubs");
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Run all Block 1 migrations against the provided database connection.
 * Idempotent — safe to call on every server startup.
 */
export function runBlock1Migrations(db: DatabaseSync): void {
  // Bootstrap the migrations tracker table (always safe to re-run).
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);

  migration001(db);
  migration002(db);
  migration003(db);
  migration004(db);
}
