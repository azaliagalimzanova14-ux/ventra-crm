"use client";

/**
 * src/components/rie/ClientRieSection.tsx
 *
 * Relationship Intelligence section — three cards rendered in sequence:
 *
 *   1. Relationship Health Card   — score + label + progress bar
 *   2. Narrative Card             — 2–3 sentence AI summary + key evidence
 *   3. Recommended Action Card    — one specific next step
 *
 * Per-API state (Sprint 3.1.6 — M-3):
 *   rhythmLoading / rhythmError and narrativeLoading / narrativeError are
 *   tracked independently. A failure on one API does not block the other card.
 *
 * Stale-while-revalidate refresh (Sprint 3.1.6 — C-1):
 *   When narrative.isStale is true, one automatic re-fetch fires after 4 seconds.
 *   If the narrative is still stale after that, a manual "Refresh" link is shown.
 *   No polling — exactly one automatic attempt.
 *
 * Client-only — do NOT import in server components.
 */

import { useState, useEffect } from "react";
import { cn }                  from "@/lib/utils";
import { ArrowRight, Clock, AlertCircle } from "lucide-react";

// ── API types ─────────────────────────────────────────────────────────────────

interface RhythmData {
  daysSinceContact:    number | null;
  healthScore:         number | null;
  healthLabel:         "strong" | "healthy" | "at_risk" | "critical" | null;
  sampleSize:          number;
  isOverdue:           boolean;
}

interface EvidenceItem {
  type:   string;
  label:  string;
  value:  string;
  weight: "high" | "medium" | "low";
}

interface NarrativeData {
  narrative:          string;
  recommendedAction:  string;
  confidenceScore:    number;
  evidence:           EvidenceItem[];
  isStale:            boolean;
}

// ── Health color map ──────────────────────────────────────────────────────────

const HEALTH_CONFIG = {
  strong:   { hex: "#10b981", label: "Strong",   ringCls: "border-emerald-200", bgCls: "bg-emerald-50",  textCls: "text-emerald-700" },
  healthy:  { hex: "#3b82f6", label: "Healthy",  ringCls: "border-blue-200",    bgCls: "bg-blue-50",     textCls: "text-blue-700"    },
  at_risk:  { hex: "#f59e0b", label: "At Risk",  ringCls: "border-amber-200",   bgCls: "bg-amber-50",    textCls: "text-amber-700"   },
  critical: { hex: "#ef4444", label: "Critical", ringCls: "border-red-200",     bgCls: "bg-red-50",      textCls: "text-red-700"     },
} as const;

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded bg-[var(--color-border)]",
        className,
      )}
    />
  );
}

// ── Section heading (M-1) ─────────────────────────────────────────────────────

function SectionHeading() {
  return (
    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)] mb-0.5 px-0.5">
      Relationship Intelligence
    </p>
  );
}

// ── Shared card-level error slot ──────────────────────────────────────────────

function CardError({ message }: { message: string }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl px-4 py-3 flex items-center gap-2">
      <AlertCircle size={12} className="text-[var(--color-fg-faint)] flex-shrink-0" aria-hidden="true" />
      <span className="text-[12px] text-[var(--color-fg-muted)]">{message}</span>
    </div>
  );
}

// ── Card 1: Relationship Health ───────────────────────────────────────────────

