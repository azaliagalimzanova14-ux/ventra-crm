# Block 1 — Workspace & Team Management: Architecture

> Status: **AWAITING APPROVAL** — no implementation has been written yet.

---

## 1. Audit Results

### What exists today

| Module | File(s) | State |
|---|---|---|
| Auth | `src/lib/auth.ts`, `src/context/auth-context.tsx` | localStorage + sessionStorage; plain-text passwords; no backend |
| Users | `src/lib/types.ts` | `User { id, name, email, company, role: string }` — role is untyped string |
| Workspace | `src/lib/workspace.ts`, `src/context/workspace-context.tsx` | Mode-only concept: `"demo" \| "empty" \| "custom"`. No real entity |
| Roles | `src/lib/team.ts` | `TeamRole` type + `ROLE_META` exist in the team module, disconnected from auth |
| Permissions | — | None. `ModuleVisibility` is UI-only toggling, not access control |
| Invitations | `src/lib/team.ts`, `src/components/team/invite-modal.tsx` | localStorage records; no token, no email, no acceptance flow |
| Profile | — | Nothing. User has name/email from registration only |
| Activity Log | `src/lib/activity.ts`, `src/lib/storage.ts` | Derived from data snapshots + real event log capped at 50; no user attribution |
| Notifications | `src/lib/notifications.ts` | Computed/derived on every render; read state in localStorage; no notifications page |
| Settings | `src/app/(app)/settings/page.tsx` | Appearance, integrations, feedback, workspace mode tabs. No profile, no notification prefs |

---

## 2. Gap Analysis

### Workspace
- ✅ Mode concept (demo/empty/custom)
- ✅ Language per workspace (localStorage)
- ❌ No workspace entity — no id, name, slug, plan, owner, logo
- ❌ No multi-workspace support
- ❌ No workspace settings stored server-side

### Users
- ✅ User type with name/email/company
- ✅ Auth context wiring
- ❌ `role` is untyped string (not connected to `TeamRole`)
- ❌ No `workspaceId` on User
- ❌ No avatar_url, phone, bio, timezone
- ❌ No profile page

### Roles
- ✅ `TeamRole` type with 4 roles + `ROLE_META` + `ROLE_HIERARCHY`
- ✅ Role UI in team page (dropdown, badges)
- ❌ Team roles are disconnected from the auth system
- ❌ No role enforcement anywhere in the app

### Permissions
- ✅ Module visibility toggling (UI-only)
- ❌ No permission model
- ❌ No access control on any route or action
- ❌ No `can(action, resource)` abstraction

### Invitations
- ✅ `inviteMember()` creates invited member in localStorage
- ✅ Resend invite UI
- ❌ No invite token
- ❌ No email sending
- ❌ No acceptance landing page
- ❌ No expiration

### Profile
- ❌ No profile page
- ❌ No avatar upload
- ❌ No bio, phone, timezone fields
- ❌ No notification preferences

### Activity Log
- ✅ `logActivity()` for real user actions (capped at 50)
- ✅ `generateActivity()` merges real + derived events
- ✅ Team-specific activity log exists
- ❌ Activity is workspace-unscoped (no `workspaceId`)
- ❌ No user attribution (who performed the action)
- ❌ Two separate activity stores (CRM + team) — not unified

### Notifications
- ✅ Notification types (kind, category, priority)
- ✅ Read state persisted in localStorage
- ✅ Sidebar unread count
- ❌ Notifications are derived/computed, not persisted
- ❌ No notifications page
- ❌ No notification preferences
- ❌ No push or email notifications

### Settings
- ✅ Appearance (accent, icon style, widgets)
- ✅ Integrations (Telegram, Gmail)
- ✅ Feedback
- ✅ Workspace mode
- ❌ No profile settings
- ❌ No notification preferences
- ❌ No workspace name/slug/logo
- ❌ No security section (change password, sessions)

---

## 3. Database Schema

Extends `src/lib/db.ts` (already uses SQLite for Telegram integration).

