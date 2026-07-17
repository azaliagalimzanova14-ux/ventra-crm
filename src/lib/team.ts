/**
 * Team Management — types, storage, helpers.
 *
 * ⚠ DEV ONLY: uses localStorage as data layer.
 * Replace getTeamMembers / saveTeamMembers / getTeamActivity / saveTeamActivity
 * with server API calls before deploying to production.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type TeamRole    = "owner" | "admin" | "team_lead" | "sales_manager";
export type MemberStatus = "active" | "invited" | "inactive";

export interface TeamMember {
  id:            string;
  name:          string;
  email:         string;
  avatar:        string;      // 2-letter initials
  role:          TeamRole;
  status:        MemberStatus;
  invitedAt:     string;      // ISO
  joinedAt?:     string;      // ISO — set when invite accepted
  lastActiveAt?: string;      // ISO
}

export type TeamActivityKind =
  | "member_invited"
  | "member_joined"
  | "role_changed"
  | "member_removed"
  | "invite_resent";

export interface TeamActivity {
  id:         string;
  kind:       TeamActivityKind;
  actorName:  string;    // who performed the action
  targetName: string;    // who was affected
  detail?:    string;    // e.g. "changed role from Admin to Team Lead"
  createdAt:  string;    // ISO
}

// ── Role metadata ──────────────────────────────────────────────────────────────

export const ROLE_META: Record<TeamRole, {
  label:       string;
  description: string;
  color:       string;
  bg:          string;
}> = {
  owner: {
    label:       "Owner",
    description: "Full access — billing, workspace settings, all data",
    color:       "text-purple-700",
    bg:          "bg-purple-50 border-purple-200",
  },
  admin: {
    label:       "Admin",
    description: "Manage team members, settings, and all modules",
    color:       "text-blue-700",
    bg:          "bg-blue-50 border-blue-200",
  },
  team_lead: {
    label:       "Team Lead",
    description: "View reports, manage team members below them",
    color:       "text-amber-700",
    bg:          "bg-amber-50 border-amber-200",
  },
  sales_manager: {
    label:       "Sales Manager",
    description: "Manage pipeline, deals, clients, and inbox",
    color:       "text-emerald-700",
    bg:          "bg-emerald-50 border-emerald-200",
  },
};

/** Roles in descending privilege order */
export const ROLE_HIERARCHY: TeamRole[] = [
  "owner", "admin", "team_lead", "sales_manager",
];

// ── Storage keys ───────────────────────────────────────────────────────────────

const MEMBERS_KEY  = "ventra_team_members";
const ACTIVITY_KEY = "ventra_team_activity";

// ── Seed / default data ───────────────────────────────────────────────────────

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

const DEFAULT_MEMBERS: TeamMember[] = [
  {
    id:           "member_owner",
    name:         "You",
    email:        "owner@ventra.io",
    avatar:       "YO",
    role:         "owner",
    status:       "active",
    invitedAt:    daysAgo(90),
    joinedAt:     daysAgo(90),
    lastActiveAt: new Date().toISOString(),
  },
  {
    id:           "member_2",
    name:         "Alex Kim",
    email:        "alex.kim@ventra.io",
    avatar:       "AK",
    role:         "admin",
    status:       "active",
    invitedAt:    daysAgo(60),
    joinedAt:     daysAgo(58),
    lastActiveAt: hoursAgo(2),
  },
  {
    id:           "member_3",
    name:         "Jordan Lee",
    email:        "jordan.lee@ventra.io",
    avatar:       "JL",
    role:         "team_lead",
    status:       "active",
    invitedAt:    daysAgo(30),
    joinedAt:     daysAgo(29),
    lastActiveAt: hoursAgo(26),
  },
  {
    id:           "member_4",
    name:         "Sam Rivera",
    email:        "sam.rivera@ventra.io",
    avatar:       "SR",
    role:         "sales_manager",
    status:       "active",
    invitedAt:    daysAgo(14),
    joinedAt:     daysAgo(13),
    lastActiveAt: hoursAgo(50),
  },
  {
    id:           "member_5",
    name:         "Taylor Morgan",
    email:        "taylor.morgan@example.com",
    avatar:       "TM",
    role:         "sales_manager",
    status:       "invited",
    invitedAt:    daysAgo(3),
  },
];

