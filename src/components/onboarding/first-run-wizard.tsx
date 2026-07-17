"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Zap, ArrowRight, Check, Palette, Home, Briefcase,
  GraduationCap, Wrench, TrendingUp, MoreHorizontal,
  MessageCircle, Sparkles, AlertTriangle, CheckSquare,
  Users, Database, Layers, CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { markFirstRunDone, saveBusinessType, clearAllCRMData } from "@/lib/storage";
import { AIInsightCard, type AIInsight } from "@/components/ui/ai-insight-card";

// ─── Types ─────────────────────────────────────────────────────────────────────

type WizardStep  = 1 | 2 | 3 | 4 | 5;
type StartMode   = "demo" | "empty";
type FirstAction = "task" | "client" | "dashboard";

// ─── Business types ───────────────────────────────────────────────────────────

const BUSINESS_TYPES = [
  { id: "agency",     label: "Marketing Agency",  icon: Palette,       color: "text-violet-600 bg-violet-50 border-violet-200" },
  { id: "realestate", label: "Real Estate",       icon: Home,          color: "text-amber-600 bg-amber-50 border-amber-200" },
  { id: "consulting", label: "Consulting",        icon: Briefcase,     color: "text-blue-600 bg-blue-50 border-blue-200" },
  { id: "school",     label: "Online School",     icon: GraduationCap, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  { id: "service",    label: "Service Business",  icon: Wrench,        color: "text-orange-600 bg-orange-50 border-orange-200" },
  { id: "sales",      label: "Sales Team",        icon: TrendingUp,    color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
  { id: "other",      label: "Other",             icon: MoreHorizontal,color: "text-[var(--color-fg-muted)] bg-[var(--color-canvas)] border-[var(--color-border)]" },
] as const;

// ─── Step 1: Welcome ──────────────────────────────────────────────────────────

function Step1() {
  return (
    <div className="flex flex-col items-center text-center pt-2 pb-4">
      {/* Logo */}
      <div className="w-16 h-16 rounded-2xl bg-[var(--color-accent)] flex items-center justify-center shadow-lg shadow-[var(--color-accent)]/30 mb-6">
        <Zap size={28} className="text-white" strokeWidth={2.5} />
      </div>

      <h1 className="text-[24px] font-bold tracking-tight text-[var(--color-fg)] mb-2">
        Welcome to Ventra
      </h1>
      <p className="text-[14px] text-[var(--color-fg-muted)] leading-relaxed max-w-[380px] mb-8">
        The AI workspace that turns scattered client communication into clear actions — so you focus on growing, not managing.
      </p>

      {/* Value props */}
      <div className="w-full max-w-[360px] space-y-3">
        {[
          { icon: MessageCircle, text: "See all client messages in one inbox" },
          { icon: Sparkles,      text: "AI turns conversations into tasks & insights" },
          { icon: TrendingUp,    text: "Track deals, clients & projects without chaos" },
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-3 text-left bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl px-4 py-3">
            <div className="w-7 h-7 rounded-lg bg-[var(--color-accent-subtle)] flex items-center justify-center flex-shrink-0">
              <Icon size={13} className="text-[var(--color-accent)]" />
            </div>
            <p className="text-[13px] text-[var(--color-fg-muted)] font-medium">{text}</p>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-[var(--color-fg-faint)] mt-6">
        Setup takes about 2 minutes · No credit card required
      </p>
    </div>
  );
}

// ─── Step 2: Business type ────────────────────────────────────────────────────

function Step2({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-5">
        <h2 className="text-[18px] font-bold text-[var(--color-fg)] mb-1">What&apos;s your business?</h2>
        <p className="text-[13px] text-[var(--color-fg-muted)]">
          Ventra will personalise your AI insights and workspace to match how you work.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {BUSINESS_TYPES.map(({ id, label, icon: Icon, color }) => {
          const isSelected = selected === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={cn(
                "relative flex flex-col items-center gap-2.5 px-3 py-4 rounded-xl border-2 transition-all text-center",
                isSelected
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-subtle)] shadow-sm"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent-subtle)] hover:bg-[var(--color-canvas)]",
              )}
            >
              {isSelected && (
                <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[var(--color-accent)] flex items-center justify-center">
                  <Check size={9} className="text-white" strokeWidth={3} />
                </span>
              )}
              <div className={cn("w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0", color)}>
                <Icon size={16} />
              </div>
              <span className={cn(
                "text-[12px] font-semibold leading-tight",
                isSelected ? "text-[var(--color-accent)]" : "text-[var(--color-fg-muted)]",
              )}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 3: Demo vs empty ────────────────────────────────────────────────────

function Step3({
  startMode,
  onSelect,
}: {
  startMode: StartMode;
  onSelect:  (m: StartMode) => void;
}) {
  const options: { id: StartMode; icon: React.ElementType; title: string; sub: string; badge?: string; items: string[] }[] = [
    {
      id:    "demo",
      icon:  Database,
      title: "Start with demo data",
      sub:   "See Ventra fully loaded so you understand what's possible immediately.",
      badge: "Recommended",
      items: ["8 sample clients", "Active deals & pipeline", "Tasks and AI insights", "Inbox conversations"],
    },
    {
      id:    "empty",
      icon:  Layers,
      title: "Start empty",
      sub:   "Blank workspace — add your real clients and data from scratch.",
      items: ["Clean slate", "Your real clients only", "Build at your own pace"],
    },
  ];

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-[18px] font-bold text-[var(--color-fg)] mb-1">How do you want to start?</h2>
        <p className="text-[13px] text-[var(--color-fg-muted)]">
          You can always reset or add real data later from Settings.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {options.map(({ id, icon: Icon, title, sub, badge, items }) => {
          const isSelected = startMode === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={cn(
                "relative w-full text-left p-4 rounded-xl border-2 transition-all",
                isSelected
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-subtle)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent-subtle)]",
              )}
            >
              <div className="flex items-start gap-3">
                {/* Selection ring */}
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors",
                  isSelected ? "border-[var(--color-accent)] bg-[var(--color-accent)]" : "border-[var(--color-border)]",
                )}>
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={14} className={isSelected ? "text-[var(--color-accent)]" : "text-[var(--color-fg-muted)]"} />
                    <span className={cn("text-[13px] font-semibold", isSelected ? "text-[var(--color-accent)]" : "text-[var(--color-fg)]")}>
                      {title}
                    </span>
                    {badge && (
                      <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                        {badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-[var(--color-fg-faint)] mb-2 leading-relaxed">{sub}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((item) => (
                      <span key={item} className="flex items-center gap-1 text-[10px] font-medium text-[var(--color-fg-muted)] bg-[var(--color-canvas)] border border-[var(--color-border)] px-2 py-0.5 rounded-full">
                        <Check size={8} className="text-emerald-500" />
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 4: AI moment ────────────────────────────────────────────────────────

const DEMO_INSIGHT: AIInsight = {
  kind: "danger",
  icon: AlertTriangle,
  text: "Deal at risk — $48K proposal awaiting board decision",
  sub:  "Respond before Friday to keep the deal alive",
};

function Step4({ businessType }: { businessType: string | null }) {
  const [showInsight, setShowInsight] = useState(false);
  const [showTask,    setShowTask]    = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowInsight(true), 700);
    const t2 = setTimeout(() => setShowTask(true),    1_400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const clientLabel = businessType === "realestate"
    ? "Your client"
    : "Sarah Chen · Apex Digital";

  return (
    <div>
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={15} className="text-[var(--color-accent)]" />
          <h2 className="text-[18px] font-bold text-[var(--color-fg)]">Ventra in action</h2>
        </div>
        <p className="text-[13px] text-[var(--color-fg-muted)]">
          Watch how Ventra reads a client message and creates an action plan — automatically.
        </p>
      </div>

      {/* Simulated message */}
      <div className="bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl p-4 mb-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-[#25d366]" />
          <span className="text-[10px] font-semibold text-[#25d366] uppercase tracking-wider">WhatsApp · Just now</span>
        </div>

        {/* Client message bubble */}
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
            SC
          </div>
          <div className="flex-1">
            <p className="text-[11px] font-semibold text-[var(--color-fg)] mb-1">{clientLabel}</p>
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl rounded-tl-sm px-3.5 py-2.5 max-w-[340px]">
              <p className="text-[13px] text-[var(--color-fg)] leading-relaxed">
                Hi! Just following up on the proposal — my board needs a decision by Friday. Can we hop on a quick call today to go over final terms?
              </p>
            </div>
            <p className="text-[10px] text-[var(--color-fg-faint)] mt-1">2 minutes ago</p>
          </div>
        </div>
      </div>

      {/* AI arrow */}
      <div className={cn(
        "flex items-center gap-2 justify-center py-1 transition-all duration-500",
        showInsight ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
      )}>
        <div className="h-px flex-1 bg-[var(--color-border)]" />
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-accent-subtle)] border border-[var(--color-accent)]/30">
          <Sparkles size={10} className="text-[var(--color-accent)]" />
          <span className="text-[10px] font-semibold text-[var(--color-accent)]">Ventra AI analyzed this</span>
        </div>
        <div className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      {/* AI insight */}
      <div className={cn(
        "mt-3 transition-all duration-500",
        showInsight ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
      )}>
        <AIInsightCard insight={DEMO_INSIGHT} />
      </div>

      {/* Suggested task */}
      <div className={cn(
        "mt-3 transition-all duration-500",
        showTask ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
      )}>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center flex-shrink-0">
            <CheckSquare size={14} className="text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[9px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full uppercase">Urgent</span>
              <span className="text-[9px] text-[var(--color-fg-faint)]">AI created · just now</span>
            </div>
            <p className="text-[12px] font-semibold text-[var(--color-fg)]">
              Schedule call with Sarah Chen — confirm proposal terms
            </p>
          </div>
          <CheckCheck size={14} className="text-[var(--color-fg-faint)] flex-shrink-0" />
        </div>
        <p className="text-[11px] text-[var(--color-fg-faint)] text-center mt-3 leading-relaxed">
          This is what Ventra does for every client conversation — automatically.
        </p>
      </div>
    </div>
  );
}

// ─── Step 5: First action ─────────────────────────────────────────────────────

function Step5({ onAction }: { onAction: (a: FirstAction) => void }) {
  return (
    <div>
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-3">
          <CheckCheck size={20} className="text-emerald-600" />
        </div>
        <h2 className="text-[18px] font-bold text-[var(--color-fg)] mb-1">You&apos;re all set!</h2>
        <p className="text-[13px] text-[var(--color-fg-muted)] max-w-[340px] leading-relaxed">
          Your workspace is ready. What do you want to do first?
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {/* Primary: Create task */}
        <button
          onClick={() => onAction("task")}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
            <CheckSquare size={15} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-semibold">Create a follow-up task</p>
            <p className="text-[11px] opacity-75">Start with an action item for a real client</p>
          </div>
          <ArrowRight size={15} className="opacity-60 flex-shrink-0" />
        </button>

        {/* Secondary: Add client */}
        <button
          onClick={() => onAction("client")}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[var(--color-surface)] hover:bg-[var(--color-canvas)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] text-[var(--color-fg)] transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-[var(--color-accent-subtle)] flex items-center justify-center flex-shrink-0">
            <Users size={15} className="text-[var(--color-accent)]" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-semibold">Add my first real client</p>
            <p className="text-[11px] text-[var(--color-fg-faint)]">Import a client contact and start tracking</p>
          </div>
          <ArrowRight size={15} className="text-[var(--color-fg-faint)] flex-shrink-0" />
        </button>

        {/* Tertiary: Dashboard */}
        <button
          onClick={() => onAction("dashboard")}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[var(--color-surface)] hover:bg-[var(--color-canvas)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] text-[var(--color-fg)] transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-[var(--color-canvas)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0">
            <Zap size={15} className="text-[var(--color-fg-muted)]" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-semibold">Just open the dashboard</p>
            <p className="text-[11px] text-[var(--color-fg-faint)]">Explore Ventra on your own</p>
          </div>
          <ArrowRight size={15} className="text-[var(--color-fg-faint)] flex-shrink-0" />
        </button>
      </div>
    </div>
  );
}

// ─── Wizard shell ─────────────────────────────────────────────────────────────

export function FirstRunWizard({ onComplete }: { onComplete: () => void }) {
  const router   = useRouter();
  const [step,      setStep]      = useState<WizardStep>(1);
  const [business,  setBusiness]  = useState<string | null>(null);
  const [startMode, setStartMode] = useState<StartMode>("demo");

  function goNext() {
    if (step < 5) setStep((s) => (s + 1) as WizardStep);
  }
  function goBack() {
    if (step > 1) setStep((s) => (s - 1) as WizardStep);
  }
  function skipToFinish() {
    setStep(5);
  }

  function handleAction(action: FirstAction) {
    // Persist choices
    if (business) saveBusinessType(business);
    if (startMode === "empty") clearAllCRMData();
    markFirstRunDone();
    onComplete();
    // Navigate
    const paths: Record<FirstAction, string> = {
      task:      "/tasks",
      client:    "/clients",
      dashboard: "/dashboard",
    };
    router.push(paths[action]);
  }

  const canContinue = step !== 2 || business !== null;
  const isLastStep  = step === 5;
  const isFirstStep = step === 1;
  const showSkip    = step >= 2 && step <= 4;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="w-full max-w-[580px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: "90vh" }}
      >
        {/* ── Progress bar ── */}
        <div className="px-6 pt-5 flex-shrink-0">
          <div className="flex items-center gap-1">
            {([1, 2, 3, 4, 5] as WizardStep[]).map((s) => (
              <div
                key={s}
                className={cn(
                  "h-1 rounded-full transition-all duration-500",
                  s < step  ? "flex-1 bg-[var(--color-accent)]/40" :
                  s === step ? "flex-[2] bg-[var(--color-accent)]" :
                               "flex-1 bg-[var(--color-border)]",
                )}
              />
            ))}
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[10px] text-[var(--color-fg-faint)]">Step {step} of 5</p>
            {showSkip && (
              <button
                onClick={skipToFinish}
                className="text-[10px] text-[var(--color-fg-faint)] hover:text-[var(--color-fg-muted)] transition-colors"
              >
                Skip setup →
              </button>
            )}
          </div>
        </div>

        {/* ── Step content ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && <Step1 />}
          {step === 2 && <Step2 selected={business} onSelect={setBusiness} />}
          {step === 3 && <Step3 startMode={startMode} onSelect={setStartMode} />}
          {step === 4 && <Step4 businessType={business} />}
          {step === 5 && <Step5 onAction={handleAction} />}
        </div>

        {/* ── Footer nav ── (hidden on step 5 — actions are in the step itself) */}
        {!isLastStep && (
          <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-between gap-3 flex-shrink-0">
            {!isFirstStep ? (
              <button
                onClick={goBack}
                className="px-4 py-2 rounded-xl text-[13px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] transition-colors"
              >
                Back
              </button>
            ) : <div />}

            <button
              onClick={goNext}
              disabled={!canContinue}
              className={cn(
                "flex items-center gap-2 px-5 py-2 rounded-xl text-[13px] font-semibold transition-colors",
                canContinue
                  ? "bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white"
                  : "bg-[var(--color-border)] text-[var(--color-fg-faint)] cursor-not-allowed",
              )}
            >
              {step === 1 ? "Let's go" : step === 4 ? "I'm ready" : "Continue"}
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
