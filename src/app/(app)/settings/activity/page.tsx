"use client";

/**
 * /settings/activity — Workspace Activity Log
 *
 * Displays a paginated audit trail of workspace events.
 * Requires activity.view permission (enforced by API + by RequirePermission here).
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter }           from "next/navigation";
import { TopBar }              from "@/components/layout/top-bar";
import { RequirePermission }   from "@/components/auth/require-permission";
import { usePermissions }      from "@/context/permission-context";
import { cn }                  from "@/lib/utils";
import {
  Loader2, ChevronLeft, ChevronRight,
  User, Building2, Users, FileText, Briefcase,
  CheckSquare, Mail, Shield, Activity,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActivityItem {
  id:         string;
  type:       string;
  label:      string;
  entityType: string | null;
  entityId:   string | null;
  entityName: string | null;
  detail:     string | null;
  metadata:   Record<string, unknown>;
  createdAt:  string;
  actor: {
    id:        string;
    name:      string;
    email:     string;
    avatarUrl: string | null;
  } | null;
}

interface ActivityResponse {
  items:  ActivityItem[];
  total:  number;
  page:   number;
  pages:  number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ENTITY_ICONS: Record<string, React.ElementType> = {
  client:     Users,
  deal:       Briefcase,
  task:       CheckSquare,
  project:    FileText,
  member:     User,
  workspace:  Building2,
  invitation: Mail,
};

const TYPE_COLORS: Record<string, string> = {
  // member events
  member_invited:             "bg-blue-50   text-blue-700   border-blue-200",
  member_joined:              "bg-emerald-50 text-emerald-700 border-emerald-200",
  member_removed:             "bg-red-50    text-red-700    border-red-200",
  role_changed:               "bg-purple-50 text-purple-700 border-purple-200",
  invite_resent:              "bg-sky-50    text-sky-700    border-sky-200",
  invitation_cancelled:       "bg-slate-50  text-slate-600  border-slate-200",
  // workspace events
  workspace_created:          "bg-emerald-50 text-emerald-700 border-emerald-200",
  workspace_updated:          "bg-amber-50  text-amber-700  border-amber-200",
  workspace_settings_changed: "bg-amber-50  text-amber-700  border-amber-200",
};

function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? "bg-slate-50 text-slate-600 border-slate-200";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function MetaDetail({ item }: { item: ActivityItem }) {
  const m = item.metadata;
  if (item.type === "role_changed") {
    return (
      <span className="text-[11px] text-[var(--color-fg-faint)]">
        {String(m.from ?? "")} → {String(m.to ?? "")}
      </span>
    );
  }
  if (item.type === "workspace_settings_changed") {
    const changed = Array.isArray(m.changed) ? (m.changed as string[]).join(", ") : "";
    if (changed) return <span className="text-[11px] text-[var(--color-fg-faint)]">Changed: {changed}</span>;
  }
  if (item.detail) {
    return <span className="text-[11px] text-[var(--color-fg-faint)]">{item.detail}</span>;
  }
  if (item.entityName) {
    return <span className="text-[11px] text-[var(--color-fg-faint)] truncate max-w-[160px]">{item.entityName}</span>;
  }
  return null;
}

function ActorAvatar({ actor }: { actor: ActivityItem["actor"] }) {
  if (!actor) {
    return (
      <div className="w-8 h-8 rounded-full bg-[var(--color-border)] flex items-center justify-center flex-shrink-0">
        <Shield size={13} className="text-[var(--color-fg-faint)]" />
      </div>
    );
  }
  if (actor.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={actor.avatarUrl} alt={actor.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
    );
  }
  const initials = actor.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  return (
    <div className="w-8 h-8 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
      {initials}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function ActivityRow({ item }: { item: ActivityItem }) {
  const EntityIcon = ENTITY_ICONS[item.entityType ?? ""] ?? Activity;

  return (
    <div className="flex items-start gap-3 px-5 py-3.5 border-b border-[var(--color-border)]/50 last:border-0 hover:bg-[var(--color-canvas)]/50 transition-colors">
      {/* Actor avatar */}
      <ActorAvatar actor={item.actor} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[13px] font-semibold text-[var(--color-fg)] truncate">
            {item.actor?.name ?? "System"}
          </p>
          <span className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium flex-shrink-0",
            typeColor(item.type),
          )}>
            <EntityIcon size={10} />
            {item.label}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {item.actor?.email && (
            <p className="text-[11px] text-[var(--color-fg-faint)] truncate">{item.actor.email}</p>
          )}
          {item.actor?.email && <span className="text-[var(--color-border)] text-[11px]">·</span>}
          <MetaDetail item={item} />
        </div>
      </div>

      {/* Timestamp */}
      <p className="text-[11px] text-[var(--color-fg-faint)] flex-shrink-0 mt-0.5" title={item.createdAt}>
        {relativeTime(item.createdAt)}
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function ActivityLogContent() {
  const [data,    setData]    = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/activity?page=${p}&limit=20`, { credentials: "include" });
      const json = await res.json() as ActivityResponse & { error?: string };
      if (!res.ok) { setError(json.error ?? "Failed to load activity"); }
      else { setData(json); }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(page); }, [load, page]);

  function goPage(p: number) {
    setPage(p);
  }

  return (
    <div className="flex-1 p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Summary card */}
        {data && (
          <div className="flex items-center gap-3 px-4 py-3 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-2xl">
            <Activity size={14} className="text-[var(--color-fg-faint)]" />
            <p className="text-[12px] text-[var(--color-fg-muted)]">
              <span className="font-semibold text-[var(--color-fg)]">{data.total}</span> total events
              {data.pages > 1 && (
                <> — page <span className="font-semibold">{data.page}</span> of <span className="font-semibold">{data.pages}</span></>
              )}
            </p>
          </div>
        )}

        {/* Event list */}
        <div className="bg-[var(--color-canvas)] border border-[var(--color-border)]/80 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={22} className="animate-spin text-[var(--color-fg-faint)]" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center px-6">
              <p className="text-[13px] text-red-500">{error}</p>
              <button
                onClick={() => { void load(page); }}
                className="text-[12px] text-[var(--color-accent)] hover:underline font-medium"
              >
                Try again
              </button>
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2.5 py-14">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-border)] flex items-center justify-center">
                <Activity size={16} className="text-[var(--color-fg-faint)]" />
              </div>
              <p className="text-[13px] font-medium text-[var(--color-fg-faint)]">No activity yet</p>
              <p className="text-[11px] text-[var(--color-fg-faint)]">Events will appear here as your team uses Ventra.</p>
            </div>
          ) : (
            data.items.map((item) => <ActivityRow key={item.id} item={item} />)
          )}
        </div>

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between px-1">
            <button
              onClick={() => goPage(page - 1)}
              disabled={page <= 1 || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[12px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent-subtle)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={13} /> Previous
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(data.pages, 7) }, (_, i) => {
                const p = i + 1;
                return (
                  <button
                    key={p}
                    onClick={() => goPage(p)}
                    disabled={loading}
                    className={cn(
                      "w-7 h-7 rounded-lg text-[12px] font-medium transition-colors",
                      p === page
                        ? "bg-[var(--color-accent)] text-white"
                        : "text-[var(--color-fg-muted)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-fg)]",
                    )}
                  >
                    {p}
                  </button>
                );
              })}
              {data.pages > 7 && <span className="text-[11px] text-[var(--color-fg-faint)] px-1">…{data.pages}</span>}
            </div>

            <button
              onClick={() => goPage(page + 1)}
              disabled={page >= data.pages || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[12px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent-subtle)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight size={13} />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default function ActivityPage() {
  const { loading } = usePermissions();
  const router      = useRouter();

  return (
    <RequirePermission
      permission="activity.view"
      fallback={
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center space-y-2">
            <Shield size={28} className="text-[var(--color-fg-faint)] mx-auto" />
            <p className="text-[13px] font-medium text-[var(--color-fg-muted)]">Access restricted</p>
            <p className="text-[12px] text-[var(--color-fg-faint)]">
              The activity log is available to owners, admins, and managers.
            </p>
            <button
              onClick={() => router.replace("/dashboard")}
              className="text-[12px] text-[var(--color-accent)] hover:underline font-medium"
            >
              Go to dashboard →
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col flex-1">
        <TopBar
          title="Activity Log"
          subtitle="Audit trail of workspace events"
        />
        {!loading && <ActivityLogContent />}
      </div>
    </RequirePermission>
  );
}
