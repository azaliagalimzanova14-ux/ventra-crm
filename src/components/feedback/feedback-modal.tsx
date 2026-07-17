"use client";

import { useState } from "react";
import {
  X, Star, Bug, Lightbulb, MessageSquare, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type FeedbackType,
  type BugSeverity,
  type FeaturePriority,
  type WouldUseAnswer,
} from "@/lib/feedback";

/** POST feedback to the DB-backed API; falls back silently on error. */
async function submitFeedbackApi(
  type:    "general" | "bug" | "feature",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: Record<string, any>,
): Promise<void> {
  try {
    await fetch("/api/feedback", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body:    JSON.stringify({ type, message }),
    });
  } catch { /* non-fatal */ }
}

// ─── Sub-types ────────────────────────────────────────────────────────────────

interface Props {
  currentPage: string;
  onClose:     () => void;
  onSubmit:    () => void;  // called after successful submit (show toast)
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS: { id: FeedbackType; label: string; icon: React.ElementType; color: string }[] = [
  { id: "general", label: "General",  icon: MessageSquare, color: "text-violet-600" },
  { id: "bug",     label: "Bug",      icon: Bug,           color: "text-red-600"    },
  { id: "feature", label: "Feature",  icon: Lightbulb,     color: "text-amber-600"  },
];

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold text-[var(--color-fg-muted)] uppercase tracking-wider mb-1.5">
      {children}
    </label>
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-faint)] focus:outline-none focus:border-[var(--color-accent)] transition-colors resize-none"
    />
  );
}

function TextInput({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-faint)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
    />
  );
}

function SegmentGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; color?: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map(({ id, label, color }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all",
            value === id
              ? color ?? "bg-[var(--color-accent)] border-[var(--color-accent)] text-white"
              : "bg-[var(--color-canvas)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-accent-subtle)] hover:text-[var(--color-fg)]",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Star rating ──────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hovered, setHovered] = useState(0);
  const display = hovered || value;
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          className="transition-transform hover:scale-110"
        >
          <Star
            size={24}
            className={n <= display ? "text-amber-400" : "text-[var(--color-border)]"}
            fill={n <= display ? "#fbbf24" : "none"}
          />
        </button>
      ))}
      {value > 0 && (
        <span className="ml-2 self-center text-[12px] text-[var(--color-fg-muted)]">
          {["", "Poor", "Fair", "Good", "Great", "Excellent"][value]}
        </span>
      )}
    </div>
  );
}

// ─── General feedback form ────────────────────────────────────────────────────

function GeneralForm({ onSubmit }: { onSubmit: (d: {
  rating: number;
  liked: string;
  confusing: string;
  wouldUse: WouldUseAnswer | null;
}) => void }) {
  const [rating,    setRating]    = useState(0);
  const [liked,     setLiked]     = useState("");
  const [confusing, setConfusing] = useState("");
  const [wouldUse,  setWouldUse]  = useState<WouldUseAnswer | null>(null);

  const canSubmit = rating > 0;

  return (
    <div className="space-y-4">
      <div>
        <Label>Overall rating *</Label>
        <StarRating value={rating} onChange={setRating} />
      </div>
      <div>
        <Label>What did you like?</Label>
        <Textarea value={liked} onChange={setLiked} placeholder="The AI insights were really helpful..." />
      </div>
      <div>
        <Label>What was confusing or missing?</Label>
        <Textarea value={confusing} onChange={setConfusing} placeholder="I wasn&apos;t sure how to..." />
      </div>
      <div>
        <Label>Would you use Ventra for your work?</Label>
        <SegmentGroup<WouldUseAnswer>
          options={[
            { id: "yes",   label: "Yes, definitely", color: "bg-emerald-500 border-emerald-500 text-white" },
            { id: "maybe", label: "Maybe",            color: "bg-amber-500 border-amber-500 text-white" },
            { id: "no",    label: "Not right now",   color: "bg-red-500 border-red-500 text-white" },
          ]}
          value={wouldUse}
          onChange={setWouldUse}
        />
      </div>
      <button
        onClick={() => canSubmit && onSubmit({ rating, liked, confusing, wouldUse })}
        disabled={!canSubmit}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold transition-colors",
          canSubmit
            ? "bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white"
            : "bg-[var(--color-border)] text-[var(--color-fg-faint)] cursor-not-allowed",
        )}
      >
        <Send size={13} /> Submit feedback
      </button>
    </div>
  );
}

// ─── Bug report form ──────────────────────────────────────────────────────────