function HealthCard({
  rhythm,
  loading,
  error,
}: {
  rhythm:  RhythmData | null;
  loading: boolean;
  error:   boolean;
}) {
  if (loading) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 space-y-3">
        <Skeleton className="h-2.5 w-32" />
        <Skeleton className="h-10 w-16" />
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>
    );
  }

  if (error) {
    return <CardError message="Relationship health unavailable." />;
  }

  if (!rhythm) return null;

  const { healthScore: score, healthLabel: label, sampleSize, isOverdue, daysSinceContact } = rhythm;
  const cfg = label && label in HEALTH_CONFIG ? HEALTH_CONFIG[label] : null;

  // Insufficient data
  if (score === null || sampleSize < 2 || !cfg) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)] mb-2">
          Relationship Health
        </p>
        <p className="text-[13px] text-[var(--color-fg-muted)]">
          Not enough messages to compute health — start a conversation to begin tracking.
        </p>
      </div>
    );
  }

  const days = daysSinceContact !== null ? Math.round(daysSinceContact) : null;
  const lastContactLabel =
    days === null ? null :
    days === 0   ? "contacted today" :
    days === 1   ? "1 day ago" :
                   `${days} days ago`;

  return (
    <div className={cn("border rounded-2xl p-4", cfg.bgCls, cfg.ringCls)}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <p className={cn("text-[10px] font-bold uppercase tracking-wider", cfg.textCls)}>
          Relationship Health
        </p>
        {lastContactLabel && (
          <span className={cn("text-[11px] opacity-75", cfg.textCls)}>
            {lastContactLabel}
          </span>
        )}
      </div>

      {/* Score + label */}
      <div className="flex items-baseline gap-2.5 mb-3">
        <span className={cn("text-[44px] font-bold leading-none tracking-tight", cfg.textCls)}>
          {score}
        </span>
        <span className={cn("text-[14px] font-semibold", cfg.textCls)}>
          {cfg.label}
        </span>
        {isOverdue && (
          <span className="ml-auto text-[10px] font-semibold text-red-600 bg-white/70 border border-red-200 px-2 py-0.5 rounded-full">
            overdue
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-white/50 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${score}%`, backgroundColor: cfg.hex }}
        />
      </div>
    </div>
  );
}

// ── Card 2: Narrative ─────────────────────────────────────────────────────────

function NarrativeCard({
  narrative,
  loading,
  error,
  onManualRefresh,
}: {
  narrative:       NarrativeData | null;
  loading:         boolean;
  error:           boolean;
  onManualRefresh: (() => void) | null;
}) {
  if (loading) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
        <div className="pt-3 border-t border-[var(--color-border)] flex gap-4">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    );
  }

  if (error) {
    return <CardError message="Narrative unavailable — will retry on next visit." />;
  }

  if (!narrative) return null;

  // Only show medium/high-weight evidence, skip health_score (shown in card 1)
  const keyEvidence = narrative.evidence.filter(
    (e) => e.weight !== "low" && e.type !== "health_score",
  );

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4">
      {/* Stale indicator — auto-refreshing or manual refresh offer (C-1) */}
      {narrative.isStale && (
        <div className="flex items-center gap-1.5 mb-2">
          <Clock size={12} className="text-[var(--color-fg-faint)]" />
          {onManualRefresh ? (
            <button
              onClick={onManualRefresh}
              className="text-[11px] text-[var(--color-accent)] hover:underline focus:outline-none"
              aria-label="Refresh narrative"
              type="button"
            >
              Refresh
            </button>
          ) : (
            <span className="text-[11px] text-[var(--color-fg-faint)]">
              Refreshing in the background…
            </span>
          )}
        </div>
      )}

      {/* Narrative text */}
      <p className="text-[13px] text-[var(--color-fg)] leading-[1.65]">
        {narrative.narrative}
      </p>

      {/* Evidence + confidence — secondary */}
      {keyEvidence.length > 0 && (
        <div className="mt-3.5 pt-3 border-t border-[var(--color-border)]">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {keyEvidence.map((e) => (
              <span key={e.type} className="text-[11px] text-[var(--color-fg-muted)]">
                <span className="text-[var(--color-fg-faint)]">{e.label}:</span>{" "}
                {e.value}
              </span>
            ))}
          </div>
          <p className="text-right text-[10px] text-[var(--color-fg-faint)] mt-1.5">
            {narrative.confidenceScore}% confidence
          </p>
        </div>
      )}
    </div>
  );
}

// ── Card 3: Recommended Action ────────────────────────────────────────────────

function ActionCard({ action }: { action: string | null }) {
  if (!action) return null;

  return (
    <div
      className={cn(
        "border rounded-2xl px-4 py-3.5 flex items-start gap-3",
        "bg-[var(--color-canvas)] border-[var(--color-accent)]/20",
      )}
    >
      <ArrowRight
        size={14}
        className="text-[var(--color-accent)] flex-shrink-0 mt-0.5"
        aria-hidden="true"
      />
      <p className="text-[13px] font-medium text-[var(--color-fg)] leading-snug">
        {action}
      </p>
    </div>
  );
}

// ── Loading skeleton (full section, both APIs pending) ────────────────────────

function RieSkeleton() {
  return (
    <div className="space-y-2 mb-4" aria-label="Loading relationship intelligence" aria-busy="true">
      <SectionHeading />
      <HealthCard    rhythm={null}    loading={true} error={false} />
      <NarrativeCard narrative={null} loading={true} error={false} onManualRefresh={null} />
      <div className="bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-2xl px-4 py-3.5">
        <Skeleton className="h-4 w-48" />
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ClientRieSection({ clientId }: { clientId: string }) {
  // Per-API state (M-3) — each card tracks loading and error independently
  const [rhythm,    setRhythm]    = useState<RhythmData | null>(null);
  const [narrative, setNarrative] = useState<NarrativeData | null>(null);
  const [rhythmLoading,    setRhythmLoading]    = useState(true);
  const [narrativeLoading, setNarrativeLoading] = useState(true);
  const [rhythmError,    setRhythmError]    = useState(false);
  const [narrativeError, setNarrativeError] = useState(false);

  // Stale refresh tracking (C-1) — true after the one automatic retry completes
  const [staleRetried, setStaleRetried] = useState(false);

  // ── Initial load — both APIs in parallel ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setRhythm(null);
      setNarrative(null);
      setRhythmLoading(true);
      setNarrativeLoading(true);
      setRhythmError(false);
      setNarrativeError(false);
      setStaleRetried(false);

      const [rResult, nResult] = await Promise.allSettled([
        fetch(`/api/rie/rhythm/${clientId}`,             { credentials: "include" }),
        fetch(`/api/rie/narrative?clientId=${clientId}`, { credentials: "include" }),
      ]);

      if (cancelled) return;

      // ── Rhythm ─────────────────────────────────────────────────────────────
      if (rResult.status === "fulfilled" && rResult.value.ok) {
        try {
          const d = await rResult.value.json() as { rhythm: RhythmData };
          if (!cancelled) setRhythm(d.rhythm);
        } catch {
          if (!cancelled) setRhythmError(true);
        }
      } else if (!cancelled) {
        setRhythmError(true);
      }
      if (!cancelled) setRhythmLoading(false);

      // ── Narrative ──────────────────────────────────────────────────────────
      if (nResult.status === "fulfilled" && nResult.value.ok) {
        try {
          const d = await nResult.value.json() as { narrative: NarrativeData };
          if (!cancelled) setNarrative(d.narrative);
        } catch {
          if (!cancelled) setNarrativeError(true);
        }
      } else if (!cancelled) {
        setNarrativeError(true);
      }
      if (!cancelled) setNarrativeLoading(false);
    }

    void load();
    return () => { cancelled = true; };
  }, [clientId]);

  // ── Stale auto-refresh — exactly one attempt, 4 s after stale detected (C-1) ──
  useEffect(() => {
    // Skip: not stale, already retried, or narrative still loading (client just changed)
    if (!narrative?.isStale || staleRetried || narrativeLoading) return;

    let live = true;

    const timer = setTimeout((): void => {
      if (!live) return;
      void (async () => {
        try {
          const res = await fetch(
            `/api/rie/narrative?clientId=${clientId}`,
            { credentials: "include" },
          );
          if (live && res.ok) {
            const d = await res.json() as { narrative: NarrativeData };
            if (live) setNarrative(d.narrative);
          }
        } catch { /* best-effort — never surface a background refresh error */ }
        if (live) setStaleRetried(true);
      })();
    }, 4000);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [narrative, staleRetried, narrativeLoading, clientId]);

  // ── Manual refresh — offered after auto-retry if narrative is still stale ─
  function handleManualRefresh(): void {
    void (async () => {
      try {
        const res = await fetch(
          `/api/rie/narrative?clientId=${clientId}`,
          { credentials: "include" },
        );
        if (res.ok) {
          const d = await res.json() as { narrative: NarrativeData };
          setNarrative(d.narrative);
        }
      } catch { /* best-effort */ }
    })();
  }

  // Pass manual refresh handler only once the auto-retry has completed
  const onManualRefresh: (() => void) | null =
    narrative?.isStale && staleRetried ? handleManualRefresh : null;

  // ── Render ────────────────────────────────────────────────────────────────

  // Both APIs still loading → full skeleton
  if (rhythmLoading && narrativeLoading) return <RieSkeleton />;

  // Both APIs failed → section-level error
  if (rhythmError && narrativeError) {
    return (
      <div
        role="alert"
        className="mb-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl px-4 py-3 flex items-center gap-2"
      >
        <AlertCircle size={13} className="text-[var(--color-fg-faint)] flex-shrink-0" aria-hidden="true" />
        <span className="text-[12px] text-[var(--color-fg-muted)]">
          Relationship intelligence unavailable — will retry on next visit.
        </span>
      </div>
    );
  }

  // Both resolved, neither errored, neither returned data → nothing to show yet
  if (!rhythmLoading && !narrativeLoading && !rhythm && !narrative && !rhythmError && !narrativeError) {
    return (
      <div className="mb-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4">
        <SectionHeading />
        <p className="text-[13px] text-[var(--color-fg-muted)] mt-1.5">
          Send a few messages to start tracking relationship health and rhythm.
        </p>
      </div>
    );
  }

  // At least one API succeeded — render cards with their own loading/error states
  return (
    <div className="space-y-2 mb-4">
      <SectionHeading />
      <HealthCard
        rhythm={rhythm}
        loading={rhythmLoading}
        error={rhythmError}
      />
      <NarrativeCard
        narrative={narrative}
        loading={narrativeLoading}
        error={narrativeError}
        onManualRefresh={onManualRefresh}
      />
      <ActionCard action={narrative?.recommendedAction ?? null} />
    </div>
  );
}
