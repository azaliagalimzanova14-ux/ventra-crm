"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Sparkles, AlertTriangle, TrendingUp, Users,
  CheckSquare, ChevronRight, X, Zap,
} from "lucide-react";
import type { Client, Task, Deal } from "@/lib/types";
import { cn } from "@/lib/utils";

type InsightKind = "warning" | "opportunity" | "action";

interface Insight {
  id: string; kind: InsightKind; icon: React.ElementType;
  text: string; sub?: string; href: string;
}

function derive(clients: Client[], tasks: Task[], deals: Deal[]): Insight[] {
  const now = new Date();
  const result: Insight[] = [];

  const overdue = tasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled" && new Date(t.dueDate) < now
  );
  if (overdue.length > 0) {
    result.push({ id: "overdue_tasks", kind: "warning", icon: CheckSquare,
      text: `${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}`,
      sub: overdue[0].title, href: "/tasks" });
  }

  const closingSoon = deals.filter((d) => {
    if (d.stage === "closed_won" || d.stage === "closed_lost") return false;
    const days = (new Date(d.expectedClose).getTime() - now.getTime()) / 86_400_000;
    return days >= 0 && days <= 7;
  });
  if (closingSoon.length > 0) {
    const val = closingSoon.reduce((s, d) => s + d.value, 0);
    result.push({ id: "closing_soon", kind: "warning", icon: TrendingUp,
      text: `${closingSoon.length} deal${closingSoon.length > 1 ? "s" : ""} closing within 7 days`,
      sub: `$${(val / 1000).toFixed(0)}K at stake`, href: "/pipeline" });
  }

  const hot = deals.filter(
    (d) => d.probability >= 70 && d.stage !== "closed_won" && d.stage !== "closed_lost"
  );
  if (hot.length > 0) {
    const val = hot.reduce((s, d) => s + d.value, 0);
    result.push({ id: "hot_deals", kind: "opportunity", icon: Zap,
      text: `$${val >= 1000 ? `${(val / 1000).toFixed(0)}K` : val} in high-probability deals`,
      sub: `${hot.length} deal${hot.length > 1 ? "s" : ""} at 70%+ probability`, href: "/pipeline" });
  }

  const stale = clients.filter((c) => {
    if (c.status !== "active") return false;
    return (now.getTime() - new Date(c.lastContact).getTime()) > 30 * 86_400_000;
  });
  if (stale.length > 0) {
    result.push({ id: "stale_clients", kind: "action", icon: Users,
      text: `${stale.length} client${stale.length > 1 ? "s" : ""} not contacted in 30+ days`,
      sub: stale[0].name, href: "/clients" });
  }

  const dueToday = tasks.filter((t) => {
    if (t.status === "done" || t.status === "cancelled") return false;
    const d = new Date(t.dueDate);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  });
  if (dueToday.length > 0 && overdue.length === 0) {
    result.push({ id: "due_today", kind: "action", icon: AlertTriangle,
      text: `${dueToday.length} task${dueToday.length > 1 ? "s" : ""} due today`,
      sub: dueToday[0].title, href: "/tasks" });
  }

  return result.slice(0, 4);
}

const KIND_STYLE: Record<InsightKind, { wrap: string; icon: string }> = {
  warning:     { wrap: "bg-amber-50 border border-amber-200",   icon: "text-amber-600" },
  opportunity: { wrap: "bg-emerald-50 border border-emerald-200", icon: "text-emerald-600" },
  action:      { wrap: "bg-[var(--color-accent-subtle)] border border-[var(--color-accent-subtle)]", icon: "text-[var(--color-accent)]" },
};

export function AIInsights({ clients, tasks, deals }: {
  clients: Client[]; tasks: Task[]; deals: Deal[];
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const all     = useMemo(() => derive(clients, tasks, deals), [clients, tasks, deals]);
  const visible = all.filter((ins) => !hidden.has(ins.id));

  if (all.length === 0) return null;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-card">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--color-border)]">
        <div className="w-7 h-7 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center flex-shrink-0">
          <Sparkles size={13} className="text-violet-600" />
        </div>
        <h2 className="text-[14px] font-semibold text-[var(--color-fg)]">AI Insights</h2>
        <span className="ml-auto text-[11px] bg-violet-50 text-violet-600 border border-violet-200 px-2 py-0.5 rounded-full font-semibold">
          {visible.length} active
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-[13px] font-medium text-[var(--color-fg-muted)]">All clear — no insights right now</p>
          <p className="text-[11px] text-[var(--color-fg-faint)] mt-1">Check back as you add more data</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {visible.map((ins) => {
            const Icon = ins.icon;
            const style = KIND_STYLE[ins.kind];
            return (
              <div key={ins.id}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-[var(--color-canvas)] transition-colors group">
                <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0", style.wrap)}>
                  <Icon size={13} className={style.icon} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--color-fg)] truncate">{ins.text}</p>
                  {ins.sub && <p className="text-[11px] text-[var(--color-fg-faint)] truncate mt-0.5">{ins.sub}</p>}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <Link href={ins.href}
                    className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)] transition-colors">
                    <ChevronRight size={13} />
                  </Link>
                  <button onClick={() => setHidden((s) => new Set([...s, ins.id]))}
                    className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-fg-muted)] hover:bg-[var(--color-canvas)] transition-colors">
                    <X size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
