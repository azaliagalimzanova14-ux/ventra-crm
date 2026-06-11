"use client";

import {
  UserPlus, FolderOpen, CheckSquare,
  TrendingUp, TrendingDown, MessageSquare, FileText,
} from "lucide-react";
import type { Activity } from "@/lib/types";
import { timeAgo } from "@/lib/activity";
import { cn } from "@/lib/utils";

const ICONS: Record<Activity["type"], React.ElementType> = {
  client_added:    UserPlus,
  project_created: FolderOpen,
  task_done:       CheckSquare,
  deal_won:        TrendingUp,
  deal_lost:       TrendingDown,
  message:         MessageSquare,
  invoice:         FileText,
};

const COLORS: Record<Activity["type"], string> = {
  client_added:    "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]",
  project_created: "bg-violet-50 text-violet-600",
  task_done:       "bg-emerald-50 text-emerald-600",
  deal_won:        "bg-emerald-50 text-emerald-600",
  deal_lost:       "bg-red-50 text-red-500",
  message:         "bg-blue-50 text-blue-600",
  invoice:         "bg-amber-50 text-amber-600",
};

export function ActivityFeed({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return (
      <div className="px-5 py-8 text-center">
        <p className="text-[13px] font-medium text-[var(--color-fg-muted)]">No activity yet</p>
        <p className="text-[11px] text-[var(--color-fg-faint)] mt-1">Start by adding clients and deals</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[var(--color-border)]">
      {activities.map((a) => {
        const Icon = ICONS[a.type];
        return (
          <div key={a.id}
            className="flex items-start gap-3 px-5 py-3.5 hover:bg-[var(--color-canvas)] transition-colors">
            <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5", COLORS[a.type])}>
              <Icon size={13} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[var(--color-fg)] truncate">{a.title}</p>
              <p className="text-[11px] text-[var(--color-fg-faint)] truncate mt-0.5">{a.description}</p>
            </div>
            <span className="text-[11px] text-[var(--color-fg-faint)] flex-shrink-0 pt-0.5 tabular-nums">
              {timeAgo(a.timestamp)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
