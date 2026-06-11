"use client";

import { useState, useEffect, useMemo } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { getClients, getProjects, getTasks } from "@/lib/storage";
import type { Client, Project, Task } from "@/lib/types";
import { useLanguage } from "@/context/language-context";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { Users, CheckSquare, AlertTriangle, DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Palette ────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  planning:    "var(--color-accent)",
  in_progress: "#7c3aed",
  review:      "#f59e0b",
  completed:   "#10b981",
  on_hold:     "#e5e7eb",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#f87171",
  high:   "#fb923c",
  medium: "#818cf8",
  low:    "#e5e7eb",
};

// ── Tooltip ────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--color-border)] border border-[var(--color-border)] rounded-xl p-3 shadow-2xl text-[12px] min-w-[130px]">
      {label && <p className="text-[var(--color-fg-muted)] mb-2 font-medium">{label}</p>}
      {payload.map((entry: { name: string; color: string; value: number }) => (
        <p key={entry.name} style={{ color: entry.color }} className="font-semibold">
          {entry.name}:{" "}
          {typeof entry.value === "number" && entry.value > 9999
            ? `$${(entry.value / 1000).toFixed(0)}K`
            : entry.value}
        </p>
      ))}
    </div>
  );
}

// ── Month helper ───────────────────────────────────────────────────────────
function last6Months(lang: string): { key: string; label: string }[] {
  const locale = lang === "ru" ? "ru-RU" : "en-US";
  const result = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const raw = d.toLocaleString(locale, { month: "short" });
    result.push({ key, label: raw.charAt(0).toUpperCase() + raw.slice(1) });
  }
  return result;
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { t, lang } = useLanguage();

  const [clients,  setClients]  = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks,    setTasks]    = useState<Task[]>([]);
  const [loaded,   setLoaded]   = useState(false);

  useEffect(() => {
    setClients(getClients());
    setProjects(getProjects());
    setTasks(getTasks());
    setLoaded(true);
  }, []);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeClients     = clients.filter((c) => c.status === "active").length;
    const completedProjects = projects.filter((p) => p.status === "completed").length;
    const overdueTasks      = tasks.filter(
      (tk) => tk.dueDate && new Date(tk.dueDate) < today && tk.status !== "done" && tk.status !== "cancelled"
    ).length;
    const totalBudget = projects.reduce((s, p) => s + (p.budget ?? 0), 0);
    const totalSpent  = projects.reduce((s, p) => s + (p.spent  ?? 0), 0);
    const spentPct    = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
    return { activeClients, completedProjects, overdueTasks, totalBudget, spentPct };
  }, [clients, projects, tasks]);

  // ── Monthly activity ──────────────────────────────────────────────────────
  const monthlyActivity = useMemo(() => {
    const months = last6Months(lang);
    return months.map(({ key, label }) => ({
      month:                           label,
      [t("analytics_label_tasks")]:   tasks.filter((tk) => tk.createdAt?.startsWith(key)).length,
      [t("analytics_label_clients")]: clients.filter((c)  => c.joinedAt?.startsWith(key)).length,
    }));
  // lang change regenerates labels — intentional
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, tasks, lang]);

  // ── Projects by status ────────────────────────────────────────────────────
  const projectsByStatus = useMemo(() => {
    const statusLabels: Record<string, string> = {
      planning:    t("status_planning"),
      in_progress: t("status_in_progress"),
      review:      t("status_review"),
      completed:   t("status_completed"),
      on_hold:     t("status_on_hold"),
    };
    const counts: Record<string, number> = {};
    projects.forEach((p) => { counts[p.status] = (counts[p.status] ?? 0) + 1; });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([status, value]) => ({
        name:  statusLabels[status] ?? status,
        value,
        color: STATUS_COLORS[status] ?? "var(--color-accent)",
      }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, lang]);

  // ── Tasks by priority ─────────────────────────────────────────────────────
  const tasksByPriority = useMemo(() => {
    const labels: Record<string, string> = {
      urgent: t("priority_urgent"),
      high:   t("priority_high"),
      medium: t("priority_medium"),
      low:    t("priority_low"),
    };
    return (["urgent", "high", "medium", "low"] as const).map((p) => ({
      name:  labels[p],
      value: tasks.filter((tk) => tk.priority === p).length,
      fill:  PRIORITY_COLORS[p],
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, lang]);

  // ── Budget by project ─────────────────────────────────────────────────────
  const budgetByProject = useMemo(() => {
    const budgetKey = t("analytics_label_budget");
    const spentKey  = t("analytics_label_spent");
    return projects
      .filter((p) => p.budget > 0)
      .sort((a, b) => b.budget - a.budget)
      .slice(0, 6)
      .map((p) => ({
        name:        p.name.length > 18 ? p.name.slice(0, 16) + "…" : p.name,
        [budgetKey]: p.budget,
        [spentKey]:  p.spent ?? 0,
      }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, lang]);

  // ── Top clients ───────────────────────────────────────────────────────────
  const topClients = useMemo(
    () => [...clients].filter((c) => c.totalValue > 0).sort((a, b) => b.totalValue - a.totalValue).slice(0, 5),
    [clients]
  );
  const maxClientValue = topClients[0]?.totalValue ?? 1;

  // ── Task status stacks ────────────────────────────────────────────────────
  const taskStatusRows = useMemo(() => {
    const defs = [
      { status: "todo",        label: t("task_todo"),          color: "bg-[#e5e7eb]"  },
      { status: "in_progress", label: t("status_in_progress"), color: "bg-indigo-500" },
      { status: "done",        label: t("task_done"),          color: "bg-emerald-500" },
      { status: "cancelled",   label: t("task_cancelled"),     color: "bg-gray-200"  },
    ] as const;
    return defs.map((d) => {
      const count = tasks.filter((tk) => tk.status === d.status).length;
      const pct   = tasks.length > 0 ? Math.round((count / tasks.length) * 100) : 0;
      return { ...d, count, pct };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, lang]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <div className="flex flex-col flex-1">
        <TopBar title={t("analytics_title")} subtitle={t("analytics_subtitle")} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // ── KPI card definitions ──────────────────────────────────────────────────
  const kpiCards = [
    {
      label: t("analytics_active_clients"),
      value: kpis.activeClients,
      sub:   `${clients.length} ${t("analytics_clients_total")}`,
      icon:  Users,
      color: "text-[var(--color-accent)]",
      bg:    "bg-[var(--color-accent-subtle)]",
      up:    true,
    },
    {
      label: t("analytics_completed_proj"),
      value: kpis.completedProjects,
      sub:   `${projects.length} ${t("analytics_projects_total")}`,
      icon:  CheckSquare,
      color: "text-emerald-600",
      bg:    "bg-emerald-50",
      up:    true,
    },
    {
      label: t("analytics_overdue_tasks"),
      value: kpis.overdueTasks,
      sub:   kpis.overdueTasks > 0 ? t("analytics_need_attention") : "✓ OK",
      icon:  AlertTriangle,
      color: kpis.overdueTasks > 0 ? "text-red-500"  : "text-emerald-600",
      bg:    kpis.overdueTasks > 0 ? "bg-red-500/10" : "bg-emerald-50",
      up:    kpis.overdueTasks === 0,
    },
    {
      label: t("analytics_total_budget"),
      value: `$${(kpis.totalBudget / 1000).toFixed(0)}K`,
      sub:   `${kpis.spentPct}% ${t("analytics_label_spent").toLowerCase()}`,
      icon:  DollarSign,
      color: "text-amber-600",
      bg:    "bg-amber-50",
      up:    true,
    },
  ];

  const budgetKey = t("analytics_label_budget");
  const spentKey  = t("analytics_label_spent");

  return (
    <div className="flex flex-col flex-1">
      <TopBar title={t("analytics_title")} subtitle={t("analytics_subtitle")} />

      <div className="flex-1 p-6 space-y-6">

        {/* ── KPI cards ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-4">
          {kpiCards.map((card) => (
            <div key={card.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <p className="text-[12px] text-[var(--color-fg-faint)] font-medium leading-snug max-w-[110px]">{card.label}</p>
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", card.bg)}>
                  <card.icon size={15} className={card.color} />
                </div>
              </div>
              <p className="text-[28px] font-bold text-[var(--color-fg)] leading-none">{card.value}</p>
              <div className="flex items-center gap-1 mt-2">
                {card.up
                  ? <TrendingUp  size={12} className="text-emerald-600 flex-shrink-0" />
                  : <TrendingDown size={12} className="text-red-500 flex-shrink-0" />}
                <p className="text-[11px] text-[var(--color-fg-faint)]">{card.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Monthly activity ─────────────────────────────────────────────── */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-[14px] font-semibold text-[var(--color-fg)]">{t("analytics_activity_chart")}</h2>
              <p className="text-[12px] text-[var(--color-fg-faint)] mt-0.5">{t("analytics_activity_sub")}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-fg-muted)]">
                <div className="w-3 h-0.5 bg-indigo-500 rounded" />{t("analytics_label_tasks")}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-fg-muted)]">
                <div className="w-3 h-0.5 bg-emerald-500 rounded" />{t("analytics_label_clients")}
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={monthlyActivity} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradTasks" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--color-accent)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0}   />
                </linearGradient>
                <linearGradient id="gradClients" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "var(--color-fg-faint)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--color-fg-faint)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone" dataKey={t("analytics_label_tasks")}
                stroke="var(--color-accent)" strokeWidth={2} fill="url(#gradTasks)"
                dot={{ fill: "var(--color-accent)", r: 3 }} activeDot={{ r: 5 }}
              />
              <Area
                type="monotone" dataKey={t("analytics_label_clients")}
                stroke="#10b981" strokeWidth={2} fill="url(#gradClients)"
                dot={{ fill: "#10b981", r: 3 }} activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* ── 3-column row ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-6">

          {/* Projects by status — donut */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
            <h2 className="text-[14px] font-semibold text-[var(--color-fg)]">{t("analytics_proj_status")}</h2>
            <p className="text-[12px] text-[var(--color-fg-faint)] mt-0.5 mb-3">{t("analytics_distribution")}</p>
            {projectsByStatus.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie
                      data={projectsByStatus} cx="50%" cy="50%"
                      innerRadius={42} outerRadius={65} paddingAngle={3} dataKey="value"
                    >
                      {projectsByStatus.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-1">
                  {projectsByStatus.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
                      <span className="text-[11px] text-[var(--color-fg-muted)] flex-1 truncate">{entry.name}</span>
                      <span className="text-[11px] font-semibold text-[var(--color-fg)]">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptySlot label={t("analytics_no_data")} />
            )}
          </div>

          {/* Tasks by priority — horizontal bar */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
            <h2 className="text-[14px] font-semibold text-[var(--color-fg)]">{t("analytics_tasks_priority")}</h2>
            <p className="text-[12px] text-[var(--color-fg-faint)] mt-0.5 mb-3">{t("analytics_tasks_breakdown")}</p>
            {tasks.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={tasksByPriority} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--color-fg-faint)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={58} tick={{ fill: "var(--color-fg-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" name={t("analytics_label_tasks")} radius={[0, 4, 4, 0]}>
                      {tasksByPriority.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2">
                  {tasksByPriority.map((p) => (
                    <div key={p.name} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.fill }} />
                      <span className="text-[11px] text-[var(--color-fg-muted)]">{p.name}</span>
                      <span className="text-[11px] font-semibold text-[var(--color-fg)] ml-auto">{p.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptySlot label={t("analytics_no_data")} />
            )}
          </div>

          {/* Task status breakdown — stacked bars */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
            <h2 className="text-[14px] font-semibold text-[var(--color-fg)]">{t("analytics_label_tasks")}</h2>
            <p className="text-[12px] text-[var(--color-fg-faint)] mt-0.5 mb-5">{t("analytics_distribution")}</p>
            {tasks.length > 0 ? (
              <div className="space-y-3">
                {taskStatusRows.map((row) => (
                  <div key={row.status}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12px] text-[var(--color-fg-muted)]">{row.label}</span>
                      <span className="text-[12px] font-semibold text-[var(--color-fg)]">
                        {row.count}{" "}
                        <span className="text-[10px] text-[var(--color-fg-faint)] font-normal">({row.pct}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all", row.color)} style={{ width: `${row.pct}%` }} />
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-[var(--color-fg-faint)] pt-1 border-t border-[var(--color-border)]">
                  {t("analytics_label_total")}: <span className="text-[var(--color-fg)] font-semibold">{tasks.length}</span>
                </p>
              </div>
            ) : (
              <EmptySlot label={t("analytics_no_data")} />
            )}
          </div>
        </div>

        {/* ── Budget by project ─────────────────────────────────────────────── */}
        {budgetByProject.length > 0 && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-[14px] font-semibold text-[var(--color-fg)]">{t("analytics_budget_util")}</h2>
                <p className="text-[12px] text-[var(--color-fg-faint)] mt-0.5">{t("analytics_budget_sub")}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-fg-muted)]">
                  <div className="w-3 h-2.5 rounded-sm bg-indigo-500/40" />{t("analytics_label_budget")}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-fg-muted)]">
                  <div className="w-3 h-2.5 rounded-sm bg-indigo-500" />{t("analytics_label_spent")}
                </div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={budgetByProject} margin={{ top: 0, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--color-fg-faint)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`}
                  tick={{ fill: "var(--color-fg-faint)", fontSize: 11 }} axisLine={false} tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey={budgetKey} fill="var(--color-accent)" fillOpacity={0.35} radius={[4, 4, 0, 0]} />
                <Bar dataKey={spentKey}  fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Top clients ───────────────────────────────────────────────────── */}
        {topClients.length > 0 && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--color-border)]">
              <h2 className="text-[14px] font-semibold text-[var(--color-fg)]">{t("analytics_top_clients")}</h2>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {topClients.map((client, i) => {
                const pct = Math.round((client.totalValue / maxClientValue) * 100);
                return (
                  <div key={client.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--color-canvas)] transition-colors">
                    <span className="text-[13px] font-medium text-[var(--color-fg-faint)] w-4 flex-shrink-0">{i + 1}</span>
                    <div className="w-8 h-8 rounded-full bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-[11px] font-bold text-[var(--color-fg)] flex-shrink-0">
                      {client.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <p className="text-[13px] font-medium text-[var(--color-fg)] truncate">{client.name}</p>
                        <span className="text-[11px] text-[var(--color-fg-faint)] truncate hidden sm:block">{client.company}</span>
                      </div>
                      <div className="h-1 bg-[var(--color-border)] rounded-full overflow-hidden max-w-xs">
                        <div
                          className="h-full bg-linear-to-r from-indigo-500 to-violet-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[14px] font-semibold text-[var(--color-fg)] flex-shrink-0">
                      ${client.totalValue.toLocaleString()}
                    </span>
                    <span className="text-[11px] text-[var(--color-fg-faint)] w-14 text-right flex-shrink-0">
                      {client.projectCount}p
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Empty slot ─────────────────────────────────────────────────────────────
function EmptySlot({ label }: { label: string }) {
  return (
    <div className="h-[180px] flex items-center justify-center text-[13px] text-[var(--color-fg-faint)]">
      {label}
    </div>
  );
}
