"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Sparkles, AlertTriangle, TrendingUp, Users,
  CheckSquare, X, Zap, ArrowRight, Clock, Target,
} from "lucide-react";
import type { Client, Task, Deal } from "@/lib/types";
import { cn } from "@/lib/utils";

type SignalKind = "warning" | "opportunity" | "action" | "urgent";

interface Signal {
  id:   string;
  kind: SignalKind;
  icon: React.ElementType;
  /** Short headline */
  text: string;
  /** Supporting detail */
  sub?: string;
  /** Button label */
  cta:  string;
  href: string;
  /** Urgency weight for sorting (higher = more urgent) */
  score: number;
}

// ─── Signal derivation ────────────────────────────────────────────────────────

function deriveSignals(clients: Client[], tasks: Task[], deals: Deal[]): Signal[] {
  const now  = new Date();
  const result: Signal[] = [];

  // ── 1. Overdue tasks (urgent) ──────────────────────────────────────────────
  const overdue = tasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled" && t.dueDate && new Date(t.dueDate) < now
  );
  if (overdue.length > 0) {
    result.push({
      id: "overdue_tasks", kind: "urgent", icon: CheckSquare, score: 100,
      text:  `${overdue.length} overdue task${overdue.length > 1 ? "s" : ""} need attention`,
      sub:   overdue.length === 1 ? overdue[0].title : `Latest: ${overdue[0].title}`,
      cta:   "View tasks", href: "/tasks",
    });
  }

  // ── 2. Inactive clients — 7-14 days (warning) ─────────────────────────────
  const inactive7 = clients.filter((c) => {
    if (c.status !== "active") return false;
    const days = (now.getTime() - new Date(c.lastContact).getTime()) / 86_400_000;
    return days >= 7 && days < 14;
  });
  if (inactive7.length > 0) {
    result.push({
      id: "inactive_7d", kind: "warning", icon: Users, score: 85,
      text:  `${inactive7.length} client${inactive7.length > 1 ? "s" : ""} not contacted in 7–14 days`,
      sub:   inactive7.slice(0, 2).map((c) => c.name).join(", ") + (inactive7.length > 2 ? ` +${inactive7.length - 2}` : ""),
      cta:   "Follow up", href: "/clients",
    });
  }

  // ── 3. Inactive clients — 14+ days (urgent) ───────────────────────────────
  const inactive14 = clients.filter((c) => {
    if (c.status !== "active") return false;
    const days = (now.getTime() - new Date(c.lastContact).getTime()) / 86_400_000;
    return days >= 14 && days < 30;
  });
  if (inactive14.length > 0) {
    result.push({
      id: "inactive_14d", kind: "urgent", icon: AlertTriangle, score: 90,
      text:  `${inactive14.length} client${inactive14.length > 1 ? "s" : ""} overdue for contact (14+ days)`,
      sub:   inactive14.slice(0, 2).map((c) => c.name).join(", ") + (inactive14.length > 2 ? ` +${inactive14.length - 2}` : ""),
      cta:   "Contact now", href: "/clients",
    });
  }

  // ── 4. Stuck deals — past expected close, not closed ──────────────────────
  const stuck = deals.filter((d) => {
    if (d.stage === "closed_won" || d.stage === "closed_lost") return false;
    return new Date(d.expectedClose) < now;
  });
  if (stuck.length > 0) {
    const val = stuck.reduce((s, d) => s + d.value, 0);
    result.push({
      id: "stuck_deals", kind: "warning", icon: Clock, score: 88,
      text:  `${stuck.length} deal${stuck.length > 1 ? "s" : ""} stuck past their close date`,
      sub:   `$${val >= 1000 ? `${(val / 1000).toFixed(0)}K` : val} at risk · ${stuck[0].title}`,
      cta:   "Review pipeline", href: "/pipeline",
    });
  }

  // ── 5. Deals closing within 7 days ────────────────────────────────────────
  const closingSoon = deals.filter((d) => {
    if (d.stage === "closed_won" || d.stage === "closed_lost") return false;
    const days = (new Date(d.expectedClose).getTime() - now.getTime()) / 86_400_000;
    return days >= 0 && days <= 7;
  });
  if (closingSoon.length > 0) {
    const val = closingSoon.reduce((s, d) => s + d.value, 0);
    result.push({
      id: "closing_soon", kind: "warning", icon: TrendingUp, score: 80,
      text:  `${closingSoon.length} deal${closingSoon.length > 1 ? "s" : ""} closing within 7 days`,
      sub:   `$${(val / 1000).toFixed(0)}K at stake — act now`,
      cta:   "Go to pipeline", href: "/pipeline",
    });
  }

  // ── 6. High-probability deals (70%+) ──────────────────────────────────────
  const hot = deals.filter(
    (d) => d.probability >= 70 && d.stage !== "closed_won" && d.stage !== "closed_lost"
  );
  if (hot.length > 0) {
    const val = hot.reduce((s, d) => s + d.value, 0);
    result.push({
      id: "hot_deals", kind: "opportunity", icon: Target, score: 75,
      text:  `$${val >= 1000 ? `${(val / 1000).toFixed(0)}K` : val} in high-probability deals`,
      sub:   `${hot.length} deal${hot.length > 1 ? "s" : ""} at 70%+ · push to close`,
      cta:   "View pipeline", href: "/pipeline",
    });
  }

  // ── 7. Hot opportunity — single deal with 85%+ ────────────────────────────
  const ultraHot = hot.filter((d) => d.probability >= 85);
  if (ultraHot.length > 0) {
    result.push({
      id: "ultra_hot", kind: "opportunity", icon: Zap, score: 78,
      text:  `${ultraHot[0].title} is at ${ultraHot[0].probability}% — ready to close`,
      sub:   `${ultraHot[0].clientName} · $${ultraHot[0].value.toLocaleString()}`,
      cta:   "Close the deal", href: "/pipeline",
    });
  }

  // ── 8. Tasks due today ─────────────────────────────────────────────────────
  const dueToday = tasks.filter((t) => {
    if (t.status === "done" || t.status === "cancelled") return false;
    const d = new Date(t.dueDate);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  });
  if (dueToday.length > 0 && overdue.length === 0) {
    result.push({
      id: "due_today", kind: "action", icon: AlertTriangle, score: 70,
      text:  `${dueToday.length} task${dueToday.length > 1 ? "s" : ""} due today`,
      sub:   dueToday[0].title,
      cta:   "View tasks", href: "/tasks",
    });
  }

  // Sort by score descending, cap at 5 visible
  return result.sort((a, b) => b.score - a.score).slice(0, 5);
}

