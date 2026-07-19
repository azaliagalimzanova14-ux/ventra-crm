"use client";

/**
 * src/components/rie/OpportunityDetection.tsx
 *
 * Opportunity Detection — Sprint 4
 *
 * Displays AI-enriched relationship opportunities detected by opportunity-engine.ts.
 * All categorization is deterministic; AI explains the signal in one sentence.
 *
 * Design:
 *   - Calls GET /api/rie/opportunities (credentials: "include")
 *   - 4 opportunity types: re_engagement, waiting_reply, approaching, momentum_up
 *   - Uses CSS custom properties for all colors
 *   - useCallback on load() to satisfy react-hooks/exhaustive-deps
 */

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Clock, TrendingUp, MessageSquare, RefreshCw } from "lucide-react";

// ── Types (mirrors API response) ──────────────────────────────────────────────

type OpportunityType = "re_engagement" | "approaching" | "momentum_up" | "waiting_reply";

interface Opportunity {
  id:               string;
  clientName:       string;
  type:             OpportunityType;
  healthLabel:      "strong" | "healthy" | "at_risk" | "critical" | null;
  daysSinceContact: number | null;
  overdueRatio:     number | null;
  momentum:         string | null;
  insight:          string;
}

interface ApiResponse {
  generatedAt:   string;
  opportunities: Opportunity[];
  clientCount:   number;
  aiProvider:    string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_META: Record<
  OpportunityType,
  { label: string; icon: React.ElementType; colorClass: string }
> = {
  re_engagement: {
    label:      "Re-engage",
    icon:       AlertCircle,
    colorClass: "text-red-500",
  },
  waiting_reply: {
    label:      "Waiting for you",
    icon:       Clock,
    colorClass: "text-amber-500",
  },
  approaching: {
    label:      "Check in soon",
    icon:       MessageSquare,
    colorClass: "text-blue-500",
  },
  momentum_up: {
    label:      "Momentum",
    icon:       TrendingUp,
    colorClass: "text-emerald-500",
  },
};

const HEALTH_COLORS: Record<string, string> = {
  strong:   "text-emerald-600",
  healthy:  "text-blue-600",
  at_risk:  "text-amber-600",
  critical: "text-red-600",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-16 rounded-lg"
          style={{ backgroundColor: "var(--color-surface)" }}
        />
      ))}
    </div>
  );
}

function OpportunityCard({ opp }: { opp: Opportunity }) {
  const meta  = TYPE_META[opp.type];
  const Icon  = meta.icon;

  return (
    <div
      className="flex gap-3 p-3 rounded-lg border"
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor:     "var(--color-border)",
      }}
    >
      <div className={`mt-0.5 shrink-0 ${meta.colorClass}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-sm font-medium truncate"
            style={{ color: "var(--color-fg)" }}
          >
            {opp.clientName}
          </span>
          {opp.healthLabel && (
            <span className={`text-xs ${HEALTH_COLORS[opp.healthLabel] ?? ""}`}>
              {opp.healthLabel.replace("_", " ")}
            </span>
          )}
          {opp.daysSinceContact !== null && (
            <span className="text-xs" style={{ color: "var(--color-fg-faint)" }}>
              {opp.daysSinceContact}d ago
            </span>
          )}
          {opp.overdueRatio !== null && (
            <span className="text-xs font-medium text-amber-500">
              {opp.overdueRatio}×
            </span>
          )}
        </div>
        <p
          className="text-xs mt-0.5"
          style={{ color: "var(--color-fg-muted)" }}
        >
          {opp.insight || meta.label}
        </p>
      </div>
    </div>
  );
}

function Header({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-base font-semibold" style={{ color: "var(--color-fg)" }}>
          Opportunities
        </h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-fg-muted)" }}>
          Relationship signals that need attention
        </p>
      </div>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="p-1.5 rounded-md transition-opacity hover:opacity-70 disabled:opacity-40"
        style={{ color: "var(--color-fg-muted)" }}
        aria-label="Refresh opportunities"
      >
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function OpportunityDetection() {
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [data, setData]               = useState<ApiResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rie/opportunities", { credentials: "include" });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json() as ApiResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load opportunities");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <Header onRefresh={load} loading={loading} />

      {loading && <Skeleton />}

      {!loading && error && (
        <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
          {error}
        </p>
      )}

      {!loading && !error && data && data.opportunities.length === 0 && (
        <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
          No opportunities detected across {data.clientCount} active clients.
          Relationships look balanced — check back later.
        </p>
      )}

      {!loading && !error && data && data.opportunities.length > 0 && (
        <div className="space-y-2">
          {data.opportunities.map((opp) => (
            <OpportunityCard key={`${opp.id}-${opp.type}`} opp={opp} />
          ))}
          <p
            className="text-xs pt-1"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {data.opportunities.length} signal{data.opportunities.length !== 1 ? "s" : ""} across {data.clientCount} clients
            {data.aiProvider !== "none" && ` · AI: ${data.aiProvider}`}
          </p>
        </div>
      )}
    </div>
  );
}
