"use client";

/**
 * src/components/rie/ClientTimeline.tsx
 *
 * Relationship History — Sprint 3.2 Feature 3
 *
 * Shows how a relationship evolved over time:
 *   • Health snapshots (AI narrative milestones — each time the narrative changed)
 *   • Contact events  (daily message summaries — when and how you spoke)
 *   • Task events     (tasks created or completed linked to this client)
 *
 * Renders as a collapsible section on the client detail page.
 * Sorted newest-first. On-demand load — expands on click.
 *
 * Client-only — do NOT import in server components.
 */

import { useState, useCallback } from "react";
import { cn }                    from "@/lib/utils";
import {
  ChevronDown, ChevronUp,
  Activity, MessageCircle, CheckSquare,
  AlertCircle,
} from "lucide-react";

// ── API type (must match route.ts) ────────────────────────────────────────────

interface TimelineEvent {
  id:           string;
  kind:         "health" | "contact" | "task";
  timestamp:    string;
  // health
  healthLabel?: string;
  narrative?:   string;
  momentum?:    string;
  confidence?:  number;
  // contact
  messageCount?: number;
  lastPreview?:  string;
  initiator?:    "client" | "agent" | "mixed";
  channel?:      string;
  // task
  taskTitle?:  string;
  taskStatus?: string;
}

// ── Health label config ───────────────────────────────────────────────────────

const HEALTH_CFG = {
  strong:   { dot: "bg-emerald-500", text: "text-emerald-700", label: "Strong"   },
  healthy:  { dot: "bg-blue-500",    text: "text-blue-700",    label: "Healthy"  },
  at_risk:  { dot: "bg-amber-500",   text: "text-amber-700",   label: "At Risk"  },
  critical: { dot: "bg-red-500",     text: "text-red-700",     label: "Critical" },
} as const;

const MOMENTUM_LABEL: Record<string, string> = {
  accelerating: "↑ Accelerating",
  stable:       "→ Stable",
  declining:    "↓ Declining",
  dormant:      "· Dormant",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric", minute: "2-digit",
  });
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-[var(--color-border)]", className)} />;
}

// ── Event card components ─────────────────────────────────────────────────────

function HealthEvent({ event }: { event: TimelineEvent }) {
  const cfg = event.healthLabel && event.healthLabel in HEALTH_CFG
    ? HEALTH_CFG[event.healthLabel as keyof typeof HEALTH_CFG]
    : null;

  return (
    <div className="flex gap-3">
      {/* Timeline dot */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={cn("w-2.5 h-2.5 rounded-full mt-1", cfg?.dot ?? "bg-[var(--color-fg-faint)]")} />
        <div className="w-px flex-1 bg-[var(--color-border)] mt-1" />
      </div>

      <div className="pb-5 flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <Activity size={11} className="text-[var(--color-fg-faint)] flex-shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)]">
            Health snapshot
          </span>
          {cfg && (
            <span className={cn("text-[10px] font-semibold", cfg.text)}>
              {cfg.label}
            </span>
          )}
          {event.momentum && MOMENTUM_LABEL[event.momentum] && (
            <span className="text-[10px] text-[var(--color-fg-faint)]">
              {MOMENTUM_LABEL[event.momentum]}
            </span>
          )}
        </div>
        {event.narrative && (
          <p className="text-[12px] text-[var(--color-fg-muted)] leading-relaxed line-clamp-2">
            {event.narrative}
          </p>
        )}
        <p className="text-[10px] text-[var(--color-fg-faint)] mt-1">
          {fmtDate(event.timestamp)}
          {event.confidence !== undefined && ` · ${event.confidence}% confidence`}
        </p>
      </div>
    </div>
  );
}