// ─── Kind styles ──────────────────────────────────────────────────────────────

// Colors aligned with shared KIND_STYLES in ai-insight-card.tsx:
// urgent ≈ danger (red), warning (amber), opportunity (violet), action (accent/blue)
const KIND_STYLE: Record<SignalKind, { wrap: string; icon: string; badge: string; dot: string }> = {
  urgent:      { wrap: "bg-red-50 border-red-200",         icon: "text-red-600",     badge: "bg-red-50 text-red-700 border-red-200",           dot: "bg-red-500"     },
  warning:     { wrap: "bg-amber-50 border-amber-200",     icon: "text-amber-600",   badge: "bg-amber-50 text-amber-700 border-amber-200",     dot: "bg-amber-500"   },
  opportunity: { wrap: "bg-violet-50 border-violet-200",   icon: "text-violet-600",  badge: "bg-violet-50 text-violet-700 border-violet-200",  dot: "bg-violet-500"  },
  action:      { wrap: "bg-[var(--color-accent-subtle)] border-[var(--color-accent-subtle)]", icon: "text-[var(--color-accent)]", badge: "bg-[var(--color-accent-subtle)] text-[var(--color-accent)] border-[var(--color-accent-subtle)]", dot: "bg-[var(--color-accent)]" },
};

const KIND_LABEL: Record<SignalKind, string> = {
  urgent:      "Urgent",
  warning:     "Warning",
  opportunity: "Opportunity",
  action:      "Action",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AIInsights({ clients, tasks, deals }: {
  clients: Client[]; tasks: Task[]; deals: Deal[];
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const all     = useMemo(() => deriveSignals(clients, tasks, deals), [clients, tasks, deals]);
  const visible = all.filter((s) => !hidden.has(s.id));

  if (all.length === 0) return null;

  const urgentCount = visible.filter((s) => s.kind === "urgent").length;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-card">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--color-border)]">
        <div className="w-7 h-7 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center flex-shrink-0">
          <Sparkles size={13} className="text-violet-600" />
        </div>
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--color-fg)] leading-tight">Business Signals</h2>
          <p className="text-[10px] text-[var(--color-fg-faint)]">AI-powered alerts</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {urgentCount > 0 && (
            <span className="text-[11px] bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-semibold">
              {urgentCount} urgent
            </span>
          )}
          <span className="text-[11px] bg-violet-50 text-violet-600 border border-violet-200 px-2 py-0.5 rounded-full font-semibold">
            {visible.length} active
          </span>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-3">
            <Target size={18} className="text-emerald-600" />
          </div>
          <p className="text-[13px] font-semibold text-[var(--color-fg-muted)]">All clear — no signals right now</p>
          <p className="text-[11px] text-[var(--color-fg-faint)] mt-1">Keep adding data and we&apos;ll surface insights here</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {visible.map((sig) => {
            const Icon  = sig.icon;
            const style = KIND_STYLE[sig.kind];
            return (
              <div key={sig.id}
                className="flex items-start gap-3 px-5 py-4 hover:bg-[var(--color-canvas)] transition-colors">
                {/* Icon */}
                <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 border mt-0.5", style.wrap)}>
                  <Icon size={13} className={style.icon} />
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0">
                  {/* Kind badge */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border", style.badge)}>
                      <span className={cn("w-1 h-1 rounded-full flex-shrink-0", style.dot)} />
                      {KIND_LABEL[sig.kind]}
                    </span>
                  </div>
                  <p className="text-[13px] font-semibold text-[var(--color-fg)] leading-snug">{sig.text}</p>
                  {sig.sub && <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5">{sig.sub}</p>}
                  <Link href={sig.href}
                    className={cn(
                      "inline-flex items-center gap-1 mt-2 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors hover:opacity-80",
                      style.badge
                    )}>
                    {sig.cta}
                    <ArrowRight size={10} />
                  </Link>
                </div>

                {/* Dismiss */}
                <button
                  onClick={() => setHidden((s) => new Set([...s, sig.id]))}
                  className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-fg-muted)] hover:bg-[var(--color-canvas)] transition-colors flex-shrink-0 mt-0.5">
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
