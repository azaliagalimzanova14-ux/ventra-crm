/**
 * src/lib/server/models.ts
 *
 * TypeScript types for every Block 1 database entity.
 * These mirror the SQLite columns exactly (snake_case, ISO strings for dates).
 *
 * Naming convention:
 *   - DB row types use snake_case to match column names (easy spread from query results)
 *   - Nullable columns are `string | null` (not `undefined`) to match SQLite semantics
 */

// ── Roles & statuses ──────────────────────────────────────────────────────────

export type WorkspacePlan   = "free" | "pro" | "enterprise";
export type MemberRole      = "owner" | "admin" | "team_lead" | "sales_manager" | "support";
export type MemberStatus    = "active" | "invited" | "inactive";
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export type ClientStatus =
  | "lead"
  | "active"
  | "inactive"
  | "churned";

export type ClientSource =
  | "manual"
  | "import"
  | "telegram"
  | "email"
  | "whatsapp"
  | "referral"
  | "other";

export type ActivityEntityType =
  | "client"
  | "deal"
  | "task"
  | "project"
  | "member"
  | "workspace"
  | "invitation";

export type TaskStatus   = "todo" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type DealStatus = "open" | "won" | "lost";

export type ActivityType =
  | "client_added"
  | "client_updated"
  | "client_deleted"
  | "client_assigned"
  | "deal_created"
  | "deal_updated"
  | "deal_deleted"
  | "deal_assigned"
  | "deal_stage_changed"
  | "deal_won"
  | "deal_lost"
  | "deal_closed"
  | "task_created"
  | "task_updated"
  | "task_completed"
  | "task_assigned"
  | "task_deleted"
  | "project_created"
  | "project_updated"
  | "project_completed"
  | "member_invited"
  | "member_joined"
  | "member_removed"
  | "role_changed"
  | "invite_resent"
  | "invitation_cancelled"
  | "workspace_created"
  | "workspace_updated"
  | "workspace_settings_changed";

// ── Block 2: Unified Inbox types ──────────────────────────────────────────────

/** Channels supported by the unified inbox */
export type ConversationChannel = "telegram" | "email" | "whatsapp";

/** Lifecycle status of a conversation */
export type ConversationStatus  = "open" | "closed" | "snoozed";

/** Who sent a message in the unified model */
export type SenderType = "client" | "agent" | "bot" | "system";

/** Row in the `conversations` table */
export interface DbConversation {
  id:                string;
  workspace_id:      string;
  client_id:         string | null;
  channel:           ConversationChannel;
  external_id:       string | null;   // Telegram chat_id, Gmail thread_id, etc.
  title:             string;
  assigned_user_id:  string | null;
  status:            ConversationStatus;
  last_message_at:   string | null;
  last_message_text: string | null;
  metadata:          string | null;   // JSON — channel-specific data (e.g. {personal:true})
  created_at:        string;
  updated_at:        string;
}

/** Row in the `messages` table */
export interface DbMessage {
  id:              string;
  workspace_id:    string;
  conversation_id: string;
  sender_type:     SenderType;
  sender_id:       string | null;   // user_id if sender_type === 'agent'
  content:         string;
  attachments:     string | null;   // JSON array
  metadata:        string | null;   // JSON object (channel-specific extras)
  created_at:      string;
}

export type NotificationKind     = "danger" | "warning" | "opportunity" | "action" | "ok";
export type NotificationCategory = "task" | "deal" | "client" | "lead" | "ai" | "team" | "system";
export type NotificationPriority = "urgent" | "high" | "medium" | "low";

// ── Core entity rows ──────────────────────────────────────────────────────────

/** Row in the `users` table */
export interface DbUser {
  id:            string;
  name:          string;
  email:         string;
  password_hash: string;
  avatar_url:    string | null;
  phone:         string | null;
  bio:           string | null;
  timezone:      string;
  locale:        string;
  created_at:    string;
  updated_at:    string;
}

