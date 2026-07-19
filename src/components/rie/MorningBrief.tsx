"use client";

/**
 * src/components/rie/MorningBrief.tsx
 *
 * Morning Brief component — scannable workspace-level relationship snapshot.
 *
 * Sections (in scan order):
 *   1. Greeting + generated-at timestamp
 *   2. Needs Attention  — critical/at-risk clients, max 5
 *   3. Overdue          — past cadence but not at risk, max 5
 *   4. Recent Positive  — healthy/strong, contacted ≤ 3 days, max 3
 *   5. Today's Priorities — 3 AI-generated (or deterministic) action strings
 *
 * States handled:
 *   - loading         → skeleton
 *   - error           → error banner
 *   - empty workspace → no clients yet
 *   - no data         → clients exist but none have rhythm data
 *   - healthy         → all clear, no attention/overdue items
 *   - mixed           → normal operational view
 *
 * Client-only — do NOT import in server components.
 */

import { useState, useEffect, useCallback } from "react";
import Link                                 from "next/link";
import { cn }                               from "@/lib/utils";
import {
  AlertCircle, CheckCircle2, Clock, ArrowRight,
  RefreshCw, Loader2,
} from "lucide-react";

// ── API types ──────────────────────────────────────────────────────────────────

interface BriefClient {
  id:                   string;
  name:                 string;
  healthLabel:          "strong" | "healthy" | "at_risk" | "critical" | null;
  daysSinceContact:     number | null;
  silenceThresholdDays: number | null;
  isOverdue:            boolean;
  overdueRatio:         number | null;
  sampleSize:           number;
}

interface MorningBrief {
  generatedAt:          string;
  greeting:             string;
  needsAttention:       BriefClient[];
  overdueRelationships: BriefClient[];
  recentPositive:       BriefClient[];
  topPriorities:        string[];
  clientCount:          number;
  trackedCount:         number;
  provider:             string | null;
}

// ── Health config ──────────────────────────────────────────────────────────────

const HEALTH_CONFIG = {
  strong:   { label: "Strong",   dotCls: "bg-emerald-500", badgeCls: "bg-emerald-50 text-emerald-700 border-emerald-200"  },
  healthy:  { label: "Healthy",  dotCls: "bg-blue-500",    badgeCls: "bg-blue-50 text-blue-700 border-blue-200"            },
  at_risk:  { label: "At Risk",  dotCls: "bg-amber-500",   badgeCls: "bg-amber-50 text-amber-700 border-amber-200"         },
  critical: { label: "Critical", dotCls: "bg-red-500",     badgeCls: "bg-red-50 text-red-700 border-red-200"               },
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return "";
  }
}

function dayLabel(days: number | null): string {
  if (days === null) return "—";
  if (days === 0)    return "today";
  if (days === 1)    return "1 day ago";
  return `${Math.round(days)}d ago`;
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded bg-[var(--color-border)]", className)} />
  );
}

function BriefSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading morning brief" aria-busy="true">
      {/* Greeting */}
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-3.5 w-32" />
      </div>

      {/* Section */}
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <div className="space-y-2">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </div>

      {/* Priorities */}
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// ── Client row ─────────────────────────────────────────────────────────────────

function ClientRow({
  client,
  showOverdueRatio,
}: {
  client:           BriefClient;
  showOverdueRatio: boolean;
}) {
  const cfg = client.healthLabel && client.healthLabel in HEALTH_CONFIG
    ? HEALTH_CONFIG[client.healthLabel]
    : null;

  return (
    <Link
      href={`/clients/${client.id}`}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl border",
        "bg-[var(--color-surface)] border-[var(--color-border)]",
        "hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-canvas)]",
        "transition-colors duration-150 group",
      )}
    >
      {/* Health dot */}
      <span
        className={cn(
          "w-2.5 h-2.5 rounded-full flex-shrink-0",
          cfg?.dotCls ?? "bg-[var(--color-fg-faint)]",
        )}
        aria-hidden="true"
      />

      {/* Name */}
      <span className="flex-1 min-w-0">
        <span className="text-[13px] font-medium text-[var(--color-fg)] truncate block group-hover:text-[var(--color-accent)] transition-colors">
          {client.name}
        </span>
      </span>

      {/* Right: days ago + optional ratio badge */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {showOverdueRatio && client.overdueRatio !== null && (
          <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
            {client.overdueRatio}×
          </span>
        )}
        <span className="text-[12px] text-[var(--color-fg-muted)]">
          {dayLabel(client.daysSinceContact)}
        </span>
        {cfg && (
          <span className={cn("text-[10px] font-semibold border px-1.5 py-0.5 rounded-full hidden sm:inline", cfg.badgeCls)}>
            {cfg.label}
          </span>
        )}
      </div>
    </Link>
  );
}

