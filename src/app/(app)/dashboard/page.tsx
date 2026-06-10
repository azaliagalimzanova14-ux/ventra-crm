"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { TopBar }           from "@/components/layout/top-bar";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { SetupChecklist }   from "@/components/onboarding/setup-checklist";
import { AIInsights }       from "@/components/dashboard/ai-insights";
import { ActivityFeed }     from "@/components/dashboard/activity-feed";
import { useLanguage } from "@/context/language-context";
import {
  getClients, getProjects, getTasks, getDeals,
  isOnboardingDone, getSetupProgress,
} from "@/lib/storage";
import { generateActivity } from "@/lib/activity";
import type { Client, Project, Task, Deal, Activity } from "@/lib/types";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  TrendingUp, Users, FolderKanban, DollarSign,
  ArrowUpRight, ArrowDownRight, Clock, MoreHorizontal,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Stage config ─────────────────────────────────────────────────────────────

const stageColors: Record<string, string> = {
  lead:        "bg-[#1c1c35] text-[#8080a8]",
  qualified:   "bg-blue-500/15 text-blue-400",
  proposal:    "bg-violet-500/15 text-violet-400",
  negotiation: "bg-amber-500/15 text-amber-400",
  closed_won:  "bg-emerald-500/15 text-emerald-400",
  closed_lost: "bg-red-500/15 text-red-400",
};

const STAGE_ORDER = ["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"];