function ContactEvent({ event }: { event: TimelineEvent }) {
  const channelLabel =
    event.channel === "telegram" ? "Telegram" :
    event.channel === "email"    ? "Email"    :
    event.channel ? event.channel.charAt(0).toUpperCase() + event.channel.slice(1) :
    "Message";

  const initiatorLabel =
    event.initiator === "client" ? "Client reached out" :
    event.initiator === "agent"  ? "You reached out" :
    "Both sides active";

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="w-2.5 h-2.5 rounded-full mt-1 bg-[var(--color-accent)]/60" />
        <div className="w-px flex-1 bg-[var(--color-border)] mt-1" />
      </div>

      <div className="pb-5 flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <MessageCircle size={11} className="text-[var(--color-fg-faint)] flex-shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)]">
            {channelLabel}
          </span>
          <span className="text-[10px] text-[var(--color-fg-faint)]">
            {event.messageCount} message{event.messageCount !== 1 ? "s" : ""}
          </span>
          <span className="text-[10px] text-[var(--color-fg-faint)]">· {initiatorLabel}</span>
        </div>
        {event.lastPreview && (
          <p className="text-[12px] text-[var(--color-fg-muted)] truncate">
            &ldquo;{event.lastPreview}&rdquo;
          </p>
        )}
        <p className="text-[10px] text-[var(--color-fg-faint)] mt-1">
          {fmtDate(event.timestamp)} at {fmtTime(event.timestamp)}
        </p>
      </div>
    </div>
  );
}

function TaskEvent({ event }: { event: TimelineEvent }) {
  const isDone = event.taskStatus === "done";
  const isCancelled = event.taskStatus === "cancelled";

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={cn(
          "w-2.5 h-2.5 rounded-full mt-1",
          isDone       ? "bg-emerald-500" :
          isCancelled  ? "bg-[var(--color-fg-faint)]" :
          "bg-amber-400",
        )} />
        <div className="w-px flex-1 bg-[var(--color-border)] mt-1" />
      </div>

      <div className="pb-5 flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <CheckSquare size={11} className="text-[var(--color-fg-faint)] flex-shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)]">
            Task {isDone ? "completed" : isCancelled ? "cancelled" : "created"}
          </span>
        </div>
        <p className={cn(
          "text-[12px] truncate",
          isDone || isCancelled ? "text-[var(--color-fg-muted)] line-through" : "text-[var(--color-fg)]",
        )}>
          {event.taskTitle}
        </p>
        <p className="text-[10px] text-[var(--color-fg-faint)] mt-1">
          {fmtDate(event.timestamp)}
        </p>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ClientTimeline({ clientId }: { clientId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [events,   setEvents]   = useState<TimelineEvent[] | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(false);

  const load = useCallback((): void => {
    if (events !== null || loading) return;
    setLoading(true);
    setError(false);
    void (async () => {
      try {
        const res = await fetch(
          `/api/clients/${clientId}/timeline?limit=40`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json() as { events: TimelineEvent[] };
        setEvents(data.events);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [clientId, events, loading]);

  function handleToggle(): void {
    if (!expanded) load();
    setExpanded((v) => !v);
  }

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden mb-4">
      {/* Header — always visible, click to expand */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-[var(--color-canvas)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Activity size={13} className="text-[var(--color-fg-faint)]" aria-hidden="true" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)]">
            Relationship History
          </p>
          {events !== null && (
            <span className="text-[10px] text-[var(--color-fg-faint)]">
              ({events.length} events)
            </span>
          )}
        </div>
        {expanded
          ? <ChevronUp   size={14} className="text-[var(--color-fg-faint)]" />
          : <ChevronDown size={14} className="text-[var(--color-fg-faint)]" />
        }
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-[var(--color-border)] px-4 pt-4 pb-2">
          {/* Loading */}
          {loading && (
            <div className="space-y-4">
              {[0,1,2].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full mt-1 bg-[var(--color-border)] animate-pulse" />
                    <div className="w-px h-10 bg-[var(--color-border)] mt-1" />
                  </div>
                  <div className="pb-4 flex-1 space-y-1.5">
                    <Skeleton className="h-2.5 w-32" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-2 w-24" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 py-3 text-[12px] text-[var(--color-fg-muted)]">
              <AlertCircle size={13} className="text-[var(--color-fg-faint)] flex-shrink-0" />
              Could not load relationship history.
            </div>
          )}

          {/* Empty */}
          {!loading && !error && events !== null && events.length === 0 && (
            <p className="text-[12px] text-[var(--color-fg-faint)] py-3">
              No history yet — send a few messages to start tracking how this relationship evolves.
            </p>
          )}

          {/* Events */}
          {!loading && !error && events !== null && events.length > 0 && (
            <div>
              {events.map((ev) => (
                ev.kind === "health"  ? <HealthEvent  key={ev.id} event={ev} /> :
                ev.kind === "contact" ? <ContactEvent key={ev.id} event={ev} /> :
                                        <TaskEvent    key={ev.id} event={ev} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