/** Row in the `sessions` table */
export interface DbSession {
  id:           string;
  user_id:      string;
  workspace_id: string | null;
  token:        string;
  expires_at:   string;
  created_at:   string;
  user_agent:   string | null;
  ip_address:   string | null;
}

/** Row in the `workspaces` table */
export interface DbWorkspace {
  id:         string;
  name:       string;
  slug:       string;
  plan:       WorkspacePlan;
  owner_id:   string;
  logo_url:   string | null;
  settings:   string | null;  // JSON-encoded WorkspaceSettings
  created_at: string;
  updated_at: string;
}

/** Parsed workspace settings (stored as JSON in workspaces.settings) */
export interface WorkspaceSettings {
  accentColor?:  string;
  iconStyle?:    "thin" | "bold";
  widgetLayout?: string[];
  locale?:       string;
  timezone?:     string;
  currency?:     string;
}

/** Row in the `workspace_members` table */
export interface DbWorkspaceMember {
  id:             string;
  workspace_id:   string;
  user_id:        string | null;  // NULL while invite is pending
  email:          string;
  display_name:   string | null;  // Pre-join name (used before user links their account)
  role:           MemberRole;
  status:         MemberStatus;
  invited_by:     string | null;
  invited_at:     string;
  joined_at:      string | null;
  last_active_at: string | null;
}

/** Row in the `invitations` table */
export interface DbInvitation {
  id:           string;
  workspace_id: string;
  email:        string;
  role:         MemberRole;
  token:        string;
  invited_by:   string;
  expires_at:   string;
  accepted_at:  string | null;
  revoked_at:   string | null;
  created_at:   string;
}

/** Row in the `activity_log` table */
export interface DbActivityEntry {
  id:           string;
  workspace_id: string;
  user_id:      string | null;
  type:         ActivityType;
  entity_type:  ActivityEntityType | null;
  entity_id:    string | null;
  entity_name:  string | null;
  detail:       string | null;
  metadata:     string | null;  // JSON-encoded extra data
  created_at:   string;
}

/** Row in the `notifications` table */
export interface DbNotification {
  id:           string;
  workspace_id: string;
  user_id:      string;
  kind:         NotificationKind;
  category:     NotificationCategory;
  priority:     NotificationPriority;
  title:        string;
  body:         string;
  href:         string;
  entity_id:    string | null;
  read:         number;  // SQLite INTEGER: 0 | 1
  read_at:      string | null;
  created_at:   string;
}

/** Row in the `notification_preferences` table */
export interface DbNotificationPreference {
  user_id:      string;
  workspace_id: string;
  category:     NotificationCategory;
  in_app:       number;  // SQLite INTEGER: 0 | 1
  email:        number;  // SQLite INTEGER: 0 | 1
}

// ── Block 3: Email accounts ───────────────────────────────────────────────────

export type EmailProviderName = "gmail" | "outlook";

/** Row in the `email_accounts` table. Tokens stored encrypted. */
export interface DbEmailAccount {
  id:               string;
  workspace_id:     string;
  user_id:          string;
  provider:         EmailProviderName;
  email:            string;
  display_name:     string | null;
  access_token:     string;   // AES-256-GCM encrypted
  refresh_token:    string | null;  // AES-256-GCM encrypted
  token_expires_at: string | null;  // ISO 8601
  scope:            string | null;
  connected_at:     string;
  last_sync_at:     string | null;
}

// ── Future-expansion stubs (tables exist in schema, helpers will come in later blocks) ──

/** Row in the `organizations` table (Block 4+) */
export interface DbOrganization {
  id:         string;
  name:       string;
  slug:       string;
  plan:       WorkspacePlan;
  created_at: string;
  updated_at: string;
}

