/**
 * src/lib/server/migrations.ts
 *
 * Migration system for Block 1 tables.
 *
 * Design:
 *  - Each migration has a unique integer version number.
 *  - The `schema_migrations` table tracks which versions have been applied.
 *  - Migrations are idempotent: running them twice is safe.
 *  - Migrations never drop tables or delete data.
 *  - Each migration runs in a transaction; a failure rolls back only that
 *    migration and leaves the DB in its previous state.
 *  - ALTER TABLE statements are guarded by checking existing columns first
 *    (SQLite does not support IF NOT EXISTS on ALTER TABLE).
 */

import type { DatabaseSync } from "node:sqlite";
import { randomUUID }        from "node:crypto";
import {
  SQL_USERS,
  SQL_SESSIONS,
  SQL_WORKSPACE_MEMBERS,
  SQL_INVITATIONS,
  SQL_ACTIVITY_LOG,
  SQL_NOTIFICATIONS,
  SQL_NOTIFICATION_PREFERENCES,
  SQL_INDEXES,
  SQL_ORGANIZATIONS,
  SQL_WORKSPACES_ORG_COLUMN,
  SQL_BILLING_PLANS,
  SQL_API_KEYS,
  SQL_AUDIT_LOGS,
  SQL_AUDIT_LOG_INDEX,
  SQL_CONVERSATIONS,
  SQL_MESSAGES,
  SQL_INBOX_INDEXES,
  SQL_EMAIL_ACCOUNTS,
  SQL_EMAIL_INDEXES,
  SQL_CLIENTS,
  SQL_CLIENT_CONTACTS,
  SQL_CLIENT_TAGS,
  SQL_CLIENTS_INDEXES,
  SQL_TASKS,
  SQL_TASK_CHECKLIST,
  SQL_TASK_COMMENTS,
  SQL_TASK_REMINDERS,
  SQL_TASKS_INDEXES,
  SQL_DEAL_STAGES,
  SQL_DEALS,
  SQL_DEALS_INDEXES,
  SQL_AI_ANALYSIS,
  SQL_AI_SUGGESTIONS,
  SQL_AI_INDEXES,
  SQL_ONBOARDING_PROGRESS,
  SQL_FEEDBACK,
  SQL_EVENTS,
  SQL_SYSTEM_ERRORS,
  SQL_AI_USAGE,
  SQL_M15_INDEXES,
  SQL_RIE_RHYTHMS,
  SQL_RIE_NARRATIVES,
  SQL_RIE_INDEXES,
  SQL_WORKSPACE_MEMORY,
} from "./schema";

// ── Migration registry ────────────────────────────────────────────────────────

interface Migration {
  version: number;
  name:    string;
  up:      (db: DatabaseSync) => void;
}

/**
 * Returns the list of column names for a given table.
 * Used to guard ALTER TABLE statements.
 */
function getColumns(db: DatabaseSync, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return new Set(rows.map((r) => r.name));
}

/**
 * Executes a single ALTER TABLE … ADD COLUMN statement only if the column
 * does not yet exist. SQLite does not support IF NOT EXISTS on ALTER TABLE.
 */
