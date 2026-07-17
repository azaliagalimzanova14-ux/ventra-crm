"use client";

/**
 * /timeline — Unified Timeline
 *
 * Shows a merged, newest-first stream of:
 *   - Task events (created, completed, updated, assigned)
 *   - Client events (added, updated, deleted, assigned)
 *   - Deal events (created, stage changed, won, lost)
 *   - Conversation messages
 *
 * Powered by GET /api/timeline.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/top-bar";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, Users, TrendingUp, MessageCircle,
  CheckSquare, RefreshCw, Loader2, Activity,
  ChevronDown,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TimelineItem {
  id:          string;
  kind:        "message" | "activity";
  type:        string;
  title:       string;
  body:        string | null;
  actor_id:    string | null;
  entity_id:   string | null;
  entity_type: string | null;
  href:        string | null;
  created_at:  string;
}

type TypeFilter = "all" | "tasks" | "clients" | "deals" | "messages";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m    = Math.floor(diff / 60_000);
  if (m < 1)   return "just now";
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// ── Event icon & color ────────────────────────────────────────────────────────

function eventMeta(item: TimelineItem): {
  icon:  React.ElementType;
  color: string;
  bg:    string;
  label: string;
} {
  if (item.type.startsWith("task"))    return { icon: CheckSquare,   color: "text-violet-600", bg: "bg-violet-50", label: "Task"    };
  if (item.type.startsWith("client"))  return { icon: Users,         color: "text-blue-600",   bg: "bg-blue-50",   label: "Client"  };
  if (item.type.startsWith("deal"))    return { icon: TrendingUp,    color: "text-emerald-600",bg: "bg-emerald-50",label: "Deal"    };
  if (item.type === "message")         return { icon: MessageCircle, color: "text-[#0088cc]",  bg: "bg-blue-50",   label: "Message" };
  return { icon: Activity, color: "text-[var(--color-fg-faint)]", bg: "bg-[var(--color-canvas)]", label: "Event" };
}

function typeLabel(type: string): string {
  const MAP: Record<string, string> = {
    task_created:      "Task created",
    task_completed:    "Task completed",
    task_updated:      "Task updated",
    task_assigned:     "Task assigned",
    task_deleted:      "Task deleted",
    client_added:      "Client added",
    client_updated:    "Client updated",
    client_deleted:    "Client deleted",
    client_assigned:   "Client assigned",
    deal_created:      "Deal created",
    deal_stage_changed:"Deal moved",
    deal_won:          "Deal won",
    deal_lost:         "Deal lost",
    message:           "Message",
  };
  return MAP[type] ?? type.replace(/_/g, " ");
}

// ── Timeline Item ─────────────────────────────────────────────────────────────

function EventItem({ item }: { item: TimelineItem }) {
  const router = useRouter();
  const meta   = eventMeta(item);
  const Icon   = meta.icon;
  const isTask = item.type === "task_completed";

  return (
    <div
      className={cn(
        "flex gap-3 group",
        item.href && "cursor-pointer",
      )}
      onClick={() => item.href && router.push(item.href)}
    >
      {/* Icon column */}
      <div className="flex flex-col items-center">
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0", meta.bg)}>
          <Icon size={14} className={meta.color} />
        </div>
        <div className="w-px flex-1 bg-[var(--color-border)] mt-1" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <span className={cn(
                "text-[10px] font-semibold px-1.5 py-0.5 rounded-md",
                meta.bg, meta.color,
              )}>
                {typeLabel(item.type)}
              </span>
              {isTask && <CheckCircle2 size={12} className="text-emerald-500" />}
            </div>
            <p className={cn(
              "text-[13px] font-medium text-[var(--color-fg)] leading-snug",
              item.href && "group-hover:text-[var(--color-accent)] transition-colors",
            )}>
              {item.title}
            </p>
            {item.body && (
              <p className="text-[12px] text-[var(--color-fg-muted)] mt-0.5 line-clamp-2">{item.body}</p>
            )}
          </div>
          <span className="text-[10px] text-[var(--color-fg-faint)] flex-shrink-0 mt-0.5">{relTime(item.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TimelinePage() {
  const [events,    setEvents]    = useState<TimelineItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [offset,    setOffset]    = useState(0);
  const [hasMore,   setHasMore]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const LIMIT = 50;

  const fetchEvents = useCallback(async (reset = false) => {
    if (reset) {
      setLoading(true);
      setOffset(0);
    }
    try {
      const params = new URLSearchParams({
        limit:  String(LIMIT),
        offset: String(reset ? 0 : offset),
        types:  typeFilter,
      });
      const res  = await fetch(`/api/timeline?${params.toString()}`);
      const data = await res.json() as { events?: TimelineItem[]; total?: number };
      const newEvents = data.events ?? [];
      if (reset) {
        setEvents(newEvents);
      } else {
        setEvents((prev) => [...prev, ...newEvents]);
      }
      setHasMore(newEvents.length === LIMIT);
      setOffset((reset ? 0 : offset) + newEvents.length);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [typeFilter, offset]);

  useEffect(() => { void fetchEvents(true); }, [typeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRefresh() {
    setRefreshing(true);
    await fetchEvents(true);
  }

  // Group events by date
  const grouped = new Map<string, TimelineItem[]>();
  for (const e of events) {
    const day = e.created_at.slice(0, 10);
    const list = grouped.get(day) ?? [];
    list.push(e);
    grouped.set(day, list);
  }

  return (
    <div className="flex flex-col h-screen bg-[var(--color-canvas)] overflow-hidden">
      <TopBar title="Timeline" subtitle="Unified activity stream" />

      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-3xl mx-auto w-full">
        {/* Controls */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          {(["all", "tasks", "clients", "deals", "messages"] as TypeFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors capitalize",
                typeFilter === f
                  ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                  : "bg-[var(--color-surface)] text-[var(--color-fg-muted)] border-[var(--color-border)] hover:border-[var(--color-accent)]/40",
              )}
            >
              {f === "all" ? "All activity" : f}
            </button>
          ))}

          <button
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="ml-auto p-2 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-canvas)] text-[var(--color-fg-muted)] transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Timeline */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={24} className="animate-spin text-[var(--color-accent)]" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Activity size={36} className="text-[var(--color-fg-faint)]" />
            <p className="text-[14px] font-semibold text-[var(--color-fg-muted)]">No activity yet</p>
            <p className="text-[13px] text-[var(--color-fg-faint)]">Events will appear here as you use Ventra</p>
          </div>
        ) : (
          <div>
            {Array.from(grouped.entries()).map(([day, dayEvents]) => (
              <div key={day} className="mb-2">
                <div className="sticky top-0 bg-[var(--color-canvas)] py-2 mb-2 z-10">
                  <p className="text-[11px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider">
                    {fmtDate(day)}
                  </p>
                </div>
                {dayEvents.map((e) => (
                  <EventItem key={e.id} item={e} />
                ))}
              </div>
            ))}

            {hasMore && (
              <button
                onClick={() => void fetchEvents(false)}
                className="w-full py-3 flex items-center justify-center gap-2 text-[13px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)] rounded-xl hover:bg-[var(--color-canvas)] transition-colors mt-2"
              >
                <ChevronDown size={14} />
                Load more
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
