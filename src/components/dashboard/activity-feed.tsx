"use client";

import {
  UserPlus, FolderOpen, CheckSquare,
  TrendingUp, TrendingDown, MessageSquare, FileText,
} from "lucide-react";
import type { Activity } from "@/lib/types";
import { timeAgo } from "@/lib/activity";
import { cn } from "@/lib/utils";

// ─── Icon + color maps ────────────────────────────────────────────────────────

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
  client_added:    "bg-indigo-500/15 text-indigo-400",
  project_created: "bg-violet-500/15 text-violet-400",
  task_done:       "bg-emerald-500/15 text-emerald-400",
  deal_won:        "bg-emerald-500/15 text-emerald-400",
  deal_lost:       "bg-red-500/15 text-red-400",
  message:         "bg-blue-500/15 text-blue-400",
  invoice:         "bg-amber-500/15 text-amber-400",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ActivityFeed({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-[12px] text-[#3a3a5a]">
        No activity yet — start by adding clients and deals
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#1c1c35]">
      {activities.map((a) => {
        const Icon = ICONS[a.type];
        return (
          <div
            key={a.id}
            className="flex items-start gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
          >
            <div className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
              COLORS[a.type]
            )}>
              <Icon size={13} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[#c0c0d8] truncate">{a.title}</p>
              <p className="text-[11px] text-[#5a5a8a] truncate mt-0.5">{a.description}</p>
            </div>
            <span className="text-[11px] text-[#3a3a5a] flex-shrink-0 pt-0.5">
              {timeAgo(a.timestamp)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
