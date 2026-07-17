"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { TopBar }    from "@/components/layout/top-bar";
import { DealModal } from "@/components/pipeline/deal-modal";
import { TaskModal } from "@/components/tasks/task-modal";
import { useLanguage } from "@/context/language-context";
import { useTheme }    from "@/context/theme-context";
import {
  getDeals, saveDeals, getTasks, saveTasks,
  getClients, getActivityLog, logActivity,
} from "@/lib/storage";
import type { Deal, DealStage, Task, Activity, Client } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Plus, X, TrendingUp, DollarSign, GripVertical, Check,
  AlertTriangle, Clock, Zap, Star, ChevronRight,
  Sparkles, ArrowRight, Mail, Phone, CheckSquare,
  MessageSquare, MoreHorizontal, ArrowLeft,
  SortAsc, Target, Flame, Upload,
} from "lucide-react";
import { AIInsightCard, AIInsightBadge, KIND_STYLES, type AIInsight } from "@/components/ui/ai-insight-card";
import { AppToast }    from "@/components/ui/toast";
import { ImportModal } from "@/components/import-modal";
import type { ImportResult } from "@/lib/import";

// ─── Stage config ─────────────────────────────────────────────────────────────

const STAGES: DealStage[] = [
  "lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost",
];

const STAGE_META: Record<DealStage, {
  label: string; color: string; dot: string;
  headerCls: string; dropCls: string; accent: string;
}> = {
  lead:        { label: "Lead",        color: "text-gray-600",    dot: "bg-gray-400",    headerCls: "bg-gray-50/80",    dropCls: "border-gray-300",    accent: "bg-gray-100" },
  qualified:   { label: "Qualified",   color: "text-blue-700",   dot: "bg-blue-500",    headerCls: "bg-blue-50/80",   dropCls: "border-blue-300",   accent: "bg-blue-100" },
  proposal:    { label: "Proposal",    color: "text-violet-700", dot: "bg-violet-500",  headerCls: "bg-violet-50/80", dropCls: "border-violet-300", accent: "bg-violet-100" },
  negotiation: { label: "Negotiation", color: "text-amber-700",  dot: "bg-amber-500",   headerCls: "bg-amber-50/80",  dropCls: "border-amber-300",  accent: "bg-amber-100" },
  closed_won:  { label: "Won",         color: "text-emerald-700",dot: "bg-emerald-500", headerCls: "bg-emerald-50/80",dropCls: "border-emerald-300",accent: "bg-emerald-100" },
  closed_lost: { label: "Lost",        color: "text-red-600",    dot: "bg-red-500",     headerCls: "bg-red-50/80",    dropCls: "border-red-300",    accent: "bg-red-100" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function daysUntil(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

function daysAgoMs(ms: number): number {
  return Math.floor((Date.now() - ms) / 86_400_000);
}

// ─── AI Deal Insight ──────────────────────────────────────────────────────────
// Returns shared AIInsight — visual styles come from KIND_STYLES in ai-insight-card.tsx

function getDealInsight(deal: Deal, activityLog: Activity[]): AIInsight {
  const untilClose = daysUntil(deal.expectedClose);
  const isActive   = deal.stage !== "closed_won" && deal.stage !== "closed_lost";

  const relevant = activityLog.filter((a) =>
    a.title.toLowerCase().includes(deal.title.toLowerCase()) ||
    a.description?.toLowerCase().includes(deal.clientName.toLowerCase())
  );
  const lastActivityMs    = relevant.length > 0 ? new Date(relevant[0].timestamp).getTime() : null;
  const daysSinceActivity = lastActivityMs !== null ? daysAgoMs(lastActivityMs) : null;

  const idTs        = parseInt(deal.id.replace("deal-", ""), 10);
  const daysInStage = !isNaN(idTs) ? daysAgoMs(idTs) : 0;

  if (!isActive) return deal.stage === "closed_won"
    ? { kind: "ok",   icon: Check, text: "Deal closed — won!",   sub: fmt$(deal.value) + " secured" }
    : { kind: "ok",   icon: X,     text: "Deal closed — lost",   sub: "Archive or revive this deal" };

  if (untilClose < 0)
    return { kind: "danger",      icon: AlertTriangle, text: `Overdue by ${Math.abs(untilClose)} days`,          sub: "Push to close or update timeline" };
  if (deal.probability >= 75 && untilClose <= 7)
    return { kind: "opportunity", icon: Flame,         text: "High chance of closing — follow up today",         sub: `${deal.probability}% probability · closes in ${untilClose}d` };
  if (daysSinceActivity !== null && daysSinceActivity >= 7)
    return { kind: "warning",     icon: Clock,         text: `No activity for ${daysSinceActivity} days`,        sub: "Risk: client may go cold" };
  if (deal.stage === "negotiation" && deal.probability < 50)
    return { kind: "warning",     icon: AlertTriangle, text: "Probability low for negotiation stage",            sub: "Consider re-qualifying the deal" };
  if (daysInStage >= 14 && ["lead", "qualified"].includes(deal.stage))
    return { kind: "warning",     icon: Clock,         text: `Stuck in ${STAGE_META[deal.stage].label} for ${daysInStage}d`, sub: "Move forward or reassess" };
  if (deal.probability >= 70)
    return { kind: "opportunity", icon: Zap,           text: `Strong deal at ${deal.probability}% probability`, sub: untilClose >= 0 ? `Closes in ${untilClose}d` : undefined };
  if (untilClose <= 14)
    return { kind: "action",      icon: Target,        text: `Closing in ${untilClose} days`,                   sub: "Schedule final review" };
  return   { kind: "ok",          icon: Star,          text: "Deal is on track",                                 sub: `${deal.probability}% · closes ${deal.expectedClose}` };
}

// ─── Risk score (for smart sort) ─────────────────────────────────────────────

function getRiskScore(deal: Deal, activityLog: Activity[]): number {
  if (deal.stage === "closed_won" || deal.stage === "closed_lost") return -1;
  let score = 0;
  const untilClose = daysUntil(deal.expectedClose);
  if (untilClose < 0)  score += 50;
  if (untilClose < 7)  score += 20;
  if (deal.probability < 40) score += 15;
  if (deal.stage === "negotiation" && deal.probability < 50) score += 20;
  const relevant = activityLog.filter((a) =>
    a.title.toLowerCase().includes(deal.title.toLowerCase()) ||
    a.description?.toLowerCase().includes(deal.clientName.toLowerCase())
  );
  if (relevant.length === 0) score += 10;
  else {
    const days = daysAgoMs(new Date(relevant[0].timestamp).getTime());
    if (days >= 14) score += 15;
    else if (days >= 7) score += 8;
  }
  return score;
}

// ─── Sort mode ────────────────────────────────────────────────────────────────

type SortMode = "default" | "value" | "risk" | "closing" | "stale";

function sortDealsBy(deals: Deal[], mode: SortMode, activityLog: Activity[]): Deal[] {
  const copy = [...deals];
  switch (mode) {
    case "value":
      return copy.sort((a, b) => b.value - a.value);
    case "risk":
      return copy.sort((a, b) => getRiskScore(b, activityLog) - getRiskScore(a, activityLog));
    case "closing":
      return copy.sort((a, b) => daysUntil(a.expectedClose) - daysUntil(b.expectedClose));
    case "stale": {
      const lastActivity = (d: Deal) => {
        const hit = activityLog.find((a) =>
          a.title.toLowerCase().includes(d.title.toLowerCase()) ||
          a.description?.toLowerCase().includes(d.clientName.toLowerCase())
        );
        return hit ? new Date(hit.timestamp).getTime() : 0;
      };
      return copy.sort((a, b) => lastActivity(a) - lastActivity(b));
    }
    default:
      return copy;
  }
}

// ─── AI next action ───────────────────────────────────────────────────────────

function getNextAction(deal: Deal): string {
  const untilClose = daysUntil(deal.expectedClose);
  if (untilClose < 0 && deal.stage !== "closed_won" && deal.stage !== "closed_lost") return "Deal is overdue — call the client or update the timeline";
  if (deal.probability >= 75 && untilClose <= 7) return "High probability + close date approaching — send final proposal and schedule a call";
  if (deal.stage === "negotiation") return "Draft final terms and send to client for review";
  if (deal.stage === "proposal") return "Follow up on proposal sent — check if they have questions";
  if (deal.stage === "qualified") return "Prepare and send a tailored proposal this week";
  if (deal.stage === "lead") return "Schedule a discovery call to qualify this lead";
  if (deal.stage === "closed_won") return "Kick off onboarding — send welcome email and intro call";
  return "Check in with client and update deal status";
}

// ─── Email draft generator ────────────────────────────────────────────────────

function getDraftEmail(deal: Deal): { subject: string; body: string } {
  const name = deal.clientName.split(" ")[0] || deal.clientName;
  const untilClose = daysUntil(deal.expectedClose);
  if (deal.stage === "proposal") {
    return {
      subject: `Following up on our proposal — ${deal.title}`,
      body: `Hi ${name},\n\nI wanted to follow up on the proposal I sent over for "${deal.title}". Do you have any questions or feedback?\n\nI'm happy to hop on a quick call to walk through the details.\n\nBest,`,
    };
  }
  if (deal.stage === "negotiation") {
    return {
      subject: `Final terms — ${deal.title}`,
      body: `Hi ${name},\n\nI'm reaching out to finalize the terms for "${deal.title}". I've attached the updated agreement for your review.\n\nLet me know if there's anything you'd like to adjust.\n\nBest,`,
    };
  }
  if (untilClose <= 7 && untilClose >= 0) {
    return {
      subject: `Checking in before our deadline — ${deal.title}`,
      body: `Hi ${name},\n\nI wanted to touch base as we approach the closing date for "${deal.title}". Is there anything blocking us from moving forward?\n\nI'd love to resolve any concerns before ${deal.expectedClose}.\n\nBest,`,
    };
  }
  return {
    subject: `Quick check-in — ${deal.title}`,
    body: `Hi ${name},\n\nJust checking in on "${deal.title}" — wanted to make sure everything is still on track and see if there's anything I can help with.\n\nFeel free to reply or give me a call.\n\nBest,`,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ModalState =
  | { open: false }
  | { open: true; mode: "create"; stage: DealStage }
  | { open: true; mode: "edit"; deal: Deal };

type DetailTab = "overview" | "tasks" | "timeline";

// ─── Deal card ────────────────────────────────────────────────────────────────

function DealCard({
  deal, selected, onClick, onEdit, activityLog,
}: {
  deal: Deal; selected: boolean; onClick: () => void; onEdit: () => void;
  activityLog: Activity[];
}) {
  const { sw }    = useTheme();
  const insight   = getDealInsight(deal, activityLog);
  const untilClose = daysUntil(deal.expectedClose);
  const isActive  = deal.stage !== "closed_won" && deal.stage !== "closed_lost";

  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("dealId", deal.id)}
      onClick={onClick}
      className={cn(
        "group relative bg-[var(--color-surface)] border rounded-xl p-3.5 cursor-pointer transition-all duration-150 shadow-sm hover:shadow-md hover:-translate-y-0.5",
        selected
          ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)] shadow-md"
          : "border-[var(--color-border)] hover:border-[var(--color-accent)]/50"
      )}>

      {/* Drag handle */}
      <div className="absolute left-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical size={12} className="text-[var(--color-fg-faint)]" strokeWidth={sw} />
      </div>

      {/* Header */}
      <div className="flex items-start gap-1.5">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[var(--color-fg)] leading-snug line-clamp-2">{deal.title}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <div className="w-4 h-4 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[7px] font-bold text-white flex-shrink-0">
              {(deal.clientAvatar || deal.clientName[0] || "?").slice(0, 1)}
            </div>
            <span className="text-[11px] text-[var(--color-fg-muted)] truncate">{deal.clientName}</span>
          </div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)] transition-all flex-shrink-0">
          <MoreHorizontal size={13} strokeWidth={sw} />
        </button>
      </div>

      {/* Value + probability */}
      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[var(--color-border)]">
        <span className="text-[14px] font-bold text-[var(--color-fg)]">{fmt$(deal.value)}</span>
        <div className="flex items-center gap-1.5">
          <div className="w-12 h-1 bg-[var(--color-border)] rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", deal.probability >= 70 ? "bg-emerald-500" : deal.probability >= 40 ? "bg-amber-500" : "bg-red-400")}
              style={{ width: `${deal.probability}%` }}
            />
          </div>
          <span className="text-[11px] text-[var(--color-fg-faint)] tabular-nums font-medium">{deal.probability}%</span>
        </div>
      </div>

      {/* Close date */}
      {isActive && (
        <div className="flex items-center justify-between mt-2">
          <span className={cn("text-[10px] font-medium flex items-center gap-1",
            untilClose < 0 ? "text-red-600" : untilClose <= 7 ? "text-amber-600" : "text-[var(--color-fg-faint)]"
          )}>
            <ChevronRight size={9} />
            {untilClose < 0
              ? `${Math.abs(untilClose)}d overdue`
              : untilClose === 0 ? "Closes today"
              : `${untilClose}d left`}
          </span>
          {/* AI insight badge */}
          <AIInsightBadge insight={insight} />
        </div>
      )}
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