```sql
-- ── Core auth tables ──────────────────────────────────────────────────────────

CREATE TABLE users (
  id            TEXT PRIMARY KEY,          -- uuid v4
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,             -- bcrypt
  avatar_url    TEXT,
  phone         TEXT,
  bio           TEXT,
  timezone      TEXT NOT NULL DEFAULT 'UTC',
  locale        TEXT NOT NULL DEFAULT 'en',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,          -- uuid v4
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id  TEXT,                      -- NULL until workspace selected
  token         TEXT UNIQUE NOT NULL,      -- 64-byte cryptographic random hex
  expires_at    TEXT NOT NULL,             -- 30 days from creation
  created_at    TEXT NOT NULL,
  user_agent    TEXT,
  ip_address    TEXT
);

-- ── Workspace tables ──────────────────────────────────────────────────────────

CREATE TABLE workspaces (
  id            TEXT PRIMARY KEY,          -- uuid v4
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,      -- URL-safe, e.g. "acme-corp"
  plan          TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'pro' | 'enterprise'
  owner_id      TEXT NOT NULL REFERENCES users(id),
  logo_url      TEXT,
  settings      TEXT,                      -- JSON: { accentColor, iconStyle, widgetLayout }
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE workspace_members (
  id            TEXT PRIMARY KEY,          -- uuid v4
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,  -- NULL while invite pending
  email         TEXT NOT NULL,             -- used for pending invites before user exists
  role          TEXT NOT NULL,             -- 'owner' | 'admin' | 'team_lead' | 'sales_manager'
  status        TEXT NOT NULL DEFAULT 'invited',  -- 'active' | 'invited' | 'inactive'
  invited_by    TEXT REFERENCES users(id),
  invited_at    TEXT NOT NULL,
  joined_at     TEXT,
  last_active_at TEXT,
  UNIQUE(workspace_id, email)
);

-- ── Invitations ───────────────────────────────────────────────────────────────

CREATE TABLE invitations (
  id            TEXT PRIMARY KEY,          -- uuid v4
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  role          TEXT NOT NULL,
  token         TEXT UNIQUE NOT NULL,      -- 32-byte random hex → invite link
  invited_by    TEXT NOT NULL REFERENCES users(id),
  expires_at    TEXT NOT NULL,             -- 7 days
  accepted_at   TEXT,
  revoked_at    TEXT,
  created_at    TEXT NOT NULL,
  UNIQUE(workspace_id, email)
);

-- ── Activity & notifications ──────────────────────────────────────────────────

CREATE TABLE activity_log (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(id),
  type          TEXT NOT NULL,             -- 'client_added' | 'deal_won' | 'member_invited' | …
  entity_type   TEXT,                      -- 'client' | 'deal' | 'task' | 'project' | 'member'
  entity_id     TEXT,
  entity_name   TEXT,
  detail        TEXT,                      -- human-readable, e.g. "added Acme Corp"
  metadata      TEXT,                      -- JSON blob for extra structured data
  created_at    TEXT NOT NULL
);

CREATE INDEX idx_activity_workspace ON activity_log(workspace_id, created_at DESC);

CREATE TABLE notifications (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,             -- 'danger' | 'warning' | 'opportunity' | 'action' | 'ok'
  category      TEXT NOT NULL,             -- 'task' | 'deal' | 'client' | 'lead' | 'ai' | 'team' | 'system'
  priority      TEXT NOT NULL,             -- 'urgent' | 'high' | 'medium' | 'low'
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  href          TEXT NOT NULL,
  entity_id     TEXT,
  read          INTEGER NOT NULL DEFAULT 0,
  read_at       TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX idx_notif_user ON notifications(user_id, workspace_id, read, created_at DESC);

CREATE TABLE notification_preferences (
  user_id       TEXT NOT NULL REFERENCES users(id),
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id),
  category      TEXT NOT NULL,
  in_app        INTEGER NOT NULL DEFAULT 1,
  email         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, workspace_id, category)
);
```

---

## 4. API Design

All routes under `src/app/api/`. Session token sent as HTTP-only cookie `ventra_session`.

### Auth
```
POST /api/auth/register        → create user + workspace + session cookie
POST /api/auth/login           → validate credentials, create session cookie
POST /api/auth/logout          → delete session, clear cookie
GET  /api/auth/me              → { user, membership, workspace }
```

### Workspace
```
GET    /api/workspaces/:id             → workspace details
PATCH  /api/workspaces/:id             → update name, slug, logo, settings
GET    /api/workspaces/:id/members     → list members + pending invites
```

### Invitations
```
POST   /api/workspaces/:id/invitations           → create invite + send email
GET    /api/workspaces/:id/invitations           → list active invitations
DELETE /api/workspaces/:id/invitations/:invId    → revoke
POST   /api/workspaces/:id/invitations/:invId/resend → resend email
GET    /api/invitations/:token                   → validate (public)
POST   /api/invitations/:token/accept            → accept → create user + member + session
```

