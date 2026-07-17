"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { TopBar } from "@/components/layout/top-bar";
import { getClients } from "@/lib/storage";
import { getTasks }   from "@/lib/storage";
import { getDeals }   from "@/lib/storage";
import { getTeamMembers, ROLE_META } from "@/lib/team";
import type { TeamMember } from "@/lib/team";
import type { Client, Task, Deal } from "@/lib/types";
import { normalizeClient } from "@/lib/normalize";
import {
  Users, CheckSquare, TrendingUp, Clock,
  AlertTriangle, MessageSquare, ChevronRight,
  ArrowUpRight, Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function daysAgo(d: string) {
  if (!d) return Infinity;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

const now = new Date();

function isOverdue(task: Task) {
  return (
    task.status !== "done" &&
    task.status !== "cancelled" &&
    !!task.dueDate &&
    new Date(task.dueDate) < now
  );
}

// ── Per-manager stats ──────────────────────────────────────────────────────────

interface ManagerStats {
  member:             TeamMember;
  clients:            Client[];
  openTasks:          Task[];
  overdueTasks:       Task[];
  activeDeals:        Deal[];
  wonDeals:           Deal[];
  dealValue:          number;
  /** Clients where lastContact within 7 days */
  activeConversations: number;
  /** Average days since last contact across assigned clients; null if no clients */
  avgResponseDays:    number | null;
}

function buildStats(
  members:  TeamMember[],
  clients:  Client[],
  tasks:    Task[],
  deals:    Deal[],
): ManagerStats[] {
  return members.map((m) => {
    const mClients    = clients.filter((c) => c.assignedId === m.id);
    const mTasks      = tasks.filter(
      (t) => t.assignee?.toLowerCase() === m.name.toLowerCase() &&
             t.status !== "done" && t.status !== "cancelled",
    );
    const mOverdue    = mTasks.filter(isOverdue);
    const mDeals      = deals.filter(
      (d) => d.owner?.toLowerCase() === m.name.toLowerCase(),
    );
    const mActive     = mDeals.filter(
      (d) => d.stage !== "closed_won" && d.stage !== "closed_lost",
    );
    const mWon        = mDeals.filter((d) => d.stage === "closed_won");
    const mValue      = mActive.reduce((s, d) => s + d.value, 0);

    const activeConvs = mClients.filter(
      (c) => c.lastContact && daysAgo(c.lastContact) <= 7,
    ).length;

    const contactedClients = mClients.filter((c) => c.lastContact);
    const avgResponseDays  = contactedClients.length
      ? Math.round(
          contactedClients.reduce((s, c) => s + daysAgo(c.lastContact), 0) /
          contactedClients.length,
        )
      : null;

    return {
      member:             m,
      clients:            mClients,
      openTasks:          mTasks,
      overdueTasks:       mOverdue,
      activeDeals:        mActive,
      wonDeals:           mWon,
      dealValue:          mValue,
      activeConversations: activeConvs,
      avgResponseDays,
    };
  });
}

// ── Design primitives ──────────────────────────────────────────────────────────

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden",
      className,
    )}>
      {children}
    </div>
  );
}

function PanelHead({
  title, count, href, action,
}: {
  title: string; count?: number; href?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border)]">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-[var(--color-fg)]">{title}</span>
        {count !== undefined && (
          <span className="text-[11px] font-semibold text-[var(--color-fg-faint)] bg-[var(--color-canvas)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-md tabular-nums">
            {count}
          </span>
        )}
      </div>
      {action ?? (href && (
        <Link href={href} className="text-[11px] text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] flex items-center gap-0.5 transition-colors">
          View all <ChevronRight size={11} />
        </Link>
      ))}
    </div>
  );
}

function Empty({ icon: Icon, text, sub }: { icon: React.ElementType; text: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-8 px-4 text-center">
      <Icon size={20} className="text-[var(--color-fg-faint)]" strokeWidth={1.5} />
      <p className="text-[12px] font-medium text-[var(--color-fg-muted)]">{text}</p>
      {sub && <p className="text-[11px] text-[var(--color-fg-faint)]">{sub}</p>}
    </div>
  );
}

