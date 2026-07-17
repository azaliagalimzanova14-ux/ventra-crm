/**
 * src/lib/db/types.ts
 *
 * TypeScript entity types for Block 1 database tables.
 * Column names are camelCase; the raw SQLite rows use snake_case.
 * Row mappers live in each query file.
 *
 * Future-proof stubs at the bottom (organizations, api_keys, audit_log)
 * mirror tables created in migration 004 but not yet wired to API routes.
 */

// ── Workspace ─────────────────────────────────────────────────────────────────

export type WorkspacePlan = "free" | "pro" | "enterprise";

export interface WorkspaceSettings {
  accentColor?: string;
  iconStyle?: string;
  widgetLayout?: string[];
  /** Deprecated: kept for backwards-compat with localStorage migration */
  locale?: string;
}

export interface DbWorkspace {
  id: string;
  name: string;
  slug: string;
  plan: WorkspacePlan;
  ownerId: string | null;
  logoUrl: string | null;
  settings: WorkspaceSettings;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export type CreateWorkspaceInput = Omit<DbWorkspace, "id" | "createdAt" | "updatedAt">;
export type UpdateWorkspaceInput = Partial<
  Omit<DbWorkspace, "id" | "ownerId" | "createdAt">
>;

// ── User ──────────────────────────────────────────────────────────────────────

export interface DbUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  avatarUrl: string | null;
  phone: string | null;
  bio: string | null;
  timezone: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateUserInput = Omit<DbUser, "id" | "createdAt" | "updatedAt">;
export type UpdateUserInput = Partial<
  Omit<DbUser, "id" | "email" | "createdAt">
>;

// ── Session ───────────────────────────────────────────────────────────────────

export interface DbSession {
  id: string;
  userId: string;
  workspaceId: string | null;
  token: string;
  expiresAt: string;
  createdAt: string;
  userAgent: string | null;
  ipAddress: string | null;
}

export type CreateSessionInput = Omit<DbSession, "id" | "createdAt">;

// ── Workspace Member ──────────────────────────────────────────────────────────

export type MemberRole   = "owner" | "admin" | "team_lead" | "sales_manager";
export type MemberStatus = "active" | "invited" | "inactive";

export interface DbWorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string | null;   // NULL while invite is pending (no account yet)
  email: string;
  role: MemberRole;
  status: MemberStatus;
  invitedBy: string | null;
  invitedAt: string;
  joinedAt: string | null;
  lastActiveAt: string | null;
}

export type CreateMemberInput = Omit<DbWorkspaceMember, "id">;
export type UpdateMemberInput = Partial<
  Pick<DbWorkspaceMember, "role" | "status" | "userId" | "joinedAt" | "lastActiveAt">
>;

// ── Invitation ────────────────────────────────────────────────────────────────

export interface DbInvitation {
  id: string;
  workspaceId: string;
  email: string;
  role: MemberRole;
  token: string;        // 64-char hex — forms the invite link
  invitedBy: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export type CreateInvitationInput = Omit<
  DbInvitation,
  "id" | "acceptedAt" | "revokedAt" | "createdAt"
>;

// ── Activity Log ──────────────────────────────────────────────────────────────

export type ActivityType =
  | "client_added"       | "client_updated"   | "client_deleted"
  | "deal_created"       | "deal_won"         | "deal_lost"       | "deal_moved"
  | "task_created"       | "task_done"        | "task_deleted"
  | "project_created"    | "project_updated"  | "project_deleted"
  | "member_invited"     | "member_joined"    | "role_changed"    | "member_removed" | "invite_resent"
  | "workspace_updated"
  | "system";

export type ActivityEntityType =
  | "client" | "deal" | "task" | "project" | "member" | "workspace" | "system";

export interface DbActivityLog {
  id: string;
  workspaceId: string;
  userId: string | null;
  type: ActivityType;
  entityType: ActivityEntityType | null;
  entityId: string | null;
  entityName: string | null;
  detail: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export type CreateActivityInput = Omit<DbActivityLog, "id" | "createdAt">;

export interface GetActivityOptions {
  limit?: number;
  cursor?: string;     // createdAt of last seen item (for cursor pagination)
  type?: ActivityType;
  userId?: string;
  entityType?: ActivityEntityType;
}

// ── Notification ──────────────────────────────────────────────────────────────

export type NotifKind     = "danger" | "warning" | "opportunity" | "action" | "ok";
export type NotifCategory = "task" | "deal" | "client" | "lead" | "ai" | "team" | "system";
export type NotifPriority = "urgent" | "high" | "medium" | "low";

export interface DbNotification {
  id: string;
  workspaceId: string;
  userId: string;
  kind: NotifKind;
  category: NotifCategory;
  priority: NotifPriority;
  title: string;
  body: string;
  href: string;
  entityId: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export type CreateNotificationInput  = Omit<DbNotification, "read" | "readAt" | "createdAt">;
export type UpsertNotificationInput  = Omit<DbNotification, "read" | "readAt" | "createdAt">;

export interface GetNotificationOptions {
  unreadOnly?: boolean;
  limit?: number;
  category?: NotifCategory;
}

// ── Notification Preferences ──────────────────────────────────────────────────

export interface DbNotificationPreference {
  userId: string;
  workspaceId: string;
  category: NotifCategory;
  inApp: boolean;
  email: boolean;
}

export type UpsertPrefInput = DbNotificationPreference;

// ── Future-proof stubs ────────────────────────────────────────────────────────
// Tables exist in migration 004 — not yet wired to API routes.
// Adding these types now prevents import cycles when Block 4+ code arrives.

export interface DbOrganization {
  id: string;
  name: string;
  plan: WorkspacePlan;
  createdAt: string;
  updatedAt: string;
}

export interface DbApiKey {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  keyPrefix: string;           // first 8 chars shown in UI, e.g. "vnt_xxxx"
  keyHash: string;             // bcrypt hash of the full key
  scopes: string[];            // JSON array of permission scopes
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface DbAuditLog {
  id: string;
  workspaceId: string;
  userId: string | null;
  action: string;              // e.g. "user.login", "member.role_changed"
  resourceType: string | null;
  resourceId: string | null;
  changes: Record<string, unknown> | null;  // { before, after }
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}