### Members
```
PATCH  /api/workspaces/:id/members/:memberId    → change role
DELETE /api/workspaces/:id/members/:memberId    → remove
```

### Profile
```
GET    /api/profile                → current user profile
PATCH  /api/profile                → update name, phone, bio, timezone, locale
POST   /api/profile/avatar         → upload avatar (multipart)
POST   /api/profile/password       → change password (requires current_password)
GET    /api/profile/sessions       → list active sessions
DELETE /api/profile/sessions/:id   → revoke a session
```

### Activity Log
```
GET /api/workspaces/:id/activity   → paginated (cursor-based), filterable by type/user/date
```

### Notifications
```
GET    /api/notifications                    → list for current user in current workspace
PATCH  /api/notifications/:id               → mark read
POST   /api/notifications/read-all          → mark all read
GET    /api/notifications/preferences       → per-category preferences
PATCH  /api/notifications/preferences       → update preferences
```

---

## 5. React Architecture

### Provider Tree (replaces current structure)

```
<SessionProvider>          ← replaces auth-context.tsx; fetches /api/auth/me
  <WorkspaceProvider>      ← replaces workspace-context.tsx; fetches /api/workspaces/:id
    <PermissionProvider>   ← NEW; derives from session.membership.role
      <LanguageProvider>   ← existing; reads workspace.settings.locale
        <ModulesProvider>  ← existing; stays
          <NotificationsProvider>  ← NEW; fetches /api/notifications
            {children}
          </NotificationsProvider>
        </ModulesProvider>
      </LanguageProvider>
    </PermissionProvider>
  </WorkspaceProvider>
</SessionProvider>
```

### New Files

```
src/
  app/
    (app)/
      profile/page.tsx           ← NEW — profile editor
      notifications/page.tsx     ← NEW — notifications center
    invite/[token]/page.tsx      ← NEW — public invite acceptance page
  middleware.ts                  ← NEW — session check, redirects /(app) to /login
  components/
    auth/
      require-permission.tsx     ← NEW — <RequirePermission permission="...">
    profile/
      profile-form.tsx           ← NEW
      avatar-upload.tsx          ← NEW
    notifications/
      notification-list.tsx      ← NEW
      notification-item.tsx      ← NEW
  context/
    session-context.tsx          ← REPLACES auth-context.tsx
    workspace-context.tsx        ← REPLACES current workspace-context.tsx
    permission-context.tsx       ← NEW
    notifications-context.tsx    ← NEW
  hooks/
    use-permission.ts            ← NEW
    use-session.ts               ← NEW
    use-workspace.ts             ← NEW
  lib/
    permissions.ts               ← NEW — permission matrix
    server/
      auth-helpers.ts            ← NEW — requireAuth(), hashPassword(), verifyPassword()
      db-users.ts                ← NEW
      db-workspace.ts            ← NEW
      db-invitations.ts          ← NEW
      db-activity.ts             ← NEW
      db-notifications.ts        ← NEW
      email.ts                   ← NEW — sendInviteEmail() (console stub initially)
```

### Key Hooks

```typescript
// use-permission.ts
const { can } = usePermission();
can("members:invite")        // → boolean
can("workspace:manage")      // → boolean
can("clients:delete")        // → boolean

// use-session.ts
const { user, membership, loading } = useSession();
user.name; user.email; user.avatarUrl
membership.role; membership.workspaceId; membership.status

// use-workspace.ts
const { workspace, updateSettings } = useWorkspace();
workspace.name; workspace.slug; workspace.plan; workspace.settings
```

---

## 6. Permission Model

### Role Matrix

| Permission | Owner | Admin | Team Lead | Sales Manager |
|---|:---:|:---:|:---:|:---:|
| `workspace:manage` (name, slug, logo) | ✅ | ❌ | ❌ | ❌ |
| `workspace:billing` | ✅ | ❌ | ❌ | ❌ |
| `members:invite` | ✅ | ✅ | ❌ | ❌ |
| `members:change_role` | ✅ | ✅ | ❌ | ❌ |
| `members:remove` | ✅ | ✅ | ❌ | ❌ |
| `settings:manage` | ✅ | ✅ | ❌ | ❌ |
| `analytics:view` | ✅ | ✅ | ✅ | ❌ |
| `clients:create/update/delete` | ✅ | ✅ | ✅ | ✅ |
| `deals:create/update/delete` | ✅ | ✅ | ✅ | ✅ |
| `tasks:create/update/delete` | ✅ | ✅ | ✅ | ✅ |
| `projects:create/update/delete` | ✅ | ✅ | ✅ | ✅ |
| Read all data | ✅ | ✅ | ✅ | ✅ |