// ─── Recharts custom tooltip ──────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#111128] border border-[#1c1c35] rounded-xl px-3 py-2.5 shadow-xl">
      <p className="text-[11px] text-[#5a5a8a] mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-[12px] font-semibold" style={{ color: p.color }}>
          {p.name === "revenue" || p.name === "value" ? "$" : ""}{p.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

// ─── Revenue chart ────────────────────────────────────────────────────────────

function RevenueChart({ projects }: { projects: Project[] }) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();

  const data = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const m = d.getMonth();
    const y = d.getFullYear();
    const revenue = projects
      .filter((p) => {
        const pd = new Date(p.dueDate);
        return pd.getMonth() === m && pd.getFullYear() === y;
      })
      .reduce((s, p) => s + (p.spent || 0), 0);
    return { month: months[m], revenue };
  });

  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1c1c35" vertical={false} />
        <XAxis dataKey="month" tick={{ fill: "#5a5a8a", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#5a5a8a", fontSize: 10 }} axisLine={false} tickLine={false}
          tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
        <Tooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey="revenue" name="revenue" stroke="#6366f1" strokeWidth={2}
          fill="url(#revGrad)" dot={false} activeDot={{ r: 4, fill: "#6366f1" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Deals funnel ─────────────────────────────────────────────────────────────

function DealsFunnel({ deals }: { deals: Deal[] }) {
  const { t } = useLanguage();
  const stageLabels: Record<string, string> = {
    lead:        t("stage_lead"),
    qualified:   t("stage_qualified"),
    proposal:    t("stage_proposal"),
    negotiation: t("stage_negotiation"),
    closed_won:  t("stage_closed_won"),
    closed_lost: t("stage_closed_lost"),
  };

  const data = STAGE_ORDER
    .filter((s) => s !== "closed_lost")
    .map((stage) => ({
      stage: stageLabels[stage] ?? stage,
      value: deals.filter((d) => d.stage === stage).reduce((s, d) => s + d.value, 0),
    }))
    .filter((d) => d.value > 0);

  if (data.length === 0) {
    return (
      <div className="h-[140px] flex items-center justify-center text-[12px] text-[#3a3a5a]">
        No deals yet — <Link href="/pipeline" className="ml-1 text-indigo-400 hover:underline">Add one →</Link>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#1c1c35" horizontal={false} />
        <XAxis type="number" tick={{ fill: "#5a5a8a", fontSize: 10 }} axisLine={false} tickLine={false}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <YAxis type="category" dataKey="stage" tick={{ fill: "#8080a8", fontSize: 10 }} axisLine={false} tickLine={false} width={70} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="value" name="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Top clients ──────────────────────────────────────────────────────────────

function TopClients({ clients }: { clients: Client[] }) {
  const top = [...clients].sort((a, b) => b.totalValue - a.totalValue).slice(0, 5);
  const max = top[0]?.totalValue || 1;

  if (top.length === 0) {
    return (
      <div className="py-8 text-center text-[12px] text-[#3a3a5a]">
        No clients yet — <Link href="/clients" className="ml-1 text-indigo-400 hover:underline">Add one →</Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {top.map((c, i) => (
        <div key={c.id} className="flex items-center gap-3">
          <span className="text-[11px] text-[#3a3a5a] w-3 flex-shrink-0">{i + 1}</span>
          <div className="w-6 h-6 rounded-full bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
            {c.avatar?.slice(0, 2) ?? c.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[12px] font-medium text-[#c0c0d8] truncate">{c.name}</span>
              <span className="text-[11px] font-semibold text-white ml-2 flex-shrink-0">
                ${c.totalValue >= 1000 ? `${(c.totalValue / 1000).toFixed(0)}K` : c.totalValue}
              </span>
            </div>
            <div className="h-1 bg-[#1c1c35] rounded-full overflow-hidden">
              <div
                className="h-full bg-linear-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
                style={{ width: `${(c.totalValue / max) * 100}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Dashboard page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t } = useLanguage();
  const [clients,  setClients]  = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks,    setTasks]    = useState<Task[]>([]);
  const [deals,    setDeals]    = useState<Deal[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);

  const [showWizard,         setShowWizard]         = useState(false);
  const [showChecklist,      setShowChecklist]      = useState(false);
  const [checklistDismissed, setChecklistDismissed] = useState(false);

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
    lead:        t("stage_lead"),
    qualified:   t("stage_qualified"),
    proposal:    t("stage_proposal"),
    negotiation: t("stage_negotiation"),
    closed_won:  t("stage_closed_won"),
    closed_lost: t("stage_closed_lost"),
  };

  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-500/15 text-emerald-400",
    indigo:  "bg-indigo-500/15 text-indigo-400",
    violet:  "bg-violet-500/15 text-violet-400",
    amber:   "bg-amber-500/15 text-amber-400",
  };

  const stats = [
    { label: t("dash_revenue"),      value: totalRevenue,   prefix: "$", color: "emerald", icon: DollarSign,   change: 12 },
    { label: t("dash_clients"),      value: activeClients,  prefix: "",  color: "indigo",  icon: Users,        change: 8  },
    { label: t("dash_projects"),     value: activeProjects, prefix: "",  color: "violet",  icon: FolderKanban, change: -3 },
    { label: t("dash_pipeline_val"), value: pipelineValue,  prefix: "$", color: "amber",   icon: TrendingUp,   change: 24 },
  ];

  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled").slice(0, 5);
  const recentDeals = deals.slice(0, 4);

  return (
    <div className="flex flex-col flex-1">
      <TopBar title={t("dash_title")} subtitle={t("dash_subtitle")} />

      <div className="flex-1 p-4 md:p-6 space-y-5">

        {/* Setup checklist */}
        {showChecklist && !checklistDismissed && (
          <SetupChecklist onDismiss={() => { setChecklistDismissed(true); setShowChecklist(false); }} />
        )}

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
          {stats.map(({ label, value, change, icon: Icon, prefix, color }) => {
            const up = change >= 0;
            const displayValue =
              prefix === "$" && value >= 1000
                ? `${prefix}${value >= 1_000_000 ? (value / 1_000_000).toFixed(1) + "M" : (value / 1000).toFixed(0) + "K"}`
                : `${prefix}${value}`;
            return (
              <div key={label} className="bg-[#111128] border border-[#1c1c35] rounded-xl p-4 md:p-5 hover:border-[#252545] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 transition-all duration-200">
                <div className="flex items-start justify-between mb-3 md:mb-4">
                  <div className={cn("w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center", colorMap[color])}>
                    <Icon size={16} strokeWidth={1.75} />
                  </div>
                  <span className={cn("flex items-center gap-0.5 text-[11px] md:text-[12px] font-medium", up ? "text-emerald-400" : "text-red-400")}>
                    {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(change)}%
                  </span>
                </div>
                <p className="text-[22px] md:text-[26px] font-bold text-white leading-none">{displayValue}</p>
                <p className="text-[12px] md:text-[13px] text-[#5a5a8a] mt-1">{label}</p>
              </div>
            );
          })}
        </div>

        {/* ── Charts row ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
          {/* Revenue trend */}
          <div className="md:col-span-2 bg-[#111128] border border-[#1c1c35] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1c1c35]">
              <div>
                <h2 className="text-[14px] font-semibold text-white">Revenue trend</h2>
                <p className="text-[11px] text-[#5a5a8a] mt-0.5">Billed per month (last 6 months)</p>
              </div>
              <Link href="/analytics" className="text-[12px] text-[#5a5a8a] hover:text-indigo-400 transition-colors">
                {t("dash_view_all")}
              </Link>
            </div>
            <div className="px-4 pt-3 pb-2">
              <RevenueChart projects={projects} />
            </div>
          </div>

          {/* Top clients */}
          <div className="bg-[#111128] border border-[#1c1c35] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1c1c35]">
              <h2 className="text-[14px] font-semibold text-white">Top clients</h2>
              <Link href="/clients" className="text-[12px] text-[#5a5a8a] hover:text-indigo-400 transition-colors">
                {t("dash_view_all")}
              </Link>
            </div>
            <div className="px-5 py-4">
              <TopClients clients={clients} />
            </div>
          </div>
        </div>

        {/* ── Pipeline + Tasks row ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
          {/* Deals funnel */}
          <div className="md:col-span-2 bg-[#111128] border border-[#1c1c35] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1c1c35]">
              <div>
                <h2 className="text-[14px] font-semibold text-white">{t("dash_deal_pipe")}</h2>
                <p className="text-[11px] text-[#5a5a8a] mt-0.5">
                  ${pipelineValue >= 1000 ? `${(pipelineValue / 1000).toFixed(0)}K` : pipelineValue} {t("dash_total")}
                </p>
              </div>
              <Link href="/pipeline" className="text-[12px] text-[#5a5a8a] hover:text-indigo-400 transition-colors flex items-center gap-1">
                {t("dash_view_all")} <ChevronRight size={12} />
              </Link>
            </div>
            {/* Mini kanban pills */}
            {recentDeals.length > 0 ? (
              <div className="p-4 space-y-2.5">
                {recentDeals.map((deal) => (
                  <div key={deal.id} className="flex items-center gap-3 px-3.5 py-2.5 bg-[#0d0d1c] border border-[#1c1c35] rounded-xl hover:border-[#252545] transition-colors">
                    <div className="w-6 h-6 rounded-full bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                      {deal.clientAvatar?.slice(0, 1) ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#e0e0f0] truncate">{deal.title}</p>
                      <p className="text-[11px] text-[#5a5a8a]">{deal.clientName}</p>
                    </div>
                    <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-md flex-shrink-0", stageColors[deal.stage])}>
                      {stageLabel[deal.stage]}
                    </span>
                    <span className="text-[12px] font-semibold text-white flex-shrink-0">
                      ${deal.value >= 1000 ? `${(deal.value / 1000).toFixed(0)}K` : deal.value}
                    </span>
                  </div>
                ))}
                {/* Funnel chart below */}
                <div className="mt-3 pt-3 border-t border-[#1c1c35]">
                  <DealsFunnel deals={deals} />
                </div>
              </div>
            ) : (
              <div className="p-4">
                <DealsFunnel deals={deals} />
              </div>
            )}
          </div>

          {/* Due soon */}
          <div className="bg-[#111128] border border-[#1c1c35] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1c1c35]">
              <h2 className="text-[14px] font-semibold text-white">{t("dash_due_soon")}</h2>
              {openTasks.length > 0 && (
                <span className="text-[11px] bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-md font-medium">
                  {openTasks.length} {t("dash_tasks_badge")}
                </span>
              )}
            </div>
            <div className="divide-y divide-[#1c1c35]">
              {openTasks.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-[12px] text-[#3a3a5a]">All caught up!</p>
                  <Link href="/tasks" className="text-[12px] text-indigo-400 hover:underline mt-1 block">Add a task →</Link>
                </div>
              ) : (
                openTasks.map((task) => (
                  <div key={task.id} className="px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-start gap-2.5">
                      <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0",
                        task.priority === "urgent" ? "bg-red-400" :
                        task.priority === "high"   ? "bg-amber-400" :
                        task.priority === "medium" ? "bg-indigo-400" : "bg-[#5a5a8a]"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[#e0e0f0] truncate">{task.title}</p>
                        <p className="text-[11px] text-[#5a5a8a] mt-0.5 flex items-center gap-1">
                          <Clock size={10} />{t("dash_due_label")} {task.dueDate}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── AI Insights + Recent Activity ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          <AIInsights clients={clients} tasks={tasks} deals={deals} />

          <div className="bg-[#111128] border border-[#1c1c35] rounded-xl overflow-hidden hover:border-[#252545] transition-colors">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1c1c35]">
              <h2 className="text-[14px] font-semibold text-white">Recent activity</h2>
              <span className="text-[11px] text-[#5a5a8a]">{activity.length} events</span>
            </div>
            <ActivityFeed activities={activity} />
          </div>
        </div>

        {/* ── Recent deals table ── */}
        {deals.length > 0 && (
          <div className="bg-[#111128] border border-[#1c1c35] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1c1c35]">
              <h2 className="text-[14px] font-semibold text-white">All deals</h2>
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-[#5a5a8a]">
                  ${(deals.reduce((a, d) => a + d.value, 0) / 1000).toFixed(0)}K {t("dash_total")}
                </span>
                <Link href="/pipeline" className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                  <MoreHorizontal size={16} className="text-[#5a5a8a]" />
                </Link>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1c1c35]">
                    {[t("dash_col_deal"), t("dash_col_stage"), t("dash_col_value"), t("dash_col_prob"), t("dash_col_close")].map((h) => (
                      <th key={h} className="text-left text-[11px] font-medium text-[#5a5a8a] uppercase tracking-wider px-5 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c1c35]">
                  {deals.slice(0, 5).map((deal) => (
                    <tr key={deal.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-full bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                            {deal.clientAvatar?.slice(0, 1) ?? "?"}
                          </div>
                          <div>
                            <p className="text-[13px] font-medium text-[#e0e0f0]">{deal.title}</p>
                            <p className="text-[11px] text-[#5a5a8a]">{deal.clientName}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={cn("text-[11px] font-medium px-2 py-1 rounded-md", stageColors[deal.stage])}>
                          {stageLabel[deal.stage]}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] font-semibold text-white">${deal.value.toLocaleString()}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-[#1c1c35] rounded-full overflow-hidden">
                            <div className="h-full bg-linear-to-r from-indigo-500 to-violet-500 rounded-full" style={{ width: `${deal.probability}%` }} />
                          </div>
                          <span className="text-[11px] text-[#8080a8]">{deal.probability}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-[#8080a8]">{deal.expectedClose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Onboarding wizard overlay */}
      {showWizard && <OnboardingWizard onComplete={handleWizardComplete} />}
    </div>
  );
}