function BugForm({ defaultPage, onSubmit }: {
  defaultPage: string;
  onSubmit: (d: {
    page: string;
    happened: string;
    expected: string;
    severity: BugSeverity;
    screenshotNote: string;
  }) => void;
}) {
  const [page,           setPage]           = useState(defaultPage);
  const [happened,       setHappened]       = useState("");
  const [expected,       setExpected]       = useState("");
  const [severity,       setSeverity]       = useState<BugSeverity | null>(null);
  const [screenshotNote, setScreenshotNote] = useState("");

  const canSubmit = happened.trim().length > 0 && severity !== null;

  return (
    <div className="space-y-4">
      <div>
        <Label>Page / Section</Label>
        <TextInput value={page} onChange={setPage} placeholder="e.g. Clients, Pipeline, Tasks" />
      </div>
      <div>
        <Label>What happened? *</Label>
        <Textarea value={happened} onChange={setHappened} placeholder="Describe what went wrong..." rows={3} />
      </div>
      <div>
        <Label>Expected behavior</Label>
        <Textarea value={expected} onChange={setExpected} placeholder="What should have happened?" rows={2} />
      </div>
      <div>
        <Label>Severity *</Label>
        <SegmentGroup<BugSeverity>
          options={[
            { id: "low",    label: "Low — cosmetic",     color: "bg-blue-500 border-blue-500 text-white" },
            { id: "medium", label: "Medium — functional", color: "bg-amber-500 border-amber-500 text-white" },
            { id: "high",   label: "High — blocker",      color: "bg-red-500 border-red-500 text-white" },
          ]}
          value={severity}
          onChange={setSeverity}
        />
      </div>
      <div>
        <Label>Screenshot notes (optional)</Label>
        <TextInput value={screenshotNote} onChange={setScreenshotNote} placeholder="Describe what a screenshot would show..." />
      </div>
      <button
        onClick={() => canSubmit && severity && onSubmit({ page, happened, expected, severity, screenshotNote })}
        disabled={!canSubmit}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold transition-colors",
          canSubmit
            ? "bg-red-500 hover:bg-red-400 text-white"
            : "bg-[var(--color-border)] text-[var(--color-fg-faint)] cursor-not-allowed",
        )}
      >
        <Bug size={13} /> Report bug
      </button>
    </div>
  );
}

// ─── Feature request form ─────────────────────────────────────────────────────

function FeatureForm({ onSubmit }: { onSubmit: (d: {
  idea: string;
  problem: string;
  priority: FeaturePriority;
}) => void }) {
  const [idea,     setIdea]     = useState("");
  const [problem,  setProblem]  = useState("");
  const [priority, setPriority] = useState<FeaturePriority | null>(null);

  const canSubmit = idea.trim().length > 0 && priority !== null;

  return (
    <div className="space-y-4">
      <div>
        <Label>Feature idea *</Label>
        <TextInput value={idea} onChange={setIdea} placeholder="e.g. Export clients to CSV" />
      </div>
      <div>
        <Label>What problem does it solve?</Label>
        <Textarea value={problem} onChange={setProblem} placeholder="Right now I have to manually..." rows={3} />
      </div>
      <div>
        <Label>Priority *</Label>
        <SegmentGroup<FeaturePriority>
          options={[
            { id: "nice_to_have", label: "Nice to have",  color: "bg-blue-500 border-blue-500 text-white" },
            { id: "important",    label: "Important",      color: "bg-amber-500 border-amber-500 text-white" },
            { id: "critical",     label: "Critical for me", color: "bg-violet-600 border-violet-600 text-white" },
          ]}
          value={priority}
          onChange={setPriority}
        />
      </div>
      <button
        onClick={() => canSubmit && priority && onSubmit({ idea, problem, priority })}
        disabled={!canSubmit}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold transition-colors",
          canSubmit
            ? "bg-amber-500 hover:bg-amber-400 text-white"
            : "bg-[var(--color-border)] text-[var(--color-fg-faint)] cursor-not-allowed",
        )}
      >
        <Lightbulb size={13} /> Submit request
      </button>
    </div>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

export function FeedbackModal({ currentPage, onClose, onSubmit }: Props) {
  const [tab, setTab] = useState<FeedbackType>("general");

  function handleGeneral(d: { rating: number; liked: string; confusing: string; wouldUse: WouldUseAnswer | null }) {
    void submitFeedbackApi("general", { ...d, page: currentPage });
    onSubmit();
    onClose();
  }

  function handleBug(d: { page: string; happened: string; expected: string; severity: BugSeverity; screenshotNote: string }) {
    void submitFeedbackApi("bug", d);
    onSubmit();
    onClose();
  }

  function handleFeature(d: { idea: string; problem: string; priority: FeaturePriority }) {
    void submitFeedbackApi("feature", d);
    onSubmit();
    onClose();
  }

  const activeTab = TABS.find((t) => t.id === tab)!;

  return (
    <div
      className="fixed inset-0 z-[190] flex items-end sm:items-center justify-center p-4 sm:pb-4 pb-0 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[480px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl rounded-b-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-0 flex-shrink-0">
          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
            tab === "general" ? "bg-violet-50" : tab === "bug" ? "bg-red-50" : "bg-amber-50"
          )}>
            <activeTab.icon size={14} className={activeTab.color} />
          </div>
          <div className="flex-1">
            <h2 className="text-[14px] font-bold text-[var(--color-fg)]">Share feedback</h2>
            <p className="text-[11px] text-[var(--color-fg-faint)]">Help us improve Ventra</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 px-5 pt-3 pb-0 flex-shrink-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all",
                tab === id
                  ? id === "general" ? "bg-violet-50 text-violet-700 border border-violet-200"
                    : id === "bug"   ? "bg-red-50 text-red-700 border border-red-200"
                                     : "bg-amber-50 text-amber-700 border border-amber-200"
                  : "text-[var(--color-fg-muted)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-fg)]",
              )}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="h-px bg-[var(--color-border)] mx-5 mt-3 flex-shrink-0" />

        {/* ── Form body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "general" && <GeneralForm onSubmit={handleGeneral} />}
          {tab === "bug"     && <BugForm defaultPage={currentPage} onSubmit={handleBug} />}
          {tab === "feature" && <FeatureForm onSubmit={handleFeature} />}
        </div>
      </div>
    </div>
  );
}
