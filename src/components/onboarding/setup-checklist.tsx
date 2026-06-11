"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/language-context";
import { getSetupProgress, markSetupStep, type SetupStep } from "@/lib/storage";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

const ALL_STEPS: SetupStep[] = ["profile", "client", "project", "task", "pipeline"];

const STEP_LINKS: Record<SetupStep, string> = {
  profile:  "/settings",
  client:   "/clients",
  project:  "/projects",
  task:     "/tasks",
  pipeline: "/pipeline",
};

interface SetupChecklistProps {
  onDismiss: () => void;
}

export function SetupChecklist({ onDismiss }: SetupChecklistProps) {
  const { t } = useLanguage();
  const [done, setDone] = useState<SetupStep[]>([]);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => { setDone(getSetupProgress()); }, []);

  const stepLabels: Record<SetupStep, string> = {
    profile:  t("setup_step_profile"),
    client:   t("setup_step_client"),
    project:  t("setup_step_project"),
    task:     t("setup_step_task"),
    pipeline: t("setup_step_pipeline"),
  };

  function handleClick(step: SetupStep) {
    markSetupStep(step);
    setDone(getSetupProgress());
  }

  const completedCount = ALL_STEPS.filter((s) => done.includes(s)).length;
  const pct = Math.round((completedCount / ALL_STEPS.length) * 100);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--color-border)]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-[13px] font-semibold text-[var(--color-fg)]">{t("setup_title")}</h3>
            <span className="text-[11px] text-[var(--color-fg-faint)]">
              {completedCount}/{ALL_STEPS.length} {t("setup_completed")}
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={onDismiss}
            className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Steps */}
      {expanded && (
        <div className="divide-y divide-[#1c1c35]">
          {ALL_STEPS.map((step) => {
            const isDone = done.includes(step);
            return (
              <Link
                key={step}
                href={STEP_LINKS[step]}
                onClick={() => handleClick(step)}
                className={cn(
                  "flex items-center gap-3 px-5 py-3 transition-colors group",
                  isDone ? "opacity-60" : "hover:bg-white/[0.02]"
                )}
              >
                {isDone ? (
                  <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
                ) : (
                  <Circle size={16} className="text-[var(--color-fg-faint)] flex-shrink-0 group-hover:text-[var(--color-accent)] transition-colors" />
                )}
                <span className={cn(
                  "text-[13px] flex-1",
                  isDone ? "line-through text-[var(--color-fg-faint)]" : "text-[var(--color-fg)] group-hover:text-[var(--color-fg)] transition-colors"
                )}>
                  {stepLabels[step]}
                </span>
                {!isDone && (
                  <span className="text-[11px] text-[var(--color-fg-faint)] group-hover:text-[var(--color-accent)] transition-colors opacity-0 group-hover:opacity-100">
                    →
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
