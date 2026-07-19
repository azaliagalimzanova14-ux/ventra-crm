"use client";

/**
 * src/components/rie/PortfolioIntelligence.tsx
 *
 * Portfolio Intelligence — Sprint 3.2 Feature 4
 *
 * Workspace-level view of relationship health across all clients.
 *
 * Sections (deterministic, no AI):
 *   1. Needs Action   — declining momentum or critical/at-risk
 *   2. Overdue        — past cadence threshold
 *   3. Improving      — accelerating momentum, healthy/strong
 *   4. Active Recently — contacted in last 7 days
 *
 * Answers in under 5 seconds:
 *   "Which relationships need my attention right now?"
 *   "Which are getting better?"
 *   "Which are overdue?"
 *
 * States: loading skeleton, empty workspace, no data, healthy, mixed
 *
 * Client-only — do NOT import in server components.
 */

import { useState, useEffect, useCallback } from "react";
import Link                                 from "next/link";
import { cn }                               from "@/lib/utils";
import {
  TrendingDown, TrendingUp, Clock, CheckCircle2,
  AlertCircle, RefreshCw, Loader2, Users,
} from "lucide-react";

// ── API types ──────────────────────────────────────────────────────────────────

interface PortfolioClient {
  id:               string;
  name:             string;
  healthLabel:      "strong" | "healthy" | "at_risk" | "critical" | null;
  healthScore:      number | null;
  daysSinceContact: number | null;
  isOverdue:        boolean;
  overdueRatio:     number | null;
  sampleSize:       number;
  momentum:         string | null;
}

interface Portfolio {
  generatedAt:   string;
  improving:     PortfolioClient[];
  declining:     PortfolioClient[];
  overdue:       PortfolioClient[];
  recentContact: PortfolioClient[];
  untracked:     number;
  totalActive:   number;
}

// ── Health config ──────────────────────────────────────────────────────────────

const HEALTH_CFG = {
  strong:   { dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200",  label: "Strong"   },
  healthy:  { dot: "bg-blue-500",    badge: "bg-blue-50 text-blue-700 border-blue-200",            label: "Healthy"  },
  at_risk:  { dot: "bg-amber-500",   badge: "bg-amber-50 text-amber-700 border-amber-200",         label: "At Risk"  },
  critical: { dot: "bg-red-500",     badge: "bg-red-50 text-red-700 border-red-200",               label: "Critical" },
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function dayLabel(days: number | null): string {
  if (days === null) return "—";
  if (days === 0)    return "today";
  if (days === 1)    return "1d ago";
  return `${Math.round(days)}d ago`;
}

function fmtTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  } catch { return ""; }
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-[var(--color-border)]", className)} />;
}

function PortfolioSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading portfolio" aria-busy="true">
      <div className="space-y-1.5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3.5 w-32" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

// ── Client row ─────────────────────────────────────────────────────────────────

