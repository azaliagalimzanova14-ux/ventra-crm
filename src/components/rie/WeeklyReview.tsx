"use client";

/**
 * src/components/rie/WeeklyReview.tsx
 *
 * Weekly Review — Sprint 4
 *
 * Displays the 7-day lookback: stats, narrative, health changes, top activity.
 * Calls GET /api/rie/weekly-review (credentials: "include").
 * AI-enriched narrative rendered when available; graceful empty state otherwise.
 *
 * Design:
 *   - Stat tiles row at top (contacts, messages, tasks, new clients)
 *   - AI narrative block (shown only when non-empty)
 *   - Health changes (improved / declined)
 *   - Top active clients
 *   - Portfolio snapshot counts
 *   - All colors via CSS custom properties; health states use semantic colors
 */

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  MessageSquare,
  CheckSquare,
  Users,
  UserPlus,
} from "lucide-react";

// ── Types (mirrors API response) ──────────────────────────────────────────────

interface WeeklyClientActivity {
  clientId:    string;
  clientName:  string;
  msgCount:    number;
  lastChannel: string | null;
}

interface WeeklyHealthChange {
  clientId:   string;
  clientName: string;
  previous:   string | null;
  current:    string | null;
  direction:  "improved" | "declined" | "unchanged";
}

interface WeeklyReview {
  generatedAt:    string;
  weekStart:      string;
  weekEnd:        string;
  totalContacts:  number;
  totalMessages:  number;
  newClients:     number;
  tasksCompleted: number;
  healthImproved: number;
  healthDeclined: number;
  topActivity:    WeeklyClientActivity[];
  improved:       WeeklyHealthChange[];
  declined:       WeeklyHealthChange[];
  totalActive:    number;
  strongCount:    number;
  healthyCount:   number;
  atRiskCount:    number;
  criticalCount:  number;
  narrative:      string;
  nextWeekFocus:  string;
  provider:       string | null;
}

interface ApiResponse {
  review: WeeklyReview;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-16 rounded-lg"
            style={{ backgroundColor: "var(--color-surface)" }}
          />
        ))}
      </div>
      <div
        className="h-20 rounded-lg"
        style={{ backgroundColor: "var(--color-surface)" }}
      />
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon:  React.ElementType;
  label: string;
  value: number;
}) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border"
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor:     "var(--color-border)",
      }}
    >
      <Icon size={16} style={{ color: "var(--color-fg-muted)" }} />
      <div>
        <p className="text-lg font-semibold leading-none" style={{ color: "var(--color-fg)" }}>
          {value}
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-fg-muted)" }}>
          {label}
        </p>
      </div>
    </div>
  );
}

function NarrativeBlock({ narrative, nextWeekFocus }: { narrative: string; nextWeekFocus: string }) {
  if (!narrative && !nextWeekFocus) return null;
  return (
    <div
      className="p-4 rounded-lg border"
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor:     "var(--color-border)",
      }}
    >
      {narrative && (
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-fg)" }}>
          {narrative}
        </p>
      )}
      {nextWeekFocus && (
        <p
          className="text-sm mt-2 font-medium"
          style={{ color: "var(--color-fg-muted)" }}
        >
          Next week: {nextWeekFocus}
        </p>
      )}
    </div>
  );
}

