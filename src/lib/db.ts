/**
 * src/lib/db.ts
 *
 * Singleton SQLite database using the built-in `node:sqlite` module (Node 22+).
 * WAL journal mode + foreign keys enabled.
 *
 * Schema:
 *   workspaces       — one row per tenant (auto-creates "default")
 *   tg_bots          — one bot config per workspace (token stored AES-256-GCM encrypted)
 *   tg_conversations — one row per Telegram chat per workspace
 *   tg_messages      — all incoming/outgoing Telegram messages
 *
 * DB location: VENTRA_DB_PATH env var (default: {cwd}/ventra.db)
 */

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { runBlock1Migrations } from "./server/migrations";
import { seedDefaultWorkspace } from "./server/seed";

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (_db) return _db;

  const dbPath = process.env.VENTRA_DB_PATH ?? "/tmp/ventra.db";

  // Ensure parent directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new DatabaseSync(dbPath);
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA foreign_keys = ON");

  runMigrations(_db);
  runBlock1Migrations(_db);
  seedDefaultWorkspace(_db);

  return _db;
}

// ── Schema migrations ─────────────────────────────────────────────────────────

function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL DEFAULT 'Default Workspace',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    INSERT OR IGNORE INTO workspaces (id, name)
    VALUES ('default', 'Default Workspace');

    CREATE TABLE IF NOT EXISTS tg_bots (
      id              TEXT PRIMARY KEY,
      workspace_id    TEXT NOT NULL REFERENCES workspaces(id),
      bot_username    TEXT NOT NULL,
      bot_name        TEXT NOT NULL DEFAULT '',
      bot_id_str      TEXT NOT NULL DEFAULT '',
      token_enc       TEXT NOT NULL,
      webhook_secret  TEXT NOT NULL,
      webhook_url     TEXT NOT NULL DEFAULT '',
      status          TEXT NOT NULL DEFAULT 'connected',
      connected_at    TEXT NOT NULL,
      UNIQUE(workspace_id)
    );

    CREATE TABLE IF NOT EXISTS tg_conversations (
      id                  TEXT PRIMARY KEY,
      workspace_id        TEXT NOT NULL,
      chat_id             INTEGER NOT NULL,
      chat_type           TEXT NOT NULL,
      sender_name         TEXT NOT NULL,
      sender_username     TEXT,
      sender_telegram_id  INTEGER NOT NULL,
      first_message_at    TEXT NOT NULL,
      last_message_at     TEXT NOT NULL,
      message_count       INTEGER NOT NULL DEFAULT 0,
      UNIQUE(workspace_id, chat_id)
    );

    CREATE TABLE IF NOT EXISTS tg_messages (
      id                  TEXT PRIMARY KEY,
      workspace_id        TEXT NOT NULL,
      conversation_id     TEXT NOT NULL,
      update_id           INTEGER,
      chat_id             INTEGER NOT NULL,
      chat_type           TEXT NOT NULL,
      sender_name         TEXT NOT NULL,
      sender_username     TEXT,
      sender_telegram_id  INTEGER NOT NULL,
      text                TEXT NOT NULL,
      direction           TEXT NOT NULL,
      is_simulated        INTEGER NOT NULL DEFAULT 0,
      attachment_json     TEXT,
      received_at         TEXT NOT NULL,
      created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tg_messages_ws_recv
      ON tg_messages(workspace_id, received_at DESC);

    CREATE INDEX IF NOT EXISTS idx_tg_messages_conv
      ON tg_messages(conversation_id, received_at DESC);

    CREATE INDEX IF NOT EXISTS idx_tg_conv_ws_last
      ON tg_conversations(workspace_id, last_message_at DESC);

    -- Client-to-Telegram-chat link table.
    -- Persists the resolved chatId → CRM clientId mapping so it survives
    -- browser localStorage being cleared and works across multiple browsers.
    CREATE TABLE IF NOT EXISTS tg_client_links (
      workspace_id    TEXT    NOT NULL,
      chat_id         INTEGER NOT NULL,
      client_id       TEXT    NOT NULL,
      client_name     TEXT    NOT NULL DEFAULT '',
      client_avatar   TEXT    NOT NULL DEFAULT '',
      client_company  TEXT    NOT NULL DEFAULT '',
      is_auto_created INTEGER NOT NULL DEFAULT 0,
      linked_at       TEXT    NOT NULL,
      PRIMARY KEY (workspace_id, chat_id)
    );

    CREATE INDEX IF NOT EXISTS idx_tg_client_links_ws
      ON tg_client_links(workspace_id);

    -- ── Personal Telegram Account (MTProto / GramJS) ──────────────────────────
    -- One encrypted GramJS session per workspace.
    CREATE TABLE IF NOT EXISTS tg_personal_sessions (
      workspace_id   TEXT PRIMARY KEY REFERENCES workspaces(id),
      phone_number   TEXT NOT NULL,
      session_enc    TEXT NOT NULL,    -- AES-256-GCM encrypted StringSession
      api_id         INTEGER NOT NULL,
      status         TEXT NOT NULL DEFAULT 'connected',
      connected_at   TEXT NOT NULL,
      last_sync_at   TEXT NOT NULL,
      user_id        TEXT             -- which workspace member connected this account
    );

    -- Imported Telegram dialogs (one row per imported chat).
    CREATE TABLE IF NOT EXISTS tg_personal_dialogs (
      id             TEXT PRIMARY KEY,           -- '{workspace_id}_{peer_id}'
      workspace_id   TEXT NOT NULL,
      peer_id        TEXT NOT NULL,              -- stringified BigInt (Telegram peer ID)
      peer_type      TEXT NOT NULL,              -- 'user' | 'chat' | 'channel'
      title          TEXT NOT NULL,
      username       TEXT,
      phone          TEXT,
      is_business    INTEGER NOT NULL DEFAULT 0,
      biz_score      INTEGER NOT NULL DEFAULT 0,
      biz_reasons    TEXT NOT NULL DEFAULT '[]', -- JSON string[]
      unread_count   INTEGER NOT NULL DEFAULT 0,
      last_msg_at    TEXT NOT NULL,
      client_id      TEXT,                       -- linked CRM client ID (if any)
      imported_at    TEXT NOT NULL,
      UNIQUE(workspace_id, peer_id)
    );

    CREATE INDEX IF NOT EXISTS idx_tg_personal_dialogs_ws
      ON tg_personal_dialogs(workspace_id, last_msg_at DESC);

    -- Messages within imported personal account dialogs.
    CREATE TABLE IF NOT EXISTS tg_personal_messages (
      id             TEXT PRIMARY KEY,           -- '{workspace_id}_{peer_id}_{msg_id}'
      workspace_id   TEXT NOT NULL,
      dialog_id      TEXT NOT NULL,              -- references tg_personal_dialogs.id
      msg_id         INTEGER NOT NULL,           -- Telegram message ID (within peer)
      from_id        TEXT,                       -- stringified sender peer ID
      from_name      TEXT NOT NULL,
      text           TEXT NOT NULL DEFAULT '',
      date           TEXT NOT NULL,              -- ISO 8601
      direction      TEXT NOT NULL,              -- 'inbound' | 'outbound'
      media_type     TEXT,                       -- 'photo' | 'document' | 'voice' | null
      media_caption  TEXT,
      UNIQUE(workspace_id, dialog_id, msg_id)
    );

    CREATE INDEX IF NOT EXISTS idx_tg_personal_messages_dialog
      ON tg_personal_messages(dialog_id, date DESC);
  `);

  // ── Idempotent column additions for existing databases ──────────────────────
  // user_id: tracks which workspace member connected the personal Telegram account.
  // Added after initial release; guard required for DBs created before this column.
  const tgSessionCols = db
    .prepare("PRAGMA table_info(tg_personal_sessions)")
    .all() as Array<{ name: string }>;
  if (!tgSessionCols.some((c) => c.name === "user_id")) {
    db.exec("ALTER TABLE tg_personal_sessions ADD COLUMN user_id TEXT");
  }
}
