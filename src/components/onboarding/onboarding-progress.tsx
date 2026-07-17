"use client";

/**
 * OnboardingProgress — persistent sidebar card that tracks DB-backed onboarding steps.
 * Shown in the dashboard until all steps are complete.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle2, Circle, ChevronDown, ChevronUp, X,
  Building2, MessageCircle, Users, UserPlus, TrendingUp, CheckSquare, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingStep {
  step:        string;
  completed:   boolean;
  completedAt: string | null;
}

interface ProgressResponse {
  steps:     OnboardingStep[];
  completed: number;
  total:     number;
  isDone:    boolean;
}

const STEP_META: Record<string, {
  label:       string;
  description: string;
  icon:        React.ElementType;
  href?:       string;
  action?:     string;
}> = {
  create_workspace: {
    label:       "Create workspace",
    description: "Your workspace is set up and ready.",
    icon:        Building2,
  },
  connect_channel: {
    label:       "Connect a channel",
    description: "Link Gmail or Telegram to receive messages.",
    icon:        MessageCircle,
    href:        "/settings",
    action:      "Go to Settings",
  },
  invite_team: {
    label:       "Invite your team",
    description: "Add colleagues to collaborate in Ventra.",
    icon:        UserPlus,
    href:        "/settings/team",
    action:      "Invite members",
  },
  import_clients: {
    label:       "Add your first client",
    description: "Import clients or create them manually.",
    icon:        Users,
    href:        "/clients",
    action:      "Go to Clients",
  },
  create_deal: {
    label:       "Create a deal",
    description: "Track a sales opportunity in the pipeline.",
    icon:        TrendingUp,
    href:        "/deals",
    action:      "Open Pipeline",
  },
  create_task: {
    label:       "Create a task",
    description: "Assign a follow-up action to yourself or a teammate.",
    icon:        CheckSquare,
    href:        "/tasks",
    action:      "Open Tasks",
  },
};

interface Props {
  onDismiss?: () => void;
}

export function OnboardingProgress({ onDismiss }: Props) {
  const [progress,  setProgress]  = useState<ProgressResponse | null>(null);
  const [expanded,  setExpanded]  = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding", { credentials: "include" });
      if (res.ok) {
        const data = await res.json() as ProgressResponse;
        setProgress(data);
        if (data.isDone) {
          // Collapse automatically when all done
          setTimeout(() => setDismissed(true), 3000);
        }
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (dismissed || !progress || progress.isDone) return null;

  const pct = Math.round((progress.completed / progress.total) * 100);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--color-border)]">
        <div className="w-7 h-7 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center flex-shrink-0">
          <Sparkles size={13} className="text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-semibold text-[var(--color-fg)]">Get started</h3>
          <p className="text-[11px] text-[var(--color-fg-faint)]">
            {progress.completed}/{progress.total} steps complete
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="p-1 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] transition-colors"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {onDismiss && (
            <button
              onClick={() => { setDismissed(true); onDismiss(); }}
              className="p-1 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] transition-colors"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-5 pt-3 pb-1">
        <div className="h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
          <div
            className="h-full bg-violet-500 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 space-y-1">
          {progress.steps.map((s) => {
            const meta = STEP_META[s.step];
            if (!meta) return null;
            const Icon = meta.icon;
            return (
              <div
                key={s.step}
                className={cn(
                  "flex items-start gap-3 p-2.5 rounded-xl transition-colors",
                  s.completed ? "opacity-60" : "hover:bg-[var(--color-canvas)]",
                )}
              >
                <div className="mt-0.5 flex-shrink-0">
                  {s.completed
                    ? <CheckCircle2 size={15} className="text-emerald-500" />
                    : <Circle size={15} className="text-[var(--color-border)]" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon size={12} className={s.completed ? "text-[var(--color-fg-faint)]" : "text-[var(--color-accent)]"} />
                    <span className={cn("text-[12px] font-semibold", s.completed ? "line-through text-[var(--color-fg-faint)]" : "text-[var(--color-fg)]")}>
                      {meta.label}
                    </span>
                  </div>
                  {!s.completed && (
                    <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5">{meta.description}</p>
                  )}
                  {!s.completed && meta.href && (
                    <Link
                      href={meta.href}
                      className="inline-block mt-1.5 text-[11px] font-semibold text-[var(--color-accent)] hover:underline"
                    >
                      {meta.action} →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
