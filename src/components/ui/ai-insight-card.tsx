/**
 * Unified AI insight system.
 * Used identically on Clients, Pipeline, and Dashboard pages.
 *
 * Usage:
 *   const insight = buildInsight(...);        // returns AIInsight
 *   <AIInsightCard insight={insight} />       // full detail-panel banner
 *   <AIInsightBadge kind={insight.kind} />    // compact card badge
 */

import { cn } from "@/lib/utils";

// ─── Kind system ─────────────────────────────────────────────────────────────

export type InsightKind = "danger" | "warning" | "opportunity" | "action" | "ok";

export const KIND_STYLES: Record<InsightKind, {
  panel:  string;   // panel background + border  (rounded-xl border)
  dot:    string;   // small dot colour            (w-2 h-2 rounded-full)
  badge:  string;   // compact chip colours        (text + bg)
  label:  string;   // default badge label
}> = {
  danger:      { panel: "bg-red-50 border-red-200",        dot: "bg-red-500",     badge: "bg-red-100 text-red-700",       label: "Overdue" },
  warning:     { panel: "bg-amber-50 border-amber-200",    dot: "bg-amber-500",   badge: "bg-amber-100 text-amber-700",   label: "Risk"    },
  opportunity: { panel: "bg-violet-50 border-violet-200",  dot: "bg-violet-500",  badge: "bg-violet-100 text-violet-700", label: "Hot"     },
  action:      { panel: "bg-blue-50 border-blue-200",      dot: "bg-blue-500",    badge: "bg-blue-100 text-blue-700",     label: "Soon"    },
  ok:          { panel: "bg-emerald-50 border-emerald-200",dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700",label: "Good"   },
};

// ─── Shared insight shape ────────────────────────────────────────────────────

export interface AIInsight {
  kind: InsightKind;
  icon: React.ElementType;
  text: string;
  sub?: string;
}

// ─── AIInsightCard ────────────────────────────────────────────────────────────
// Full banner — used in detail panels (Clients, Pipeline).

export function AIInsightCard({
  insight,
  className,
}: {
  insight:   AIInsight;
  className?: string;
}) {
  const style  = KIND_STYLES[insight.kind];
  const Icon   = insight.icon;

  return (
    <div className={cn("p-3 rounded-xl border flex items-start gap-2.5", style.panel, className)}>
      <span className={cn("w-2 h-2 rounded-full flex-shrink-0 mt-1", style.dot)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Icon size={11} className="flex-shrink-0 opacity-60" />
          <span className="text-[9px] font-bold uppercase tracking-wider opacity-50">AI Insight</span>
        </div>
        <p className="text-[12px] font-semibold leading-snug">{insight.text}</p>
        {insight.sub && (
          <p className="text-[11px] opacity-65 mt-0.5">{insight.sub}</p>
        )}
      </div>
    </div>
  );
}

// ─── AIInsightBadge ───────────────────────────────────────────────────────────
// Compact chip — used on kanban cards and list rows.
// Hidden when kind === "ok" by default (pass showOk to override).

export function AIInsightBadge({
  insight,
  label,
  showOk = false,
  className,
}: {
  insight:   AIInsight;
  label?:    string;
  showOk?:   boolean;
  className?: string;
}) {
  if (!showOk && insight.kind === "ok") return null;

  const style    = KIND_STYLES[insight.kind];
  const Icon     = insight.icon;
  const badgeLabel = label ?? style.label;

  return (
    <span className={cn(
      "flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
      style.badge,
      className,
    )}>
      <Icon size={8} />
      {badgeLabel}
    </span>
  );
}
