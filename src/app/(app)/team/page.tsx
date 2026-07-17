"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { TopBar }      from "@/components/layout/top-bar";
import { AppToast }    from "@/components/ui/toast";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { InviteModal } from "@/components/team/invite-modal";
import {
  getTeamMembers,
  getTeamActivity,
  changeRole, removeMember, resendInvite, inviteMember,
  formatLastActive, formatActivityTime,
  ROLE_META, ROLE_HIERARCHY,
  type TeamMember, type TeamRole, type TeamActivity,
} from "@/lib/team";
import { cn } from "@/lib/utils";
import {
  UserPlus, Users2, Shield, ChevronDown, Check,
  MoreHorizontal, Send, Trash2, RefreshCw,
  Clock, Crown, Activity,
  UserCheck, UserMinus, UserCog, MailCheck,
  Circle,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";

// ── Types ─────────────────────────────────────────────────────────────────────

type SortKey    = "name" | "role" | "status" | "joined";
type SortDir    = "asc" | "desc";
type FilterRole = "all" | TeamRole;

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TeamMember["status"] }) {
  if (status === "active") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
      <Circle size={5} className="fill-emerald-500 text-emerald-500" />
      Active
    </span>
  );
  if (status === "invited") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
      <Clock size={9} />
      Pending
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--color-border)] text-[var(--color-fg-faint)]">
      <Circle size={5} className="fill-[var(--color-fg-faint)] text-[var(--color-fg-faint)]" />
      Inactive
    </span>
  );
}

function RoleBadge({ role }: { role: TeamRole }) {
  const m = ROLE_META[role];
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border",
      m.bg, m.color,
    )}>
      {role === "owner" && <Crown size={8} />}
      {m.label}
    </span>
  );
}

function ActivityIcon({ kind }: { kind: TeamActivity["kind"] }) {
  switch (kind) {
    case "member_invited":  return <MailCheck   size={12} className="text-blue-500" />;
    case "member_joined":   return <UserCheck   size={12} className="text-emerald-500" />;
    case "role_changed":    return <UserCog     size={12} className="text-amber-500" />;
    case "member_removed":  return <UserMinus   size={12} className="text-red-500" />;
    case "invite_resent":   return <RefreshCw   size={12} className="text-[var(--color-accent)]" />;
  }
}

// ── Role change dropdown ──────────────────────────────────────────────────────

