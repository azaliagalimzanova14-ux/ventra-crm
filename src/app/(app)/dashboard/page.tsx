"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { TopBar }           from "@/components/layout/top-bar";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { SetupChecklist }   from "@/components/onboarding/setup-checklist";
import { AIInsights }       from "@/components/dashboard/ai-insights";
import { ActivityFeed }     from "@/components/dashboard/activity-feed";
import { useLanguage } from "@/context/language-context";
import { useTheme } from "@/context/theme-context";
import {
  getClients, getProjects, getTasks, getDeals,
  isOnboardingDone, getSetupProgress,
} from "@/lib/storage";
import { generateActivity } from "@/lib/activity";
import { WIDGET_LABELS } from "@/lib/theme";
import type { Client, Project, Task, Deal, Activity } from "@/lib/types";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  TrendingUp, Users, FolderKanban, DollarSign,
  ArrowUpRight, ArrowDownRight, Clock, MoreHorizontal,
  ChevronRight, ChevronUp, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Stage config ─────────────────────────────────────────────────────────────

const stageColors: Record<string, string> = {
  lead:        "bg-gray-100 text-gray-600",
  qualified:   "bg-blue-50 text-blue-600",
  proposal:    "bg-violet-50 text-violet-600",
  negotiation: "bg-amber-50 text-amber-700",
  closed_won:  "bg-emerald-50 text-emerald-700",
  closed_lost: "bg-red-50 text-red-600",
};

const STAGE_ORDER = ["lead","qualified","proposal","negotiation","closed_won","closed_lost"];