function MemberAvatar({ member, size = "md" }: { member: TeamMember; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-7 h-7 text-[10px]" : "w-9 h-9 text-[11px]";
  const role = ROLE_META[member.role];
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-bold text-white flex-shrink-0",
        dim, role.bg.replace("bg-", "bg-").replace("/10", ""),
      )}
      style={{ background: memberColor(member.role) }}
      title={member.name}
    >
      {member.avatar}
    </div>
  );
}

function memberColor(role: TeamMember["role"]) {
  return ({
    owner:         "#6366f1",
    admin:         "#8b5cf6",
    team_lead:     "#3b82f6",
    sales_manager: "#10b981",
  })[role] ?? "#6366f1";
}

// ── Manager filter bar ────────────────────────────────────────────────────────

function ManagerFilter({
  members,
  active,
  onChange,
}: {
  members:  TeamMember[];
  active:   string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => onChange(null)}
        className={cn(
          "px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors",
          active === null
            ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
            : "bg-[var(--color-canvas)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
        )}
      >
        All managers
      </button>
      {members.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(active === m.id ? null : m.id)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors",
            active === m.id
              ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
              : "bg-[var(--color-canvas)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
          )}
        >
          <span
            className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0"
            style={{ background: active === m.id ? "rgba(255,255,255,0.3)" : memberColor(m.role) }}
          >
            {m.avatar}
          </span>
          {m.name.split(" ")[0]}
        </button>
      ))}
    </div>
  );
}

// ── Workload table ────────────────────────────────────────────────────────────

function WorkloadTable({ stats }: { stats: ManagerStats[] }) {
  if (stats.length === 0) {
    return <Empty icon={Users} text="No team members" sub="Invite teammates in Team Settings" />;
  }

  const cols = [
    { label: "Manager",     w: "flex-1 min-w-0" },
    { label: "Clients",     w: "w-16 text-center" },
    { label: "Open tasks",  w: "w-20 text-center" },
    { label: "Overdue",     w: "w-16 text-center" },
    { label: "Active deals",w: "w-24 text-center" },
    { label: "Deal value",  w: "w-24 text-right" },
    { label: "Convos",      w: "w-16 text-center" },
    { label: "Avg response",w: "w-28 text-right" },
  ];

  return (
    <div className="overflow-x-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-[var(--color-border)] bg-[var(--color-canvas)]">
        {cols.map(({ label, w }) => (
          <p key={label} className={cn("text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)]", w)}>
            {label}
          </p>
        ))}
      </div>

      {/* Rows */}
      {stats.map(({ member, clients, openTasks, overdueTasks, activeDeals, dealValue, activeConversations, avgResponseDays }) => {
        const responseLabel = avgResponseDays === null
          ? "—"
          : avgResponseDays === 0 ? "today"
          : avgResponseDays === 1 ? "1d"
          : `${avgResponseDays}d`;
        const responseColor = avgResponseDays === null
          ? "text-[var(--color-fg-faint)]"
          : avgResponseDays >= 14 ? "text-red-500 font-semibold"
          : avgResponseDays >= 7  ? "text-amber-600 font-semibold"
          : "text-emerald-600 font-semibold";

        return (
          <div key={member.id} className="flex items-center gap-3 px-5 py-3 border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-canvas)] transition-colors">
            {/* Manager */}
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <MemberAvatar member={member} size="sm" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[var(--color-fg)] truncate">{member.name}</p>
                <p className="text-[10px] text-[var(--color-fg-faint)]">{ROLE_META[member.role].label}</p>
              </div>
            </div>

            {/* Clients */}
            <p className="w-16 text-center text-[13px] font-semibold text-[var(--color-fg)] tabular-nums">
              {clients.length}
            </p>

            {/* Open tasks */}
            <p className="w-20 text-center text-[13px] font-semibold text-[var(--color-fg)] tabular-nums">
              {openTasks.length}
            </p>

            {/* Overdue */}
            <p className={cn("w-16 text-center text-[13px] tabular-nums font-semibold",
              overdueTasks.length > 0 ? "text-red-500" : "text-[var(--color-fg-faint)]"
            )}>
              {overdueTasks.length > 0 ? overdueTasks.length : "—"}
            </p>

            {/* Active deals */}
            <p className="w-24 text-center text-[13px] font-semibold text-[var(--color-fg)] tabular-nums">
              {activeDeals.length}
            </p>

            {/* Deal value */}
            <p className="w-24 text-right text-[13px] font-semibold text-emerald-600 tabular-nums">
              {dealValue > 0 ? fmt$(dealValue) : "—"}
            </p>

            {/* Active conversations */}
            <p className="w-16 text-center text-[13px] font-semibold text-[var(--color-fg)] tabular-nums">
              {activeConversations > 0 ? activeConversations : "—"}
            </p>

            {/* Avg response */}
            <p className={cn("w-28 text-right text-[13px] tabular-nums", responseColor)}>
              {responseLabel}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── Tasks by manager chart ────────────────────────────────────────────────────

const BAR_COLORS = ["#6366f1", "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

function TasksBarChart({ stats }: { stats: ManagerStats[] }) {
  const data = stats.map((s) => ({
    name:     s.member.name.split(" ")[0],
    open:     s.openTasks.length,
    overdue:  s.overdueTasks.length,
  }));

  const hasData = data.some((d) => d.open > 0);
  if (!hasData) {
    return <Empty icon={CheckSquare} text="No open tasks" sub="All tasks are on track" />;
  }

  return (
    <div className="p-5">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "var(--color-fg-faint)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "var(--color-fg-faint)", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-white border border-[var(--color-border)] rounded-xl px-3 py-2 shadow-lg text-[12px]">
                  <p className="text-[var(--color-fg-faint)] mb-1 font-semibold">{label}</p>
                  {payload.map((p) => (
                    <p key={p.dataKey as string} className="font-semibold" style={{ color: p.color as string }}>
                      {p.dataKey === "overdue" ? "Overdue" : "Open"}: {p.value as number}
                    </p>
                  ))}
                </div>
              );
            }}
          />
          <Bar dataKey="open" name="Open" radius={[3, 3, 0, 0]} maxBarSize={40}>
            {data.map((_, i) => (
              <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} fillOpacity={0.85} />
            ))}
          </Bar>
          <Bar dataKey="overdue" name="Overdue" radius={[3, 3, 0, 0]} fill="#ef4444" fillOpacity={0.7} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 justify-center mt-2">
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-fg-muted)]">
          <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" /> Open tasks
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-fg-muted)]">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> Overdue
        </span>
      </div>
    </div>
  );
}

