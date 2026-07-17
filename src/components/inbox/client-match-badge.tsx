"use client";

import { useState, useRef, useEffect } from "react";
import { Link2, UserCheck, UserPlus, ChevronDown, Search, X, Check } from "lucide-react";
import type { ClientMatchResult, MatchTier } from "@/lib/client-matcher";
import { getMethodLabel } from "@/lib/client-matcher";
import type { Client } from "@/lib/types";
import { cn } from "@/lib/utils";

// ── Tier styles ────────────────────────────────────────────────────────────────

const TIER_STYLES: Record<MatchTier, { bg: string; text: string; border: string; dot: string }> = {
  exact:  { bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500"  },
  strong: { bg: "bg-blue-50",     text: "text-blue-700",    border: "border-blue-200",    dot: "bg-blue-500"     },
  likely: { bg: "bg-amber-50",    text: "text-amber-700",   border: "border-amber-200",   dot: "bg-amber-500"    },
  none:   { bg: "bg-gray-50",     text: "text-gray-600",    border: "border-gray-200",    dot: "bg-gray-400"     },
};

// ── Reassign popover ──────────────────────────────────────────────────────────

function ReassignPopover({
  clients,
  currentClientId,
  onSelect,
  onClose,
}: {
  clients:         Client[];
  currentClientId?: string;
  onSelect:        (client: Client | null) => void;
  onClose:         () => void;
}) {
  const [query,  setQuery]  = useState("");
  const inputRef            = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = clients
    .filter((c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.company.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 8);

  return (
    <div className="absolute top-full left-0 mt-1.5 z-[200] w-[280px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)]">
        <Search size={12} className="text-[var(--color-fg-faint)] flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients…"
          className="flex-1 text-[12px] bg-transparent text-[var(--color-fg)] placeholder-[var(--color-fg-faint)] outline-none"
        />
        <button onClick={onClose} className="p-0.5 rounded hover:bg-[var(--color-canvas)] text-[var(--color-fg-faint)]">
          <X size={11} />
        </button>
      </div>

      {/* Client list */}
      <div className="max-h-[240px] overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <p className="text-[11px] text-[var(--color-fg-faint)] text-center py-4">No clients found</p>
        ) : (
          filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => { onSelect(c); onClose(); }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--color-canvas)] transition-colors text-left",
                c.id === currentClientId && "bg-[var(--color-accent-subtle)]",
              )}
            >
              <div className="w-6 h-6 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                {c.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-[var(--color-fg)] truncate">{c.name}</p>
                <p className="text-[10px] text-[var(--color-fg-faint)] truncate">{c.company}</p>
              </div>
              {c.id === currentClientId && <Check size={11} className="text-[var(--color-accent)] flex-shrink-0" />}
            </button>
          ))
        )}
      </div>

      {/* Footer: create new */}
      <div className="border-t border-[var(--color-border)] py-1">
        <button
          onClick={() => { onSelect(null); onClose(); }}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--color-canvas)] transition-colors text-left"
        >
          <div className="w-6 h-6 rounded-full bg-[var(--color-canvas)] border border-dashed border-[var(--color-border)] flex items-center justify-center flex-shrink-0">
            <UserPlus size={10} className="text-[var(--color-fg-faint)]" />
          </div>
          <span className="text-[12px] text-[var(--color-fg-muted)]">Keep as new client</span>
        </button>
      </div>
    </div>
  );
}

// ── Main badge ─────────────────────────────────────────────────────────────────

export interface ClientMatchBadgeProps {
  /** Set when a match was found. Null means "new client / no match". */
  matchResult?:    ClientMatchResult | null;
  /** True when the conversation was linked to a pre-existing client via matching */
  wasMatched?:     boolean;
  /** True when a brand-new client was auto-created */
  isNew?:          boolean;
  /** Current linked client (for the reassign popover) */
  currentClient?:  Client;
  /** Full client list for the reassign dropdown */
  allClients:      Client[];
  /** Called when user picks a different client (null = revert to new) */
  onReassign?:     (client: Client | null) => void;
  className?:      string;
}

export function ClientMatchBadge({
  matchResult,
  wasMatched,
  isNew,
  currentClient,
  allClients,
  onReassign,
  className,
}: ClientMatchBadgeProps) {
  const [open, setOpen] = useState(false);
  const containerRef    = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── "No match — new client" state ─────────────────────────────────────────
  if (!wasMatched && isNew) {
    return (
      <div ref={containerRef} className={cn("relative flex items-center", className)}>
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-50 border border-gray-200 text-[10px] text-gray-600">
          <UserPlus size={9} />
          <span className="font-medium">New client</span>
        </div>
        {onReassign && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="ml-1 p-1 rounded-md hover:bg-[var(--color-canvas)] text-[var(--color-fg-faint)] transition-colors"
            title="Reassign to existing client"
          >
            <ChevronDown size={10} />
          </button>
        )}
        {open && onReassign && (
          <ReassignPopover
            clients={allClients}
            currentClientId={currentClient?.id}
            onSelect={onReassign}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    );
  }

  // ── "Matched existing client" state ───────────────────────────────────────
  if (wasMatched && matchResult) {
    const tier   = matchResult.tier;
    const styles = TIER_STYLES[tier];
    const label  = getMethodLabel(matchResult.method);

    return (
      <div ref={containerRef} className={cn("relative flex items-center gap-1", className)}>
        <div className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-medium",
          styles.bg, styles.text, styles.border,
        )}>
          <UserCheck size={9} />
          <span>Matched · {matchResult.confidence}%</span>
          <span className="opacity-60">·</span>
          <span className="opacity-75">{label}</span>
        </div>
        {onReassign && (
          <button
            onClick={() => setOpen((v) => !v)}
            title="Reassign to a different client"
            className={cn(
              "flex items-center gap-0.5 px-1.5 py-1 rounded-full border text-[10px] font-medium transition-colors",
              styles.bg, styles.text, styles.border,
              "hover:opacity-80",
            )}
          >
            <Link2 size={9} />
            <ChevronDown size={8} />
          </button>
        )}
        {open && onReassign && (
          <ReassignPopover
            clients={allClients}
            currentClientId={currentClient?.id}
            onSelect={onReassign}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    );
  }

  // ── Already linked (recurring conversation, no match needed) ──────────────
  return null;
}
