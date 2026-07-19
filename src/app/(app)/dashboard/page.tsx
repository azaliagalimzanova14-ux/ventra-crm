"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { TopBar }           from "@/components/layout/top-bar";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { SetupChecklist }   from "@/components/onboarding/setup-checklist";
import { ClientModal }      from "@/components/clients/client-modal";
import { TaskModal }        from "@/components/tasks/task-modal";
import { DealModal }        from "@/components/pipeline/deal-modal";
import { ActivityFeed }     from "@/components/dashboard/activity-feed";
import { AIInsights }          from "@/components/dashboard/ai-insights";
import { OnboardingProgress }  from "@/components/onboarding/onboarding-progress";
import { useLanguage }      from "@/context/language-context";
import { useTheme }         from "@/context/theme-context";
import {
  getClients, getProjects, getTasks, getDeals,
  saveClients, saveTasks, saveDeals,
  isOnboardingDone, getSetupProgress, logActivity,
} from "@/lib/storage";
import { generateActivity } from "@/lib/activity";
import type { Client, Project, Task, Deal, Activity } from "@/lib/types";
import {
  Users, DollarSign, TrendingUp, CheckSquare,
  Clock, ChevronRight, Plus, Circle,
  Mail, Phone, Calendar, ArrowUpRight,
  AlertTriangle, Zap, Sparkles, RefreshCw, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeClient }  from "@/lib/normalize";
import { AVATAR_GRADIENTS } from "@/lib/constants";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function daysAgo(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}


// ─── Sub-components ───────────────────────────────────────────────────────────

/** Thin card shell */
function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden",
      className
    )}>
      {children}
    </div>
  );
}