### Implementation

```typescript
// src/lib/permissions.ts

export type Permission =
  | "workspace:manage" | "workspace:billing"
  | "members:invite"   | "members:change_role" | "members:remove"
  | "settings:manage"  | "analytics:view"
  | "clients:create"   | "clients:update"  | "clients:delete"
  | "deals:create"     | "deals:update"    | "deals:delete"
  | "tasks:create"     | "tasks:update"    | "tasks:delete"
  | "projects:create"  | "projects:update" | "projects:delete";

export type TeamRole = "owner" | "admin" | "team_lead" | "sales_manager";

const ROLE_PERMISSIONS: Record<TeamRole, Permission[]> = {
  owner:         [...ALL_PERMISSIONS],
  admin:         [...ALL_EXCEPT_BILLING],
  team_lead:     ["analytics:view", "clients:create", "clients:update", ...],
  sales_manager: ["clients:create", "clients:update", "deals:create", "deals:update", ...],
};

export function hasPermission(role: TeamRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
```

```typescript
// Server-side route guard pattern
export async function PATCH(req: Request, { params }) {
  const { userId, workspaceId, role } = await requireAuth(req);
  if (!hasPermission(role, "members:change_role")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  // … proceed
}
```

---

## 7. Workspace Isolation

### Principle
Every entity in the CRM carries `workspaceId`. All queries filter by it. No cross-workspace data leakage is possible.

### Session flow
```
Client request
  → Cookie: ventra_session=<token>
  → middleware.ts validates token → loads session.workspace_id
  → Request context: { userId, workspaceId, role }
  → All DB queries: WHERE workspace_id = $workspaceId
```

### Auth helper (server-only)
```typescript
// src/lib/server/auth-helpers.ts
export async function requireAuth(req: Request) {
  const token = req.cookies.get("ventra_session")?.value;
  if (!token) throw new ApiError(401, "Not authenticated");
  
  const session = await db.get(
    "SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')", [token]
  );
  if (!session) throw new ApiError(401, "Session expired");
  
  const membership = await db.get(
    "SELECT * FROM workspace_members WHERE user_id = ? AND workspace_id = ? AND status = 'active'",
    [session.user_id, session.workspace_id]
  );
  if (!membership) throw new ApiError(403, "Not a member of this workspace");
  
  return { userId: session.user_id, workspaceId: session.workspace_id, role: membership.role };
}
```

### Data migration
Existing localStorage CRM data (clients, deals, tasks, projects) will need `workspace_id` added when migrated to server-side storage. This is a Block 2+ concern; Block 1 focuses on the auth/team/workspace layer only.

---

## 8. Future Scalability — Multiple Organizations

The schema is already multi-tenant ready:

- **Users ↔ Workspaces is many-to-many** via `workspace_members` — one user can belong to multiple workspaces
- **Sessions carry `workspace_id`** — workspace switching changes the active context without re-login
- **All data is workspace-scoped** — zero schema changes needed to add a second workspace

Future additions require no schema changes:

**Workspace switching UI**
```
User avatar → dropdown → "Switch workspace" → list of memberships → click → 
  PATCH /api/auth/session { workspaceId } → reload
```

**Organization tier** (enterprise only, Block 4+)
```sql
CREATE TABLE organizations (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  plan  TEXT NOT NULL DEFAULT 'enterprise'
);

ALTER TABLE workspaces ADD COLUMN organization_id TEXT REFERENCES organizations(id);
```

**URL-based workspace routing**
```
/w/[slug]/dashboard
/w/[slug]/clients
```
Slug in URL → `workspaces.slug` → workspace isolation enforced at middleware level.

**Scale path**
- SQLite → PostgreSQL: schema is identical, swap the DB driver
- Add Row-Level Security (PostgreSQL RLS) for DB-level tenant isolation
- Add Redis for session storage when SQLite write throughput becomes a bottleneck

---

## 9. Implementation Milestones

Each milestone is completable in one development session (~2–4 hours). Critical path: M1 → M2 → M3 → M4/M5 (parallel) → M6 → M7 → M8 → M9 → M10.

---

### M1 — Database Foundation
**Goal:** All Block 1 tables exist and have typed query helpers.

