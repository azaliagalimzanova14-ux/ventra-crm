/**
 * src/lib/server/schema.ts
 *
 * Pure SQL DDL for all Block 1 tables.
 * Each statement uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS
 * so the schema is fully idempotent and safe to run multiple times.
 *
 * Tables are declared in FK-dependency order (parents before children).
 *
 * Future-expansion tables (organizations, api_keys, audit_logs, billing_plans)
 * are created here as stubs so the schema is forward-compatible. No helper
 * functions for them are wired up until they are needed.
 */

// ── Block 1 tables ────────────────────────────────────────────────────────────

export const SQL_USERS = `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT    PRIMARY KEY,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    avatar_url    TEXT,
    phone         TEXT,
    bio           TEXT,
    timezone      TEXT    NOT NULL DEFAULT 'UTC',
    locale        TEXT    NOT NULL DEFAULT 'en',
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL,
    UNIQUE(email)
  );
`;

export const SQL_SESSIONS = `
  CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
    token        TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    user_agent   TEXT,
    ip_address   TEXT,
    UNIQUE(token)
  );
`;

export const SQL_WORKSPACES_BLOCK1 = `
  ALTER TABLE workspaces ADD COLUMN slug       TEXT;
  ALTER TABLE workspaces ADD COLUMN plan       TEXT NOT NULL DEFAULT 'free';
  ALTER TABLE workspaces ADD COLUMN owner_id   TEXT;
  ALTER TABLE workspaces ADD COLUMN logo_url   TEXT;
  ALTER TABLE workspaces ADD COLUMN settings   TEXT;
  ALTER TABLE workspaces ADD COLUMN updated_at TEXT;
`;

export const SQL_WORKSPACE_MEMBERS = `
  CREATE TABLE IF NOT EXISTS workspace_members (
    id             TEXT PRIMARY KEY,
    workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
    email          TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'sales_manager',
    status         TEXT NOT NULL DEFAULT 'invited',
    invited_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
    invited_at     TEXT NOT NULL,
    joined_at      TEXT,
    last_active_at TEXT,
    UNIQUE(workspace_id, email)
  );
`;

export const SQL_INVITATIONS = `
  CREATE TABLE IF NOT EXISTS invitations (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email        TEXT NOT NULL,
    role         TEXT NOT NULL,
    token        TEXT NOT NULL,
    invited_by   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at   TEXT NOT NULL,
    accepted_at  TEXT,
    revoked_at   TEXT,
    created_at   TEXT NOT NULL,
    UNIQUE(token),
    UNIQUE(workspace_id, email)
  );
`;

export const SQL_ACTIVITY_LOG = `
  CREATE TABLE IF NOT EXISTS activity_log (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
    type         TEXT NOT NULL,
    entity_type  TEXT,
    entity_id    TEXT,
    entity_name  TEXT,
    detail       TEXT,
    metadata     TEXT,
    created_at   TEXT NOT NULL
  );
`;

export const SQL_NOTIFICATIONS = `
  CREATE TABLE IF NOT EXISTS notifications (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
    kind         TEXT NOT NULL,
    category     TEXT NOT NULL,
    priority     TEXT NOT NULL,
    title        TEXT NOT NULL,
    body         TEXT NOT NULL,
    href         TEXT NOT NULL,
    entity_id    TEXT,
    read         INTEGER NOT NULL DEFAULT 0,
    read_at      TEXT,
    created_at   TEXT NOT NULL
  );
`;

export const SQL_NOTIFICATION_PREFERENCES = `
  CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id      TEXT NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    category     TEXT NOT NULL,
    in_app       INTEGER NOT NULL DEFAULT 1,
    email        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, workspace_id, category)
  );
`;

// ── Indexes ───────────────────────────────────────────────────────────────────

