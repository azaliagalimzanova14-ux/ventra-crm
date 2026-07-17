/**
 * src/lib/permissions.ts
 *
 * Permission matrix for Ventra workspace roles.
 *
 * Roles (ascending privilege):
 *   sales_manager → team_lead → admin → owner
 *
 * This module is intentionally client-safe (no Node/SQLite imports).
 * Import it in both server routes and client components.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type MemberRole = "owner" | "admin" | "team_lead" | "sales_manager" | "support";

export type Permission =
  | "workspace.manage"     // rename workspace, change settings, delete workspace
  | "workspace.billing"    // manage billing/plan (future)
  | "members.invite"       // send invitations
  | "members.remove"       // remove workspace members
  | "members.manage_roles" // change member roles
  | "members.view"         // see member list
  | "clients.create"
  | "clients.edit"
  | "clients.delete"
  | "clients.view"
  | "clients.assign"
  | "tasks.view"
  | "tasks.create"
  | "tasks.edit"
  | "tasks.delete"
  | "tasks.assign"
  | "tasks.complete"
  | "deals.view"
  | "deals.create"
  | "deals.edit"
  | "deals.delete"
  | "deals.assign"
  | "deals.close"
  | "pipeline.manage"      // create/edit/delete deals and pipeline stages (legacy alias)
  | "analytics.view"
  | "activity.view"        // view workspace activity log / audit trail
  | "settings.manage"      // appearance, modules, integrations
  | "integrations.manage"  // connect / disconnect channel integrations (Telegram, email, etc.)
  | "ai.view"              // see AI analysis results and suggestions
  | "ai.use"               // trigger AI analysis and generate suggestions
  | "ai.manage";           // configure AI settings (API keys, model selection)

// ── Permission matrix ─────────────────────────────────────────────────────────

/** All defined permissions, in a stable order. */
export const ALL_PERMISSIONS: Permission[] = [
  "workspace.manage",
  "workspace.billing",
  "members.invite",
  "members.remove",
  "members.manage_roles",
  "members.view",
  "clients.create",
  "clients.edit",
  "clients.delete",
  "clients.view",
  "clients.assign",
  "tasks.view",
  "tasks.create",
  "tasks.edit",
  "tasks.delete",
  "tasks.assign",
  "tasks.complete",
  "deals.view",
  "deals.create",
  "deals.edit",
  "deals.delete",
  "deals.assign",
  "deals.close",
  "pipeline.manage",
  "analytics.view",
  "activity.view",
  "settings.manage",
  "integrations.manage",
  "ai.view",
  "ai.use",
  "ai.manage",
];

/**
 * Permissions granted to each role.
 * Higher-privilege roles implicitly include everything below them.
 */
const ROLE_PERMISSION_SETS: Record<MemberRole, Set<Permission>> = {
  owner: new Set<Permission>(ALL_PERMISSIONS),

  admin: new Set<Permission>([
    // All except workspace billing (billing managed by owner only)
    "workspace.manage",
    "members.invite",
    "members.remove",
    "members.manage_roles",
    "members.view",
    "clients.create",
    "clients.edit",
    "clients.delete",
    "clients.view",
    "clients.assign",
    "tasks.view",
    "tasks.create",
    "tasks.edit",
    "tasks.delete",
    "tasks.assign",
    "tasks.complete",
    "deals.view",
    "deals.create",
    "deals.edit",
    "deals.delete",
    "deals.assign",
    "deals.close",
    "pipeline.manage",
    "analytics.view",
    "activity.view",
    "settings.manage",
    "integrations.manage",
    "ai.view",
    "ai.use",
    "ai.manage",
  ]),

  team_lead: new Set<Permission>([
    "members.invite",
    "members.view",
    "clients.create",
    "clients.edit",
    "clients.delete",
    "clients.view",
    "clients.assign",
    "tasks.view",
    "tasks.create",
    "tasks.edit",
    "tasks.delete",
    "tasks.assign",
    "tasks.complete",
    "deals.view",
    "deals.create",
    "deals.edit",
    "deals.delete",
    "deals.assign",
    "deals.close",
    "pipeline.manage",
    "analytics.view",
    "activity.view",
    "ai.view",
    "ai.use",
  ]),

  sales_manager: new Set<Permission>([
    "members.view",
    "clients.create",
    "clients.edit",
    "clients.view",
    "clients.assign",
    "tasks.view",
    "tasks.create",
    "tasks.edit",
    "tasks.assign",
    "tasks.complete",
    "deals.view",
    "deals.create",
    "deals.edit",
    "deals.assign",
    "deals.close",
    "pipeline.manage",
    "analytics.view",
    "ai.view",
    "ai.use",
  ]),

  support: new Set<Permission>([
    "members.view",
    "clients.view",
    "tasks.view",
    "tasks.create",
    "tasks.edit",
    "tasks.complete",
    "deals.view",
    "ai.view",
  ]),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if the given role has the specified permission.
 */
export function hasPermission(role: MemberRole, permission: Permission): boolean {
  return ROLE_PERMISSION_SETS[role]?.has(permission) ?? false;
}

/**
 * Returns a flat Record<Permission, boolean> for the given role.
 * Useful for passing to React context so components can do a simple lookup.
 */
export function getPermissions(role: MemberRole): Record<Permission, boolean> {
  return Object.fromEntries(
    ALL_PERMISSIONS.map((p) => [p, hasPermission(role, p)]),
  ) as Record<Permission, boolean>;
}

/**
 * Ordered list of roles from lowest to highest privilege.
 * Used for role selectors and comparisons.
 */
export const ROLE_ORDER: MemberRole[] = [
  "support",
  "sales_manager",
  "team_lead",
  "admin",
  "owner",
];

/** Human-readable label for each role. */
export const ROLE_LABELS: Record<MemberRole, string> = {
  owner:         "Owner",
  admin:         "Admin",
  team_lead:     "Manager",
  sales_manager: "Sales",
  support:       "Support",
};