Tasks:
- Add Block 1 tables to `src/lib/db.ts` migration
- Create `src/lib/server/db-users.ts` — `createUser()`, `getUserById()`, `getUserByEmail()`, `updateUser()`
- Create `src/lib/server/db-workspace.ts` — `createWorkspace()`, `getWorkspace()`, `updateWorkspace()`, `listMemberWorkspaces()`
- Create `src/lib/server/db-invitations.ts` — `createInvitation()`, `getInvitationByToken()`, `revokeInvitation()`
- Create `src/lib/server/db-activity.ts` — `logActivity()`, `getActivity()` (paginated)
- Create `src/lib/server/db-notifications.ts` — `upsertNotification()`, `listNotifications()`, `markRead()`
- Seed: demo workspace + owner user on first boot

Deliverable: Tables created, helpers tested with a Node script.

---

### M2 — Auth Replacement
**Goal:** Login/register work via API with HTTP-only session cookie. localStorage auth removed.

Tasks:
- Add `bcryptjs` to `package.json`
- Create `src/lib/server/auth-helpers.ts` — `hashPassword()`, `verifyPassword()`, `createSession()`, `requireAuth()`
- `POST /api/auth/register` — create user + workspace (slug from company name) + session cookie
- `POST /api/auth/login` — verify password, create session cookie
- `POST /api/auth/logout` — delete session, clear cookie
- `GET  /api/auth/me` — return `{ user, membership, workspace }`
- Rewrite `src/context/auth-context.tsx` → `session-context.tsx` to call API
- Add `src/middleware.ts` — protect `/(app)` routes, redirect to `/login` if no valid session
- Delete localStorage-based `src/lib/auth.ts` (or keep as stub for compatibility during transition)

Deliverable: Login/register/logout via API. Session persisted in cookie. App protected by middleware.

---

### M3 — Workspace Entity
**Goal:** Workspace is a real DB record. Settings persist server-side.

Tasks:
- On register: create workspace record, create owner `workspace_member` record
- `GET  /api/workspaces/:id` → return workspace
- `PATCH /api/workspaces/:id` → update name, slug, logo_url, settings JSON
- Rewrite `src/context/workspace-context.tsx` — fetch from API, expose `workspace` + `updateSettings()`
- Settings page workspace tab: update name/slug fields; save calls PATCH API
- Remove `WorkspaceMode` concept (mode is replaced by real workspace entity)
- Update `LanguageProvider` to read `workspace.settings.locale` instead of localStorage

Deliverable: Workspace entity exists in DB. Settings persist across sessions.

---

### M4 — Permissions System
**Goal:** Role-based UI gating throughout the app.

Tasks:
- Create `src/lib/permissions.ts` — `Permission` type + `ROLE_PERMISSIONS` matrix + `hasPermission()`
- Create `src/context/permission-context.tsx` — `PermissionProvider` reads role from session, exposes `can(permission)`
- Create `src/hooks/use-permission.ts` — `const { can } = usePermission()`
- Create `src/components/auth/require-permission.tsx` — `<RequirePermission permission="members:invite">` hides children if no access
- Wire up throughout the app:
  - "Invite member" button: requires `members:invite`
  - Role dropdown in team table: requires `members:change_role`
  - "Remove member": requires `members:remove`
  - Settings workspace tab: requires `settings:manage`
  - Analytics page: requires `analytics:view`

Deliverable: UI correctly shows/hides actions based on role. Owner sees everything; Sales Manager sees only CRM actions.

---

### M5 — Team/Members API
**Goal:** Team CRUD works against the DB. No localStorage for team data.

Tasks:
- `GET    /api/workspaces/:id/members` — list `workspace_members` joined with `users`
- `PATCH  /api/workspaces/:id/members/:memberId` — change role (requires `members:change_role`)
- `DELETE /api/workspaces/:id/members/:memberId` — remove (requires `members:remove`)
- Update team page to fetch from API instead of `src/lib/team.ts` localStorage functions
- Log member actions to `activity_log` table
- Delete localStorage-based team storage code from `src/lib/team.ts` (keep types)

Deliverable: Team page reads/writes from DB. Role changes persist across devices.

---

### M6 — Invitations Flow
**Goal:** Full invite-by-link flow from invite creation to workspace join.