// ── Deals by manager ──────────────────────────────────────────────────────────

function DealsByManager({ stats }: { stats: ManagerStats[] }) {
  const withDeals = stats.filter((s) => s.activeDeals.length > 0 || s.wonDeals.length > 0);

  if (withDeals.length === 0) {
    return <Empty icon={TrendingUp} text="No deals assigned" sub="Assign deals to team members via the pipeline" />;
  }

  return (
    <div className="divide-y divide-[var(--color-border)]">
      {stats.map(({ member, activeDeals, wonDeals, dealValue }) => {
        const totalDeals = activeDeals.length + wonDeals.length;
        if (totalDeals === 0) return null;

        const winRate = totalDeals > 0 ? Math.round((wonDeals.length / totalDeals) * 100) : 0;

        // Stage breakdown for active deals
        const byStage = activeDeals.reduce<Record<string, number>>((acc, d) => {
          acc[d.stage] = (acc[d.stage] ?? 0) + 1;
          return acc;
        }, {});

        return (
          <div key={member.id} className="px-5 py-4">
            <div className="flex items-center gap-2.5 mb-3">
              <MemberAvatar member={member} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[var(--color-fg)]">{member.name}</p>
              </div>
              <div className="flex items-center gap-4 text-right flex-shrink-0">
                <div>
                  <p className="text-[16px] font-bold text-emerald-600 tabular-nums leading-none">{fmt$(dealValue)}</p>
                  <p className="text-[10px] text-[var(--color-fg-faint)] mt-0.5">pipeline</p>
                </div>
                <div>
                  <p className="text-[16px] font-bold text-[var(--color-fg)] tabular-nums leading-none">{activeDeals.length}</p>
                  <p className="text-[10px] text-[var(--color-fg-faint)] mt-0.5">active</p>
                </div>
                <div>
                  <p className="text-[16px] font-bold text-violet-600 tabular-nums leading-none">{winRate}%</p>
                  <p className="text-[10px] text-[var(--color-fg-faint)] mt-0.5">win rate</p>
                </div>
              </div>
            </div>

            {/* Stage pills */}
            {Object.keys(byStage).length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {Object.entries(byStage).map(([stage, count]) => (
                  <span key={stage} className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                    stage === "negotiation" ? "bg-amber-50 text-amber-700 border-amber-200" :
                    stage === "proposal"    ? "bg-violet-50 text-violet-700 border-violet-200" :
                    stage === "qualified"   ? "bg-blue-50 text-blue-700 border-blue-200" :
                                             "bg-gray-50 text-gray-600 border-gray-200"
                  )}>
                    {count} {stage.replace("_", " ")}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Overdue tasks list ────────────────────────────────────────────────────────

function OverdueList({ stats }: { stats: ManagerStats[] }) {
  const all = stats.flatMap((s) =>
    s.overdueTasks.map((t) => ({ task: t, member: s.member }))
  );

  // Sort by most overdue first
  all.sort((a, b) =>
    new Date(a.task.dueDate).getTime() - new Date(b.task.dueDate).getTime()
  );

  if (all.length === 0) {
    return <Empty icon={CheckSquare} text="No overdue tasks" sub="All tasks are on track" />;
  }

  const PRIO_DOT: Record<string, string> = {
    urgent: "bg-red-500", high: "bg-amber-500",
    medium: "bg-indigo-400", low: "bg-gray-300",
  };

  return (
    <div className="divide-y divide-[var(--color-border)]">
      {all.slice(0, 10).map(({ task, member }) => {
        const daysLate = daysAgo(task.dueDate);
        return (
          <Link key={task.id} href="/tasks"
            className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-canvas)] transition-colors group">
            <span className={cn("w-2 h-2 rounded-full flex-shrink-0", PRIO_DOT[task.priority] ?? "bg-gray-300")} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-red-600 truncate">{task.title}</p>
              {task.projectName && (
                <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5 truncate">{task.projectName}</p>
              )}
            </div>
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <MemberAvatar member={member} size="sm" />
              <span className="text-[10px] font-semibold text-red-500 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">
                {daysLate === 0 ? "today" : `${daysLate}d late`}
              </span>
            </div>
          </Link>
        );
      })}
      {all.length > 10 && (
        <div className="px-5 py-2.5">
          <Link href="/tasks" className="text-[11px] text-[var(--color-accent)] hover:underline flex items-center gap-0.5">
            View {all.length - 10} more <ArrowUpRight size={11} />
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Active conversations ──────────────────────────────────────────────────────

function ActiveConversations({ stats }: { stats: ManagerStats[] }) {
  const rows = stats
    .map((s) => ({
      member:   s.member,
      convos:   s.activeConversations,
      clients:  s.clients.length,
    }))
    .filter((r) => r.clients > 0)
    .sort((a, b) => b.convos - a.convos);

  if (rows.length === 0) {
    return <Empty icon={Inbox} text="No clients assigned" sub="Assign clients to team members to track conversations" />;
  }

  const maxConvos = Math.max(...rows.map((r) => r.convos), 1);

  return (
    <div className="divide-y divide-[var(--color-border)]">
      {rows.map(({ member, convos, clients }) => {
        const pct = Math.round((convos / maxConvos) * 100);
        return (
          <div key={member.id} className="flex items-center gap-3 px-5 py-3">
            <MemberAvatar member={member} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[12px] font-semibold text-[var(--color-fg)]">{member.name}</p>
                <span className="text-[11px] text-[var(--color-fg-faint)] tabular-nums">
                  {convos} / {clients} clients
                </span>
              </div>
              <div className="h-1.5 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: memberColor(member.role),
                    opacity: 0.8,
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
      <div className="px-5 py-2.5">
        <p className="text-[10px] text-[var(--color-fg-faint)]">
          Active conversation = client contacted within last 7 days
        </p>
      </div>
    </div>
  );
}

// ── Response time panel ───────────────────────────────────────────────────────

function ResponseTimePanel({ stats }: { stats: ManagerStats[] }) {
  const rows = stats
    .filter((s) => s.clients.length > 0)
    .sort((a, b) => (a.avgResponseDays ?? Infinity) - (b.avgResponseDays ?? Infinity));

  if (rows.length === 0) {
    return <Empty icon={Clock} text="No data" sub="Assign clients to team members to track response time" />;
  }

  return (
    <div className="divide-y divide-[var(--color-border)]">
      {rows.map(({ member, avgResponseDays, clients }) => {
        const label = avgResponseDays === null
          ? "No data"
          : avgResponseDays === 0 ? "Today"
          : avgResponseDays === 1 ? "1 day"
          : `${avgResponseDays} days`;

        const color = avgResponseDays === null
          ? "text-[var(--color-fg-faint)]"
          : avgResponseDays >= 14 ? "text-red-500"
          : avgResponseDays >= 7  ? "text-amber-600"
          : "text-emerald-600";

        const barPct = avgResponseDays === null ? 0 : Math.min(100, Math.round((avgResponseDays / 30) * 100));
        const barColor = avgResponseDays === null
          ? "var(--color-border)"
          : avgResponseDays >= 14 ? "#ef4444"
          : avgResponseDays >= 7  ? "#f59e0b"
          : "#10b981";

        return (
          <div key={member.id} className="px-5 py-3">
            <div className="flex items-center gap-2.5 mb-2">
              <MemberAvatar member={member} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-[var(--color-fg)]">{member.name}</p>
                <p className="text-[10px] text-[var(--color-fg-faint)]">{clients.length} client{clients.length !== 1 ? "s" : ""}</p>
              </div>
              <p className={cn("text-[15px] font-bold tabular-nums flex-shrink-0", color)}>
                {label}
              </p>
            </div>
            <div className="h-1.5 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${barPct}%`, background: barColor }}
              />
            </div>
          </div>
        );
      })}
      <div className="px-5 py-2.5">
        <p className="text-[10px] text-[var(--color-fg-faint)]">
          Average days since last contact across assigned clients
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TeamDashboardPage() {
  const [members,  setMembers]  = useState<TeamMember[]>([]);
  const [clients,  setClients]  = useState<Client[]>([]);
  const [tasks,    setTasks]    = useState<Task[]>([]);
  const [deals,    setDeals]    = useState<Deal[]>([]);
  const [filterMgr, setFilterMgr] = useState<string | null>(null);

  useEffect(() => {
    setMembers(getTeamMembers().filter((m) => m.status !== "inactive"));
    setClients(getClients().map(normalizeClient));
    setTasks(getTasks());
    setDeals(getDeals());
  }, []);

  const allStats = useMemo(
    () => buildStats(members, clients, tasks, deals),
    [members, clients, tasks, deals],
  );

  const stats = useMemo(
    () => filterMgr ? allStats.filter((s) => s.member.id === filterMgr) : allStats,
    [allStats, filterMgr],
  );

  // ── Global KPIs (respect manager filter) ──────────────────────────────────
  const totalOpenTasks     = stats.reduce((s, m) => s + m.openTasks.length, 0);
  const totalOverdue       = stats.reduce((s, m) => s + m.overdueTasks.length, 0);
  const totalActiveDeals   = stats.reduce((s, m) => s + m.activeDeals.length, 0);
  const totalDealValue     = stats.reduce((s, m) => s + m.dealValue, 0);
  const totalConvos        = stats.reduce((s, m) => s + m.activeConversations, 0);
  const totalClients       = stats.reduce((s, m) => s + m.clients.length, 0);
  const unassignedClients  = filterMgr ? 0 : clients.filter((c) => !c.assignedId).length;

  const kpis = [
    {
      icon: CheckSquare, label: "Open tasks",    value: totalOpenTasks,
      display: String(totalOpenTasks), color: "text-indigo-600", bg: "bg-indigo-50",
      href: "/tasks",
    },
    {
      icon: AlertTriangle, label: "Overdue",     value: totalOverdue,
      display: String(totalOverdue), color: totalOverdue > 0 ? "text-red-600" : "text-[var(--color-fg-faint)]",
      bg: totalOverdue > 0 ? "bg-red-50" : "bg-[var(--color-canvas)]",
      href: "/tasks",
    },
    {
      icon: TrendingUp, label: "Active deals",   value: totalActiveDeals,
      display: String(totalActiveDeals), color: "text-emerald-600", bg: "bg-emerald-50",
      href: "/pipeline",
    },
    {
      icon: MessageSquare, label: "Active convos", value: totalConvos,
      display: String(totalConvos), color: "text-blue-600", bg: "bg-blue-50",
      href: "/inbox",
    },
    {
      icon: Users, label: "Assigned clients", value: totalClients,
      display: String(totalClients), color: "text-violet-600", bg: "bg-violet-50",
      href: "/clients",
    },
  ];

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  return (
    <div className="flex flex-col flex-1 bg-[var(--color-canvas)]">
      <TopBar
        title="Team Dashboard"
        subtitle={dateStr}
        secondaryAction={undefined}
        action={undefined}
      />

      <div className="flex-1 p-4 md:p-6 space-y-5 overflow-y-auto">

        {/* ── Manager filter ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[12px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider">
            Filter:
          </span>
          <ManagerFilter
            members={members}
            active={filterMgr}
            onChange={setFilterMgr}
          />
          <Link href="/team" className="ml-auto text-[11px] text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] flex items-center gap-0.5 transition-colors">
            Manage team <ArrowUpRight size={11} />
          </Link>
        </div>

        {/* ── KPI tiles ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {kpis.map(({ icon: Icon, label, display, color, bg, href, value }) => (
            <Link key={label} href={href}
              className="flex items-center gap-3 px-4 py-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl hover:shadow-sm transition-all group">
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", bg)}>
                <Icon size={16} className={color} strokeWidth={1.5} />
              </div>
              <div>
                <p className={cn("text-[22px] font-bold leading-none tabular-nums", color)}>{display}</p>
                <p className="text-[10px] text-[var(--color-fg-muted)] mt-0.5 font-medium">{label}</p>
              </div>
              {value > 0 && label === "Overdue" && (
                <AlertTriangle size={12} className="text-red-400 ml-auto opacity-70" />
              )}
            </Link>
          ))}
        </div>

        {/* ── Unassigned clients alert ─────────────────────────────────────── */}
        {unassignedClients > 0 && !filterMgr && (
          <div className="flex items-center gap-3 px-5 py-3 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle size={14} className="text-amber-600 flex-shrink-0" />
            <p className="text-[13px] font-medium text-amber-800">
              {unassignedClients} client{unassignedClients !== 1 ? "s" : ""} without an assigned manager
            </p>
            <Link href="/clients" className="ml-auto text-[12px] font-semibold text-amber-700 hover:text-amber-900 flex items-center gap-0.5">
              Assign now <ArrowUpRight size={11} />
            </Link>
          </div>
        )}

        {/* ── Workload overview ────────────────────────────────────────────── */}
        <Panel>
          <PanelHead title="Workload overview" count={stats.length} />
          {members.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
              <Users size={24} className="text-[var(--color-fg-faint)]" strokeWidth={1.5} />
              <p className="text-[13px] font-medium text-[var(--color-fg-muted)]">No team members yet</p>
              <p className="text-[12px] text-[var(--color-fg-faint)]">Invite teammates in Team Settings to see workload data</p>
              <Link href="/team"
                className="mt-1 px-4 py-2 rounded-xl bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[12px] font-semibold transition-colors">
                Go to Team Settings
              </Link>
            </div>
          ) : (
            <WorkloadTable stats={stats} />
          )}
        </Panel>

        {/* ── Tasks + Response time ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7">
            <Panel>
              <PanelHead title="Open tasks by manager" count={totalOpenTasks} href="/tasks" />
              <TasksBarChart stats={stats} />
            </Panel>
          </div>
          <div className="lg:col-span-5">
            <Panel>
              <PanelHead title="Avg response time" />
              <ResponseTimePanel stats={stats} />
            </Panel>
          </div>
        </div>

        {/* ── Deals + Active conversations ──────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7">
            <Panel>
              <PanelHead
                title="Deals by manager"
                count={totalActiveDeals}
                href="/pipeline"
                action={
                  totalDealValue > 0 ? (
                    <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md tabular-nums">
                      {fmt$(totalDealValue)} pipeline
                    </span>
                  ) : undefined
                }
              />
              <DealsByManager stats={stats} />
            </Panel>
          </div>
          <div className="lg:col-span-5">
            <Panel>
              <PanelHead title="Active conversations" count={totalConvos} href="/inbox" />
              <ActiveConversations stats={stats} />
            </Panel>
          </div>
        </div>

        {/* ── Overdue tasks ─────────────────────────────────────────────────── */}
        <Panel>
          <PanelHead
            title="Overdue tasks"
            count={totalOverdue}
            href="/tasks"
            action={
              totalOverdue > 0 ? (
                <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">
                  {totalOverdue} overdue
                </span>
              ) : undefined
            }
          />
          <OverdueList stats={stats} />
        </Panel>

      </div>
    </div>
  );
}