const DEFAULT_ACTIVITY: TeamActivity[] = [
  {
    id: "act_1", kind: "member_invited",
    actorName: "You", targetName: "Taylor Morgan",
    detail: "invited as Sales Manager", createdAt: daysAgo(3),
  },
  {
    id: "act_2", kind: "member_joined",
    actorName: "Sam Rivera", targetName: "Sam Rivera",
    detail: "joined the team", createdAt: daysAgo(13),
  },
  {
    id: "act_3", kind: "role_changed",
    actorName: "You", targetName: "Jordan Lee",
    detail: "changed role from Sales Manager to Team Lead", createdAt: daysAgo(20),
  },
  {
    id: "act_4", kind: "member_joined",
    actorName: "Jordan Lee", targetName: "Jordan Lee",
    detail: "joined the team", createdAt: daysAgo(29),
  },
  {
    id: "act_5", kind: "member_joined",
    actorName: "Alex Kim", targetName: "Alex Kim",
    detail: "joined the team", createdAt: daysAgo(58),
  },
];

// ── CRUD helpers ───────────────────────────────────────────────────────────────

export function getTeamMembers(): TeamMember[] {
  if (typeof window === "undefined") return DEFAULT_MEMBERS;
  // ⚠ DEV ONLY
  const raw = localStorage.getItem(MEMBERS_KEY);
  if (!raw) {
    localStorage.setItem(MEMBERS_KEY, JSON.stringify(DEFAULT_MEMBERS));
    return DEFAULT_MEMBERS;
  }
  try { return JSON.parse(raw) as TeamMember[]; }
  catch { return DEFAULT_MEMBERS; }
}

export function saveTeamMembers(members: TeamMember[]): void {
  // ⚠ DEV ONLY
  localStorage.setItem(MEMBERS_KEY, JSON.stringify(members));
}

export function getTeamActivity(): TeamActivity[] {
  if (typeof window === "undefined") return DEFAULT_ACTIVITY;
  // ⚠ DEV ONLY
  const raw = localStorage.getItem(ACTIVITY_KEY);
  if (!raw) {
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(DEFAULT_ACTIVITY));
    return DEFAULT_ACTIVITY;
  }
  try { return JSON.parse(raw) as TeamActivity[]; }
  catch { return DEFAULT_ACTIVITY; }
}

export function saveTeamActivity(activity: TeamActivity[]): void {
  // ⚠ DEV ONLY
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity));
}

// ── Mutation helpers ───────────────────────────────────────────────────────────

export function logTeamActivity(
  entry: Omit<TeamActivity, "id" | "createdAt">,
): void {
  const activity = getTeamActivity();
  const newEntry: TeamActivity = {
    ...entry,
    id:        `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  saveTeamActivity([newEntry, ...activity].slice(0, 100)); // keep last 100
}

export function inviteMember(
  email:     string,
  role:      TeamRole,
  actorName: string,
): TeamMember {
  const members = getTeamMembers();

  // Derive a display name from the email local part
  const local  = email.split("@")[0] ?? email;
  const name   = local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || email;
  const avatar = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "??";

  const member: TeamMember = {
    id:        `member_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    email,
    avatar,
    role,
    status:    "invited",
    invitedAt: new Date().toISOString(),
  };

  saveTeamMembers([...members, member]);
  logTeamActivity({
    kind:       "member_invited",
    actorName,
    targetName: name,
    detail:     `invited as ${ROLE_META[role].label}`,
  });

  return member;
}

export function changeRole(
  memberId:  string,
  newRole:   TeamRole,
  actorName: string,
): void {
  const members = getTeamMembers();
  const member  = members.find((m) => m.id === memberId);
  if (!member) return;

  const oldLabel = ROLE_META[member.role].label;
  const newLabel = ROLE_META[newRole].label;

  saveTeamMembers(
    members.map((m) => m.id === memberId ? { ...m, role: newRole } : m),
  );
  logTeamActivity({
    kind:       "role_changed",
    actorName,
    targetName: member.name,
    detail:     `changed role from ${oldLabel} to ${newLabel}`,
  });
}

export function removeMember(memberId: string, actorName: string): void {
  const members = getTeamMembers();
  const member  = members.find((m) => m.id === memberId);
  if (!member) return;

  saveTeamMembers(members.filter((m) => m.id !== memberId));
  logTeamActivity({
    kind:       "member_removed",
    actorName,
    targetName: member.name,
    detail:     "removed from team",
  });
}

export function resendInvite(memberId: string, actorName: string): void {
  const member = getTeamMembers().find((m) => m.id === memberId);
  if (!member) return;
  logTeamActivity({
    kind:       "invite_resent",
    actorName,
    targetName: member.name,
    detail:     `invite resent to ${member.email}`,
  });
}

// ── Display helpers ────────────────────────────────────────────────────────────

export function formatLastActive(iso?: string): string {
  if (!iso) return "Never";
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return "Just now";
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatActivityTime(iso: string): string {
  const d    = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86_400_000);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (days === 0) return `Today at ${time}`;
  if (days === 1) return `Yesterday at ${time}`;
  if (days <  7)  return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