// ─── Recharts tooltip ─────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[var(--color-border)] rounded-xl px-3 py-2.5 shadow-lg shadow-black/5">
      <p className="text-[11px] text-[var(--color-fg-faint)] mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-[13px] font-semibold" style={{ color: p.color }}>
          {p.name === "revenue" || p.name === "value" ? "$" : ""}{p.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

// ─── Revenue chart ────────────────────────────────────────────────────────────

function RevenueChart({ projects }: { projects: Project[] }) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const now = new Date();
  const data = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const m = d.getMonth(); const y = d.getFullYear();
    const revenue = projects
      .filter((p) => { const pd = new Date(p.dueDate); return pd.getMonth() === m && pd.getFullYear() === y; })
      .reduce((s, p) => s + (p.spent || 0), 0);
    return { month: months[m], revenue };
  });
  const hasData = data.some((d) => d.revenue > 0);
  if (!hasData) return (
    <div className="h-[140px] flex flex-col items-center justify-center gap-2">
      <p className="text-[12px] text-[var(--color-fg-faint)]">No billing data yet</p>
      <Link href="/projects" className="text-[12px] text-[var(--color-accent)] hover:underline">Create a project →</Link>
    </div>
  );
  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="var(--color-accent)" stopOpacity={0.15} />
            <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="month" tick={{ fill: "var(--color-fg-faint)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "var(--color-fg-faint)", fontSize: 11 }} axisLine={false} tickLine={false}
          tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
        <Tooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey="revenue" name="revenue" stroke="var(--color-accent)" strokeWidth={2}
          fill="url(#revGrad)" dot={false} activeDot={{ r: 4, fill: "var(--color-accent)", stroke: "white", strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Deals funnel ─────────────────────────────────────────────────────────────

function DealsFunnel({ deals }: { deals: Deal[] }) {
  const { t } = useLanguage();
  const stageLabels: Record<string, string> = {
    lead: t("stage_lead"), qualified: t("stage_qualified"), proposal: t("stage_proposal"),
    negotiation: t("stage_negotiation"), closed_won: t("stage_closed_won"), closed_lost: t("stage_closed_lost"),
  };
  const data = STAGE_ORDER.filter((s) => s !== "closed_lost")
    .map((stage) => ({ stage: stageLabels[stage] ?? stage, value: deals.filter((d) => d.stage === stage).reduce((s, d) => s + d.value, 0) }))
    .filter((d) => d.value > 0);
  if (data.length === 0) return (
    <div className="h-[120px] flex flex-col items-center justify-center gap-1.5">
      <p className="text-[12px] text-[var(--color-fg-faint)]">No pipeline data yet</p>
      <Link href="/pipeline" className="text-[12px] text-[var(--color-accent)] hover:underline">Add your first deal →</Link>
    </div>
  );
  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
        <XAxis type="number" tick={{ fill: "var(--color-fg-faint)", fontSize: 11 }} axisLine={false} tickLine={false}
          tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
        <YAxis type="category" dataKey="stage" tick={{ fill: "var(--color-fg-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={68} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="value" name="value" fill="var(--color-accent)" radius={[0, 6, 6, 0]} fillOpacity={0.85} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Top clients ──────────────────────────────────────────────────────────────

function TopClients({ clients }: { clients: Client[] }) {
  const top = [...clients].sort((a, b) => b.totalValue - a.totalValue).slice(0, 5);
  const max = top[0]?.totalValue || 1;
  if (top.length === 0) return (
    <div className="py-8 text-center">
      <p className="text-[12px] text-[var(--color-fg-faint)]">No clients yet</p>
      <Link href="/clients" className="text-[12px] text-[var(--color-accent)] hover:underline mt-1 block">Add your first client →</Link>
    </div>
  );
  const GRAD = ["from-indigo-500 to-violet-600","from-emerald-500 to-teal-600","from-amber-500 to-orange-600","from-pink-500 to-rose-600","from-blue-500 to-cyan-600"];
  return (
    <div className="space-y-4">
      {top.map((c, i) => (
        <div key={c.id} className="flex items-center gap-3">
          <span className="text-[11px] text-[var(--color-fg-faint)] w-3 flex-shrink-0 tabular-nums">{i + 1}</span>
          <div className={cn("w-7 h-7 rounded-full bg-linear-to-br flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0", GRAD[i % GRAD.length])}>
            {c.avatar?.slice(0, 2) ?? c.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[13px] font-medium text-[var(--color-fg)] truncate">{c.name}</span>
              <span className="text-[12px] font-semibold text-[var(--color-fg)] ml-2 flex-shrink-0">
                ${c.totalValue >= 1000 ? `${(c.totalValue / 1000).toFixed(0)}K` : c.totalValue}
              </span>
            </div>
            <div className="h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
              <div className="h-full bg-[var(--color-accent)] rounded-full transition-all duration-700 opacity-70"
                style={{ width: `${(c.totalValue / max) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-shadow", className)}>
      {children}
    </div>
  );
}

function CardHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
      <div>
        <h2 className="text-[14px] font-semibold text-[var(--color-fg)]">{title}</h2>
        {sub && <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

function ViewAllLink({ href }: { href: string }) {
  const { t } = useLanguage();
  return (
    <Link href={href} className="text-[12px] text-[var(--color-fg-muted)] hover:text-[var(--color-accent)] transition-colors flex items-center gap-0.5">
      {t("dash_view_all")} <ChevronRight size={12} />
    </Link>
  );
}

// ─── Dashboard page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t } = useLanguage();
  const { prefs, setDashWidgets, sw } = useTheme();

  const [clients,  setClients]  = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks,    setTasks]    = useState<Task[]>([]);
  const [deals,    setDeals]    = useState<Deal[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [showWizard,         setShowWizard]         = useState(false);
  const [showChecklist,      setShowChecklist]      = useState(false);
  const [checklistDismissed, setChecklistDismissed] = useState(false);
  const [editingWidgets, setEditingWidgets] = useState(false);

  useEffect(() => {
    setClients(getClients());
    setProjects(getProjects());
    setTasks(getTasks());
    setDeals(getDeals());
    setActivity(generateActivity());
    if (!isOnboardingDone()) setShowWizard(true);
    if (getSetupProgress().length < 5 && !checklistDismissed) setShowChecklist(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleWizardComplete = useCallback(() => {
    setShowWizard(false);
    setClients(getClients());
    setProjects(getProjects());
    setActivity(generateActivity());
    if (getSetupProgress().length < 5) setShowChecklist(true);
  }, []);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalRevenue   = projects.reduce((s, p) => s + (p.spent || 0), 0);
  const activeClients  = clients.filter((c) => c.status === "active").length;
  const activeProjects = projects.filter((p) => p.status === "in_progress").length;
  const pipelineValue  = deals.filter((d) => d.stage !== "closed_lost").reduce((s, d) => s + d.value, 0);

  const stageLabel: Record<string, string> = {
    lead: t("stage_lead"), qualified: t("stage_qualified"), proposal: t("stage_proposal"),
    negotiation: t("stage_negotiation"), closed_won: t("stage_closed_won"), closed_lost: t("stage_closed_lost"),
  };

  const stats = [
    { label: t("dash_revenue"),      value: totalRevenue,   prefix: "$", color: "text-emerald-600 bg-emerald-50", icon: DollarSign,   change: 12 },
    { label: t("dash_clients"),      value: activeClients,  prefix: "",  color: "text-blue-600 bg-blue-50",       icon: Users,        change: 8  },
    { label: t("dash_projects"),     value: activeProjects, prefix: "",  color: "text-violet-600 bg-violet-50",   icon: FolderKanban, change: -3 },
    { label: t("dash_pipeline_val"), value: pipelineValue,  prefix: "$", color: "text-amber-600 bg-amber-50",     icon: TrendingUp,   change: 24 },
  ];

  const openTasks   = tasks.filter((tk) => tk.status !== "done" && tk.status !== "cancelled").slice(0, 6);
  const recentDeals = deals.slice(0, 4);

  // ── Widget order + visibility ──────────────────────────────────────────────
  const widgets = prefs.dashWidgets;

  function moveWidget(id: string, dir: -1 | 1) {
    const arr = [...widgets];
    const i = arr.indexOf(id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setDashWidgets(arr);
  }

  function toggleWidget(id: string) {
    if (widgets.includes(id)) {
      setDashWidgets(widgets.filter((w) => w !== id));
    } else {
      setDashWidgets([...widgets, id]);
    }
  }

  // ── Widget renderers ───────────────────────────────────────────────────────
  const widgetMap: Record<string, React.ReactNode> = {
    kpi: (
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        {stats.map(({ label, value, change, icon: Icon, prefix, color }) => {
          const up = change >= 0;
          const displayValue = prefix === "$" && value >= 1000
            ? `${prefix}${value >= 1_000_000 ? (value / 1_000_000).toFixed(1) + "M" : (value / 1000).toFixed(0) + "K"}`
            : `${prefix}${value}`;
          return (
            <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200">
              <div className="flex items-start justify-between mb-4">
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", color)}>
                  <Icon size={17} strokeWidth={sw} />
                </div>
                <span className={cn("flex items-center gap-0.5 text-[12px] font-medium px-1.5 py-0.5 rounded-md", up ? "text-emerald-700 bg-emerald-50" : "text-red-600 bg-red-50")}>
                  {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{Math.abs(change)}%
                </span>
              </div>
              <p className="text-[28px] font-bold text-[var(--color-fg)] leading-none">{displayValue}</p>
              <p className="text-[12px] text-[var(--color-fg-muted)] mt-1.5 font-medium">{label}</p>
            </div>
          );
        })}
      </div>
    ),

    revenue: (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader title="Revenue trend" sub="Billed per month (last 6 months)" action={<ViewAllLink href="/analytics" />} />
          <div className="px-5 pt-3 pb-3"><RevenueChart projects={projects} /></div>
        </Card>
        <Card>
          <CardHeader title="Top clients" action={<ViewAllLink href="/clients" />} />
          <div className="px-5 py-4"><TopClients clients={clients} /></div>
        </Card>
      </div>
    ),

    insights_activity: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AIInsights clients={clients} tasks={tasks} deals={deals} />
        <Card>
          <CardHeader title="Recent activity" sub={`${activity.length} events`} />
          <ActivityFeed activities={activity} />
        </Card>
      </div>
    ),

    pipeline_tasks: (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader title={t("dash_deal_pipe")} sub={`$${pipelineValue >= 1000 ? `${(pipelineValue / 1000).toFixed(0)}K` : pipelineValue} ${t("dash_total")}`} action={<ViewAllLink href="/pipeline" />} />
          {recentDeals.length > 0 ? (
            <div className="p-4 space-y-2">
              {recentDeals.map((deal) => (
                <div key={deal.id} className="flex items-center gap-3 px-4 py-2.5 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl hover:border-[var(--color-accent-subtle)] transition-colors">
                  <div className="w-7 h-7 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                    {deal.clientAvatar?.slice(0, 1) ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[var(--color-fg)] truncate">{deal.title}</p>
                    <p className="text-[11px] text-[var(--color-fg-faint)]">{deal.clientName}</p>
                  </div>
                  <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0", stageColors[deal.stage])}>{stageLabel[deal.stage]}</span>
                  <span className="text-[13px] font-semibold text-[var(--color-fg)] flex-shrink-0">${deal.value >= 1000 ? `${(deal.value / 1000).toFixed(0)}K` : deal.value}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-[var(--color-border)]"><DealsFunnel deals={deals} /></div>
            </div>
          ) : (
            <div className="p-4"><DealsFunnel deals={deals} /></div>
          )}
        </Card>

        <Card>
          <CardHeader title={t("dash_due_soon")} action={
            openTasks.length > 0
              ? <span className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-md font-semibold">{openTasks.length}</span>
              : undefined
          } />
          <div className="divide-y divide-[var(--color-border)]">
            {openTasks.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-600"><path d="M20 6L9 17l-5-5" /></svg>
                </div>
                <p className="text-[13px] font-medium text-[var(--color-fg-muted)]">All caught up!</p>
                <Link href="/tasks" className="text-[12px] text-[var(--color-accent)] hover:underline mt-1 block">Add a task →</Link>
              </div>
            ) : openTasks.map((task) => (
              <div key={task.id} className="px-5 py-3.5 hover:bg-[var(--color-canvas)] transition-colors">
                <div className="flex items-start gap-2.5">
                  <div className={cn("w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0",
                    task.priority === "urgent" ? "bg-red-500" : task.priority === "high" ? "bg-amber-500" :
                    task.priority === "medium" ? "bg-blue-500" : "bg-gray-300")} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[var(--color-fg)] truncate">{task.title}</p>
                    <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5 flex items-center gap-1">
                      <Clock size={10} strokeWidth={sw} />{t("dash_due_label")} {task.dueDate}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    ),

    deals_table: deals.length > 0 ? (
      <Card>
        <CardHeader title="All deals" sub={`$${(deals.reduce((a, d) => a + d.value, 0) / 1000).toFixed(0)}K ${t("dash_total")}`}
          action={<Link href="/pipeline" className="p-1.5 rounded-lg hover:bg-[var(--color-canvas)] transition-colors"><MoreHorizontal size={15} className="text-[var(--color-fg-faint)]" /></Link>} />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {[t("dash_col_deal"),t("dash_col_stage"),t("dash_col_value"),t("dash_col_prob"),t("dash_col_close")].map((h) => (
                  <th key={h} className="text-left text-[11px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider px-6 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {deals.slice(0, 5).map((deal) => (
                <tr key={deal.id} className="hover:bg-[var(--color-canvas)] transition-colors">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                        {deal.clientAvatar?.slice(0, 1) ?? "?"}
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-[var(--color-fg)]">{deal.title}</p>
                        <p className="text-[11px] text-[var(--color-fg-faint)]">{deal.clientName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", stageColors[deal.stage])}>
                      {stageLabel[deal.stage]}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-[13px] font-semibold text-[var(--color-fg)]">${deal.value.toLocaleString()}</td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--color-accent)] rounded-full opacity-80" style={{ width: `${deal.probability}%` }} />
                      </div>
                      <span className="text-[11px] text-[var(--color-fg-muted)]">{deal.probability}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-[12px] text-[var(--color-fg-muted)]">{deal.expectedClose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    ) : null,
  };

  return (
    <div className="flex flex-col flex-1 bg-[var(--color-canvas)]">
      <TopBar title={t("dash_title")} subtitle={t("dash_subtitle")} action={
        editingWidgets ? { label: "Done", onClick: () => setEditingWidgets(false) }
        : { label: "Customize", onClick: () => setEditingWidgets(true) }
      } />

      <div className="flex-1 p-4 md:p-6 space-y-5">

        {/* Setup checklist */}
        {showChecklist && !checklistDismissed && (
          <SetupChecklist onDismiss={() => { setChecklistDismissed(true); setShowChecklist(false); }} />
        )}

        {/* Widget customization panel */}
        {editingWidgets && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 shadow-card">
            <p className="text-[13px] font-semibold text-[var(--color-fg)] mb-3">Customize dashboard</p>
            <p className="text-[12px] text-[var(--color-fg-muted)] mb-4">Toggle widgets on or off, and reorder them.</p>
            <div className="space-y-2">
              {Object.keys(WIDGET_LABELS).map((id) => {
                const isOn = widgets.includes(id);
                const idx  = widgets.indexOf(id);
                return (
                  <div key={id} className="flex items-center gap-3 px-3 py-2.5 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl">
                    <button
                      onClick={() => toggleWidget(id)}
                      className={cn(
                        "w-9 h-5 rounded-full transition-colors flex-shrink-0 relative",
                        isOn ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"
                      )}
                    >
                      <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform", isOn && "translate-x-4")} />
                    </button>
                    <span className={cn("text-[13px] font-medium flex-1", isOn ? "text-[var(--color-fg)]" : "text-[var(--color-fg-faint)]")}>
                      {WIDGET_LABELS[id]}
                    </span>
                    {isOn && (
                      <div className="flex gap-0.5">
                        <button onClick={() => moveWidget(id, -1)} disabled={idx <= 0}
                          className="p-1 rounded hover:bg-[var(--color-border)] disabled:opacity-30 transition-colors">
                          <ChevronUp size={13} className="text-[var(--color-fg-muted)]" />
                        </button>
                        <button onClick={() => moveWidget(id, 1)} disabled={idx >= widgets.length - 1}
                          className="p-1 rounded hover:bg-[var(--color-border)] disabled:opacity-30 transition-colors">
                          <ChevronDown size={13} className="text-[var(--color-fg-muted)]" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Render widgets in user-defined order */}
        {widgets.map((id) => {
          const content = widgetMap[id];
          if (!content) return null;
          return <div key={id}>{content}</div>;
        })}
      </div>

      {showWizard && <OnboardingWizard onComplete={handleWizardComplete} />}
    </div>
  );
}