function addColumnIfMissing(
  db:         DatabaseSync,
  table:      string,
  column:     string,
  definition: string,
): void {
  const cols = getColumns(db, table);
  if (!cols.has(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

const MIGRATIONS: Migration[] = [
  // ── 1: Core auth tables ────────────────────────────────────────────────────
  {
    version: 1,
    name:    "create_users_and_sessions",
    up(db) {
      db.exec(SQL_USERS);
      // sessions references workspaces which already exists (created by the
      // Telegram migrations). We create sessions after workspaces.
      db.exec(SQL_SESSIONS);
    },
  },

  // ── 2: Extend workspaces table ─────────────────────────────────────────────
  {
    version: 2,
    name:    "extend_workspaces",
    up(db) {
      // workspaces was created by the Telegram migration with minimal columns.
      // We add the Block 1 columns one-by-one, guarded by existence checks.
      addColumnIfMissing(db, "workspaces", "slug",       "TEXT");
      addColumnIfMissing(db, "workspaces", "plan",       "TEXT NOT NULL DEFAULT 'free'");
      addColumnIfMissing(db, "workspaces", "owner_id",   "TEXT");
      addColumnIfMissing(db, "workspaces", "logo_url",   "TEXT");
      addColumnIfMissing(db, "workspaces", "settings",   "TEXT");
      addColumnIfMissing(db, "workspaces", "updated_at", "TEXT");

      // Backfill: give the existing 'default' workspace a slug and timestamps
      db.exec(`
        UPDATE workspaces
        SET    slug       = id,
               updated_at = COALESCE(updated_at, created_at,
                              strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        WHERE  slug IS NULL
      `);
    },
  },

  // ── 3: Workspace members & invitations ────────────────────────────────────
  {
    version: 3,
    name:    "create_workspace_members_and_invitations",
    up(db) {
      db.exec(SQL_WORKSPACE_MEMBERS);
      db.exec(SQL_INVITATIONS);
    },
  },

  // ── 4: Activity log & notifications ───────────────────────────────────────
  {
    version: 4,
    name:    "create_activity_log_and_notifications",
    up(db) {
      db.exec(SQL_ACTIVITY_LOG);
      db.exec(SQL_NOTIFICATIONS);
      db.exec(SQL_NOTIFICATION_PREFERENCES);
    },
  },

  // ── 5: All Block 1 indexes ─────────────────────────────────────────────────
  {
    version: 5,
    name:    "create_block1_indexes",
    up(db) {
      db.exec(SQL_INDEXES);
    },
  },

  // ── 6: Future-expansion stubs ─────────────────────────────────────────────
  {
    version: 6,
    name:    "create_expansion_stubs",
    up(db) {
      db.exec(SQL_ORGANIZATIONS);
      // Guard the organizations FK column just like other ALTER TABLE additions
      addColumnIfMissing(
        db,
        "workspaces",
        "organization_id",
        "TEXT REFERENCES organizations(id) ON DELETE SET NULL",
      );
      // SQL_WORKSPACES_ORG_COLUMN contains the raw ALTER statement — we already
      // handled it above, so we only use that export for documentation purposes.
      void SQL_WORKSPACES_ORG_COLUMN; // referenced so the import is not unused
      db.exec(SQL_BILLING_PLANS);
      db.exec(SQL_API_KEYS);
      db.exec(SQL_AUDIT_LOGS);
      db.exec(SQL_AUDIT_LOG_INDEX);
    },
  },

  // ── 7: Team management columns ────────────────────────────────────────────
  {
    version: 7,
    name:    "team_management_columns",
    up(db) {
      // Pre-join display name for invited members (before they link their account)
      addColumnIfMissing(db, "workspace_members", "display_name", "TEXT");
    },
  },

  // ── 8: Unified Inbox — conversations + messages ──────────────────────────
  {
    version: 8,
    name:    "unified_inbox_conversations_messages",
    up(db) {
      db.exec(SQL_CONVERSATIONS);
      db.exec(SQL_MESSAGES);
      db.exec(SQL_INBOX_INDEXES);
    },
  },

  // ── 9: Conversations metadata column ─────────────────────────────────────
  {
    version: 9,
    name:    "conversations_metadata_column",
    up(db) {
      // Add free-form JSON metadata to conversations.
      // Used to distinguish bot vs. personal-account Telegram channels, and for
      // future channel-specific data without schema changes.
      addColumnIfMissing(db, "conversations", "metadata", "TEXT");
    },
  },

  // ── 10: Email accounts ────────────────────────────────────────────────────
  {
    version: 10,
    name:    "email_accounts",
    up(db) {
      db.exec(SQL_EMAIL_ACCOUNTS);
      db.exec(SQL_EMAIL_INDEXES);
    },
  },

  // ── 11: CRM Clients — clients, client_contacts, client_tags ─────────────
  {
    version: 11,
    name:    "crm_clients",
    up(db) {
      db.exec(SQL_CLIENTS);
      db.exec(SQL_CLIENT_CONTACTS);
      db.exec(SQL_CLIENT_TAGS);
      db.exec(SQL_CLIENTS_INDEXES);
    },
  },

  // ── 12: Tasks & Timeline — tasks, task_checklist, task_comments, task_reminders ──
  {
    version: 12,
    name:    "tasks_and_timeline",
    up(db) {
      db.exec(SQL_TASKS);
      db.exec(SQL_TASK_CHECKLIST);
      db.exec(SQL_TASK_COMMENTS);
      db.exec(SQL_TASK_REMINDERS);
      db.exec(SQL_TASKS_INDEXES);
    },
  },

  // ── 13: Deals & Sales Pipeline — deal_stages, deals ────────────────────────
  {
    version: 13,
    name:    "deals_and_pipeline",
    up(db) {
      db.exec(SQL_DEAL_STAGES);
      db.exec(SQL_DEALS);
      db.exec(SQL_DEALS_INDEXES);

      // Seed 7 default stages for every workspace that exists at migration time.
      // Future workspaces get seeded via ensureDefaultStages() in the API layer.
      const workspaces = db.prepare("SELECT id FROM workspaces").all() as Array<{ id: string }>;
      const ts = new Date().toISOString();
      const insert = db.prepare(`
        INSERT OR IGNORE INTO deal_stages
          (id, workspace_id, name, order_index, color, is_default, is_won, is_lost, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const DEFAULTS = [
        { name: "Lead",        order: 0, color: "#9ca3af", isDefault: 1, isWon: 0, isLost: 0 },
        { name: "Qualified",   order: 1, color: "#3b82f6", isDefault: 0, isWon: 0, isLost: 0 },
        { name: "Proposal",    order: 2, color: "#8b5cf6", isDefault: 0, isWon: 0, isLost: 0 },
        { name: "Negotiation", order: 3, color: "#f59e0b", isDefault: 0, isWon: 0, isLost: 0 },
        { name: "Won",         order: 4, color: "#10b981", isDefault: 0, isWon: 1, isLost: 0 },
        { name: "Lost",        order: 5, color: "#ef4444", isDefault: 0, isWon: 0, isLost: 1 },
        { name: "On Hold",     order: 6, color: "#eab308", isDefault: 0, isWon: 0, isLost: 0 },
      ];

      for (const ws of workspaces) {
        for (const s of DEFAULTS) {
          insert.run(randomUUID(), ws.id, s.name, s.order, s.color, s.isDefault, s.isWon, s.isLost, ts);
        }
      }
    },
  },

  // ── 14: AI Analysis & Suggestions ────────────────────────────────────────────
  {
    version: 14,
    name:    "ai_analysis_and_suggestions",
    up(db) {
      db.exec(SQL_AI_ANALYSIS);
      db.exec(SQL_AI_SUGGESTIONS);
      db.exec(SQL_AI_INDEXES);
    },
  },

  // ── 15: Product Readiness & Beta Preparation ──────────────────────────────
  {
    version: 15,
    name:    "product_readiness_beta",
    up(db) {
      db.exec(SQL_ONBOARDING_PROGRESS);
      db.exec(SQL_FEEDBACK);
      db.exec(SQL_EVENTS);
      db.exec(SQL_SYSTEM_ERRORS);
      db.exec(SQL_AI_USAGE);
      db.exec(SQL_M15_INDEXES);
      // Extend workspace settings with branding fields (company_website, description, industry)
      // These are stored in the JSON settings column — no ALTER TABLE needed.
    },
  },

  // ── 16: Relationship Intelligence Engine — Sprint 3.1 foundation ──────────
  {
    version: 16,
    name:    "rie_sprint_3_1_foundation",
    up(db) {
      db.exec(SQL_RIE_RHYTHMS);
      db.exec(SQL_RIE_NARRATIVES);
      db.exec(SQL_RIE_INDEXES);
    },
  },

  // ── 17: Founder Memory — Sprint 4 ────────────────────────────────────────
  {
    version: 17,
    name:    "founder_memory_sprint_4",
    up(db) {
      db.exec(SQL_WORKSPACE_MEMORY);
    },
  },
];

// ── Migration runner ──────────────────────────────────────────────────────────

/**
 * Creates the `schema_migrations` table if it does not exist, then runs every
 * migration whose version number is greater than the current max applied version.
 *
 * Each migration runs inside its own `BEGIN … COMMIT` transaction so a partial
 * failure does not corrupt the applied-versions bookkeeping.
 */
export function runBlock1Migrations(db: DatabaseSync): void {
  // Ensure the migrations tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      applied_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);

  const appliedRow = db
    .prepare("SELECT COALESCE(MAX(version), 0) AS max_version FROM schema_migrations")
    .get() as { max_version: number };

  const currentVersion = appliedRow.max_version;

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion);

  if (pending.length === 0) return;

  for (const migration of pending) {
    // Run each migration in a transaction
    db.exec("BEGIN");
    try {
      migration.up(db);
      db.prepare(
        "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
      ).run(migration.version, migration.name);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(
        `Migration v${migration.version} "${migration.name}" failed: ${String(err)}`,
      );
    }
  }
}

/**
 * Returns the list of applied migration versions (for diagnostics / health checks).
 */
export function getAppliedMigrations(
  db: DatabaseSync,
): Array<{ version: number; name: string; applied_at: string }> {
  try {
    return db
      .prepare("SELECT version, name, applied_at FROM schema_migrations ORDER BY version")
      .all() as Array<{ version: number; name: string; applied_at: string }>;
  } catch {
    return [];
  }
}