function RoleDropdown({
  member,
  onChangeRole,
}: {
  member:        TeamMember;
  onChangeRole:  (id: string, role: TeamRole) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  if (member.role === "owner") {
    return <RoleBadge role={member.role} />;
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border transition-colors",
          ROLE_META[member.role].bg,
          ROLE_META[member.role].color,
          "hover:opacity-80",
        )}
      >
        {ROLE_META[member.role].label}
        <ChevronDown size={8} className={cn("transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 w-[220px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg overflow-hidden">
          <p className="px-3 py-2 text-[10px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider border-b border-[var(--color-border)]">
            Change role
          </p>
          {ROLE_HIERARCHY.filter((r) => r !== "owner").map((r) => {
            const meta     = ROLE_META[r];
            const selected = r === member.role;
            return (
              <button
                key={r}
                onClick={() => {
                  onChangeRole(member.id, r);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors",
                  selected ? "bg-[var(--color-accent-subtle)]" : "hover:bg-[var(--color-canvas)]",
                )}
              >
                <span className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 mt-0.5",
                  meta.bg, meta.color,
                )}>
                  {meta.label}
                </span>
                <span className="flex-1 text-[11px] text-[var(--color-fg-muted)] leading-tight">
                  {meta.description}
                </span>
                {selected && <Check size={11} className="text-[var(--color-accent)] flex-shrink-0 mt-0.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Row actions dropdown ──────────────────────────────────────────────────────

function RowActions({
  member,
  onResend,
  onRemove,
}: {
  member:   TeamMember;
  onResend: (id: string) => void;
  onRemove: (member: TeamMember) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  if (member.role === "owner") return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] transition-colors"
      >
        <MoreHorizontal size={14} />
      </button>

      {open && (
        <div className="absolute z-20 right-0 top-full mt-1 w-[180px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg overflow-hidden">
          {member.status === "invited" && (
            <button
              onClick={() => { onResend(member.id); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-[var(--color-canvas)] transition-colors text-[12px] text-[var(--color-fg-muted)]"
            >
              <Send size={12} className="text-[var(--color-accent)]" />
              Resend invite
            </button>
          )}
          <button
            onClick={() => { onRemove(member); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-red-50 transition-colors text-[12px] text-red-600"
          >
            <Trash2 size={12} />
            Remove member
          </button>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const { user }   = useAuth();
  const actorName  = user?.name ?? "You";

  const [members,     setMembers]     = useState<TeamMember[]>([]);
  const [activity,    setActivity]    = useState<TeamActivity[]>([]);
  const [showInvite,  setShowInvite]  = useState(false);
  const [toast,       setToast]       = useState<string | null>(null);
  const [sortKey,     setSortKey]     = useState<SortKey>("role");
  const [sortDir,     setSortDir]     = useState<SortDir>("asc");
  const [filterRole,  setFilterRole]  = useState<FilterRole>("all");
  const [confirmRemove, setConfirmRemove] = useState<TeamMember | null>(null);

  // Load on mount
  useEffect(() => {
    setMembers(getTeamMembers());
    setActivity(getTeamActivity());
  }, []);

  function reload() {
    setMembers(getTeamMembers());
    setActivity(getTeamActivity());
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleInvite = useCallback((email: string, role: TeamRole) => {
    inviteMember(email, role, actorName);
    reload();
    setShowInvite(false);
    setToast(`Invite sent to ${email}`);
  }, [actorName]);

  const handleChangeRole = useCallback((id: string, role: TeamRole) => {
    changeRole(id, role, actorName);
    reload();
    const member = getTeamMembers().find((m) => m.id === id);
    setToast(`${member?.name ?? "Member"} is now ${ROLE_META[role].label}`);
  }, [actorName]);

  const handleResend = useCallback((id: string) => {
    resendInvite(id, actorName);
    const member = getTeamMembers().find((m) => m.id === id);
    reload();
    setToast(`Invite resent to ${member?.email ?? "member"}`);
  }, [actorName]);

  function handleRemoveConfirmed() {
    if (!confirmRemove) return;
    removeMember(confirmRemove.id, actorName);
    reload();
    setToast(`${confirmRemove.name} has been removed`);
    setConfirmRemove(null);
  }

  // ── Sorting + filtering ───────────────────────────────────────────────────

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const displayed = useMemo(() => {
    let list = filterRole === "all" ? members : members.filter((m) => m.role === filterRole);
    list = [...list].sort((a, b) => {
      let va = "", vb = "";
      if (sortKey === "name")   { va = a.name;           vb = b.name; }
      if (sortKey === "role")   { va = ROLE_HIERARCHY.indexOf(a.role).toString(); vb = ROLE_HIERARCHY.indexOf(b.role).toString(); }
      if (sortKey === "status") { va = a.status;          vb = b.status; }
      if (sortKey === "joined") { va = a.joinedAt ?? a.invitedAt; vb = b.joinedAt ?? b.invitedAt; }
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return list;
  }, [members, filterRole, sortKey, sortDir]);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => ({
    total:   members.length,
    active:  members.filter((m) => m.status === "active").length,
    invited: members.filter((m) => m.status === "invited").length,
  }), [members]);

  // ── Sort header ───────────────────────────────────────────────────────────

  function SortHeader({ label, col }: { label: string; col: SortKey }) {
    const active = sortKey === col;
    return (
      <button
        onClick={() => toggleSort(col)}
        className={cn(
          "flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
          active ? "text-[var(--color-accent)]" : "text-[var(--color-fg-faint)] hover:text-[var(--color-fg-muted)]",
        )}
      >
        {label}
        <span className="text-[8px]">{active ? (sortDir === "asc" ? "↑" : "↓") : ""}</span>
      </button>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen bg-[var(--color-canvas)]">
      <TopBar
        title="Team"
        subtitle="Manage your workspace members and roles"
      />

      <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 73px)" }}>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[900px] mx-auto px-6 py-6 space-y-5">

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total members", value: stats.total,   icon: Users2,    color: "text-[var(--color-accent)]",  bg: "bg-[var(--color-accent-subtle)]" },
                { label: "Active",        value: stats.active,  icon: UserCheck, color: "text-emerald-600",             bg: "bg-emerald-50" },
                { label: "Pending invite",value: stats.invited, icon: Clock,     color: "text-amber-600",               bg: "bg-amber-50" },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 flex items-center gap-3">
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", bg)}>
                    <Icon size={16} className={color} />
                  </div>
                  <div>
                    <p className="text-[22px] font-bold text-[var(--color-fg)] leading-none">{value}</p>
                    <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {/* Role filter */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {(["all", ...ROLE_HIERARCHY] as FilterRole[]).map((r) => {
                  const label = r === "all" ? "All roles" : ROLE_META[r].label;
                  const count = r === "all" ? members.length : members.filter((m) => m.role === r).length;
                  return (
                    <button
                      key={r}
                      onClick={() => setFilterRole(r)}
                      className={cn(
                        "flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors",
                        filterRole === r
                          ? "bg-[var(--color-accent)] text-white"
                          : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-accent-subtle)] hover:text-[var(--color-fg)]",
                      )}
                    >
                      {label}
                      <span className={cn(
                        "text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[14px] text-center",
                        filterRole === r ? "bg-white/20 text-white" : "bg-[var(--color-border)] text-[var(--color-fg-faint)]",
                      )}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Invite button */}
              <button
                onClick={() => setShowInvite(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[12px] font-semibold transition-colors flex-shrink-0"
              >
                <UserPlus size={13} />
                Invite member
              </button>
            </div>

            {/* Members table */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">

              {/* Table header */}
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_36px] gap-3 px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-canvas)]">
                <SortHeader label="Member" col="name" />
                <SortHeader label="Role"   col="role" />
                <SortHeader label="Status" col="status" />
                <SortHeader label="Last active" col="joined" />
                <div />
              </div>

              {/* Rows */}
              {displayed.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <Users2 size={20} className="text-[var(--color-fg-faint)]" strokeWidth={1.5} />
                  <p className="text-[13px] text-[var(--color-fg-faint)]">No members match this filter</p>
                </div>
              ) : (
                displayed.map((member) => (
                  <div
                    key={member.id}
                    className="grid grid-cols-[2fr_1fr_1fr_1fr_36px] gap-3 px-4 py-3 items-center border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-canvas)] transition-colors"
                  >
                    {/* Member info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
                        {member.avatar}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[var(--color-fg)] truncate">
                          {member.name}
                        </p>
                        <p className="text-[11px] text-[var(--color-fg-faint)] truncate">
                          {member.email}
                        </p>
                      </div>
                    </div>

                    {/* Role (editable) */}
                    <div>
                      <RoleDropdown member={member} onChangeRole={handleChangeRole} />
                    </div>

                    {/* Status */}
                    <div>
                      <StatusBadge status={member.status} />
                    </div>

                    {/* Last active */}
                    <div>
                      <span className="text-[11px] text-[var(--color-fg-faint)]">
                        {member.status === "invited"
                          ? `Invited ${formatLastActive(member.invitedAt)}`
                          : formatLastActive(member.lastActiveAt)}
                      </span>
                    </div>

                    {/* Actions */}
                    <RowActions
                      member={member}
                      onResend={handleResend}
                      onRemove={(m) => setConfirmRemove(m)}
                    />
                  </div>
                ))
              )}
            </div>

            {/* Role legend */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield size={13} className="text-[var(--color-fg-faint)]" />
                <p className="text-[11px] font-semibold text-[var(--color-fg-muted)] uppercase tracking-wider">
                  Role permissions
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {ROLE_HIERARCHY.map((r) => {
                  const meta = ROLE_META[r];
                  return (
                    <div key={r} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[var(--color-canvas)]">
                      <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0",
                        meta.bg, meta.color,
                      )}>
                        {meta.label}
                      </span>
                      <p className="text-[11px] text-[var(--color-fg-muted)] leading-snug">
                        {meta.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── Activity log panel ────────────────────────────────────────── */}
        <aside className="w-[288px] flex-shrink-0 border-l border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3.5 border-b border-[var(--color-border)] flex-shrink-0">
            <Activity size={13} className="text-[var(--color-accent)]" />
            <p className="text-[12px] font-semibold text-[var(--color-fg)]">Activity log</p>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {activity.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center px-4">
                <Activity size={18} className="text-[var(--color-fg-faint)]" strokeWidth={1.5} />
                <p className="text-[12px] text-[var(--color-fg-faint)]">No activity yet</p>
              </div>
            ) : (
              activity.map((entry) => (
                <div key={entry.id} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-[var(--color-canvas)] transition-colors">
                  {/* Icon */}
                  <div className="w-6 h-6 rounded-full bg-[var(--color-canvas)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ActivityIcon kind={entry.kind} />
                  </div>
                  {/* Text */}
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-[var(--color-fg)] leading-snug">
                      <span className="font-semibold">{entry.actorName}</span>
                      {" "}
                      <span className="text-[var(--color-fg-muted)]">{entry.detail ?? entry.kind.replace(/_/g, " ")}</span>
                    </p>
                    <p className="text-[10px] text-[var(--color-fg-faint)] mt-0.5">
                      {formatActivityTime(entry.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────── */}

      {showInvite && (
        <InviteModal
          onInvite={handleInvite}
          onClose={() => setShowInvite(false)}
        />
      )}

      {confirmRemove && (
        <ConfirmModal
          title={`Remove ${confirmRemove.name}?`}
          description={`${confirmRemove.name} will lose access to this workspace immediately. This action cannot be undone.`}
          confirmLabel="Remove member"
          confirmColor="bg-red-500 hover:bg-red-400"
          onConfirm={handleRemoveConfirmed}
          onCancel={() => setConfirmRemove(null)}
        />
      )}

      <AppToast msg={toast} onDone={() => setToast(null)} />
    </div>
  );
}