function ClientRow({
  client,
  showRatio,
}: {
  client:    PortfolioClient;
  showRatio: boolean;
}) {
  const cfg = client.healthLabel && client.healthLabel in HEALTH_CFG
    ? HEALTH_CFG[client.healthLabel]
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
      <span
        className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", cfg?.dot ?? "bg-[var(--color-fg-faint)]")}
        aria-hidden="true"
      />
      <span className="flex-1 min-w-0">
        <span className="text-[13px] font-medium text-[var(--color-fg)] truncate block group-hover:text-[var(--color-accent)] transition-colors">
          {client.name}
        </span>
      </span>
      <div className="flex items-center gap-2 flex-shrink-0">
        {showRatio && client.overdueRatio !== null && (
          <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
            {client.overdueRatio}×
          </span>
        )}
        <span className="text-[12px] text-[var(--color-fg-muted)]">
          {dayLabel(client.daysSinceContact)}
        </span>
        {cfg && (
          <span className={cn("text-[10px] font-semibold border px-1.5 py-0.5 rounded-full hidden sm:inline", cfg.badge)}>
            {cfg.label}
          </span>
        )}
      </div>
    </Link>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({
  label, icon: Icon, color, clients, showRatio, emptyMsg,
}: {
  label:    string;
  icon:     React.ElementType;
  color:    string;
  clients:  PortfolioClient[];
  showRatio: boolean;
  emptyMsg?: string;
}) {
  if (clients.length === 0 && !emptyMsg) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} className={color} aria-hidden="true" />
        <p className={cn("text-[11px] font-bold uppercase tracking-wider", color)}>
          {label}
        </p>
        {clients.length > 0 && (
          <span className="text-[11px] text-[var(--color-fg-faint)]">({clients.length})</span>
        )}
      </div>
      {clients.length === 0 && emptyMsg ? (
        <p className="text-[12px] text-[var(--color-fg-faint)] pl-1">{emptyMsg}</p>
      ) : (
        <div className="space-y-2">
          {clients.map((c) => (
            <ClientRow key={c.id} client={c} showRatio={showRatio} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Header bar ─────────────────────────────────────────────────────────────────

function Header({ portfolio, onRefresh }: { portfolio: Portfolio; onRefresh: () => void }) {
  const [refreshing, setRefreshing] = useState(false);

  function handleRefresh(): void {
    setRefreshing(true);
    void (async () => {
      await new Promise<void>((r) => { onRefresh(); setTimeout(r, 500); });
      setRefreshing(false);
    })();
  }

  const tracked = portfolio.totalActive - portfolio.untracked;
  const issues  = portfolio.declining.length + portfolio.overdue.length;

  let summary: string;
  if (portfolio.totalActive === 0) {
    summary = "No active clients yet.";
  } else if (issues === 0) {
    summary = `All ${tracked} tracked relationship${tracked !== 1 ? "s" : ""} look healthy.`;
  } else {
    summary = `${issues} relationship${issues !== 1 ? "s" : ""} need${issues === 1 ? "s" : ""} your attention.`;
  }

  return (
    <div className="flex items-start justify-between gap-3 mb-6">
      <div>
        <p className="text-[17px] font-semibold text-[var(--color-fg)] leading-snug">
          {summary}
        </p>
        <p className="text-[11px] text-[var(--color-fg-faint)] mt-1">
          {portfolio.totalActive} active client{portfolio.totalActive !== 1 ? "s" : ""}
          {portfolio.untracked > 0 && ` · ${portfolio.untracked} untracked`}
          {portfolio.generatedAt ? ` · ${fmtTime(portfolio.generatedAt)}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        aria-label="Refresh Portfolio"
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

// ── Main export ────────────────────────────────────────────────────────────────

export function PortfolioIntelligence() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(false);

  const load = useCallback((): void => {
    setLoading(true);
    setError(false);
    void (async () => {
      try {
        const res = await fetch("/api/rie/portfolio", { credentials: "include" });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json() as { portfolio: Portfolio };
        setPortfolio(data.portfolio);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return <PortfolioSkeleton />;

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !portfolio) {
    return (
      <div
        role="alert"
        className="flex items-center gap-3 px-4 py-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl"
      >
        <AlertCircle size={16} className="text-[var(--color-fg-faint)] flex-shrink-0" />
        <div className="flex-1">
          <p className="text-[13px] font-medium text-[var(--color-fg)]">Portfolio unavailable</p>
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

  // ── Empty workspace ────────────────────────────────────────────────────────
  if (portfolio.totalActive === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <div className="w-12 h-12 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center mb-4">
          <Users size={20} className="text-[var(--color-fg-faint)]" />
        </div>
        <p className="text-[15px] font-semibold text-[var(--color-fg)] mb-1">No active clients</p>
        <p className="text-[13px] text-[var(--color-fg-muted)] mb-5 max-w-xs">
          Add clients and start tracking relationships to see portfolio intelligence.
        </p>
        <Link href="/clients" className="text-[13px] font-medium text-[var(--color-accent)] hover:underline">
          Go to Clients →
        </Link>
      </div>
    );
  }

  // ── No tracked data ────────────────────────────────────────────────────────
  if (portfolio.untracked === portfolio.totalActive) {
    return (
      <div className="space-y-4">
        <Header portfolio={portfolio} onRefresh={load} />
        <div className="flex items-center gap-3 px-4 py-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl">
          <AlertCircle size={15} className="text-[var(--color-fg-faint)] flex-shrink-0" />
          <p className="text-[13px] text-[var(--color-fg-muted)]">
            No relationship data yet. Send a few messages to clients and check back after rhythm data builds up.
          </p>
        </div>
      </div>
    );
  }

  const hasAlerts = portfolio.declining.length > 0 || portfolio.overdue.length > 0;

  // ── Healthy portfolio ──────────────────────────────────────────────────────
  if (!hasAlerts) {
    return (
      <div className="space-y-6">
        <Header portfolio={portfolio} onRefresh={load} />
        <div className="flex items-center gap-3 px-4 py-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-emerald-800">Portfolio looks healthy</p>
            <p className="text-[12px] text-emerald-700 mt-0.5">
              No declining or overdue relationships detected right now.
            </p>
          </div>
        </div>
        {portfolio.improving.length > 0 && (
          <Section
            label="Improving" icon={TrendingUp} color="text-emerald-600"
            clients={portfolio.improving} showRatio={false}
          />
        )}
        {portfolio.recentContact.length > 0 && (
          <Section
            label="Active Recently" icon={CheckCircle2} color="text-blue-500"
            clients={portfolio.recentContact} showRatio={false}
          />
        )}
      </div>
    );
  }

  // ── Mixed portfolio ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <Header portfolio={portfolio} onRefresh={load} />

      {portfolio.declining.length > 0 && (
        <Section
          label="Needs Action" icon={TrendingDown} color="text-red-500"
          clients={portfolio.declining} showRatio={false}
        />
      )}
      {portfolio.overdue.length > 0 && (
        <Section
          label="Overdue" icon={Clock} color="text-amber-500"
          clients={portfolio.overdue} showRatio={true}
        />
      )}
      {portfolio.improving.length > 0 && (
        <Section
          label="Improving" icon={TrendingUp} color="text-emerald-600"
          clients={portfolio.improving} showRatio={false}
        />
      )}
      {portfolio.recentContact.length > 0 && (
        <Section
          label="Active Recently" icon={CheckCircle2} color="text-blue-500"
          clients={portfolio.recentContact} showRatio={false}
        />
      )}
    </div>
  );
}
