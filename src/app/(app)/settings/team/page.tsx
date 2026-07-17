"use client";

/**
 * /settings/team — Team Management Page
 *
 * Lists workspace members with avatar, name, email, role, status, joined date.
 * Owners and admins can add, edit role, and remove members.
 * Shows pending invitations with resend/cancel actions.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { TopBar }          from "@/components/layout/top-bar";
import { useTeam }         from "@/context/team-context";
import { useWorkspace }    from "@/context/workspace-context";
import { usePermissions }  from "@/context/permission-context";
import { cn }              from "@/lib/utils";
import { AppToast }        from "@/components/ui/toast";
import {
  UserPlus, MoreHorizontal, Loader2, X, ChevronDown,
  Shield, Users, Check, Mail, RefreshCw, Ban, Link,
} from "lucide-react";
import type { MemberRole } from "@/lib/permissions";
import type { TeamMember } from "@/context/team-context";

// ── Invitation types ──────────────────────────────────────────────────────────

interface Invitation {
  id:         string;
  email:      string;
  role:       string;
  status:     "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  created_at: string;
}

// ── Role UI helpers ───────────────────────────────────────────────────────────

// UI display labels (map DB roles → requirement labels)
const ROLE_UI_LABELS: Record<MemberRole, string> = {
  owner:         "Owner",
  admin:         "Admin",
  team_lead:     "Manager",
  sales_manager: "Sales",
  support:       "Support",
};

const ROLE_COLORS: Record<MemberRole, string> = {
  owner:         "bg-amber-50 text-amber-700 border-amber-200",
  admin:         "bg-purple-50 text-purple-700 border-purple-200",
  team_lead:     "bg-blue-50 text-blue-700 border-blue-200",
  sales_manager: "bg-emerald-50 text-emerald-700 border-emerald-200",
  support:       "bg-slate-50 text-slate-600 border-slate-200",
};

const STATUS_COLORS: Record<string, string> = {
  active:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  invited:  "bg-amber-50 text-amber-600 border-amber-200",
  inactive: "bg-slate-50 text-slate-500 border-slate-200",
};

// Available roles for the add/edit dropdowns (owner can see all, admin can't assign owner)
const ASSIGNABLE_ROLES: MemberRole[] = ["admin", "team_lead", "sales_manager", "support"];
const ALL_ROLES: MemberRole[]        = ["owner", ...ASSIGNABLE_ROLES];

// ── Avatar ────────────────────────────────────────────────────────────────────

function MemberAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt={name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
    );
  }
  return (
    <div className="w-9 h-9 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0 select-none">
      {initials}
    </div>
  );
}

// ── Role selector dropdown ────────────────────────────────────────────────────

function RoleDropdown({
  value,
  onChange,
  canAssignOwner,
  disabled,
}: {
  value:          MemberRole;
  onChange:       (r: MemberRole) => void;
  canAssignOwner: boolean;
  disabled?:      boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const options = canAssignOwner ? ALL_ROLES : ASSIGNABLE_ROLES;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] font-medium transition-colors",
          ROLE_COLORS[value],
          disabled
            ? "cursor-default opacity-60"
            : "hover:opacity-80 cursor-pointer",
        )}
      >
        {ROLE_UI_LABELS[value]}
        {!disabled && <ChevronDown size={11} className={cn("transition-transform", open && "rotate-180")} />}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-36 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg z-30 py-1 overflow-hidden">
          {options.map((r) => (
            <button
              key={r}
              onClick={() => { onChange(r); setOpen(false); }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-left transition-colors hover:bg-[var(--color-canvas)]",
                r === value ? "text-[var(--color-accent)]" : "text-[var(--color-fg-muted)]",
              )}
            >
              {r === value && <Check size={11} className="text-[var(--color-accent)] flex-shrink-0" />}
              <span className={r === value ? "ml-0" : "ml-[15px]"}>{ROLE_UI_LABELS[r]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Add member modal ──────────────────────────────────────────────────────────

function AddMemberModal({
  onClose,
  onAdded,
  canAssignOwner,
}: {
  onClose:        () => void;
  onAdded:        () => void;
  canAssignOwner: boolean;
}) {
  const [form,    setForm]    = useState({ name: "", email: "", role: "sales_manager" as MemberRole });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => { emailRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email.trim()) { setError("Email is required"); return; }
    setLoading(true);
    setError("");
    try {
      const res  = await fetch("/api/team", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify(form),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "Failed to add member"); }
      else { onAdded(); onClose(); }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
      <div className="w-full max-w-md mx-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--color-border)]/60">
          <div className="w-7 h-7 rounded-lg bg-[var(--color-accent-subtle)] flex items-center justify-center">
            <UserPlus size={14} className="text-[var(--color-accent)]" />
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-semibold text-[var(--color-fg)]">Add team member</p>
            <p className="text-[11px] text-[var(--color-fg-faint)]">Invite someone to this workspace</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={(e) => { void handleSubmit(e); }} className="px-5 py-5 space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-[var(--color-fg-muted)]">Full name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Alex Morgan"
              className="w-full h-9 px-3 text-[13px] bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg text-[var(--color-fg)] placeholder:text-[var(--color-fg-placeholder)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-[var(--color-fg-muted)]">Email address <span className="text-red-400">*</span></label>
            <input
              ref={emailRef}
              type="email"
              value={form.email}
              onChange={(e) => { setForm({ ...form, email: e.target.value }); setError(""); }}
              placeholder="alex@company.com"
              required
              className="w-full h-9 px-3 text-[13px] bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg text-[var(--color-fg)] placeholder:text-[var(--color-fg-placeholder)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-[var(--color-fg-muted)]">Role</label>
            <div className="flex flex-wrap gap-2">
              {(canAssignOwner ? ALL_ROLES : ASSIGNABLE_ROLES).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm({ ...form, role: r })}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-colors",
                    form.role === r
                      ? ROLE_COLORS[r]
                      : "border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-accent-subtle)] bg-[var(--color-canvas)]",
                  )}
                >
                  {ROLE_UI_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 rounded-lg border border-[var(--color-border)] text-[13px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent-subtle)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 h-9 rounded-lg bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[13px] font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {loading && <Loader2 size={13} className="animate-spin" />}
              Add member
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Invitations section ───────────────────────────────────────────────────────

function InvitationsSection({
  workspaceId,
  canManage,
  onToast,
}: {
  workspaceId: string | null;
  canManage:   boolean;
  onToast:     (msg: string) => void;
}) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [actionId,    setActionId]    = useState<string | null>(null);
  const [showLink,    setShowLink]    = useState<{ id: string; link: string } | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res  = await fetch("/api/invitations", { credentials: "include" });
      const data = await res.json() as { invitations?: Invitation[] };
      // Show only non-accepted invitations (pending, expired)
      const visible = (data.invitations ?? []).filter(
        (i) => i.status !== "accepted" && i.status !== "revoked",
      );
      setInvitations(visible);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  async function handleAction(id: string, action: "resend" | "cancel") {
    setActionId(id);
    try {
      const res  = await fetch(`/api/invitations/${id}`, {
        method:      "PATCH",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({ action }),
      });
      const data = await res.json() as { error?: string; link?: string; invitation?: Invitation };
      if (!res.ok) {
        onToast(data.error ?? `Failed to ${action} invitation`);
      } else {
        if (action === "resend" && data.link) {
          setShowLink({ id, link: data.link });
        }
        onToast(action === "resend" ? "New invitation link generated" : "Invitation cancelled");
        await load();
      }
    } catch {
      onToast("Network error");
    } finally {
      setActionId(null);
    }
  }

  // No section if no invitations and not a manager
  if (!loading && invitations.length === 0 && !canManage) return null;

  return (
    <div className="bg-[var(--color-canvas)] border border-[var(--color-border)]/80 rounded-2xl overflow-hidden">
      {/* Section header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[var(--color-border)]/60 bg-[var(--color-surface)]">
        <Mail size={14} className="text-[var(--color-fg-faint)]" />
        <h3 className="text-[12px] font-semibold text-[var(--color-fg)] flex-1">Pending Invitations</h3>
        <button
          onClick={() => { void load(); }}
          className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] transition-colors"
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={18} className="animate-spin text-[var(--color-fg-faint)]" />
        </div>
      ) : invitations.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10">
          <Mail size={18} className="text-[var(--color-fg-faint)]" />
          <p className="text-[12px] text-[var(--color-fg-faint)]">No pending invitations</p>
        </div>
      ) : (
        <div>
          {invitations.map((inv) => {
            const isExpired = inv.status === "expired";
            const isWorking = actionId === inv.id;
            const linkShown = showLink?.id === inv.id;

            return (
              <div
                key={inv.id}
                className="flex items-center gap-4 px-5 py-3.5 border-b border-[var(--color-border)]/50 last:border-0 hover:bg-[var(--color-canvas)]/50 transition-colors"
              >
                {/* Email + role */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--color-fg)] truncate">{inv.email}</p>
                  <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5">
                    {ROLE_UI_LABELS[inv.role as MemberRole] ?? inv.role}
                  </p>
                  {linkShown && (
                    <div className="mt-2 flex items-center gap-1.5 max-w-xs">
                      <input
                        readOnly
                        value={showLink.link}
                        className="flex-1 min-w-0 text-[10px] px-2 py-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] text-[var(--color-fg-muted)] truncate"
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <button
                        onClick={() => { void navigator.clipboard.writeText(showLink.link); onToast("Link copied!"); }}
                        className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] transition-colors flex-shrink-0"
                        title="Copy link"
                      >
                        <Link size={10} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Status badge */}
                <span className={cn(
                  "inline-flex items-center px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex-shrink-0",
                  isExpired
                    ? "bg-red-50 text-red-600 border-red-200"
                    : "bg-amber-50 text-amber-600 border-amber-200",
                )}>
                  {isExpired ? "Expired" : "Pending"}
                </span>

                {/* Expiry */}
                <div className="w-24 flex-shrink-0 text-right">
                  <p className="text-[10px] text-[var(--color-fg-faint)]">
                    {isExpired ? "Expired" : "Expires"}{" "}
                    {new Date(inv.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>

                {/* Actions */}
                {canManage && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => { void handleAction(inv.id, "resend"); }}
                      disabled={isWorking}
                      title="Resend invitation"
                      className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)] transition-colors disabled:opacity-40"
                    >
                      {isWorking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    </button>
                    <button
                      onClick={() => { void handleAction(inv.id, "cancel"); }}
                      disabled={isWorking}
                      title="Cancel invitation"
                      className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                    >
                      <Ban size={13} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Member row ────────────────────────────────────────────────────────────────

function MemberRow({
  member,
  canManage,
  canRemove: canRemoveProp,
  canAssignOwner,
  isCurrentUser,
  onRoleChange,
  onRemove,
}: {
  member:         TeamMember;
  canManage:      boolean;  // can manage roles
  canRemove:      boolean;  // can remove members
  canAssignOwner: boolean;
  isCurrentUser:  boolean;
  onRoleChange:   (id: string, role: MemberRole) => Promise<void>;
  onRemove:       (member: TeamMember) => void;
}) {
  const [roleLoading,  setRoleLoading]  = useState(false);
  const [menuOpen,     setMenuOpen]     = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  const isOwner       = member.role === "owner";
  const canEdit       = canManage && !(isOwner && !canAssignOwner) && !isCurrentUser;
  const canRemoveMbr  = canRemoveProp && !isCurrentUser && !(isOwner && !canAssignOwner);

  async function handleRole(role: MemberRole) {
    setRoleLoading(true);
    await onRoleChange(member.id, role);
    setRoleLoading(false);
  }

  const joinedDisplay = member.joinedAt
    ? new Date(member.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : member.status === "invited"
    ? "Pending"
    : "—";

  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-[var(--color-border)]/50 last:border-0 hover:bg-[var(--color-canvas)]/50 transition-colors group">
      {/* Avatar */}
      <MemberAvatar name={member.name} avatarUrl={member.avatarUrl} />

      {/* Name + email */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-semibold text-[var(--color-fg)] truncate">
            {member.name}
          </p>
          {isCurrentUser && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--color-accent-subtle)] text-[var(--color-accent-fg)] border border-[var(--color-accent-subtle)]">
              You
            </span>
          )}
        </div>
        <p className="text-[11px] text-[var(--color-fg-faint)] truncate mt-0.5">{member.email}</p>
      </div>

      {/* Role badge / selector */}
      <div className="w-28 flex-shrink-0">
        {canEdit && !roleLoading ? (
          <RoleDropdown
            value={member.role}
            onChange={(r) => { void handleRole(r); }}
            canAssignOwner={canAssignOwner}
          />
        ) : (
          <span className={cn(
            "inline-flex items-center px-2.5 py-1 rounded-lg border text-[11px] font-semibold",
            ROLE_COLORS[member.role],
          )}>
            {roleLoading ? <Loader2 size={10} className="animate-spin" /> : ROLE_UI_LABELS[member.role]}
          </span>
        )}
      </div>

      {/* Status */}
      <div className="w-20 flex-shrink-0">
        <span className={cn(
          "inline-flex items-center px-2.5 py-1 rounded-lg border text-[11px] font-semibold capitalize",
          STATUS_COLORS[member.status] ?? STATUS_COLORS.inactive,
        )}>
          {member.status}
        </span>
      </div>

      {/* Joined date */}
      <div className="w-28 flex-shrink-0 text-right">
        <p className="text-[11px] text-[var(--color-fg-faint)]">{joinedDisplay}</p>
      </div>

      {/* Actions menu */}
      <div className="w-8 flex-shrink-0 flex justify-center" ref={menuRef}>
        {canRemoveMbr && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] transition-all"
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-32 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg z-20 py-1">
                <button
                  onClick={() => { setMenuOpen(false); onRemove(member); }}
                  className="w-full px-3 py-2 text-left text-[12px] font-medium text-red-500 hover:bg-red-50 transition-colors"
                >
                  Remove member
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const { members, loading, refreshMembers, currentMember } = useTeam();
  const { role: callerRole, workspaceId } = useWorkspace();
  const { can } = usePermissions();

  const [showAdd,      setShowAdd]      = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [removeLoading,setRemoveLoading]= useState(false);
  const [toast,        setToast]        = useState<string | null>(null);

  // Fine-grained permission checks
  const canInvite      = can("members.invite");
  const canRemove      = can("members.remove");
  const canManageRoles = can("members.manage_roles");
  const canManage      = canInvite || canRemove || canManageRoles;
  const canAssignOwner = callerRole === "owner";

  // ── Role change ─────────────────────────────────────────────────────────────

  async function handleRoleChange(memberId: string, role: MemberRole) {
    try {
      const res = await fetch(`/api/team/${memberId}`, {
        method:      "PATCH",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({ role }),
      });
      const data = await res.json() as { error?: string };
      if (res.ok) {
        await refreshMembers();
        setToast("Role updated");
      } else {
        setToast(data.error ?? "Failed to update role");
      }
    } catch {
      setToast("Network error");
    }
  }

  // ── Remove member ───────────────────────────────────────────────────────────

  async function handleRemoveConfirm() {
    if (!removeTarget) return;
    setRemoveLoading(true);
    try {
      const res = await fetch(`/api/team/${removeTarget.id}`, {
        method:      "DELETE",
        credentials: "include",
      });
      const data = await res.json() as { error?: string };
      if (res.ok) {
        await refreshMembers();
        setToast(`${removeTarget.name} removed from workspace`);
        setRemoveTarget(null);
      } else {
        setToast(data.error ?? "Failed to remove member");
      }
    } catch {
      setToast("Network error");
    } finally {
      setRemoveLoading(false);
    }
  }

  // ── Counts ──────────────────────────────────────────────────────────────────

  const activeCount  = members.filter((m) => m.status === "active").length;
  const invitedCount = members.filter((m) => m.status === "invited").length;

  return (
    <>
      <AppToast msg={toast} onDone={() => setToast(null)} />

      <div className="flex flex-col flex-1">
        <TopBar
          title="Team"
          subtitle="Manage your workspace members"
          action={canInvite ? { label: "Add member", onClick: () => setShowAdd(true) } : undefined}
        />

        <div className="flex-1 p-6">
          <div className="max-w-4xl mx-auto space-y-5">

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total members", value: members.length, icon: Users },
                { label: "Active",        value: activeCount,    icon: Check },
                { label: "Pending",       value: invitedCount,   icon: Shield },
              ].map(({ label, value, icon: Icon }) => (
                <div
                  key={label}
                  className="bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-2xl px-4 py-3.5 flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-xl bg-[var(--color-accent-subtle)] flex items-center justify-center flex-shrink-0">
                    <Icon size={15} className="text-[var(--color-accent)]" />
                  </div>
                  <div>
                    <p className="text-[20px] font-bold text-[var(--color-fg)] leading-none">{value}</p>
                    <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Member table */}
            <div className="bg-[var(--color-canvas)] border border-[var(--color-border)]/80 rounded-2xl overflow-hidden">
              {/* Table header */}
              <div className="flex items-center gap-4 px-5 py-3 border-b border-[var(--color-border)]/60 bg-[var(--color-surface)]">
                <div className="w-9 flex-shrink-0" />
                <div className="flex-1 text-[10px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider">Member</div>
                <div className="w-28 flex-shrink-0 text-[10px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider">Role</div>
                <div className="w-20 flex-shrink-0 text-[10px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider">Status</div>
                <div className="w-28 flex-shrink-0 text-right text-[10px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider">Joined</div>
                <div className="w-8 flex-shrink-0" />
              </div>

              {/* Rows */}
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={20} className="animate-spin text-[var(--color-fg-faint)]" />
                </div>
              ) : members.length === 0 ? (
                <div className="flex flex-col items-center gap-2.5 py-14">
                  <div className="w-10 h-10 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-border)] flex items-center justify-center">
                    <Users size={16} className="text-[var(--color-fg-faint)]" />
                  </div>
                  <p className="text-[13px] font-medium text-[var(--color-fg-faint)]">No team members yet</p>
                  {canInvite && (
                    <button
                      onClick={() => setShowAdd(true)}
                      className="text-[12px] text-[var(--color-accent)] hover:underline font-medium"
                    >
                      Add your first member →
                    </button>
                  )}
                </div>
              ) : (
                members.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    canManage={canManageRoles}
                    canRemove={canRemove}
                    canAssignOwner={canAssignOwner}
                    isCurrentUser={m.id === currentMember?.id}
                    onRoleChange={handleRoleChange}
                    onRemove={setRemoveTarget}
                  />
                ))
              )}
            </div>

            {/* Invitations section */}
            <InvitationsSection
              workspaceId={workspaceId}
              canManage={canManage}
              onToast={setToast}
            />

            {/* Permission note for non-admins */}
            {!canManage && (
              <p className="text-[12px] text-[var(--color-fg-faint)] text-center">
                Only owners and admins can manage team members.
              </p>
            )}

          </div>
        </div>
      </div>

      {/* Add member modal */}
      {showAdd && (
        <AddMemberModal
          onClose={() => setShowAdd(false)}
          onAdded={() => { void refreshMembers(); setToast("Member added successfully"); }}
          canAssignOwner={canAssignOwner}
        />
      )}

      {/* Remove confirmation */}
      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
          <div className="w-full max-w-sm mx-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-5">
              <p className="text-[15px] font-semibold text-[var(--color-fg)]">Remove team member?</p>
              <p className="text-[13px] text-[var(--color-fg-muted)] mt-1.5 leading-relaxed">
                <span className="font-medium">{removeTarget.name}</span> will lose access to this workspace.
                This action can be undone by re-adding them.
              </p>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => setRemoveTarget(null)}
                disabled={removeLoading}
                className="flex-1 h-9 rounded-lg border border-[var(--color-border)] text-[13px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleRemoveConfirm(); }}
                disabled={removeLoading}
                className="flex-1 h-9 rounded-lg bg-red-500 hover:bg-red-400 text-white text-[13px] font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {removeLoading && <Loader2 size={13} className="animate-spin" />}
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