/** Section header inside a panel */
function PanelHead({
  title, count, href, action,
}: { title: string; count?: number; href?: string; action?: React.ReactNode }) {
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

/** Empty state inside a panel */
function Empty({ icon: Icon, text, sub }: { icon: React.ElementType; text: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-8 px-4 text-center">
      <Icon size={20} className="text-[var(--color-fg-faint)]" strokeWidth={1.5} />
      <p className="text-[12px] font-medium text-[var(--color-fg-muted)]">{text}</p>
      {sub && <p className="text-[11px] text-[var(--color-fg-faint)]">{sub}</p>}
    </div>
  );
}

// ─── Revenue sparkline ────────────────────────────────────────────────────────

function RevenueTrend({ projects, deals }: { projects: Project[]; deals: Deal[] }) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const now = new Date();
  const data = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const m = d.getMonth(); const y = d.getFullYear();
    const billed = projects
      .filter((p) => { const pd = new Date(p.dueDate); return pd.getMonth() === m && pd.getFullYear() === y; })
      .reduce((s, p) => s + (p.spent || 0), 0);
    const won = deals
      .filter((d2) => { if (d2.stage !== "closed_won") return false; const cd = new Date(d2.expectedClose); return cd.getMonth() === m && cd.getFullYear() === y; })
      .reduce((s, d2) => s + d2.value, 0);
    return { month: months[m], revenue: billed + won };
  });

  const totalWon  = deals.filter((d) => d.stage === "closed_won").reduce((s, d) => s + d.value, 0);
  const pipeline  = deals.filter((d) => d.stage !== "closed_lost").reduce((s, d) => s + d.value, 0);
  const winRate   = deals.length ? Math.round((deals.filter((d) => d.stage === "closed_won").length / deals.length) * 100) : 0;
  const hasData   = data.some((r) => r.revenue > 0);

  return (
    <Panel>
      <PanelHead title="Revenue & Sales" href="/analytics" />
      <div className="p-5">
        {/* KPI row */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          {[
            { label: "Revenue won",    value: fmt$(totalWon),  color: "text-emerald-600" },
            { label: "Pipeline value", value: fmt$(pipeline),  color: "text-[var(--color-accent)]" },
            { label: "Win rate",       value: `${winRate}%`,   color: "text-violet-600" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p className={cn("text-[22px] font-bold leading-none tabular-nums", color)}>{value}</p>
              <p className="text-[11px] text-[var(--color-fg-faint)] mt-1 font-medium">{label}</p>
            </div>
          ))}
        </div>

        {/* Chart */}
        {hasData ? (
          <ResponsiveContainer width="100%" height={110}>
            <AreaChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <defs>
                <linearGradient id="revG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="var(--color-accent)" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "var(--color-fg-faint)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--color-fg-faint)", fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-white border border-[var(--color-border)] rounded-xl px-3 py-2 shadow-lg text-[12px]">
                      <p className="text-[var(--color-fg-faint)] mb-0.5">{label}</p>
                      <p className="font-semibold text-[var(--color-fg)]">{fmt$(payload[0].value as number)}</p>
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="revenue" stroke="var(--color-accent)" strokeWidth={1.5}
                fill="url(#revG)" dot={false}
                activeDot={{ r: 3, fill: "var(--color-accent)", stroke: "white", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[110px] flex items-center justify-center">
            <p className="text-[12px] text-[var(--color-fg-faint)]">No revenue data yet —{" "}
              <Link href="/pipeline" className="text-[var(--color-accent)] hover:underline">add deals</Link>
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
}

// ─── Tasks today ──────────────────────────────────────────────────────────────

const PRIO_DOT: Record<string, string> = {
  urgent: "bg-red-500",
  high:   "bg-amber-500",
  medium: "bg-[var(--color-accent)]",
  low:    "bg-gray-300",
};

function TasksToday({ tasks, onAddTask }: { tasks: Task[]; onAddTask: () => void }) {
  const now = new Date();
  const today = tasks.filter((t) => {
    if (t.status === "done" || t.status === "cancelled") return false;
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  });
  const overdue = tasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled" && t.dueDate && new Date(t.dueDate) < now &&
      !(new Date(t.dueDate).toDateString() === now.toDateString())
  );

  const all = [...overdue.slice(0, 3), ...today].slice(0, 8);

  return (
    <Panel>
      <PanelHead title="Tasks for today" count={today.length + overdue.length} href="/tasks"
        action={
          <div className="flex items-center gap-2">
            {overdue.length > 0 && (
              <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">
                {overdue.length} overdue
              </span>
            )}
            <button onClick={onAddTask}
              className="p-1 rounded-md text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)] transition-colors">
              <Plus size={13} />
            </button>
          </div>
        }
      />
      {all.length === 0 ? (
        <Empty icon={CheckSquare} text="All clear for today" sub="No tasks due — add one to stay on track" />
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {all.map((task) => {
            const isOverdue = task.dueDate && new Date(task.dueDate) < now && new Date(task.dueDate).toDateString() !== now.toDateString();
            return (
              <Link key={task.id} href="/tasks"
                className="flex items-start gap-3 px-5 py-3 hover:bg-[var(--color-canvas)] transition-colors group">
                <Circle size={14} className="text-[var(--color-fg-faint)] mt-0.5 flex-shrink-0 group-hover:text-[var(--color-accent)] transition-colors" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className={cn("text-[13px] font-medium leading-snug truncate", isOverdue ? "text-red-600" : "text-[var(--color-fg)]")}>
                    {task.title}
                  </p>
                  {task.projectName && (
                    <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5 truncate">{task.projectName}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={cn("w-1.5 h-1.5 rounded-full", PRIO_DOT[task.priority] ?? "bg-gray-300")} />
                  {isOverdue ? (
                    <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">overdue</span>
                  ) : (
                    task.dueDate && <span className="text-[10px] text-[var(--color-fg-faint)]">{task.dueDate.slice(5)}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ─── Deals requiring attention ────────────────────────────────────────────────

const STAGE_BADGE: Record<string, string> = {
  lead:        "bg-gray-100 text-gray-600",
  qualified:   "bg-blue-50 text-blue-700",
  proposal:    "bg-violet-50 text-violet-700",
  negotiation: "bg-amber-50 text-amber-700",
  closed_won:  "bg-emerald-50 text-emerald-700",
  closed_lost: "bg-red-50 text-red-600",
};

function DealsAttention({ deals }: { deals: Deal[] }) {
  const { t } = useLanguage();
  const now = new Date();

  const stageLabel: Record<string, string> = {
    lead: t("stage_lead"), qualified: t("stage_qualified"), proposal: t("stage_proposal"),
    negotiation: t("stage_negotiation"), closed_won: t("stage_closed_won"), closed_lost: t("stage_closed_lost"),
  };

  // Score deals by urgency
  interface ScoredDeal { deal: Deal; reason: string; score: number; urgentColor: string }
  const scored: ScoredDeal[] = [];

  deals.forEach((d) => {
    if (d.stage === "closed_won" || d.stage === "closed_lost") return;
    const daysToClose = (new Date(d.expectedClose).getTime() - now.getTime()) / 86_400_000;
    const daysPast    = -daysToClose;

    if (daysPast > 0) {
      scored.push({ deal: d, reason: `${Math.floor(daysPast)}d past close date`, score: 100, urgentColor: "text-red-500" });
    } else if (daysToClose <= 3) {
      scored.push({ deal: d, reason: `Closing in ${Math.ceil(daysToClose)}d`, score: 90, urgentColor: "text-amber-600" });
    } else if (daysToClose <= 7) {
      scored.push({ deal: d, reason: `Closing in ${Math.ceil(daysToClose)}d`, score: 80, urgentColor: "text-amber-500" });
    } else if (d.probability >= 80) {
      scored.push({ deal: d, reason: `${d.probability}% probability — ready`, score: 70, urgentColor: "text-emerald-600" });
    }
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 5);

  return (
    <Panel>
      <PanelHead title="Deals requiring attention" count={top.length} href="/pipeline" />
      {top.length === 0 ? (
        <Empty icon={TrendingUp} text="Pipeline looks healthy" sub="No deals need immediate attention" />
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {top.map(({ deal, reason, urgentColor }) => (
            <Link key={deal.id} href="/pipeline"
              className="flex items-center gap-3 px-5 py-3.5 hover:bg-[var(--color-canvas)] transition-colors group">
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                {deal.clientAvatar?.slice(0, 2) ?? "?"}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[var(--color-fg)] truncate">{deal.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-md", STAGE_BADGE[deal.stage])}>
                    {stageLabel[deal.stage]}
                  </span>
                  <span className={cn("text-[10px] font-medium", urgentColor)}>{reason}</span>
                </div>
              </div>
              {/* Value */}
              <div className="text-right flex-shrink-0">
                <p className="text-[13px] font-semibold text-[var(--color-fg)]">{fmt$(deal.value)}</p>
                <p className="text-[10px] text-[var(--color-fg-faint)]">{deal.probability}%</p>
              </div>
              <ChevronRight size={13} className="text-[var(--color-fg-faint)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ─── Unified comms preview ────────────────────────────────────────────────────

const GRAD = AVATAR_GRADIENTS;

function CommsPreview({ clients }: { clients: Client[] }) {
  // Sort by most recently contacted, show top 5 active clients
  const recent = [...clients]
    .filter((c) => c.status === "active" && c.lastContact)
    .sort((a, b) => new Date(b.lastContact).getTime() - new Date(a.lastContact).getTime())
    .slice(0, 5);

  return (
    <Panel>
      <PanelHead title="Client contacts" href="/clients" />
      {recent.length === 0 ? (
        <Empty icon={Mail} text="No clients yet" sub="Add clients to track communication" />
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {recent.map((c, i) => {
            const days = daysAgo(c.lastContact);
            const isStale = days > 14;
            return (
              <Link key={c.id} href="/clients"
                className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-canvas)] transition-colors group">
                <div className={cn("w-8 h-8 rounded-full bg-linear-to-br flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0", GRAD[i % GRAD.length])}>
                  {c.avatar?.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--color-fg)] truncate">{c.name}</p>
                  <p className="text-[11px] text-[var(--color-fg-faint)] truncate">{c.company}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {isStale && (
                    <AlertTriangle size={11} className="text-amber-500" />
                  )}
                  <span className={cn("text-[10px] font-medium", isStale ? "text-amber-600" : "text-[var(--color-fg-faint)]")}>
                    {days === 0 ? "today" : days === 1 ? "1d ago" : `${days}d ago`}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Quick action row */}
      <div className="flex items-center gap-1 px-5 py-3 border-t border-[var(--color-border)]">
        <span className="text-[11px] text-[var(--color-fg-faint)]">Reach out via</span>
        <Link href="/clients" className="flex items-center gap-1 ml-2 text-[11px] text-[var(--color-fg-muted)] hover:text-[var(--color-accent)] transition-colors">
          <Mail size={11} /> Email
        </Link>
        <span className="text-[var(--color-border)] mx-1">·</span>
        <Link href="/clients" className="flex items-center gap-1 text-[11px] text-[var(--color-fg-muted)] hover:text-[var(--color-accent)] transition-colors">
          <Phone size={11} /> Phone
        </Link>
        <span className="text-[var(--color-border)] mx-1">·</span>
        <Link href="/clients" className="flex items-center gap-1 text-[11px] text-[var(--color-fg-muted)] hover:text-[var(--color-accent)] transition-colors">
          <Calendar size={11} /> Meeting
        </Link>
      </div>
    </Panel>
  );
}

// ─── Dashboard page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t }    = useLanguage();
  const { sw }   = useTheme();

  const [clients,  setClients]  = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks,    setTasks]    = useState<Task[]>([]);
  const [deals,    setDeals]    = useState<Deal[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [showWizard,         setShowWizard]         = useState(false);
  const [showChecklist,      setShowChecklist]      = useState(false);
  const [checklistDismissed, setChecklistDismissed] = useState(false);

  // Server-backed task summary (from /api/tasks/summary)
  const [taskSummary, setTaskSummary] = useState<{
    my_tasks: number; overdue: number; due_today: number; completed_today: number; upcoming: number;
  } | null>(null);

  // Server-backed deal summary (from /api/deals/summary)
  const [dealSummary, setDealSummary] = useState<{
    open_count: number; pipeline_value: number; won_count: number; won_revenue: number; forecast: number; currency: string;
  } | null>(null);

  // LLM-powered AI coaching insights (from /api/ai/insights)
  const [aiCoachingInsights, setAiCoachingInsights] = useState<Array<{
    type: string; title: string; body: string; action?: string; priority: string;
  }>>([]);
  const [aiCoachingLoading, setAiCoachingLoading] = useState(false);

  // Quick-action modal state
  const [qModal, setQModal] = useState<"client" | "task" | "deal" | null>(null);

  useEffect(() => {
    setClients(getClients());
    setProjects(getProjects());
    setTasks(getTasks());
    setDeals(getDeals());
    setActivity(generateActivity());
    if (!isOnboardingDone()) setShowWizard(true);
    if (getSetupProgress().length < 5 && !checklistDismissed) setShowChecklist(true);
    // Fetch server-backed task summary
    void fetch("/api/tasks/summary", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { my_tasks?: number; overdue?: number; due_today?: number; completed_today?: number; upcoming?: number }) => {
        setTaskSummary({
          my_tasks:        d.my_tasks        ?? 0,
          overdue:         d.overdue         ?? 0,
          due_today:       d.due_today       ?? 0,
          completed_today: d.completed_today ?? 0,
          upcoming:        d.upcoming        ?? 0,
        });
      })
      .catch(() => { /* silent — dashboard still works without it */ });
    // Fetch deal pipeline summary
    void fetch("/api/deals/summary", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { open_count?: number; pipeline_value?: number; won_count?: number; won_revenue?: number; forecast?: number; currency?: string }) => {
        setDealSummary({
          open_count:     d.open_count     ?? 0,
          pipeline_value: d.pipeline_value ?? 0,
          won_count:      d.won_count      ?? 0,
          won_revenue:    d.won_revenue    ?? 0,
          forecast:       d.forecast       ?? 0,
          currency:       d.currency       ?? "USD",
        });
      })
      .catch(() => { /* silent */ });
    // Fetch LLM-powered AI insights
    setAiCoachingLoading(true);
    void fetch("/api/ai/insights", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { insights?: { type: string; title: string; body: string; action?: string; priority: string }[] }) => {
        setAiCoachingInsights(Array.isArray(d.insights) ? d.insights : []);
      })
      .catch(() => { /* silent — AI may not be configured */ })
      .finally(() => setAiCoachingLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleWizardComplete = useCallback(() => {
    setShowWizard(false);
    setClients(getClients());
    setProjects(getProjects());
    setActivity(generateActivity());
    if (getSetupProgress().length < 5) setShowChecklist(true);
  }, []);

  // Quick-action save handlers
  function handleClientSave(client: Client) {
    const safe = normalizeClient(client);
    const cur  = getClients();
    const isNew = !cur.find((c) => c.id === safe.id);
    saveClients(isNew ? [safe, ...cur] : cur.map((c) => c.id === safe.id ? safe : c));
    logActivity({ type: "client_added", title: `${safe.name} added`, description: safe.company, avatar: safe.avatar });
    setClients(getClients());
    setActivity(generateActivity());
    setQModal(null);
  }

  function handleTaskSave(task: Task) {
    const cur   = getTasks();
    const isNew = !cur.find((t) => t.id === task.id);
    saveTasks(isNew ? [task, ...cur] : cur.map((t) => t.id === task.id ? task : t));
    logActivity({ type: "task_created", title: "Task created", description: task.title });
    setTasks(getTasks());
    setActivity(generateActivity());
    setQModal(null);
  }

  function handleDealSave(data: Omit<Deal, "id">) {
    const cur = getDeals();
    saveDeals([...cur, { ...data, id: `deal-${Date.now()}` }]);
    logActivity({ type: "deal_moved", title: `New deal: ${data.title}`, description: data.clientName, meta: fmt$(data.value) });
    setDeals(getDeals());
    setActivity(generateActivity());
    setQModal(null);
  }

  // ── Derived numbers ────────────────────────────────────────────────────────
  const now          = new Date();
  const activeClients = clients.filter((c) => c.status === "active").length;
  const pipelineVal   = deals.filter((d) => d.stage !== "closed_lost").reduce((s, d) => s + d.value, 0);
  const openTasks     = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const todayTasks    = openTasks.filter((t) => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    return d.toDateString() === now.toDateString();
  });
  const overdueTasks  = openTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now && new Date(t.dueDate).toDateString() !== now.toDateString());
  const closingWeek   = deals.filter((d) => {
    if (d.stage === "closed_won" || d.stage === "closed_lost") return false;
    const days = (new Date(d.expectedClose).getTime() - now.getTime()) / 86_400_000;
    return days >= 0 && days <= 7;
  });
  const needFollowUp  = clients.filter(
    (c) => c.status === "active" && c.lastContact && daysAgo(c.lastContact) >= 14
  );

  // ── Greeting ───────────────────────────────────────────────────────────────
  const hr       = now.getHours();
  const greeting = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  const dateStr  = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // ── Today overview tiles ───────────────────────────────────────────────────
  const tiles = [
    {
      href:    "/tasks",
      icon:    CheckSquare,
      value:   todayTasks.length,
      label:   "Due today",
      accent:  "text-[var(--color-accent)] bg-[var(--color-accent-subtle)]",
      urgent:  false,
    },
    {
      href:    "/tasks",
      icon:    Clock,
      value:   overdueTasks.length,
      label:   "Overdue",
      accent:  overdueTasks.length > 0 ? "text-red-600 bg-red-50" : "text-[var(--color-fg-faint)] bg-[var(--color-canvas)]",
      urgent:  overdueTasks.length > 0,
    },
    {
      href:    "/pipeline",
      icon:    Zap,
      value:   closingWeek.length,
      label:   "Closing this week",
      accent:  closingWeek.length > 0 ? "text-amber-600 bg-amber-50" : "text-[var(--color-fg-faint)] bg-[var(--color-canvas)]",
      urgent:  false,
    },
    {
      href:    "/clients",
      icon:    Users,
      value:   needFollowUp.length,
      label:   "Need follow-up",
      accent:  needFollowUp.length > 0 ? "text-violet-600 bg-violet-50" : "text-[var(--color-fg-faint)] bg-[var(--color-canvas)]",
      urgent:  false,
    },
  ];

  // ── KPI bar ────────────────────────────────────────────────────────────────
  const kpis = [
    { label: t("dash_clients"),      value: activeClients,   display: String(activeClients),   icon: Users,       color: "text-blue-600" },
    { label: t("dash_pipeline_val"), value: pipelineVal,     display: fmt$(pipelineVal),       icon: TrendingUp,  color: "text-emerald-600" },
    { label: "Open tasks",           value: openTasks.length, display: String(openTasks.length), icon: CheckSquare, color: "text-violet-600" },
    { label: "Active deals",         value: deals.filter((d) => d.stage !== "closed_won" && d.stage !== "closed_lost").length,
      display: String(deals.filter((d) => d.stage !== "closed_won" && d.stage !== "closed_lost").length),
      icon: DollarSign, color: "text-amber-600" },
  ];

  return (
    <div className="flex flex-col flex-1 bg-[var(--color-canvas)]">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <TopBar title="Dashboard" subtitle={dateStr} />

      <div className="flex-1 p-4 md:p-6 space-y-5">

        {/* Setup checklist */}
        {showChecklist && !checklistDismissed && (
          <SetupChecklist onDismiss={() => { setChecklistDismissed(true); setShowChecklist(false); }} />
        )}

        {/* ── Section 1: Greeting + Quick Actions ─────────────────────── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[22px] font-bold text-[var(--color-fg)] leading-tight">
              {greeting} 👋
            </h1>
            <p className="text-[13px] text-[var(--color-fg-muted)] mt-0.5">{dateStr}</p>
          </div>

          {/* Quick action buttons */}
          <div className="flex items-center gap-2">
            {[
              { key: "client" as const, label: "Add Client",   icon: Users,       color: "text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100" },
              { key: "task"   as const, label: "Add Task",     icon: CheckSquare, color: "text-violet-700 bg-violet-50 border-violet-200 hover:bg-violet-100" },
              { key: "deal"   as const, label: "Create Deal",  icon: TrendingUp,  color: "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100" },
            ].map(({ key, label, icon: Icon, color }) => (
              <button key={key} onClick={() => setQModal(key)}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[12px] font-semibold transition-colors", color)}>
                <Icon size={12} strokeWidth={sw} />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden"><Plus size={12} /></span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Section 2: Today's Overview (4 tiles) ───────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {tiles.map(({ href, icon: Icon, value, label, accent, urgent }) => (
            <Link key={label} href={href}
              className={cn(
                "flex items-center gap-3 px-4 py-3.5 bg-[var(--color-surface)] border rounded-2xl transition-all hover:shadow-card group",
                urgent ? "border-red-200" : "border-[var(--color-border)]"
              )}>
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", accent)}>
                <Icon size={16} strokeWidth={sw} />
              </div>
              <div>
                <p className="text-[24px] font-bold text-[var(--color-fg)] leading-none tabular-nums">{value}</p>
                <p className="text-[11px] text-[var(--color-fg-muted)] mt-0.5 font-medium">{label}</p>
              </div>
              {urgent && value > 0 && (
                <AlertTriangle size={13} className="text-red-500 ml-auto opacity-70" />
              )}
            </Link>
          ))}
        </div>

        {/* ── Section 3: KPI bar ──────────────────────────────────────── */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl px-6 py-4 flex items-center gap-6 flex-wrap">
          {kpis.map(({ label, display, icon: Icon, color }, i) => (
            <div key={label} className={cn("flex items-center gap-3", i > 0 && "pl-6 border-l border-[var(--color-border)]")}>
              <Icon size={15} className={cn("flex-shrink-0", color)} strokeWidth={sw} />
              <div>
                <p className="text-[16px] font-bold text-[var(--color-fg)] leading-none tabular-nums">{display}</p>
                <p className="text-[10px] text-[var(--color-fg-faint)] mt-0.5 font-medium uppercase tracking-wide">{label}</p>
              </div>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            <Link href="/analytics" className="text-[11px] text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] flex items-center gap-0.5 transition-colors">
              Full analytics <ArrowUpRight size={11} />
            </Link>
          </div>
        </div>

        {/* ── Section 3b: Server-backed task summary widgets ─────────── */}
        {taskSummary && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {([
              { label: "My Tasks",        value: taskSummary.my_tasks,        href: "/tasks",               accent: "text-violet-600 bg-violet-50",  urgent: false },
              { label: "Overdue",         value: taskSummary.overdue,         href: "/tasks?overdue=true",  accent: taskSummary.overdue > 0 ? "text-red-600 bg-red-50" : "text-[var(--color-fg-faint)] bg-[var(--color-canvas)]", urgent: taskSummary.overdue > 0 },
              { label: "Due Today",       value: taskSummary.due_today,       href: "/tasks?due_today=true",accent: "text-amber-600 bg-amber-50",    urgent: false },
              { label: "Done Today",      value: taskSummary.completed_today, href: "/tasks?status=done",   accent: "text-emerald-600 bg-emerald-50",urgent: false },
              { label: "Upcoming (7d)",   value: taskSummary.upcoming,        href: "/tasks",               accent: "text-blue-600 bg-blue-50",      urgent: false },
            ] as { label: string; value: number; href: string; accent: string; urgent: boolean }[]).map(({ label, value, href, urgent }) => (
              <Link key={label} href={href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 bg-[var(--color-surface)] border rounded-2xl transition-all hover:shadow-card",
                  urgent ? "border-red-200" : "border-[var(--color-border)]",
                )}>
                <div>
                  <p className="text-[22px] font-bold text-[var(--color-fg)] leading-none tabular-nums">{value}</p>
                  <p className="text-[10px] text-[var(--color-fg-muted)] mt-0.5 font-medium">{label}</p>
                </div>
                {urgent && value > 0 && (
                  <AlertTriangle size={12} className="text-red-500 ml-auto opacity-70" />
                )}
              </Link>
            ))}
          </div>
        )}

        {/* ── Section 3c: Server-backed deal pipeline widgets ─────────── */}
        {dealSummary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(() => {
              const sym = dealSummary.currency === "USD" ? "$" : dealSummary.currency + " ";
              function fmtV(n: number) {
                if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(1)}M`;
                if (n >= 1_000)     return `${sym}${(n / 1_000).toFixed(0)}K`;
                return `${sym}${n.toLocaleString()}`;
              }
              return ([
                { label: "Open Deals",      display: String(dealSummary.open_count),            href: "/deals",              accent: "text-[var(--color-accent)]" },
                { label: "Pipeline Value",  display: fmtV(dealSummary.pipeline_value),           href: "/deals",              accent: "text-emerald-600" },
                { label: "Won Revenue",     display: fmtV(dealSummary.won_revenue),              href: "/deals?status=won",   accent: "text-emerald-600" },
                { label: "Forecast",        display: fmtV(dealSummary.forecast),                 href: "/deals",              accent: "text-amber-600" },
              ] as { label: string; display: string; href: string; accent: string }[]).map(({ label, display, href, accent }) => (
                <Link key={label} href={href}
                  className="flex items-center gap-3 px-4 py-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl transition-all hover:shadow-card">
                  <div>
                    <p className={cn("text-[20px] font-bold leading-none tabular-nums", accent)}>{display}</p>
                    <p className="text-[10px] text-[var(--color-fg-muted)] mt-0.5 font-medium">{label}</p>
                  </div>
                </Link>
              ));
            })()}
          </div>
        )}

        {/* ── Section 4+5: Tasks + Deals · Section 6: AI Signals ─────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left column — tasks + deals */}
          <div className="lg:col-span-7 space-y-5">
            <TasksToday tasks={tasks} onAddTask={() => setQModal("task")} />
            <DealsAttention deals={deals} />
          </div>

          {/* Right column — onboarding + AI signals + LLM coaching */}
          <div className="lg:col-span-5 space-y-5">
            <OnboardingProgress />
            <AIInsights clients={clients} tasks={tasks} deals={deals} />

            {/* LLM-powered coaching insights */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--color-border)]">
                <div className="w-7 h-7 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center flex-shrink-0">
                  <Sparkles size={13} className="text-violet-600" />
                </div>
                <div className="flex-1">
                  <h2 className="text-[14px] font-semibold text-[var(--color-fg)] leading-tight">AI Sales Coach</h2>
                  <p className="text-[10px] text-[var(--color-fg-faint)]">LLM-powered workspace insights</p>
                </div>
                <button
                  onClick={() => {
                    setAiCoachingLoading(true);
                    void fetch("/api/ai/insights?refresh=true", { credentials: "include" })
                      .then((r) => r.json())
                      .then((d: { insights?: { type: string; title: string; body: string; action?: string; priority: string }[] }) => {
                        setAiCoachingInsights(Array.isArray(d.insights) ? d.insights : []);
                      })
                      .catch(() => { /* silent */ })
                      .finally(() => setAiCoachingLoading(false));
                  }}
                  disabled={aiCoachingLoading}
                  className="text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] transition-colors disabled:opacity-40"
                >
                  <RefreshCw size={12} className={aiCoachingLoading ? "animate-spin" : ""} />
                </button>
              </div>
              {aiCoachingLoading && aiCoachingInsights.length === 0 ? (
                <div className="flex items-center gap-2 px-5 py-6 text-[12px] text-[var(--color-fg-faint)]">
                  <Loader2 size={13} className="animate-spin" /> Generating insights…
                </div>
              ) : aiCoachingInsights.length === 0 ? (
                <div className="px-5 py-6 text-center text-[12px] text-[var(--color-fg-faint)]">
                  <Sparkles size={20} className="text-violet-300 mx-auto mb-2" />
                  Configure <span className="font-mono text-[11px]">OPENAI_API_KEY</span> to enable AI coaching.
                </div>
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {aiCoachingInsights.map((insight, i) => (
                    <div key={i} className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={cn(
                          "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border",
                          insight.priority === "high" ? "bg-red-50 text-red-700 border-red-200" :
                          insight.priority === "medium" ? "bg-amber-50 text-amber-700 border-amber-200" :
                          "bg-violet-50 text-violet-700 border-violet-200",
                        )}>
                          {insight.type.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-[13px] font-semibold text-[var(--color-fg)] leading-snug">{insight.title}</p>
                      <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5 leading-relaxed">{insight.body}</p>
                      {insight.action && (
                        <p className="text-[11px] font-medium text-[var(--color-accent)] mt-1">→ {insight.action}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Section 7+8: Revenue · Activity · Comms ─────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Revenue chart */}
          <div className="lg:col-span-6">
            <RevenueTrend projects={projects} deals={deals} />
          </div>

          {/* Recent client activity */}
          <div className="lg:col-span-3">
            <Panel className="h-full">
              <PanelHead title="Recent activity" count={activity.length} href="/clients" />
              <ActivityFeed activities={activity.slice(0, 6)} />
            </Panel>
          </div>

          {/* Unified comms preview */}
          <div className="lg:col-span-3">
            <CommsPreview clients={clients} />
          </div>
        </div>

      </div>

      {/* ── Quick-action modals ─────────────────────────────────────────── */}
      <ClientModal open={qModal === "client"} onClose={() => setQModal(null)} onSave={handleClientSave} />
      <TaskModal   open={qModal === "task"}   onClose={() => setQModal(null)} onSave={handleTaskSave} />
      <DealModal   open={qModal === "deal"}   onClose={() => setQModal(null)} onSave={handleDealSave} />

      {showWizard && <OnboardingWizard onComplete={handleWizardComplete} />}
    </div>
  );
}
