"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Sparkles, AlertTriangle, TrendingUp, Users,
  CheckSquare, ChevronRight, X, Zap,
} from "lucide-react";
import type { Client, Task, Deal } from "@/lib/types";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type InsightKind = "warning" | "opportunity" | "action";

interface Insight {
  id:   string;
  kind: InsightKind;
  icon: React.ElementType;
  text: string;
  sub?: string;
  href: string;
}

// ─── Derivation ───────────────────────────────────────────────────────────────

function derive(clients: Client[], tasks: Task[], deals: Deal[]): Insight[] {
  const now     = new Date();
  const result: Insight[] = [];

  // 1. Overdue tasks
  const overdue = tasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled" && new Date(t.dueDate) < now
  );
  if (overdue.length > 0) {
    result.push({
      id:   "overdue_tasks",
      kind: "warning",
      icon: CheckSquare,
      text: `${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}`,
      sub:  overdue[0].title,
      href: "/tasks",
    });
  }

  // 2. Deals closing within 7 days (not won/lost)
  const closingSoon = deals.filter((d) => {
    if (d.stage === "closed_won" || d.stage === "closed_lost") return false;
    const days = (new Date(d.expectedClose).getTime() - now.getTime()) / 86_400_000;
    return days >= 0 && days <= 7;
  });
  if (closingSoon.length > 0) {
    const val = closingSoon.reduce((s, d) => s + d.value, 0);
    result.push({
      id:   "closing_soon",
      kind: "warning",
      icon: TrendingUp,
      text: `${closingSoon.length} deal${closingSoon.length > 1 ? "s" : ""} closing within 7 days`,
      sub:  `$${(val / 1000).toFixed(0)}K at stake`,
      href: "/pipeline",
    });
  }

  // 3. Hot deals (≥70% probability, still open)
  const hot = deals.filter(
    (d) => d.probability >= 70 && d.stage !== "closed_won" && d.stage !== "closed_lost"
  );
  if (hot.length > 0) {
    const val = hot.reduce((s, d) => s + d.value, 0);
    result.push({
      id:   "hot_deals",
      kind: "opportunity",
      icon: Zap,
      text: `$${val >= 1000 ? `${(val / 1000).toFixed(0)}K` : val} in high-probability deals`,
      sub:  `${hot.length} deal${hot.length > 1 ? "s" : ""} at 70%+ probability`,
      href: "/pipeline",
    });
  }

  // 4. Clients not contacted in 30+ days
  const stale = clients.filter((c) => {
    if (c.status !== "active") return false;
    return (now.getTime() - new Date(c.lastContact).getTime()) > 30 * 86_400_000;
  });
  if (stale.length > 0) {
    result.push({
      id:   "stale_clients",
      kind: "action",
      icon: Users,
      text: `${stale.length} client${stale.length > 1 ? "s" : ""} not contacted in 30+ days`,
      sub:  stale[0].name,
      href: "/clients",
    });
  }

  // 5. Tasks due today
  const dueToday = tasks.filter((t) => {
    if (t.status === "done" || t.status === "cancelled") return false;
    const d = new Date(t.dueDate);
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth()    === now.getMonth()    &&
           d.getDate()     === now.getDate();
  });
  if (dueToday.length > 0 && overdue.length === 0) {
    result.push({
      id:   "due_today",
      kind: "action",
      icon: AlertTriangle,
      text: `${dueToday.length} task${dueToday.length > 1 ? "s" : ""} due today`,
      sub:  dueToday[0].title,
      href: "/tasks",
    });
  }

  return result.slice(0, 4);
}

// ─── Kind styling ─────────────────────────────────────────────────────────────

const KIND_STYLE: Record<InsightKind, string> = {
  warning:     "text-amber-400 bg-amber-500/10 border border-amber-500/20",
  opportunity: "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20",
  action:      "text-indigo-400 bg-indigo-500/10 border border-indigo-500/20",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AIInsights({
  clients, tasks, deals,
}: {
  clients: Client[];
  tasks:   Task[];
  deals:   Deal[];
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const all     = useMemo(() => derive(clients, tasks, deals), [clients, tasks, deals]);
  const visible = all.filter((ins) => !hidden.has(ins.id));

  if (all.length === 0) return null;

  return (
    <div className="bg-[#111128] border border-[#1c1c35] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[#1c1c35]">
        <div className="w-6 h-6 rounded-md bg-violet-500/20 flex items-center justify-center flex-shrink-0">
          <Sparkles size={12} className="text-violet-400" />
        </div>
        <h2 className="text-[14px] font-semibold text-white">AI Insights</h2>
        <span className="ml-auto text-[10px] bg-violet-500/15 text-violet-400 border border-violet-500/20 px-1.5 py-0.5 rounded-md font-medium">
          {visible.length} active
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="px-5 py-7 text-center text-[12px] text-[#3a3a5a]">
          All clear — no insights right now
        </div>
      ) : (
        <div className="divide-y divide-[#1c1c35]">
          {visible.map((ins) => {
            const Icon = ins.icon;
            return (
              <div
                key={ins.id}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition-colors group"
              >
                <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0", KIND_STYLE[ins.kind])}>
                  <Icon size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#e0e0f0] truncate">{ins.text}</p>
                  {ins.sub && <p className="text-[11px] text-[#5a5a8a] truncate mt-0.5">{ins.sub}</p>}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <Link
                    href={ins.href}
                    className="p-1.5 rounded-lg text-[#5a5a8a] hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                  >
                    <ChevronRight size={13} />
                  </Link>
                  <button
                    onClick={() => setHidden((s) => new Set([...s, ins.id]))}
                    className="p-1.5 rounded-lg text-[#3a3a5a] hover:text-[#8080a8] hover:bg-white/5 transition-colors"
                    title="Dismiss"
                  >
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