function KanbanColumn({
  stage, deals, selectedId, onSelectDeal, onAddDeal, onEditDeal,
  onDrop, activityLog,
}: {
  stage: DealStage; deals: Deal[]; selectedId: string | null;
  onSelectDeal: (d: Deal) => void; onAddDeal: () => void; onEditDeal: (d: Deal) => void;
  onDrop: (stage: DealStage) => void; activityLog: Activity[];
}) {
  const { sw }      = useTheme();
  const [isDragOver, setIsDragOver] = useState(false);
  const meta        = STAGE_META[stage];
  const total       = deals.reduce((s, d) => s + d.value, 0);

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border transition-all duration-150 flex-shrink-0 w-[220px]",
        isDragOver ? "border-[var(--color-accent)] bg-[var(--color-accent-subtle)]/20" : "border-[var(--color-border)] bg-[var(--color-canvas)]"
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); onDrop(stage); }}
    >
      {/* Header */}
      <div className={cn("px-3 py-2.5 rounded-t-2xl border-b border-[var(--color-border)] flex items-center gap-2", meta.headerCls)}>
        <span className={cn("w-2 h-2 rounded-full flex-shrink-0", meta.dot)} />
        <span className={cn("text-[12px] font-bold flex-1 truncate", meta.color)}>{meta.label}</span>
        <span className="text-[11px] text-[var(--color-fg-faint)] font-medium">{deals.length}</span>
      </div>

      {/* Column total */}
      {total > 0 && (
        <div className={cn("mx-2.5 mt-2 px-2.5 py-1.5 rounded-xl text-center text-[11px] font-bold", meta.accent, meta.color)}>
          {fmt$(total)}
        </div>
      )}

      {/* Cards */}
      <div className="flex-1 px-2.5 py-2.5 space-y-2 overflow-y-auto min-h-[60px]">
        {deals.length === 0 && (
          <div className={cn("rounded-xl border-2 border-dashed p-3 text-center transition-colors", isDragOver ? meta.dropCls + " bg-[var(--color-surface)]" : "border-[var(--color-border-subtle)]")}>
            <p className="text-[10px] text-[var(--color-fg-faint)]">Drop here</p>
          </div>
        )}
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal}
            selected={selectedId === deal.id}
            onClick={() => onSelectDeal(deal)}
            onEdit={() => onEditDeal(deal)}
            activityLog={activityLog}
          />
        ))}
      </div>

      {/* Add deal */}
      <button onClick={onAddDeal}
        className="mx-2.5 mb-2.5 px-3 py-2 rounded-xl border border-dashed border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)] text-[11px] text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] transition-all flex items-center gap-1.5 font-semibold">
        <Plus size={11} strokeWidth={sw} /> Add deal
      </button>
    </div>
  );
}