/** Row in the `api_keys` table (Block 4+) */
export interface DbApiKey {
  id:           string;
  workspace_id: string;
  user_id:      string;
  name:         string;
  key_prefix:   string;   // first 8 chars shown in UI
  key_hash:     string;   // SHA-256 of the full key
  scopes:       string;   // JSON string[]
  last_used_at: string | null;
  expires_at:   string | null;
  created_at:   string;
  revoked_at:   string | null;
}

/** Row in the `audit_logs` table (Block 4+) */
export interface DbAuditLog {
  id:           string;
  workspace_id: string;
  user_id:      string | null;
  action:       string;
  resource:     string;
  resource_id:  string | null;
  diff:         string | null;  // JSON patch
  ip_address:   string | null;
  user_agent:   string | null;
  created_at:   string;
}

// ── M11: CRM Clients ──────────────────────────────────────────────────────────

/** Row in the `clients` table */
export interface DbClient {
  id:               string;
  workspace_id:     string;
  name:             string;
  company:          string | null;
  email:            string | null;
  phone:            string | null;
  position:         string | null;
  source:           ClientSource | null;
  status:           ClientStatus;
  assigned_user_id: string | null;
  notes:            string | null;
  created_at:       string;
  updated_at:       string;
}

/** Row in the `client_contacts` table */
export interface DbClientContact {
  id:           string;
  client_id:    string;
  workspace_id: string;
  type:         string;   // 'email' | 'phone' | 'telegram' | 'whatsapp' | 'linkedin' | 'twitter' | 'other'
  value:        string;
  is_primary:   number;   // SQLite INTEGER: 0 | 1
}

/** Row in the `client_tags` table */
export interface DbClientTag {
  id:           string;
  client_id:    string;
  workspace_id: string;
  tag:          string;
}

/** Client with joined contacts and tags */
export interface DbClientFull extends DbClient {
  contacts: DbClientContact[];
  tags:     string[];
}

// ── M12: Tasks & Timeline ─────────────────────────────────────────────────────

/** Row in the `tasks` table */
export interface DbTask {
  id:               string;
  workspace_id:     string;
  title:            string;
  description:      string | null;
  status:           TaskStatus;
  priority:         TaskPriority;
  due_date:         string | null;   // ISO 8601 date string (YYYY-MM-DD)
  assigned_user_id: string | null;
  created_by:       string;
  client_id:        string | null;
  conversation_id:  string | null;
  deal_id:          string | null;
  created_at:       string;
  updated_at:       string;
  completed_at:     string | null;
}

/** Row in the `task_checklist` table */
export interface DbTaskChecklist {
  id:          string;
  task_id:     string;
  title:       string;
  completed:   number;   // SQLite INTEGER: 0 | 1
  order_index: number;
}

/** Row in the `task_comments` table */
export interface DbTaskComment {
  id:         string;
  task_id:    string;
  user_id:    string;
  content:    string;
  created_at: string;
}

/** Row in the `task_reminders` table */
export interface DbTaskReminder {
  id:        string;
  task_id:   string;
  remind_at: string;
  sent:      number;   // SQLite INTEGER: 0 | 1
}

/** Task with checklist, comments, and reminders joined */
export interface DbTaskFull extends DbTask {
  checklist: DbTaskChecklist[];
  comments:  DbTaskComment[];
  reminders: DbTaskReminder[];
}

// ── M13: Deals & Sales Pipeline ───────────────────────────────────────────────

/** Row in the `deal_stages` table */
export interface DbDealStage {
  id:           string;
  workspace_id: string;
  name:         string;
  order_index:  number;
  color:        string;
  is_default:   number;   // SQLite INTEGER: 0 | 1
  is_won:       number;   // SQLite INTEGER: 0 | 1
  is_lost:      number;   // SQLite INTEGER: 0 | 1
  created_at:   string;
}

