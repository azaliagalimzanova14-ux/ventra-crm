"use client";

/**
 * /deals/[id] — Deal Detail Page (M13)
 *
 * Shows:
 *  - Deal header (title, value, probability, status badge)
 *  - Stage progression bar with current stage highlighted
 *  - Deal metadata (client, expected close, assigned, currency, description)
 *  - Move to stage quick actions
 *  - Linked tasks (from /api/tasks?deal_id=...)
 *  - Activity feed from /api/activity?entity_id=...
 *  - Edit / Delete actions
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams }              from "next/navigation";
import { TopBar }                            from "@/components/layout/top-bar";
import Link                                  from "next/link";
import { cn }                                from "@/lib/utils";
import {
  Loader2, ArrowLeft, Pencil, Trash2, AlertCircle,
  DollarSign, Calendar, User, Target, Check, X,
  ChevronRight, CheckCircle2, Circle, Clock, Sparkles, RefreshCw,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DealStage {
  id:          string;
  name:        string;
  order_index: number;
  color:       string;
  is_won:      number;
  is_lost:     number;
  is_default:  number;
}

interface Deal {
  id:               string;
  title:            string;
  client_id:        string | null;
  client_name:      string | null;
  stage_id:         string;
  stage:            DealStage;
  value:            number;
  currency:         string;
  probability:      number;
  expected_close:   string | null;
  assigned_user_id: string | null;
  description:      string | null;
  status:           "open" | "won" | "lost";
  created_at:       string;
  updated_at:       string;
  closed_at:        string | null;
}

interface DealTask {
  id:          string;
  title:       string;
  status:      "todo" | "in_progress" | "done" | "cancelled";
  priority:    "low" | "medium" | "high" | "urgent";
  due_date:    string | null;
  completed_at: string | null;
}

interface ActivityEntry {
  id:          string;
  type:        string;
  entity_name: string | null;
  detail:      string | null;
  user_id:     string | null;
  created_at:  string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt$(n: number, currency = "USD") {
  if (n >= 1_000_000) return `${currency === "USD" ? "$" : ""}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${currency === "USD" ? "$" : ""}${(n / 1_000).toFixed(0)}K`;
  return `${currency === "USD" ? "$" : ""}${n.toLocaleString()}`;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const TASK_STATUS_ICONS: Record<string, React.ElementType> = {
  done:        CheckCircle2,
  in_progress: Clock,
  cancelled:   X,
  todo:        Circle,
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-600 bg-red-50",
  high:   "text-orange-600 bg-orange-50",
  medium: "text-amber-600 bg-amber-50",
  low:    "text-slate-500 bg-slate-50",
};

// ── Edit Modal ─────────────────────────────────────────────────────────────────

interface EditModalProps {
  deal:    Deal;
  onSave:  (data: Partial<Deal>) => Promise<void>;
  onClose: () => void;
  saving:  boolean;
}

function EditModal({ deal, onSave, onClose, saving }: EditModalProps) {
  const [title,       setTitle]       = useState(deal.title);
  const [value,       setValue]       = useState(deal.value);
  const [probability, setProbability] = useState(deal.probability);
  const [closeDate,   setCloseDate]   = useState(deal.expected_close ?? "");
  const [description, setDescription] = useState(deal.description ?? "");
  const [currency,    setCurrency]    = useState(deal.currency);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-[var(--color-bg)] rounded-xl shadow-2xl w-full max-w-md border border-[var(--color-border)]">
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
          <h2 className="font-semibold text-[var(--color-text-primary)]">Edit Deal</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSave({ title, value, probability, expected_close: closeDate || null, description: description.trim() || null, currency }); }} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Deal Title *</label>
            <input required value={title} onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Value</label>
              <input type="number" min={0} step={100} value={value} onChange={e => setValue(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Probability %</label>
              <input type="number" min={0} max={100} value={probability} onChange={e => setProbability(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]">
                {["USD","EUR","GBP","AED","SAR","JPY","CAD","AUD"].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Expected Close</label>
              <input type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text-primary)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DealDetailPage() {
  const router = useRouter();
  const params = useParams() as { id: string };
  const id     = params.id;

  const [deal,     setDeal]     = useState<Deal | null>(null);
  const [stages,   setStages]   = useState<DealStage[]>([]);
  const [tasks,    setTasks]    = useState<DealTask[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen,  setDelOpen]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [moving,   setMoving]   = useState(false);

  // AI deal analysis state
  const [aiAnalysis,        setAiAnalysis]        = useState<{
    healthScore: number;
    status: string;
    risks: string[];
    opportunities: string[];
    nextActions: string[];
    summary: string;
  } | null>(null);
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);

  async function fetchAiAnalysis(d: Deal) {
    setAiAnalysisLoading(true);
    try {
      const daysSince = Math.floor((Date.now() - new Date(d.updated_at).getTime()) / 86_400_000);
      const res = await fetch("/api/ai/deal-analysis", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({
          dealId:          d.id,
          title:           d.title,
          stage:           d.stage.name,
          value:           d.value,
          currency:        d.currency,
          probability:     d.probability,
          expectedClose:   d.expected_close,
          daysSinceUpdate: daysSince,
          clientName:      d.client_name,
          description:     d.description,
        }),
      });
      if (res.ok) {
        const data = await res.json() as {
          analysis?: {
            healthScore: number;
            status: string;
            risks: string[];
            opportunities: string[];
            nextActions: string[];
            summary: string;
          }
        };
        setAiAnalysis(data.analysis ?? null);
      }
    } catch { /* silent */ } finally { setAiAnalysisLoading(false); }
  }

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [dealRes, stagesRes, tasksRes, actRes] = await Promise.all([
        fetch(`/api/deals/${id}`),
        fetch("/api/deal-stages"),
        fetch(`/api/tasks?deal_id=${id}&limit=50`),
        fetch(`/api/activity?entity_id=${id}&limit=20`),
      ]);
      if (!dealRes.ok) { setError("Deal not found"); return; }
      const { deal }      = await dealRes.json()    as { deal: Deal };
      const { stages }    = await stagesRes.json()  as { stages: DealStage[] };
      const { tasks }     = await tasksRes.json()   as { tasks?: DealTask[] };
      const { entries }   = await actRes.json()     as { entries?: ActivityEntry[] };
      setDeal(deal); setStages(stages);
      setTasks(tasks ?? []); setActivity(entries ?? []);
      // Fire AI analysis in background
      void fetchAiAnalysis(deal);
    } catch {
      setError("Failed to load deal");
    } finally {
      setLoading(false);
    }
    }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleEdit(data: Partial<Deal>) {
    if (!deal) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/deals/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (res.ok) {
        const { deal: updated } = await res.json() as { deal: Deal };
        setDeal(updated); setEditOpen(false);
      }
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    const res = await fetch(`/api/deals/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/deals");
  }

  async function handleMoveStage(stageId: string) {
    setMoving(true);
    try {
      const res = await fetch(`/api/deals/${id}/stage`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage_id: stageId }),
      });
      if (res.ok) {
        const { deal: updated } = await res.json() as { deal: Deal };
        setDeal(updated);
      }
    } finally { setMoving(false); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex flex-col h-full">
      <TopBar title="Deal" />
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--color-accent)]" />
      </div>
    </div>
  );

  if (error || !deal) return (
    <div className="flex flex-col h-full">
      <TopBar title="Deal" />
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <span>{error ?? "Deal not found"}</span>
        </div>
      </div>
    </div>
  );

  const stagesSorted = [...stages].sort((a, b) => a.order_index - b.order_index);
  const currentStageIdx = stagesSorted.findIndex(s => s.id === deal.stage_id);

  return (
    <div className="flex flex-col h-full">
      <TopBar title={deal.title} />

      <div className="flex-1 overflow-auto p-6 max-w-4xl mx-auto w-full">
        {/* Back */}
        <Link href="/deals" className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] mb-5">
          <ArrowLeft className="w-4 h-4" /> Back to Deals
        </Link>

        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-5 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{deal.title}</h1>
              {deal.status !== "open" && (
                <span className={cn(
                  "flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full",
                  deal.status === "won" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600",
                )}>
                  {deal.status === "won" ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  {deal.status === "won" ? "Won" : "Lost"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-[var(--color-text-muted)]">
              <span className="font-semibold text-[var(--color-text-primary)] text-base">{fmt$(deal.value, deal.currency)}</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Target className="w-3.5 h-3.5" />
                {deal.probability}% probability
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setEditOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            <button onClick={() => setDelOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-sm text-red-600 hover:bg-red-50">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>

        {/* ── Stage progression ── */}
        <div className="mb-6 p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
          <p className="text-xs font-medium text-[var(--color-text-muted)] mb-3">Pipeline Stage</p>
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {stagesSorted.map((stage, idx) => {
              const isCurrent = stage.id === deal.stage_id;
              const isPast    = idx < currentStageIdx;
              return (
                <div key={stage.id} className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => !isCurrent && deal.status === "open" && handleMoveStage(stage.id)}
                    disabled={isCurrent || deal.status !== "open" || moving}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                      isCurrent
                        ? "text-white ring-2 ring-offset-1"
                        : isPast
                        ? "opacity-60 hover:opacity-100 cursor-pointer"
                        : deal.status === "open"
                        ? "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] cursor-pointer"
                        : "cursor-default opacity-40",
                    )}
                    style={isCurrent
                      ? { backgroundColor: stage.color }
                      : isPast
                      ? { backgroundColor: stage.color + "20", color: stage.color }
                      : undefined}
                  >
                    {isCurrent && <span className="mr-1">●</span>}
                    {stage.name}
                  </button>
                  {idx < stagesSorted.length - 1 && (
                    <ChevronRight className="w-3 h-3 text-[var(--color-text-muted)] shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
          {deal.status === "open" && (
            <p className="text-xs text-[var(--color-text-muted)] mt-2">Click a stage above to move this deal</p>
          )}
        </div>

        {/* ── Info grid ── */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {[
            { label: "Client",         value: deal.client_name, icon: User,
              href: undefined },
            { label: "Expected Close", value: deal.expected_close ?? "—",  icon: Calendar, href: undefined },
            { label: "Currency",       value: deal.currency,                icon: DollarSign, href: undefined },
            { label: "Stage",          value: deal.stage.name,              icon: Target, href: undefined },
          ].map(info => (
            <div key={info.label} className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
              <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] mb-1">
                <info.icon className="w-3.5 h-3.5" />
                {info.label}
              </div>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{info.value ?? "—"}</p>
            </div>
          ))}
        </div>

        {/* Description */}
        {deal.description && (
          <div className="mb-6 p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
            <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2">Description</p>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">{deal.description}</p>
          </div>
        )}

        {/* ── AI Deal Health ── */}
        <div className="mb-6 p-4 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-violet-600" />
              <p className="text-xs font-bold uppercase tracking-wider text-violet-700">AI Deal Health</p>
            </div>
            <button
              onClick={() => void fetchAiAnalysis(deal)}
              disabled={aiAnalysisLoading}
              className="flex items-center gap-1 text-[10px] text-violet-600 hover:opacity-70 disabled:opacity-40"
            >
              <RefreshCw className={cn("w-3 h-3", aiAnalysisLoading && "animate-spin")} />
              {aiAnalysisLoading ? "Analysing…" : "Refresh"}
            </button>
          </div>
          {aiAnalysisLoading && !aiAnalysis && (
            <div className="flex items-center gap-2 text-[12px] text-violet-600">
              <Loader2 className="w-3 h-3 animate-spin" /> Analysing deal…
            </div>
          )}
          {aiAnalysis && (
            <div className="space-y-3">
              {/* Health score bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-violet-700 font-medium">Health Score</span>
                  <span className={cn("font-bold",
                    aiAnalysis.healthScore >= 70 ? "text-emerald-600" :
                    aiAnalysis.healthScore >= 40 ? "text-amber-600" : "text-red-600",
                  )}>{aiAnalysis.healthScore}/100</span>
                </div>
                <div className="h-1.5 bg-violet-100 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all",
                      aiAnalysis.healthScore >= 70 ? "bg-emerald-500" :
                      aiAnalysis.healthScore >= 40 ? "bg-amber-500" : "bg-red-500",
                    )}
                    style={{ width: `${aiAnalysis.healthScore}%` }}
                  />
                </div>
              </div>
              <p className="text-[12px] text-[var(--color-fg)] leading-relaxed">{aiAnalysis.summary}</p>
              {aiAnalysis.risks.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 mb-1">Risks</p>
                  <ul className="space-y-0.5">
                    {aiAnalysis.risks.map((r, i) => (
                      <li key={i} className="text-[11px] text-[var(--color-fg)] flex items-start gap-1.5">
                        <span className="text-red-400 flex-shrink-0 mt-0.5">•</span>{r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {aiAnalysis.nextActions.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700 mb-1">Next Actions</p>
                  <ul className="space-y-0.5">
                    {aiAnalysis.nextActions.map((a, i) => (
                      <li key={i} className="text-[11px] text-[var(--color-fg)] flex items-start gap-1.5">
                        <span className="text-violet-400 flex-shrink-0 mt-0.5">→</span>{a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {!aiAnalysisLoading && !aiAnalysis && (
            <p className="text-[12px] text-violet-500 italic">Click Refresh to analyse this deal with AI.</p>
          )}
        </div>

        {/* ── Linked Tasks ── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Linked Tasks</h2>
            <Link href={`/tasks`} className="text-xs text-[var(--color-accent)] hover:underline flex items-center gap-1">
              All tasks <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {tasks.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">No tasks linked to this deal.</p>
          ) : (
            <div className="space-y-2">
              {tasks.map(task => {
                const StatusIcon = TASK_STATUS_ICONS[task.status] ?? Circle;
                return (
                  <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
                    <StatusIcon className={cn("w-4 h-4 shrink-0",
                      task.status === "done"        ? "text-emerald-500" :
                      task.status === "in_progress" ? "text-amber-500"   :
                      task.status === "cancelled"   ? "text-slate-400"   :
                      "text-[var(--color-text-muted)]",
                    )} />
                    <span className={cn("flex-1 text-sm", task.status === "done" || task.status === "cancelled" ? "line-through text-[var(--color-text-muted)]" : "text-[var(--color-text-primary)]")}>
                      {task.title}
                    </span>
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", PRIORITY_COLORS[task.priority] ?? "")}>
                      {task.priority}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Activity Feed ── */}
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Activity</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">No activity recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {activity.map(entry => (
                <div key={entry.id} className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--color-text-secondary)] leading-snug">
                      {entry.detail ?? entry.type.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{relTime(entry.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editOpen && (
        <EditModal
          deal={deal}
          onSave={handleEdit}
          onClose={() => setEditOpen(false)}
          saving={saving}
        />
      )}

      {/* Delete confirm */}
      {delOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[var(--color-bg)] rounded-xl shadow-2xl w-full max-w-sm border border-[var(--color-border)] p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-[var(--color-text-primary)]">Delete deal?</p>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  &ldquo;{deal.title}&rdquo; will be permanently deleted.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDelOpen(false)} className="flex-1 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]">Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