Tasks:
- `POST   /api/workspaces/:id/invitations` — create invitation record + generate token + send email stub
- `GET    /api/workspaces/:id/invitations` — list pending invitations
- `DELETE /api/workspaces/:id/invitations/:invId` — revoke
- `POST   /api/workspaces/:id/invitations/:invId/resend` — resend email
- `GET    /api/invitations/:token` — public; return `{ workspace, role, inviterName, valid, expired }`
- `POST   /api/invitations/:token/accept` — create user (if new) + `workspace_member` + session cookie
- Create `src/app/invite/[token]/page.tsx` — public page showing workspace name/role, accept/decline CTA
- Create `src/lib/server/email.ts` — `sendInviteEmail()` → `console.log` stub with full email body template
- Update `InviteModal` to call POST API

Deliverable: Copy invite link → open in browser → see workspace invite → accept → log in as member of workspace.

---

### M7 — Profile Page
**Goal:** Users can view and edit their profile.

Tasks:
- `GET  /api/profile` — current user profile
- `PATCH /api/profile` — update name, phone, bio, timezone, locale
- `POST /api/profile/avatar` — multipart upload; save to `/public/avatars/:userId.jpg`
- `POST /api/profile/password` — requires `{ currentPassword, newPassword }`
- `GET  /api/profile/sessions` — list active sessions with device info
- `DELETE /api/profile/sessions/:id` — revoke session
- Create `src/app/(app)/profile/page.tsx` with tabs: Profile / Security / Sessions
- Update sidebar: show real avatar + name, link to `/profile`
- Update `User` type to include `avatarUrl`, `phone`, `bio`, `timezone`

Deliverable: Full profile page. Avatar, name, bio, timezone editable. Password change works. Sessions visible and revocable.

---

### M8 — Unified Activity Log
**Goal:** All user actions flow to `activity_log` table with user attribution.

Tasks:
- Replace `logActivity()` in `src/lib/storage.ts` with server-side call to `POST /api/workspaces/:id/activity`
- `GET /api/workspaces/:id/activity` — paginated (20/page, cursor-based), filters: type, userId, date range
- Add `workspaceId` + `userId` to all activity entries
- Wire logging into all existing mutation paths (client add/edit, deal stage change, task complete, project create)
- Merge team activity into the unified log (member_invited, role_changed, member_removed events)
- Update dashboard activity panel to fetch from API
- Update team page activity log to use unified feed filtered by type `member_*`

Deliverable: Single `activity_log` table holds all CRM + team events, attributed to users, scoped to workspace.

---

### M9 — Notifications
**Goal:** Notifications are persisted to DB. Notification center page exists.

Tasks:
- Convert `generateNotifications()` to a server function that upserts to `notifications` table (runs on relevant data mutations)
- `GET  /api/notifications` — list unread first, then read; paginated
- `PATCH /api/notifications/:id` — mark read
- `POST /api/notifications/read-all` — mark all read
- `GET  /api/notifications/preferences` — per-category in-app/email toggles
- `PATCH /api/notifications/preferences` — update
- Create `src/context/notifications-context.tsx` — poll/fetch, expose unread count
- Create `src/app/(app)/notifications/page.tsx` — grouped by category, filterable by kind
- Remove `ventra_notifications_read` and `ventra_notif_unread_count` localStorage usage

Deliverable: Notifications page exists. Read state persists to DB across devices.

---

### M10 — Settings Completion
**Goal:** Settings page is feature-complete for Block 1.

Tasks:
- Add **Profile tab** — inline name/bio/timezone edit + link to full `/profile`
- Add **Notifications tab** — per-category in-app/email toggle matrix; saves to `/api/notifications/preferences`
- Expand **Workspace tab** — name field, slug field (with validation), logo upload; saves to PATCH API
- Add **Security section** (within Profile tab or separate tab) — change password form, active sessions list, "Log out all devices"
- Add **Members tab** — shortcut to `/team` page inline or embedded team list
- Remove workspace mode switcher (demo/empty/custom) — replaced by real workspace settings

Deliverable: Settings covers profile, notifications, workspace identity, and security. All data persists to server.

---

## 10. What Does NOT Change in Block 1

- Telegram Bot integration (Tasks #1–7) — untouched
- MTProto personal account (Tasks #8–18) — untouched
- i18n / next-intl (Tasks #19–22) — untouched; `LanguageProvider` stays, source of locale value migrates from localStorage to workspace settings
- All CRM modules (clients, deals, tasks, projects, pipeline, analytics) — these move to server-side storage in Block 2
- UI component library — untouched

---

*Ready for approval. Once approved, implementation begins with M1.*