// ── Section heading ────────────────────────────────────────────────────────────

function SectionLabel({
  icon: Icon,
  label,
  count,
  color,
}: {
  icon:  React.ElementType;
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon size={13} className={color} aria-hidden="true" />
      <p className={cn("text-[11px] font-bold uppercase tracking-wider", color)}>
        {label}
      </p>
      <span className="text-[11px] text-[var(--color-fg-faint)]">({count})</span>
    </div>
  );
}

// ── Priority item ──────────────────────────────────────────────────────────────

function PriorityItem({ index, text }: { index: number; text: string }) {
  return (
    <div className={cn(
      "flex items-start gap-3 px-4 py-3 rounded-xl border",
      "bg-[var(--color-canvas)] border-[var(--color-accent)]/15",
    )}>
      <span
        className="w-5 h-5 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5"
        aria-hidden="true"
      >
        {index + 1}
      </span>
      <p className="text-[13px] text-[var(--color-fg)] leading-snug">
        {text}
      </p>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function MorningBrief() {
  const [brief,   setBrief]   = useState<MorningBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  const load = useCallback((): void => {
    void (async () => {
      setLoading(true);
      setError(false);
      setBrief(null);
      try {
        const res = await fetch("/api/rie/morning-brief", { credentials: "include" });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json() as { brief: MorningBrief };
        setBrief(data.brief);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return <BriefSkeleton />;
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error || !brief) {
    return (
      <div
        role="alert"
        className="flex items-center gap-3 px-4 py-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl"
      >
        <AlertCircle size={16} className="text-[var(--color-fg-faint)] flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-[var(--color-fg)]">Morning Brief unavailable</p>
          <p className="text-[12px] text-[var(--color-fg-muted)] mt-0.5">Could not load workspace data.</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-1.5 text-[12px] text-[var(--color-accent)] hover:underline flex-shrink-0"
        >
          <RefreshCw size={12} />
          Retry
        </button>
      </div>
    );
  }

  // ── Empty workspace ──────────────────────────────────────────────────────────
  if (brief.clientCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <div className="w-12 h-12 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center mb-4">
          <ArrowRight size={20} className="text-[var(--color-fg-faint)]" />
        </div>
        <p className="text-[15px] font-semibold text-[var(--color-fg)] mb-1">No clients yet</p>
        <p className="text-[13px] text-[var(--color-fg-muted)] mb-5 max-w-xs">
          Add your first client to start receiving relationship briefs.
        </p>
        <Link
          href="/clients"
          className="text-[13px] font-medium text-[var(--color-accent)] hover:underline"
        >
          Go to Clients →
        </Link>
      </div>
    );
  }

  const { needsAttention, overdueRelationships, recentPositive, topPriorities } = brief;
  const hasAlerts = needsAttention.length > 0 || overdueRelationships.length > 0;

  // ── Healthy portfolio (no alerts, no overdue) ────────────────────────────────
  if (!hasAlerts && brief.trackedCount === 0) {
    return (
      <div className="space-y-6">
        {/* Greeting */}
        <Greeting brief={brief} onRefresh={load} />

        <div className="flex flex-col items-center justify-center py-12 text-center px-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-4">
            <CheckCircle2 size={20} className="text-emerald-600" />
          </div>
          <p className="text-[15px] font-semibold text-[var(--color-fg)] mb-1">
            No tracked relationships yet
          </p>
          <p className="text-[13px] text-[var(--color-fg-muted)] max-w-xs">
            Send a few messages to clients — relationship health and rhythm will appear here once there are 2+ interactions on record.
          </p>
        </div>

        <Priorities priorities={topPriorities} />
      </div>
    );
  }

  if (!hasAlerts) {
    return (
      <div className="space-y-6">
        <Greeting brief={brief} onRefresh={load} />

        <div className="flex items-center gap-3 px-4 py-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-emerald-800">All relationships on track</p>
            <p className="text-[12px] text-emerald-700 mt-0.5">
              {brief.trackedCount} tracked client{brief.trackedCount !== 1 ? "s" : ""} — no overdue relationships today.
            </p>
          </div>
        </div>

        {recentPositive.length > 0 && (
          <Section
            label="Recent Positive"
            icon={CheckCircle2}
            color="text-emerald-600"
            clients={recentPositive}
            showRatio={false}
          />
        )}

        <Priorities priorities={topPriorities} />
      </div>
    );
  }

  // ── Mixed / operational view ─────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <Greeting brief={brief} onRefresh={load} />

      {needsAttention.length > 0 && (
        <Section
          label="Needs Attention"
          icon={AlertCircle}
          color="text-red-500"
          clients={needsAttention}
          showRatio={true}
        />
      )}

      {overdueRelationships.length > 0 && (
        <Section
          label="Overdue"
          icon={Clock}
          color="text-amber-500"
          clients={overdueRelationships}
          showRatio={true}
        />
      )}

      {recentPositive.length > 0 && (
        <Section
          label="Recent Positive"
          icon={CheckCircle2}
          color="text-emerald-600"
          clients={recentPositive}
          showRatio={false}
        />
      )}

      <Priorities priorities={topPriorities} />
    </div>
  );
}

// ── Sub-layout helpers ─────────────────────────────────────────────────────────

function Greeting({ brief, onRefresh }: { brief: MorningBrief; onRefresh: () => void }) {
  const [refreshing, setRefreshing] = useState(false);

  function handleRefresh(): void {
    setRefreshing(true);
    void (async () => {
      try {
        await new Promise<void>((resolve) => {
          onRefresh();
          setTimeout(resolve, 400);
        });
      } finally {
        setRefreshing(false);
      }
    })();
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[17px] font-semibold text-[var(--color-fg)] leading-snug">
          {brief.greeting}
        </p>
        <p className="text-[11px] text-[var(--color-fg-faint)] mt-1">
          {brief.trackedCount} of {brief.clientCount} client{brief.clientCount !== 1 ? "s" : ""} tracked
          {brief.generatedAt ? ` · ${formatTime(brief.generatedAt)}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        aria-label="Refresh Morning Brief"
        className="flex-shrink-0 p-1.5 rounded-lg text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-border)] transition-colors disabled:opacity-40"
      >
        {refreshing
          ? <Loader2 size={14} className="animate-spin" />
          : <RefreshCw size={14} />
        }
      </button>
    </div>
  );
}

function Section({
  label,
  icon,
  color,
  clients,
  showRatio,
}: {
  label:     string;
  icon:      React.ElementType;
  color:     string;
  clients:   BriefClient[];
  showRatio: boolean;
}) {
  return (
    <div>
      <SectionLabel icon={icon} label={label} count={clients.length} color={color} />
      <div className="space-y-2">
        {clients.map((c) => (
          <ClientRow key={c.id} client={c} showOverdueRatio={showRatio} />
        ))}
      </div>
    </div>
  );
}

function Priorities({ priorities }: { priorities: string[] }) {
  if (priorities.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <ArrowRight size={13} className="text-[var(--color-accent)]" aria-hidden="true" />
        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)]">
          Today&apos;s Priorities
        </p>
      </div>
      <div className="space-y-2">
        {priorities.map((p, i) => (
          <PriorityItem key={i} index={i} text={p} />
        ))}
      </div>
    </div>
  );
}
