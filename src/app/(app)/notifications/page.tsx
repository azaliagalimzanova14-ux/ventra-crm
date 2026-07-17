"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { TopBar } from "@/components/layout/top-bar";
import { getClients, getDeals, getTasks } from "@/lib/storage";
import {
  generateNotifications,
  getReadIds,
  markRead,
  markAllRead,
  PRIO_ORDER,
  type Notification,
  type NotifCategory,
  type NotifPriority,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";
import {
  Bell, CheckSquare, TrendingUp, Users, UserPlus,
  Sparkles, ArrowRight, CheckCheck, Check,
  InboxIcon,
} from "lucide-react";

// ─── Config ────────────────────────────────────────────────────────────────────

const KIND_COLOR: Record<string, string> = {
  danger:      "#ef4444",
  warning:     "#f59e0b",
  opportunity: "#8b5cf6",
  action:      "#3b82f6",
  ok:          "#10b981",
};

const PRIO_STYLE: Record<NotifPriority, string> = {
  urgent: "bg-red-100 text-red-700",
  high:   "bg-amber-100 text-amber-700",
  medium: "bg-blue-50 text-blue-600",
  low:    "bg-[var(--color-border)] text-[var(--color-fg-faint)]",
};

const PRIO_LABEL: Record<NotifPriority, string> = {
  urgent: "Urgent",
  high:   "High",
  medium: "Medium",
  low:    "Low",
};

const CAT_META: Record<NotifCategory, {
  icon:  React.ElementType;
  label: string;
  cls:   string;
}> = {
  task:   { icon: CheckSquare, label: "Task",   cls: "bg-blue-50 text-blue-600" },
  deal:   { icon: TrendingUp,  label: "Deal",   cls: "bg-violet-50 text-violet-700" },
  client: { icon: Users,       label: "Client", cls: "bg-emerald-50 text-emerald-700" },
  lead:   { icon: UserPlus,    label: "Lead",   cls: "bg-amber-50 text-amber-700" },
  ai:     { icon: Sparkles,    label: "AI Rec", cls: "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]" },
};

const FILTER_TABS: { id: NotifCategory | "all"; label: string; icon: React.ElementType }[] = [
  { id: "all",    label: "All",     icon: Bell       },
  { id: "task",   label: "Tasks",   icon: CheckSquare },
  { id: "deal",   label: "Deals",   icon: TrendingUp  },
  { id: "client", label: "Clients", icon: Users       },
  { id: "lead",   label: "Leads",   icon: UserPlus    },
  { id: "ai",     label: "AI",      icon: Sparkles    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (diff < 0)   return "Upcoming";
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7)   return `${diff}d ago`;
  if (diff < 30)  return `${Math.floor(diff / 7)}w ago`;
  return `${Math.floor(diff / 30)}mo ago`;
}

// ─── Notification Card ────────────────────────────────────────────────────────

function NotifCard({
  notif,
  readIds,
  onMarkRead,
}: {
  notif:      Notification;
  readIds:    Set<string>;
  onMarkRead: (id: string) => void;
}) {
  const isRead   = readIds.has(notif.id);
  const cat      = CAT_META[notif.category];
  const CatIcon  = cat.icon;

  // Kind → unread background (panel class per kind)
  const KIND_BG: Record<string, string> = {
    danger:      "bg-red-50 border-red-200",
    warning:     "bg-amber-50 border-amber-200",
    opportunity: "bg-violet-50 border-violet-200",
    action:      "bg-blue-50 border-blue-200",
    ok:          "bg-emerald-50 border-emerald-200",
  };

  return (
    <div
      className={cn(
        "relative flex gap-0 rounded-xl border overflow-hidden transition-colors",
        isRead
          ? "border-[var(--color-border)] bg-[var(--color-surface)]"
          : `${KIND_BG[notif.kind]} shadow-sm`,
      )}
    >
      {/* Kind left border */}
      <div
        className="w-1 flex-shrink-0 rounded-l-xl"
        style={{ backgroundColor: KIND_COLOR[notif.kind] }}
      />

      {/* Body */}
      <div className="flex-1 px-4 py-3.5 min-w-0">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Unread dot */}
            {!isRead && (
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: KIND_COLOR[notif.kind] }}
              />
            )}

            {/* Priority badge */}
            <span className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
              PRIO_STYLE[notif.priority],
            )}>
              {PRIO_LABEL[notif.priority]}
            </span>

            {/* Category badge */}
            <span className={cn(
              "flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
              cat.cls,
            )}>
              <CatIcon size={8} />
              {cat.label}
            </span>
          </div>

          {/* Time */}
          <span className="text-[11px] text-[var(--color-fg-faint)] flex-shrink-0 pt-0.5">
            {timeAgo(notif.createdAt)}
          </span>
        </div>

        {/* Title */}
        <p className={cn(
          "text-[13px] mt-2 leading-snug",
          isRead
            ? "font-medium text-[var(--color-fg-muted)]"
            : "font-semibold text-[var(--color-fg)]",
        )}>
          {notif.title}
        </p>

        {/* Body */}
        <p className="text-[12px] text-[var(--color-fg-faint)] mt-0.5 leading-relaxed">
          {notif.body}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-4 mt-3">
          <Link
            href={notif.href}
            onClick={() => onMarkRead(notif.id)}
            className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-accent)] hover:underline transition-colors"
          >
            View <ArrowRight size={10} />
          </Link>
          {!isRead && (
            <button
              onClick={() => onMarkRead(notif.id)}
              className="flex items-center gap-1 text-[11px] text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] transition-colors"
            >
              <Check size={10} /> Mark read
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyNotifs({
  allClear,
  filter,
}: {
  allClear: boolean;
  filter:   NotifCategory | "all";
}) {
  const label = filter === "all"
    ? "notifications"
    : `${CAT_META[filter].label.toLowerCase()} notifications`;

  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      {allClear ? (
        <>
          <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
            <CheckCheck size={20} className="text-emerald-600" />
          </div>
          <p className="text-[14px] font-semibold text-[var(--color-fg)]">You&apos;re all caught up</p>
          <p className="text-[12px] text-[var(--color-fg-faint)]">No unread alerts. Ventra is watching your pipeline.</p>
        </>
      ) : (
        <>
          <InboxIcon size={24} className="text-[var(--color-fg-faint)]" strokeWidth={1.5} />
          <p className="text-[13px] font-medium text-[var(--color-fg-muted)]">No {label}</p>
          <p className="text-[12px] text-[var(--color-fg-faint)]">Alerts will appear here as your CRM data changes.</p>
        </>
      )}
    </div>
  );
}

// ─── Priority Section Header ──────────────────────────────────────────────────

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-1 mb-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-fg-faint)]">
        {label}
      </span>
      <span className="text-[10px] font-semibold text-[var(--color-fg-faint)] bg-[var(--color-canvas)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-md tabular-nums">
        {count}
      </span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds,       setReadIds]       = useState<Set<string>>(new Set());
  const [filter,        setFilter]        = useState<NotifCategory | "all">("all");

  // Load and generate
  useEffect(() => {
    const clients = getClients();
    const tasks   = getTasks();
    const deals   = getDeals();
    const all     = generateNotifications(clients, tasks, deals);
    setNotifications(all);
    setReadIds(getReadIds());
  }, []);

  // Mark single notification read
  const handleMarkRead = useCallback((id: string) => {
    markRead(id);
    setReadIds((prev) => new Set([...prev, id]));
  }, []);

  // Mark all visible as read
  const handleMarkAllRead = useCallback(() => {
    const ids = notifications.map((n) => n.id);
    markAllRead(ids);
    setReadIds(new Set(ids));
  }, [notifications]);

  // Filtered list (category filter)
  const filtered = useMemo(() => {
    const base =
      filter === "all"
        ? notifications
        : notifications.filter((n) => n.category === filter);
    return base.sort((a, b) => {
      const aRead = readIds.has(a.id);
      const bRead = readIds.has(b.id);
      if (aRead !== bRead) return aRead ? 1 : -1;
      return PRIO_ORDER.indexOf(a.priority) - PRIO_ORDER.indexOf(b.priority);
    });
  }, [notifications, filter, readIds]);

  // Category counts (unread only)
  const counts = useMemo(() => {
    const unread = notifications.filter((n) => !readIds.has(n.id));
    return {
      all:    unread.length,
      task:   unread.filter((n) => n.category === "task").length,
      deal:   unread.filter((n) => n.category === "deal").length,
      client: unread.filter((n) => n.category === "client").length,
      lead:   unread.filter((n) => n.category === "lead").length,
      ai:     unread.filter((n) => n.category === "ai").length,
    };
  }, [notifications, readIds]);

  const totalUnread = counts.all;

  // Unread vs read split for current filter
  const unreadItems = filtered.filter((n) => !readIds.has(n.id));
  const readItems   = filtered.filter((n) => readIds.has(n.id));

  const allClear = filtered.length === 0 || (unreadItems.length === 0 && filter === "all");

  return (
    <div className="flex flex-col min-h-screen bg-[var(--color-canvas)]">
      <TopBar
        title="Notifications"
        subtitle="Everything that needs your attention, right now"
      />

      <div className="flex-1 px-8 py-6 max-w-3xl w-full mx-auto">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-accent-subtle)] flex items-center justify-center">
              <Bell size={16} className="text-[var(--color-accent)]" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--color-fg)]">Notification Center</h2>
              <p className="text-[12px] text-[var(--color-fg-faint)]">
                {totalUnread > 0
                  ? `${totalUnread} unread alert${totalUnread !== 1 ? "s" : ""}`
                  : "All caught up"}
              </p>
            </div>
          </div>

          {totalUnread > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] transition-colors"
            >
              <CheckCheck size={13} />
              Mark all read
            </button>
          )}
        </div>

        {/* ── Filter tabs ── */}
        <div className="flex items-center gap-1 mb-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-1 overflow-x-auto">
          {FILTER_TABS.map(({ id, label, icon: Icon }) => {
            const count = counts[id];
            const active = filter === id;
            return (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap flex-shrink-0",
                  active
                    ? "bg-[var(--color-accent)] text-white shadow-sm"
                    : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)]",
                )}
              >
                <Icon size={11} />
                {label}
                {count > 0 && (
                  <span className={cn(
                    "text-[9px] font-bold px-1 rounded-full min-w-[14px] text-center",
                    active
                      ? "bg-white/20 text-white"
                      : "bg-[var(--color-accent)] text-white",
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Notification list ── */}
        {filtered.length === 0 ? (
          <EmptyNotifs allClear={allClear} filter={filter} />
        ) : (
          <div className="space-y-6">

            {/* Unread section */}
            {unreadItems.length > 0 && (
              <div>
                <SectionLabel label="Unread" count={unreadItems.length} />
                <div className="space-y-2">
                  {unreadItems.map((n) => (
                    <NotifCard
                      key={n.id}
                      notif={n}
                      readIds={readIds}
                      onMarkRead={handleMarkRead}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Read section */}
            {readItems.length > 0 && (
              <div>
                <SectionLabel label="Read" count={readItems.length} />
                <div className="space-y-2 opacity-60">
                  {readItems.map((n) => (
                    <NotifCard
                      key={n.id}
                      notif={n}
                      readIds={readIds}
                      onMarkRead={handleMarkRead}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Caught-up state when unread is empty but read items exist */}
            {unreadItems.length === 0 && readItems.length > 0 && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 mb-2">
                <CheckCheck size={14} className="text-emerald-600 flex-shrink-0" />
                <p className="text-[12px] font-medium text-emerald-700">
                  You&apos;re caught up on{" "}
                  {filter === "all" ? "all alerts" : `${CAT_META[filter as NotifCategory].label.toLowerCase()} alerts`}.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Legend ── */}
        <div className="mt-10 pt-6 border-t border-[var(--color-border)]">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-fg-faint)] mb-3">
            Insight types
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(
              [
                { kind: "danger",      desc: "Overdue / critical" },
                { kind: "warning",     desc: "At risk / follow-up needed" },
                { kind: "opportunity", desc: "Revenue or growth opportunity" },
                { kind: "action",      desc: "Immediate action recommended" },
              ] as const
            ).map(({ kind, desc }) => (
              <div key={kind} className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: KIND_COLOR[kind] }}
                />
                <span className="text-[11px] text-[var(--color-fg-faint)]">{desc}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