/** Row in the `deals` table */
export interface DbDeal {
  id:               string;
  workspace_id:     string;
  title:            string;
  client_id:        string | null;
  stage_id:         string;
  value:            number;
  currency:         string;
  probability:      number;
  expected_close:   string | null;   // ISO 8601 date (YYYY-MM-DD)
  assigned_user_id: string | null;
  conversation_id:  string | null;
  description:      string | null;
  created_by:       string;
  status:           DealStatus;
  created_at:       string;
  updated_at:       string;
  closed_at:        string | null;
}

/** Deal with joined stage and optional client name */
export interface DbDealFull extends DbDeal {
  stage:       DbDealStage;
  client_name: string | null;
}

// ── M14: AI Analysis & Suggestions ───────────────────────────────────────────

export type AiAnalysisType =
  | "conversation"
  | "client_summary"
  | "deal_health"
  | "dashboard_insights";

export type AiSuggestionType = "professional" | "friendly" | "short";

/** Row in the `ai_analysis` table */
export interface DbAiAnalysis {
  id:            string;
  workspace_id:  string;
  entity_type:   string;
  entity_id:     string;
  analysis_type: AiAnalysisType;
  result_json:   string;   // JSON-encoded analysis result
  model:         string | null;
  provider:      string | null;
  created_at:    string;
}

/** Row in the `ai_suggestions` table */
export interface DbAiSuggestion {
  id:              string;
  workspace_id:    string;
  conversation_id: string;
  type:            AiSuggestionType;
  content:         string;
  accepted:        number;   // SQLite INTEGER: 0 | 1
  created_at:      string;
}

// ── M15: Product Readiness & Beta Preparation ─────────────────────────────────

export type OnboardingStep =
  | "create_workspace"
  | "connect_channel"
  | "invite_team"
  | "import_clients"
  | "create_deal"
  | "create_task";

export type FeedbackTypeDb = "bug" | "feature" | "general";

export type AnalyticsEvent =
  | "conversation_opened"
  | "message_sent"
  | "client_created"
  | "deal_created"
  | "task_completed"
  | "ai_used"
  | "feedback_submitted"
  | "demo_loaded"
  | "onboarding_step_completed";

export interface DbOnboardingProgress {
  id:           string;
  workspace_id: string;
  step:         OnboardingStep;
  completed:    number;    // SQLite INTEGER 0|1
  completed_at: string | null;
}

export interface DbFeedback {
  id:           string;
  workspace_id: string;
  user_id:      string | null;
  type:         FeedbackTypeDb;
  message:      string;    // JSON-encoded rich content
  created_at:   string;
}

export interface DbEvent {
  id:           string;
  workspace_id: string;
  user_id:      string | null;
  event:        AnalyticsEvent;
  properties:   string | null;  // JSON
  created_at:   string;
}

export interface DbSystemError {
  id:           string;
  workspace_id: string | null;
  user_id:      string | null;
  error:        string;
  page:         string | null;
  stack:        string | null;
  created_at:   string;
}

export interface DbAiUsage {
  id:            string;
  workspace_id:  string;
  user_id:       string | null;
  feature:       string;
  provider:      string;
  model:         string;
  input_tokens:  number;
  output_tokens: number;
  cost_usd:      number;
  created_at:    string;
}

/** Extended WorkspaceSettings with M15 branding fields */
export interface WorkspaceSettingsV2 {
  accentColor?:   string;
  iconStyle?:     "thin" | "bold";
  widgetLayout?:  string[];
  locale?:        string;
  timezone?:      string;
  currency?:      string;
  // M15 branding
  description?:   string;
  website?:       string;
  industry?:      string;
}

// ── Joined / computed shapes (not DB rows) ────────────────────────────────────

/** workspace_members row joined with users data */
export interface MemberWithUser extends DbWorkspaceMember {
  user_name:       string | null;
  user_avatar_url: string | null;
}

/** Notification with boolean `read` (converted from SQLite 0|1) */
export interface Notification extends Omit<DbNotification, "read"> {
  read: boolean;
}

/** Invitation with computed status field */
export interface InvitationWithStatus extends DbInvitation {
  status: InvitationStatus;
}