// ─── AI Priority Bar ──────────────────────────────────────────────────────────

function AIPriorityBar({
  deals, activityLog, onSelect,
}: {
  deals: Deal[]; activityLog: Activity[]; onSelect: (d: Deal) => void;
}) {
  const priority = useMemo(() => {
    const active = deals.filter((d) => d.stage !== "closed_won" && d.stage !== "closed_lost");
    return active
      .map((d) => ({ deal: d, score: getRiskScore(d, activityLog), insight: getDealInsight(d, activityLog) }))
      .sort((a, b) => {
        // Overdue & high prob closing first, then by score
        const aUntil = daysUntil(a.deal.expectedClose);
        const bUntil = daysUntil(b.deal.expectedClose);
        if (a.deal.probability >= 75 && aUntil <= 7 && aUntil >= 0) return -1;
        if (b.deal.probability >= 75 && bUntil <= 7 && bUntil >= 0) return 1;
        return b.score - a.score;
      })
      .slice(0, 3);
  }, [deals, activityLog]);

  if (priority.length === 0) return null;

  return (
    <div className="px-4 md:px-6 mb-0">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-lg bg-[var(--color-accent-subtle)] flex items-center justify-center">
          <Sparkles size={11} className="text-[var(--color-accent)]" />
        </div>
        <span className="text-[12px] font-bold text-[var(--color-fg)]">Focus today</span>
        <span className="text-[11px] text-[var(--color-fg-faint)]">AI-prioritized deals that need your attention</span>
      </div>
      <div className="flex items-stretch gap-3 flex-wrap">
        {priority.map(({ deal, insight }) => {
          const style      = KIND_STYLES[insight.kind];
          const InsightIcon = insight.icon;
          const untilClose  = daysUntil(deal.expectedClose);
          return (
            <button key={deal.id} onClick={() => onSelect(deal)}
              className={cn(
                "flex items-start gap-3 p-3 rounded-xl border text-left transition-all hover:shadow-md flex-1 min-w-[200px] max-w-xs",
                style.panel
              )}>
              <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5", style.badge)}>
                <InsightIcon size={11} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-[var(--color-fg)] truncate">{deal.title}</p>
                <p className="text-[11px] text-[var(--color-fg-muted)] truncate">{deal.clientName} · {fmt$(deal.value)}</p>
                <p className="text-[11px] font-medium mt-0.5 leading-snug opacity-80">
                  {insight.kind === "danger" ? `Overdue ${Math.abs(untilClose)}d` : insight.text}
                </p>
              </div>
              <ArrowRight size={12} className="text-[var(--color-fg-faint)] flex-shrink-0 mt-1" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Email draft modal ────────────────────────────────────────────────────────

function EmailModal({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const { subject, body } = getDraftEmail(deal);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-[14px] font-semibold text-[var(--color-fg)]">Draft email</h2>
            <p className="text-[11px] text-[var(--color-fg-faint)]">AI-generated follow-up for {deal.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:bg-[var(--color-canvas)] transition-colors"><X size={15} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <p className="text-[11px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider mb-1">To</p>
            <p className="text-[13px] text-[var(--color-fg)]">{deal.clientName}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider mb-1">Subject</p>
            <input defaultValue={subject} className="w-full h-9 px-3 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg text-[13px] text-[var(--color-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider mb-1">Body</p>
            <textarea defaultValue={body} rows={7} className="w-full px-3 py-2.5 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg text-[13px] text-[var(--color-fg)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] leading-relaxed" />
          </div>
          <div className="flex gap-2 pt-1">
            <a href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[13px] font-semibold transition-colors">
              <Mail size={12} /> Open in email
            </a>
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-[var(--color-border)] text-[13px] font-medium text-[var(--color-fg-muted)] hover:bg-[var(--color-canvas)] transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Deal detail panel ────────────────────────────────────────────────────────

function DealDetailPanel({
  deal, allTasks, activityLog, allClients,
  onEdit, onClose, onAddTask, onOpenEmail, onUpdateStage,
}: {
  deal:        Deal;
  allTasks:    Task[];
  activityLog: Activity[];
  allClients:  Client[];
  onEdit:      () => void;
  onClose:     () => void;
  onAddTask:   () => void;
  onOpenEmail: () => void;
  onUpdateStage: (stage: DealStage) => void;
}) {
  const { sw }  = useTheme();
  const [tab, setTab] = useState<DetailTab>("overview");

  const insight    = getDealInsight(deal, activityLog);
  const nextAction = getNextAction(deal);
  const untilClose = daysUntil(deal.expectedClose);

  const client = allClients.find((c) =>
    c.name === deal.clientName || c.company === deal.clientName
  );

  const dealTasks = allTasks.filter((t) =>
    t.projectName?.toLowerCase().includes(deal.clientName.toLowerCase()) ||
    t.projectName?.toLowerCase().includes(deal.title.toLowerCase()) ||
    t.title.toLowerCase().includes(deal.clientName.toLowerCase())
  );
  const openTasks = dealTasks.filter((t) => t.status !== "done" && t.status !== "cancelled");

  const timeline = activityLog.filter((a) =>
    a.title.toLowerCase().includes(deal.title.toLowerCase()) ||
    a.description?.toLowerCase().includes(deal.clientName.toLowerCase())
  ).slice(0, 10);

  const isActive = deal.stage !== "closed_won" && deal.stage !== "closed_lost";
  const meta     = STAGE_META[deal.stage];

  const TABS: { id: DetailTab; label: string; count?: number }[] = [
    { id: "overview",  label: "Overview" },
    { id: "tasks",     label: "Tasks",    count: openTasks.length },
    { id: "timeline",  label: "Timeline" },
  ];

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)] border-l border-[var(--color-border)]">

      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3 border-b border-[var(--color-border)] flex-shrink-0">
        <button onClick={onClose}
          className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:bg-[var(--color-canvas)] transition-colors flex-shrink-0 mt-0.5">
          <ArrowLeft size={14} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-bold text-[var(--color-fg)] leading-tight">{deal.title}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", meta.accent, meta.color)}>
              {meta.label}
            </span>
            <span className="text-[11px] text-[var(--color-fg-faint)]">{deal.clientName}</span>
          </div>
        </div>
        <button onClick={onEdit}
          className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] hover:bg-[var(--color-canvas)] transition-colors flex-shrink-0">
          <MoreHorizontal size={14} strokeWidth={sw} />
        </button>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-[var(--color-border)] flex-shrink-0 flex-wrap">
        {[
          { label: "Add task",   icon: CheckSquare, cls: "text-violet-700 bg-violet-50 border-violet-200 hover:bg-violet-100", action: onAddTask },
          { label: "Email",      icon: Mail,        cls: "text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100",         action: onOpenEmail },
          { label: "Call",       icon: Phone,       cls: "text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100",     action: () => client?.phone && window.open(`tel:${client.phone}`) },
          isActive && { label: "Won",  icon: Check, cls: "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100", action: () => onUpdateStage("closed_won") },
          isActive && { label: "Lost", icon: X,     cls: "text-red-600 bg-red-50 border-red-200 hover:bg-red-100",             action: () => onUpdateStage("closed_lost") },
        ].filter(Boolean).map((item) => {
          const btn = item as { label: string; icon: React.ElementType; cls: string; action: () => void };
          const Icon = btn.icon;
          return (
            <button key={btn.label} onClick={btn.action}
              className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-colors", btn.cls)}>
              <Icon size={10} strokeWidth={sw} />
              {btn.label}
            </button>
          );
        })}
      </div>

      {/* AI Insight */}
      <AIInsightCard insight={insight} className="mx-4 mt-3 flex-shrink-0" />

      {/* Tabs */}
      <div className="flex items-center gap-0 px-4 mt-3 border-b border-[var(--color-border)] flex-shrink-0">
        {TABS.map(({ id, label, count }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold border-b-2 transition-colors -mb-px",
              tab === id
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-transparent text-[var(--color-fg-faint)] hover:text-[var(--color-fg)]"
            )}>
            {label}
            {count !== undefined && count > 0 && (
              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", tab === id ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-canvas)] text-[var(--color-fg-muted)]")}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">

        {/* OVERVIEW */}
        {tab === "overview" && (
          <div className="p-4 space-y-3">
            {/* KPI row */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Value",       value: fmt$(deal.value),         icon: DollarSign,  cls: "text-emerald-600" },
                { label: "Probability", value: `${deal.probability}%`,   icon: TrendingUp,  cls: "text-violet-600" },
                { label: "Days left",   value: untilClose < 0 ? `${Math.abs(untilClose)}d late` : `${untilClose}d`, icon: Clock, cls: untilClose < 0 ? "text-red-600" : "text-amber-600" },
              ].map(({ label, value, icon: Icon, cls }) => (
                <div key={label} className="bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl p-2.5">
                  <Icon size={12} className={cn("mb-1.5", cls)} strokeWidth={sw} />
                  <p className="text-[16px] font-bold text-[var(--color-fg)] leading-none tabular-nums">{value}</p>
                  <p className="text-[10px] text-[var(--color-fg-faint)] mt-1">{label}</p>
                </div>
              ))}
            </div>

            {/* Stage progress */}
            <div className="bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl p-3">
              <p className="text-[10px] font-bold text-[var(--color-fg-faint)] uppercase tracking-wider mb-2">Stage</p>
              <div className="flex gap-1">
                {STAGES.filter((s) => s !== "closed_lost").map((s) => {
                  const stageOrder = ["lead", "qualified", "proposal", "negotiation", "closed_won"];
                  const isReached  = stageOrder.indexOf(deal.stage) >= stageOrder.indexOf(s) || deal.stage === s;
                  const isCurrent  = deal.stage === s;
                  return (
                    <button key={s} onClick={() => onUpdateStage(s)}
                      title={`Move to ${STAGE_META[s].label}`}
                      className={cn("flex-1 h-1.5 rounded-full transition-all hover:opacity-80",
                        isCurrent ? STAGE_META[s].dot : isReached ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"
                      )} />
                  );
                })}
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[9px] text-[var(--color-fg-faint)]">Lead</span>
                <span className="text-[9px] text-[var(--color-fg-faint)]">Won</span>
              </div>
            </div>

            {/* Deal info */}
            <div className="bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl p-3">
              <p className="text-[10px] font-bold text-[var(--color-fg-faint)] uppercase tracking-wider mb-2">Deal info</p>
              <div className="space-y-1.5">
                {[
                  { label: "Close date", value: deal.expectedClose },
                  { label: "Owner",      value: deal.owner || "Unassigned" },
                  { label: "Client",     value: deal.clientName },
                  client?.email   ? { label: "Email",    value: client.email,   href: `mailto:${client.email}` }   : null,
                  client?.phone   ? { label: "Phone",    value: client.phone,   href: `tel:${client.phone}` }     : null,
                  client?.industry ? { label: "Industry", value: client.industry } : null,
                ].filter(Boolean).map((row) => {
                  const r = row as { label: string; value: string; href?: string };
                  return (
                    <div key={r.label} className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-[var(--color-fg-faint)] flex-shrink-0">{r.label}</span>
                      {r.href
                        ? <a href={r.href} className="text-[11px] text-[var(--color-accent)] hover:underline truncate">{r.value}</a>
                        : <span className="text-[11px] text-[var(--color-fg)] font-medium truncate">{r.value}</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Next action */}
            <div className="bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl p-3">
              <p className="text-[10px] font-bold text-[var(--color-fg-faint)] uppercase tracking-wider mb-2">Suggested next action</p>
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-lg bg-[var(--color-accent-subtle)] flex items-center justify-center flex-shrink-0">
                  <Sparkles size={11} className="text-[var(--color-accent)]" />
                </div>
                <p className="text-[12px] text-[var(--color-fg)] leading-snug font-medium">{nextAction}</p>
              </div>
            </div>
          </div>
        )}

        {/* TASKS */}
        {tab === "tasks" && (
          <div className="p-4 space-y-2">
            <button onClick={onAddTask}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-[var(--color-border)] text-[12px] font-semibold text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors mb-3">
              <Plus size={12} /> Add task
            </button>
            {openTasks.length === 0 && <p className="text-[12px] text-[var(--color-fg-faint)] text-center py-4">No open tasks for this deal</p>}
            {openTasks.map((task) => {
              const overdue = task.dueDate && new Date(task.dueDate) < new Date();
              return (
                <div key={task.id} className={cn("flex items-start gap-2.5 p-3 bg-[var(--color-canvas)] border rounded-xl", overdue ? "border-red-200" : "border-[var(--color-border)]")}>
                  <div className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", {
                    "bg-red-500": task.priority === "urgent",
                    "bg-amber-500": task.priority === "high",
                    "bg-[var(--color-accent)]": task.priority === "medium",
                    "bg-gray-300": task.priority === "low",
                  })} />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-[12px] font-medium", overdue ? "text-red-600" : "text-[var(--color-fg)]")}>{task.title}</p>
                    {task.dueDate && <p className="text-[10px] text-[var(--color-fg-faint)]">Due {task.dueDate}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* TIMELINE */}
        {tab === "timeline" && (
          <div className="p-4">
            {timeline.length === 0 && (
              <p className="text-[12px] text-[var(--color-fg-faint)] text-center py-6">No activity recorded for this deal yet</p>
            )}
            <div className="relative">
              <div className="absolute left-[16px] top-0 bottom-0 w-px bg-[var(--color-border)]" />
              <div className="space-y-3">
                {timeline.map((a) => (
                  <div key={a.id} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-canvas)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0 z-10">
                      <MessageSquare size={11} className="text-[var(--color-accent)]" />
                    </div>
                    <div className="flex-1 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl p-3">
                      <p className="text-[12px] font-semibold text-[var(--color-fg)]">{a.title}</p>
                      {a.description && <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5">{a.description}</p>}
                      <p className="text-[10px] text-[var(--color-fg-faint)] mt-1.5">
                        {new Date(a.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const SORT_OPTIONS: { id: SortMode; label: string; icon: React.ElementType }[] = [
  { id: "default", label: "Default",       icon: SortAsc },
  { id: "value",   label: "Highest value", icon: DollarSign },
  { id: "risk",    label: "Highest risk",  icon: AlertTriangle },
  { id: "closing", label: "Closing soon",  icon: Clock },
  { id: "stale",   label: "Stale deals",   icon: MessageSquare },
];


export default function PipelinePage() {
  const { t }          = useLanguage();
  const { sw }         = useTheme();
  const dragId         = useRef<string | null>(null);

  const [deals,       setDeals]      = useState<Deal[]>([]);
  const [allTasks,    setAllTasks]   = useState<Task[]>([]);
  const [allClients,  setAllClients] = useState<Client[]>([]);
  const [activityLog, setActivityLog] = useState<Activity[]>([]);

  const [selected,    setSelected]   = useState<Deal | null>(null);
  const [sortMode,    setSortMode]   = useState<SortMode>("default");
  const [modal,       setModal]      = useState<ModalState>({ open: false });
  const [taskModal,   setTaskModal]  = useState(false);
  const [emailModal,  setEmailModal] = useState(false);
  const [toast,       setToast]      = useState<string | null>(null);
  const [importModal, setImportModal] = useState(false);

  useEffect(() => {
    setDeals(getDeals());
    setAllTasks(getTasks());
    setAllClients(getClients());
    setActivityLog(getActivityLog());
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const handleDealsImported = useCallback((_type: unknown, result: ImportResult) => {
    if (result.imported === 0) return;
    setDeals(getDeals());
    logActivity({
      type:        "deal_moved",
      title:       `${result.imported} deal${result.imported !== 1 ? "s" : ""} imported`,
      description: `${result.skipped} duplicates skipped · ${result.errors} errors`,
    });
    setActivityLog(getActivityLog());
    showToast(`✓ ${result.imported} deal${result.imported !== 1 ? "s" : ""} imported`);
  }, [showToast]);

  function persist(next: Deal[]) {
    setDeals(next);
    saveDeals(next);
    // Sync selected deal if it changed
    if (selected) {
      const updated = next.find((d) => d.id === selected.id);
      setSelected(updated ?? null);
    }
  }

  function handleDrop(toStage: DealStage) {
    if (!dragId.current) return;
    const id   = dragId.current;
    dragId.current = null;
    const deal = deals.find((d) => d.id === id);
    if (!deal || deal.stage === toStage) return;
    const next = deals.map((d) => d.id === id ? { ...d, stage: toStage } : d);
    persist(next);
    const type = toStage === "closed_won" ? "deal_won" : toStage === "closed_lost" ? "deal_lost" : "deal_moved";
    logActivity({ type, title: `Deal moved to ${STAGE_META[toStage].label}`, description: `${deal.title} · ${deal.clientName}`, meta: fmt$(deal.value) });
    setActivityLog(getActivityLog());
    showToast(`Moved to ${STAGE_META[toStage].label}`);
  }

  function handleSave(data: Omit<Deal, "id">) {
    if (modal.open && modal.mode === "edit") {
      const next = deals.map((d) => d.id === modal.deal.id ? { ...d, ...data } : d);
      persist(next);
      showToast(t("deal_saved"));
      if (data.stage !== modal.deal.stage) {
        const type = data.stage === "closed_won" ? "deal_won" : data.stage === "closed_lost" ? "deal_lost" : "deal_moved";
        logActivity({ type, title: `Deal updated: ${data.title}`, description: `${data.clientName} · ${STAGE_META[data.stage].label}`, meta: fmt$(data.value) });
        setActivityLog(getActivityLog());
      }
    } else {
      const newDeal = { ...data, id: `deal-${Date.now()}` };
      persist([...deals, newDeal]);
      setSelected(newDeal);
      showToast(t("deal_created"));
      logActivity({ type: "deal_moved", title: `New deal: ${data.title}`, description: `${data.clientName} · ${STAGE_META[data.stage].label}`, meta: fmt$(data.value) });
      setActivityLog(getActivityLog());
    }
    setModal({ open: false });
  }

  function handleDelete() {
    if (!modal.open || modal.mode !== "edit") return;
    const next = deals.filter((d) => d.id !== modal.deal.id);
    if (selected?.id === modal.deal.id) setSelected(null);
    persist(next);
    showToast(t("deal_deleted"));
    setModal({ open: false });
  }

  function handleUpdateStage(stage: DealStage) {
    if (!selected) return;
    const next = deals.map((d) => d.id === selected.id ? { ...d, stage } : d);
    persist(next);
    const type = stage === "closed_won" ? "deal_won" : stage === "closed_lost" ? "deal_lost" : "deal_moved";
    logActivity({ type, title: `Deal moved to ${STAGE_META[stage].label}`, description: `${selected.title} · ${selected.clientName}`, meta: fmt$(selected.value) });
    setActivityLog(getActivityLog());
    showToast(`Moved to ${STAGE_META[stage].label}`);
  }

  function handleTaskSave(task: Task) {
    const cur   = getTasks();
    const isNew = !cur.find((t) => t.id === task.id);
    const next  = isNew ? [task, ...cur] : cur.map((t) => t.id === task.id ? task : t);
    saveTasks(next);
    setAllTasks(next);
    logActivity({ type: "task_created", title: "Task created", description: task.title });
    setActivityLog(getActivityLog());
    setTaskModal(false);
    showToast("Task created");
  }

  // ── Derived stats ───────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active = deals.filter((d) => d.stage !== "closed_lost");
    const won    = deals.filter((d) => d.stage === "closed_won");
    const pipeline = deals.filter((d) => d.stage !== "closed_won" && d.stage !== "closed_lost");
    return {
      total:    fmt$(deals.reduce((s, d) => s + d.value, 0)),
      pipeline: fmt$(pipeline.reduce((s, d) => s + d.value, 0)),
      active:   active.length,
      won:      won.length,
      winRate:  deals.length > 0 ? Math.round((won.length / deals.length) * 100) : 0,
    };
  }, [deals]);

  // ── Sorted deals per stage ──────────────────────────────────────────────────
  const dealsPerStage = useMemo<Record<DealStage, Deal[]>>(() => {
    const grouped = {} as Record<DealStage, Deal[]>;
    STAGES.forEach((s) => {
      grouped[s] = sortDealsBy(deals.filter((d) => d.stage === s), sortMode, activityLog);
    });
    return grouped;
  }, [deals, sortMode, activityLog]);

  return (
    <div className={cn("flex flex-col bg-[var(--color-canvas)]", selected ? "h-screen overflow-hidden" : "flex-1")}>
      <TopBar
        title={t("pipeline_title")}
        subtitle={t("pipeline_subtitle")}
        secondaryAction={{ label: "Import", icon: Upload, onClick: () => setImportModal(true) }}
        action={{ label: t("pipeline_add_deal"), onClick: () => setModal({ open: true, mode: "create", stage: "lead" }) }}
      />

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: kanban + controls ─────────────────────────────────────── */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Stats strip */}
          <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex-shrink-0 flex-wrap">
            {[
              { label: "Pipeline",  value: stats.pipeline, icon: TrendingUp,  cls: "text-violet-600 bg-violet-50" },
              { label: "Total value", value: stats.total,  icon: DollarSign,  cls: "text-emerald-600 bg-emerald-50" },
              { label: "Active",    value: String(stats.active), icon: Target, cls: "text-blue-600 bg-blue-50" },
              { label: "Won",       value: String(stats.won),    icon: Check,  cls: "text-emerald-600 bg-emerald-50" },
              { label: "Win rate",  value: `${stats.winRate}%`,  icon: Star,   cls: "text-amber-600 bg-amber-50" },
            ].map(({ label, value, icon: Icon, cls }) => (
              <div key={label} className="flex items-center gap-2 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl px-3 py-2 shadow-sm">
                <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0", cls)}>
                  <Icon size={13} strokeWidth={sw} />
                </div>
                <div>
                  <p className="text-[15px] font-bold text-[var(--color-fg)] leading-none tabular-nums">{value}</p>
                  <p className="text-[10px] text-[var(--color-fg-muted)] mt-0.5">{label}</p>
                </div>
              </div>
            ))}

            {/* Sort mode */}
            <div className="ml-auto flex items-center gap-1 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl p-1 flex-shrink-0">
              {SORT_OPTIONS.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setSortMode(id)}
                  title={label}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors",
                    sortMode === id
                      ? "bg-[var(--color-accent)] text-white"
                      : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)]"
                  )}>
                  <Icon size={11} className={sortMode === id ? "text-white" : ""} strokeWidth={sw} />
                  <span className="hidden sm:inline">{id === "default" ? "Sort" : label.split(" ")[0]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* AI Priority bar */}
          {deals.filter((d) => d.stage !== "closed_won" && d.stage !== "closed_lost").length > 0 && (
            <div className="flex-shrink-0 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]/50">
              <AIPriorityBar deals={deals} activityLog={activityLog} onSelect={(d) => { setSelected(d); }} />
            </div>
          )}

          {/* Kanban board */}
          <div className="flex-1 overflow-x-auto overflow-y-auto p-4 md:p-6">
            <div
              className="flex gap-4 h-full"
              style={{ minWidth: `${STAGES.length * 240}px` }}
              onDragStart={(e) => {
                const card = (e.target as HTMLElement).closest("[draggable]");
                dragId.current = (e.target as HTMLElement).closest("[data-deal-id]")?.getAttribute("data-deal-id") ?? null;
                void card;
              }}
              onDragOver={(e) => e.preventDefault()}
            >
              {STAGES.map((stage) => (
                <KanbanColumn key={stage}
                  stage={stage}
                  deals={dealsPerStage[stage]}
                  selectedId={selected?.id ?? null}
                  onSelectDeal={setSelected}
                  onAddDeal={() => setModal({ open: true, mode: "create", stage })}
                  onEditDeal={(deal) => setModal({ open: true, mode: "edit", deal })}
                  onDrop={handleDrop}
                  activityLog={activityLog}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: deal detail panel ────────────────────────────────────── */}
        {selected && (
          <div className="w-[360px] flex-shrink-0 overflow-hidden border-l border-[var(--color-border)] hidden md:flex flex-col">
            <DealDetailPanel
              key={selected.id}
              deal={selected}
              allTasks={allTasks}
              activityLog={activityLog}
              allClients={allClients}
              onEdit={() => setModal({ open: true, mode: "edit", deal: selected })}
              onClose={() => setSelected(null)}
              onAddTask={() => setTaskModal(true)}
              onOpenEmail={() => setEmailModal(true)}
              onUpdateStage={handleUpdateStage}
            />
          </div>
        )}
      </div>

      {/* Modals */}
      <DealModal
        open={modal.open}
        deal={modal.open && modal.mode === "edit" ? modal.deal : undefined}
        defaultStage={modal.open && modal.mode === "create" ? modal.stage : undefined}
        onClose={() => setModal({ open: false })}
        onSave={handleSave}
        onDelete={modal.open && modal.mode === "edit" ? handleDelete : undefined}
      />
      <TaskModal
        open={taskModal}
        onClose={() => setTaskModal(false)}
        onSave={handleTaskSave}
      />
      {emailModal && selected && (
        <EmailModal deal={selected} onClose={() => setEmailModal(false)} />
      )}

      {/* Toast */}
      <AppToast msg={toast} onDone={() => setToast(null)} />

      {/* Import modal */}
      <ImportModal
        open={importModal}
        onClose={() => setImportModal(false)}
        onImported={handleDealsImported}
        defaultType="deals"
      />
    </div>
  );
}
