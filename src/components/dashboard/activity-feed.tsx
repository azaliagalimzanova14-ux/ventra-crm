"use client";

import {
  UserPlus, UserCheck, FolderOpen, CheckSquare, Plus,
  TrendingUp, TrendingDown, ArrowRight, FileText, Send,
} from "lucide-react";
import type { Activity } from "@/lib/types";
import { timeAgo } from "@/lib/activity";
import { cn } from "@/lib/utils";

const ICONS: Record<Activity["type"], React.ElementType> = {
  client_added:    UserPlus,
  client_updated:  UserCheck,
  project_created: FolderOpen,
  task_created:    Plus,
  task_done:       CheckSquare,
  deal_won:        TrendingUp,
  deal_lost:       TrendingDown,
  deal_moved:      ArrowRight,
  message:          FileText,
  invoice:          FileText,
  telegram_message: Send,
};

const COLORS: Record<Activity["type"], string> = {
  client_added:    "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]",
  client_updated:  "bg-blue-50 text-blue-600",
  project_created: "bg-violet-50 text-violet-600",
  task_created:    "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]",
  task_done:       "bg-emerald-50 text-emerald-600",
  deal_won:        "bg-emerald-50 text-emerald-600",
  deal_lost:       "bg-red-50 text-red-500",
  deal_moved:      "bg-amber-50 text-amber-600",
  message:          "bg-gray-100 text-gray-500",
  invoice:          "bg-amber-50 text-amber-600",
  telegram_message: "bg-blue-50 text-[#0088cc]",
};

const LABELS: Record<Activity["type"], string> = {
  client_added:    "Client",
  client_updated:  "Client",
  project_created: "Project",
  task_created:    "Task",
  task_done:       "Task",
  deal_won:        "Deal won",
  deal_lost:       "Deal lost",
  deal_moved:      "Pipeline",
  message:          "Message",
  invoice:          "Invoice",
  telegram_message: "Telegram",
};

export function ActivityFeed({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="text-[13px] font-medium text-[var(--color-fg-muted)]">No activity yet</p>
        <p className="text-[11px] text-[var(--color-fg-faint)] mt-1">Start by adding clients and deals</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[var(--color-border)]">
      {activities.map((a) => {
        const Icon  = ICONS[a.type]  ?? FileText;
        const color = COLORS[a.type] ?? "bg-gray-100 text-gray-600";
        const label = LABELS[a.type] ?? a.type;
        return (
          <div key={a.id}
            className="flex items-start gap-3 px-5 py-3.5 hover:bg-[var(--color-canvas)] transition-colors">
            <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5", color)}>
              <Icon size={13} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-faint)]">
                  {label}
                </span>
                {a.meta && (
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                    {a.meta}
                  </span>
                )}
              </div>
              <p className="text-[13px] font-medium text-[var(--color-fg)] truncate leading-snug">{a.title}</p>
              <p className="text-[11px] text-[var(--color-fg-faint)] truncate mt-0.5">{a.description}</p>
            </div>
            <span className="text-[11px] text-[var(--color-fg-faint)] flex-shrink-0 pt-1 tabular-nums whitespace-nowrap">
              {timeAgo(a.timestamp)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