function HealthChangeList({
  changes,
  direction,
}: {
  changes:   WeeklyHealthChange[];
  direction: "improved" | "declined";
}) {
  if (changes.length === 0) return null;

  const isUp = direction === "improved";

  return (
    <div>
      <p
        className="text-xs font-medium mb-1.5"
        style={{ color: "var(--color-fg-muted)" }}
      >
        {isUp ? "Improved" : "Declined"}
      </p>
      <div className="space-y-1">
        {changes.map((c) => (
          <div key={c.clientId} className="flex items-center gap-2">
            {isUp ? (
              <TrendingUp size={12} className="text-emerald-500 shrink-0" />
            ) : (
              <TrendingDown size={12} className="text-red-500 shrink-0" />
            )}
            <span className="text-sm truncate" style={{ color: "var(--color-fg)" }}>
              {c.clientName}
            </span>
            {c.current && (
              <span
                className="text-xs ml-auto shrink-0"
                style={{ color: "var(--color-fg-faint)" }}
              >
                {c.current.replace("_", " ")}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PortfolioBar({ review }: { review: WeeklyReview }) {
  if (review.totalActive === 0) return null;

  const pct = (n: number) => Math.round((n / review.totalActive) * 100);

  return (
    <div>
      <p
        className="text-xs font-medium mb-2"
        style={{ color: "var(--color-fg-muted)" }}
      >
        Portfolio snapshot — {review.totalActive} active
      </p>
      <div className="flex rounded-full overflow-hidden h-2">
        {review.strongCount > 0 && (
          <div
            className="bg-emerald-500"
            style={{ width: `${pct(review.strongCount)}%` }}
            title={`Strong: ${review.strongCount}`}
          />
        )}
        {review.healthyCount > 0 && (
          <div
            className="bg-blue-500"
            style={{ width: `${pct(review.healthyCount)}%` }}
            title={`Healthy: ${review.healthyCount}`}
          />
        )}
        {review.atRiskCount > 0 && (
          <div
            className="bg-amber-500"
            style={{ width: `${pct(review.atRiskCount)}%` }}
            title={`At-risk: ${review.atRiskCount}`}
          />
        )}
        {review.criticalCount > 0 && (
          <div
            className="bg-red-500"
            style={{ width: `${pct(review.criticalCount)}%` }}
            title={`Critical: ${review.criticalCount}`}
          />
        )}
      </div>
      <div className="flex gap-4 mt-1.5">
        {[
          { label: "Strong",   count: review.strongCount,   cls: "text-emerald-600" },
          { label: "Healthy",  count: review.healthyCount,  cls: "text-blue-600" },
          { label: "At-risk",  count: review.atRiskCount,   cls: "text-amber-600" },
          { label: "Critical", count: review.criticalCount, cls: "text-red-600" },
        ].map(({ label, count, cls }) =>
          count > 0 ? (
            <span key={label} className={`text-xs ${cls}`}>
              {count} {label}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

function Header({ onRefresh, loading, weekStart }: { onRefresh: () => void; loading: boolean; weekStart?: string }) {
  const dateLabel = weekStart
    ? new Date(weekStart).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-base font-semibold" style={{ color: "var(--color-fg)" }}>
          Weekly Review
        </h2>
        {dateLabel && (
          <p className="text-xs mt-0.5" style={{ color: "var(--color-fg-muted)" }}>
            Past 7 days · since {dateLabel}
          </p>
        )}
      </div>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="p-1.5 rounded-md transition-opacity hover:opacity-70 disabled:opacity-40"
        style={{ color: "var(--color-fg-muted)" }}
        aria-label="Refresh weekly review"
      >
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function WeeklyReview() {
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [review, setReview]     = useState<WeeklyReview | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rie/weekly-review", { credentials: "include" });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json() as ApiResponse;
      setReview(json.review);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load weekly review");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <Header
        onRefresh={load}
        loading={loading}
        weekStart={review?.weekStart}
      />

      {loading && <Skeleton />}

      {!loading && error && (
        <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
          {error}
        </p>
      )}

      {!loading && !error && review && (
        <div className="space-y-5">
          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3">
            <StatTile icon={Users}        label="Clients contacted" value={review.totalContacts} />
            <StatTile icon={MessageSquare} label="Messages"          value={review.totalMessages} />
            <StatTile icon={CheckSquare}  label="Tasks completed"   value={review.tasksCompleted} />
            <StatTile icon={UserPlus}     label="New clients"       value={review.newClients} />
          </div>

          {/* AI narrative */}
          <NarrativeBlock
            narrative={review.narrative}
            nextWeekFocus={review.nextWeekFocus}
          />

          {/* Health changes */}
          {(review.improved.length > 0 || review.declined.length > 0) && (
            <div
              className="p-4 rounded-lg border space-y-3"
              style={{
                backgroundColor: "var(--color-surface)",
                borderColor:     "var(--color-border)",
              }}
            >
              <HealthChangeList changes={review.improved} direction="improved" />
              <HealthChangeList changes={review.declined} direction="declined" />
            </div>
          )}

          {/* Top activity */}
          {review.topActivity.length > 0 && (
            <div>
              <p
                className="text-xs font-medium mb-2"
                style={{ color: "var(--color-fg-muted)" }}
              >
                Most active this week
              </p>
              <div className="space-y-1.5">
                {review.topActivity.map((a) => (
                  <div key={a.clientId} className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: "var(--color-fg)" }}>
                      {a.clientName}
                    </span>
                    <span className="text-xs" style={{ color: "var(--color-fg-faint)" }}>
                      {a.msgCount} msg{a.msgCount !== 1 ? "s" : ""}
                      {a.lastChannel ? ` · ${a.lastChannel}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Portfolio bar */}
          <PortfolioBar review={review} />
        </div>
      )}
    </div>
  );
}