export const SQL_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_sessions_token
    ON sessions(token);

  CREATE INDEX IF NOT EXISTS idx_sessions_user
    ON sessions(user_id, expires_at);

  CREATE INDEX IF NOT EXISTS idx_workspace_members_ws
    ON workspace_members(workspace_id, status);

  CREATE INDEX IF NOT EXISTS idx_workspace_members_user
    ON workspace_members(user_id);

  CREATE INDEX IF NOT EXISTS idx_invitations_token
    ON invitations(token);

  CREATE INDEX IF NOT EXISTS idx_invitations_ws
    ON invitations(workspace_id, email);

  CREATE INDEX IF NOT EXISTS idx_activity_ws_time
    ON activity_log(workspace_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_activity_user
    ON activity_log(user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_activity_entity
    ON activity_log(workspace_id, entity_type, entity_id);

  CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON notifications(user_id, workspace_id, read, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_notifications_ws
    ON notifications(workspace_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_notifications_entity
    ON notifications(workspace_id, entity_id);

  CREATE INDEX IF NOT EXISTS idx_notif_prefs_user
    ON notification_preferences(user_id, workspace_id);
`;

// ── Block 2: Unified Inbox tables ────────────────────────────────────────────

/**
 * One row per conversation — channel-agnostic.
 * external_id = channel-specific conversation ID (Telegram chat_id, Gmail thread_id, etc.)
 * UNIQUE(workspace_id, channel, external_id) prevents duplicate conversations per chat.
 */
export const SQL_CONVERSATIONS = `
  CREATE TABLE IF NOT EXISTS conversations (
    id                TEXT    PRIMARY KEY,
    workspace_id      TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    client_id         TEXT,
    channel           TEXT    NOT NULL,
    external_id       TEXT,
    title             TEXT    NOT NULL DEFAULT '',
    assigned_user_id  TEXT,
    status            TEXT    NOT NULL DEFAULT 'open',
    last_message_at   TEXT,
    last_message_text TEXT,
    created_at        TEXT    NOT NULL,
    updated_at        TEXT    NOT NULL,
    UNIQUE(workspace_id, channel, external_id)
  );
`;

/**
 * One row per message across all channels.
 * sender_type: 'client' | 'agent' | 'bot' | 'system'
 * attachments: JSON array of attachment objects
 * metadata: JSON object for channel-specific data
 */
export const SQL_MESSAGES = `
  CREATE TABLE IF NOT EXISTS messages (
    id              TEXT    PRIMARY KEY,
    workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    conversation_id TEXT    NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_type     TEXT    NOT NULL,
    sender_id       TEXT,
    content         TEXT    NOT NULL DEFAULT '',
    attachments     TEXT,
    metadata        TEXT,
    created_at      TEXT    NOT NULL
  );
`;

export const SQL_INBOX_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_conversations_ws_last
    ON conversations(workspace_id, last_message_at DESC);

  CREATE INDEX IF NOT EXISTS idx_conversations_ws_channel
    ON conversations(workspace_id, channel);

  CREATE INDEX IF NOT EXISTS idx_conversations_ws_status
    ON conversations(workspace_id, status);

  CREATE INDEX IF NOT EXISTS idx_conversations_external
    ON conversations(workspace_id, channel, external_id);

  CREATE INDEX IF NOT EXISTS idx_messages_conv
    ON messages(conversation_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_messages_ws
    ON messages(workspace_id, created_at DESC);
`;

// ── Block 3: Email accounts ───────────────────────────────────────────────────

/**
 * One row per connected email account per workspace.
 * OAuth tokens are stored AES-256-GCM encrypted (never plaintext).
 * UNIQUE(workspace_id, provider) — one Gmail account per workspace (MVP).
 */
export const SQL_EMAIL_ACCOUNTS = `
  CREATE TABLE IF NOT EXISTS email_accounts (
    id               TEXT PRIMARY KEY,
    workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id          TEXT NOT NULL,
    provider         TEXT NOT NULL DEFAULT 'gmail',
    email            TEXT NOT NULL,
    display_name     TEXT,
    access_token     TEXT NOT NULL,
    refresh_token    TEXT,
    token_expires_at TEXT,
    scope            TEXT,
    connected_at     TEXT NOT NULL,
    last_sync_at     TEXT,
    UNIQUE(workspace_id, provider)
  );
`;

export const SQL_EMAIL_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_email_accounts_ws
    ON email_accounts(workspace_id, provider);
`;

// ── M11: CRM Clients tables ──────────────────────────────────────────────────

export const SQL_CLIENTS = `
  CREATE TABLE IF NOT EXISTS clients (
    id               TEXT    PRIMARY KEY,
    workspace_id     TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name             TEXT    NOT NULL,
    company          TEXT,
    email            TEXT,
    phone            TEXT,
    position         TEXT,
    source           TEXT,
    status           TEXT    NOT NULL DEFAULT 'active',
    assigned_user_id TEXT    REFERENCES users(id) ON DELETE SET NULL,
    notes            TEXT,
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL
  );
`;

export const SQL_CLIENT_CONTACTS = `
  CREATE TABLE IF NOT EXISTS client_contacts (
    id           TEXT    PRIMARY KEY,
    client_id    TEXT    NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    workspace_id TEXT    NOT NULL,
    type         TEXT    NOT NULL,
    value        TEXT    NOT NULL,
    is_primary   INTEGER NOT NULL DEFAULT 0,
    UNIQUE(client_id, type, value)
  );
`;

export const SQL_CLIENT_TAGS = `
  CREATE TABLE IF NOT EXISTS client_tags (
    id           TEXT PRIMARY KEY,
    client_id    TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    tag          TEXT NOT NULL,
    UNIQUE(client_id, tag)
  );
`;

export const SQL_CLIENTS_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_clients_workspace
    ON clients(workspace_id, status);

  CREATE INDEX IF NOT EXISTS idx_clients_email
    ON clients(workspace_id, email);

  CREATE INDEX IF NOT EXISTS idx_clients_assigned
    ON clients(workspace_id, assigned_user_id);

  CREATE INDEX IF NOT EXISTS idx_client_contacts_client
    ON client_contacts(client_id);

  CREATE INDEX IF NOT EXISTS idx_client_contacts_workspace
    ON client_contacts(workspace_id, type, value);

  CREATE INDEX IF NOT EXISTS idx_client_tags_client
    ON client_tags(client_id);

  CREATE INDEX IF NOT EXISTS idx_client_tags_workspace
    ON client_tags(workspace_id, tag);
`;

// ── M12: Tasks & Timeline ────────────────────────────────────────────────────

export const SQL_TASKS = `
  CREATE TABLE IF NOT EXISTS tasks (
    id               TEXT    PRIMARY KEY,
    workspace_id     TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title            TEXT    NOT NULL,
    description      TEXT,
    status           TEXT    NOT NULL DEFAULT 'todo',
    priority         TEXT    NOT NULL DEFAULT 'medium',
    due_date         TEXT,
    assigned_user_id TEXT    REFERENCES users(id) ON DELETE SET NULL,
    created_by       TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id        TEXT    REFERENCES clients(id) ON DELETE SET NULL,
    conversation_id  TEXT    REFERENCES conversations(id) ON DELETE SET NULL,
    deal_id          TEXT,
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL,
    completed_at     TEXT
  );
`;

export const SQL_TASK_CHECKLIST = `
  CREATE TABLE IF NOT EXISTS task_checklist (
    id          TEXT    PRIMARY KEY,
    task_id     TEXT    NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    completed   INTEGER NOT NULL DEFAULT 0,
    order_index INTEGER NOT NULL DEFAULT 0
  );
`;

export const SQL_TASK_COMMENTS = `
  CREATE TABLE IF NOT EXISTS task_comments (
    id         TEXT NOT NULL PRIMARY KEY,
    task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`;

export const SQL_TASK_REMINDERS = `
  CREATE TABLE IF NOT EXISTS task_reminders (
    id        TEXT    PRIMARY KEY,
    task_id   TEXT    NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    remind_at TEXT    NOT NULL,
    sent      INTEGER NOT NULL DEFAULT 0
  );
`;

export const SQL_TASKS_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_tasks_workspace
    ON tasks(workspace_id, status);

  CREATE INDEX IF NOT EXISTS idx_tasks_assigned
    ON tasks(workspace_id, assigned_user_id);

  CREATE INDEX IF NOT EXISTS idx_tasks_client
    ON tasks(workspace_id, client_id);

  CREATE INDEX IF NOT EXISTS idx_tasks_conversation
    ON tasks(conversation_id);

  CREATE INDEX IF NOT EXISTS idx_tasks_due
    ON tasks(workspace_id, due_date);

  CREATE INDEX IF NOT EXISTS idx_task_checklist_task
    ON task_checklist(task_id);

  CREATE INDEX IF NOT EXISTS idx_task_comments_task
    ON task_comments(task_id, created_at);

  CREATE INDEX IF NOT EXISTS idx_task_reminders_task
    ON task_reminders(task_id);

  CREATE INDEX IF NOT EXISTS idx_task_reminders_pending
    ON task_reminders(remind_at, sent);
`;

// ── M13: Deals & Sales Pipeline ──────────────────────────────────────────────

/** deal_stages must be created before deals (FK dependency). */
export const SQL_DEAL_STAGES = `
  CREATE TABLE IF NOT EXISTS deal_stages (
    id           TEXT    PRIMARY KEY,
    workspace_id TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,
    order_index  INTEGER NOT NULL DEFAULT 0,
    color        TEXT    NOT NULL DEFAULT '#6b7280',
    is_default   INTEGER NOT NULL DEFAULT 0,
    is_won       INTEGER NOT NULL DEFAULT 0,
    is_lost      INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL,
    UNIQUE(workspace_id, name)
  );
`;

export const SQL_DEALS = `
  CREATE TABLE IF NOT EXISTS deals (
    id               TEXT    PRIMARY KEY,
    workspace_id     TEXT    NOT NULL REFERENCES workspaces(id)    ON DELETE CASCADE,
    title            TEXT    NOT NULL,
    client_id        TEXT    REFERENCES clients(id)                ON DELETE SET NULL,
    stage_id         TEXT    NOT NULL REFERENCES deal_stages(id),
    value            REAL    NOT NULL DEFAULT 0,
    currency         TEXT    NOT NULL DEFAULT 'USD',
    probability      INTEGER NOT NULL DEFAULT 0,
    expected_close   TEXT,
    assigned_user_id TEXT    REFERENCES users(id)                  ON DELETE SET NULL,
    conversation_id  TEXT    REFERENCES conversations(id)          ON DELETE SET NULL,
    description      TEXT,
    created_by       TEXT    NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
    status           TEXT    NOT NULL DEFAULT 'open',
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL,
    closed_at        TEXT
  );
`;

export const SQL_DEALS_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_deals_workspace
    ON deals(workspace_id, status);

  CREATE INDEX IF NOT EXISTS idx_deals_stage
    ON deals(workspace_id, stage_id);

  CREATE INDEX IF NOT EXISTS idx_deals_client
    ON deals(workspace_id, client_id);

  CREATE INDEX IF NOT EXISTS idx_deals_assigned
    ON deals(workspace_id, assigned_user_id);

  CREATE INDEX IF NOT EXISTS idx_deals_close
    ON deals(workspace_id, expected_close);

  CREATE INDEX IF NOT EXISTS idx_deal_stages_workspace
    ON deal_stages(workspace_id, order_index);
`;

// ── M14: AI Analysis & Suggestions ───────────────────────────────────────────

/**
 * Stores AI analysis results for any entity (conversation, client, deal).
 * result_json is a JSON string containing the analysis output.
 * analysis_type: 'conversation' | 'client_summary' | 'deal_health' | 'dashboard_insights'
 */
export const SQL_AI_ANALYSIS = `
  CREATE TABLE IF NOT EXISTS ai_analysis (
    id            TEXT PRIMARY KEY,
    workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    entity_type   TEXT NOT NULL,
    entity_id     TEXT NOT NULL,
    analysis_type TEXT NOT NULL,
    result_json   TEXT NOT NULL,
    model         TEXT,
    provider      TEXT,
    created_at    TEXT NOT NULL
  );
`;

/**
 * Stores AI-generated reply suggestions for conversations.
 * type: 'professional' | 'friendly' | 'short'
 * accepted: 0 = pending/rejected, 1 = accepted by user
 */
export const SQL_AI_SUGGESTIONS = `
  CREATE TABLE IF NOT EXISTS ai_suggestions (
    id              TEXT    PRIMARY KEY,
    workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    conversation_id TEXT    NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    type            TEXT    NOT NULL,
    content         TEXT    NOT NULL,
    accepted        INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL
  );
`;

export const SQL_AI_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_ai_analysis_entity
    ON ai_analysis(workspace_id, entity_type, entity_id);

  CREATE INDEX IF NOT EXISTS idx_ai_analysis_type
    ON ai_analysis(workspace_id, analysis_type, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_ai_suggestions_conv
    ON ai_suggestions(workspace_id, conversation_id, created_at DESC);
`;

// ── Future-expansion stubs (Block 4+) ─────────────────────────────────────────
// Created now so migrations never need to worry about column/table order.
// No CRUD helpers are wired until needed.

export const SQL_ORGANIZATIONS = `
  CREATE TABLE IF NOT EXISTS organizations (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL,
    plan       TEXT NOT NULL DEFAULT 'enterprise',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(slug)
  );
`;

export const SQL_WORKSPACES_ORG_COLUMN = `
  ALTER TABLE workspaces ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;
`;

export const SQL_BILLING_PLANS = `
  CREATE TABLE IF NOT EXISTS billing_plans (
    id                  TEXT PRIMARY KEY,
    workspace_id        TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    plan                TEXT NOT NULL DEFAULT 'free',
    stripe_customer_id  TEXT,
    stripe_sub_id       TEXT,
    current_period_end  TEXT,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    UNIQUE(workspace_id)
  );
`;

export const SQL_API_KEYS = `
  CREATE TABLE IF NOT EXISTS api_keys (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
    name         TEXT NOT NULL,
    key_prefix   TEXT NOT NULL,
    key_hash     TEXT NOT NULL,
    scopes       TEXT NOT NULL DEFAULT '[]',
    last_used_at TEXT,
    expires_at   TEXT,
    created_at   TEXT NOT NULL,
    revoked_at   TEXT,
    UNIQUE(key_hash)
  );
`;

export const SQL_AUDIT_LOGS = `
  CREATE TABLE IF NOT EXISTS audit_logs (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
    action       TEXT NOT NULL,
    resource     TEXT NOT NULL,
    resource_id  TEXT,
    diff         TEXT,
    ip_address   TEXT,
    user_agent   TEXT,
    created_at   TEXT NOT NULL
  );
`;

export const SQL_AUDIT_LOG_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_audit_logs_ws
    ON audit_logs(workspace_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_audit_logs_user
    ON audit_logs(user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_api_keys_ws
    ON api_keys(workspace_id);

  CREATE INDEX IF NOT EXISTS idx_api_keys_hash
    ON api_keys(key_hash);
`;

// ── M15 — Product Readiness & Beta Preparation ────────────────────────────────

export const SQL_ONBOARDING_PROGRESS = `
  CREATE TABLE IF NOT EXISTS onboarding_progress (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    step         TEXT NOT NULL,
    completed    INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    UNIQUE(workspace_id, step)
  );
`;

export const SQL_FEEDBACK = `
  CREATE TABLE IF NOT EXISTS feedback (
    id           TEXT    PRIMARY KEY,
    workspace_id TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      TEXT    REFERENCES users(id) ON DELETE SET NULL,
    type         TEXT    NOT NULL,
    message      TEXT    NOT NULL,
    created_at   TEXT    NOT NULL
  );
`;

export const SQL_EVENTS = `
  CREATE TABLE IF NOT EXISTS events (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
    event        TEXT NOT NULL,
    properties   TEXT,
    created_at   TEXT NOT NULL
  );
`;

export const SQL_SYSTEM_ERRORS = `
  CREATE TABLE IF NOT EXISTS system_errors (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
    error        TEXT NOT NULL,
    page         TEXT,
    stack        TEXT,
    created_at   TEXT NOT NULL
  );
`;

export const SQL_AI_USAGE = `
  CREATE TABLE IF NOT EXISTS ai_usage (
    id             TEXT    PRIMARY KEY,
    workspace_id   TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id        TEXT    REFERENCES users(id) ON DELETE SET NULL,
    feature        TEXT    NOT NULL,
    provider       TEXT    NOT NULL,
    model          TEXT    NOT NULL,
    input_tokens   INTEGER NOT NULL DEFAULT 0,
    output_tokens  INTEGER NOT NULL DEFAULT 0,
    cost_usd       REAL    NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL
  );
`;

export const SQL_M15_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_onboarding_workspace
    ON onboarding_progress(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_feedback_workspace
    ON feedback(workspace_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_events_workspace
    ON events(workspace_id, event, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_system_errors_workspace
    ON system_errors(workspace_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ai_usage_workspace
    ON ai_usage(workspace_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ai_usage_feature
    ON ai_usage(workspace_id, feature, created_at DESC);
`;
