"use client";

import { useState, useMemo } from "react";
import {
  X, Users, CheckSquare, TrendingUp, Bell, Check, Trash2,
  ChevronDown, ChevronUp, Sparkles, CircleCheck, CircleX, Edit3,
} from "lucide-react";
import type {
  AISuggestion, SuggestionType,
  ClientSuggestion, TaskSuggestion, DealSuggestion, FollowupSuggestion,
} from "@/lib/ai-suggestions";
import { cn } from "@/lib/utils";

// ── Props ──────────────────────────────────────────────────────────────────────

export interface SuggestionsPanelProps {
  suggestions:    AISuggestion[];
  open:           boolean;
  onClose:        () => void;
  onAccept:       (id: string, editedData?: Partial<AISuggestion>) => void;
  onReject:       (id: string) => void;
  onBulkAccept:   (filter?: SuggestionType) => void;
  onBulkReject:   (filter?: SuggestionType) => void;
}

// ── Confidence pill ────────────────────────────────────────────────────────────

function ConfidencePill({ score }: { score: number }) {
  const { bg, color, label } =
    score >= 90 ? { bg: "bg-green-100",  color: "text-green-700",  label: "High" }
  : score >= 75 ? { bg: "bg-blue-100",   color: "text-blue-700",   label: "Good" }
  : score >= 60 ? { bg: "bg-amber-100",  color: "text-amber-700",  label: "Fair" }
  :               { bg: "bg-gray-100",   color: "text-gray-600",   label: "Low"  };

  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full", bg, color)}>
      <Sparkles size={8} />
      {score}% {label}
    </span>
  );
}

// ── Type badge + icon ──────────────────────────────────────────────────────────

const TYPE_META: Record<SuggestionType, { label: string; Icon: React.FC<{ size?: number; className?: string }> ; bg: string; color: string }> = {
  client:   { label: "Client",     Icon: Users,       bg: "bg-blue-50",   color: "text-blue-600"   },
  task:     { label: "Task",       Icon: CheckSquare, bg: "bg-violet-50", color: "text-violet-600" },
  deal:     { label: "Deal",       Icon: TrendingUp,  bg: "bg-green-50",  color: "text-green-700"  },
  followup: { label: "Follow-up",  Icon: Bell,        bg: "bg-amber-50",  color: "text-amber-600"  },
};

function TypeBadge({ type }: { type: SuggestionType }) {
  const m = TYPE_META[type];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full", m.bg, m.color)}>
      <m.Icon size={8} />
      {m.label}
    </span>
  );
}

// ── Edit forms (per type) ──────────────────────────────────────────────────────

function ClientEditForm({
  s, onChange,
}: {
  s: ClientSuggestion;
  onChange: (fields: Partial<ClientSuggestion>) => void;
}) {
  return (
    <div className="flex flex-col gap-2 mt-3">
      <input
        className="w-full text-[12px] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 bg-[var(--color-canvas)] text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        placeholder="Name" value={s.name} onChange={(e) => onChange({ name: e.target.value })}
      />
      <input
        className="w-full text-[12px] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 bg-[var(--color-canvas)] text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        placeholder="Company (optional)" value={s.company ?? ""} onChange={(e) => onChange({ company: e.target.value })}
      />
      <input
        className="w-full text-[12px] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 bg-[var(--color-canvas)] text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        placeholder="Industry (optional)" value={s.industry ?? ""} onChange={(e) => onChange({ industry: e.target.value })}
      />
    </div>
  );
}

function TaskEditForm({
  s, onChange,
}: {
  s: TaskSuggestion;
  onChange: (fields: Partial<TaskSuggestion>) => void;
}) {
  return (
    <div className="flex flex-col gap-2 mt-3">
      <input
        className="w-full text-[12px] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 bg-[var(--color-canvas)] text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        placeholder="Task title" value={s.title} onChange={(e) => onChange({ title: e.target.value })}
      />
      <textarea
        className="w-full text-[12px] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 bg-[var(--color-canvas)] text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] resize-none"
        rows={2} placeholder="Description" value={s.description}
        onChange={(e) => onChange({ description: e.target.value })}
      />
      <input
        type="date"
        className="w-full text-[12px] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 bg-[var(--color-canvas)] text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        value={s.dueDate ? s.dueDate.slice(0, 10) : ""}
        onChange={(e) => onChange({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
      />
    </div>
  );
}

function DealEditForm({
  s, onChange,
}: {
  s: DealSuggestion;
  onChange: (fields: Partial<DealSuggestion>) => void;
}) {
  return (
    <div className="flex flex-col gap-2 mt-3">
      <input
        className="w-full text-[12px] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 bg-[var(--color-canvas)] text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        placeholder="Deal title" value={s.title} onChange={(e) => onChange({ title: e.target.value })}
      />
      <input
        type="number"
        className="w-full text-[12px] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 bg-[var(--color-canvas)] text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        placeholder="Value (USD)" value={s.value ?? ""}
        onChange={(e) => onChange({ value: e.target.value ? Number(e.target.value) : undefined })}
      />
      <select
        className="w-full text-[12px] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 bg-[var(--color-canvas)] text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        value={s.stage} onChange={(e) => onChange({ stage: e.target.value as DealSuggestion["stage"] })}
      >
        <option value="lead">Lead</option>
        <option value="qualified">Qualified</option>
        <option value="proposal">Proposal</option>
      </select>
    </div>
  );
}

function FollowupEditForm({
  s, onChange,
}: {
  s: FollowupSuggestion;
  onChange: (fields: Partial<FollowupSuggestion>) => void;
}) {
  return (
    <div className="flex flex-col gap-2 mt-3">
      <input
        className="w-full text-[12px] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 bg-[var(--color-canvas)] text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        placeholder="Follow-up title" value={s.title} onChange={(e) => onChange({ title: e.target.value })}
      />
      <input
        type="date"
        className="w-full text-[12px] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 bg-[var(--color-canvas)] text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        value={s.dueDate ? s.dueDate.slice(0, 10) : ""}
        onChange={(e) => onChange({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
      />
    </div>
  );
}

// ── Suggestion card ────────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion,
  onAccept,
  onReject,
}: {
  suggestion: AISuggestion;
  onAccept: (id: string, editedData?: Partial<AISuggestion>) => void;
  onReject: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing,  setEditing]  = useState(false);
  const [draft,    setDraft]    = useState<AISuggestion>(suggestion);

  const isPending  = suggestion.status === "pending";
  const isAccepted = suggestion.status === "accepted";
  const isRejected = suggestion.status === "rejected";

  const m = TYPE_META[suggestion.type];

  function handleAccept() {
    onAccept(suggestion.id, editing ? draft : undefined);
    setEditing(false);
  }

  function handleEdit() {
    setDraft(suggestion);
    setEditing(true);
    setExpanded(true);
  }

  function patchDraft(fields: Partial<AISuggestion>) {
    // Spread merges partial edit data; cast to AISuggestion is safe since
    // the discriminant `type` is never changed by any edit form.
    setDraft((prev) => ({ ...prev, ...fields } as AISuggestion));
  }

  const primaryLabel = (() => {
    switch (draft.type) {
      case "client":  return draft.name;
      case "task":    return draft.title;
      case "deal":    return draft.title;
      case "followup":return draft.title;
    }
  })();

  const secondaryLabel = (() => {
    switch (draft.type) {
      case "client":  return draft.company ?? draft.notes ?? "";
      case "task":    return draft.clientName ? `for ${draft.clientName}` : "";
      case "deal":    return draft.value ? `$${(draft.value / 1000).toFixed(0)}K · ${draft.stage}` : draft.stage;
      case "followup":return draft.clientName ? `with ${draft.clientName}` : "";
    }
  })();

  return (
    <div className={cn(
      "rounded-xl border transition-colors",
      isPending  ? "border-[var(--color-border)] bg-[var(--color-surface)]" : "",
      isAccepted ? "border-green-200 bg-green-50/60" : "",
      isRejected ? "border-[var(--color-border)] bg-[var(--color-canvas)] opacity-50" : "",
    )}>
      {/* Header row */}
      <div className="flex items-start gap-2.5 p-3">
        <div className={cn("flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5", m.bg)}>
          <m.Icon size={14} className={m.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <TypeBadge type={suggestion.type} />
            <ConfidencePill score={suggestion.confidence} />
            {isAccepted && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                <CircleCheck size={8} /> Accepted
              </span>
            )}
            {isRejected && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                <CircleX size={8} /> Rejected
              </span>
            )}
          </div>
          <p className="text-[13px] font-semibold text-[var(--color-fg)] leading-tight truncate">{primaryLabel}</p>
          {secondaryLabel && (
            <p className="text-[11px] text-[var(--color-fg-muted)] mt-0.5">{secondaryLabel}</p>
          )}
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-shrink-0 p-1 rounded-md hover:bg-[var(--color-canvas)] text-[var(--color-fg-faint)] transition-colors"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-[var(--color-border)]">
          {/* Source text */}
          <div className="mt-2.5 mb-2 p-2 rounded-lg bg-[var(--color-canvas)] border border-[var(--color-border)]">
            <p className="text-[10px] text-[var(--color-fg-faint)] mb-1 uppercase tracking-wide font-semibold">Detected from</p>
            <p className="text-[11px] text-[var(--color-fg-muted)] leading-relaxed italic">&ldquo;{suggestion.sourceText}&rdquo;</p>
          </div>

          {/* Reasons */}
          <div className="flex flex-wrap gap-1 mb-2.5">
            {suggestion.reasons.map((r) => (
              <span key={r} className="text-[10px] bg-[var(--color-canvas)] border border-[var(--color-border)] text-[var(--color-fg-muted)] px-1.5 py-0.5 rounded-full">
                {r}
              </span>
            ))}
          </div>

          {/* Edit form */}
          {editing && (
            <>
              {draft.type === "client"  && <ClientEditForm  s={draft} onChange={(f) => patchDraft(f)} />}
              {draft.type === "task"    && <TaskEditForm    s={draft} onChange={(f) => patchDraft(f)} />}
              {draft.type === "deal"    && <DealEditForm    s={draft} onChange={(f) => patchDraft(f)} />}
              {draft.type === "followup"&& <FollowupEditForm s={draft} onChange={(f) => patchDraft(f)} />}
            </>
          )}

          {/* Action buttons */}
          {isPending && (
            <div className="flex items-center gap-1.5 mt-3">
              <button
                onClick={handleAccept}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[11px] font-semibold transition-colors flex-1 justify-center"
              >
                <Check size={11} />
                {editing ? "Save & Accept" : "Accept"}
              </button>
              {!editing && (
                <button
                  onClick={handleEdit}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-canvas)] text-[var(--color-fg-muted)] text-[11px] font-medium transition-colors"
                >
                  <Edit3 size={11} /> Edit
                </button>
              )}
              {editing && (
                <button
                  onClick={() => setEditing(false)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-canvas)] text-[var(--color-fg-muted)] text-[11px] font-medium transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={() => onReject(suggestion.id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-canvas)] text-[var(--color-fg-muted)] text-[11px] font-medium transition-colors"
              >
                <Trash2 size={11} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Collapsed action strip (pending only) */}
      {!expanded && isPending && (
        <div className="flex border-t border-[var(--color-border)]">
          <button
            onClick={() => onAccept(suggestion.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)] transition-colors rounded-bl-xl"
          >
            <Check size={11} /> Accept
          </button>
          <div className="w-px bg-[var(--color-border)]" />
          <button
            onClick={handleEdit}
            className="flex items-center justify-center gap-1.5 px-4 py-2 text-[11px] font-medium text-[var(--color-fg-muted)] hover:bg-[var(--color-canvas)] transition-colors"
          >
            <Edit3 size={11} />
          </button>
          <div className="w-px bg-[var(--color-border)]" />
          <button
            onClick={() => onReject(suggestion.id)}
            className="flex items-center justify-center gap-1.5 px-4 py-2 text-[11px] font-medium text-[var(--color-fg-muted)] hover:bg-[var(--color-canvas)] transition-colors rounded-br-xl"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Filter tab ─────────────────────────────────────────────────────────────────

type FilterTab = "all" | SuggestionType;

const TABS: { id: FilterTab; label: string }[] = [
  { id: "all",      label: "All"        },
  { id: "client",   label: "Clients"    },
  { id: "task",     label: "Tasks"      },
  { id: "deal",     label: "Deals"      },
  { id: "followup", label: "Follow-ups" },
];

// ── Panel ──────────────────────────────────────────────────────────────────────

export function SuggestionsPanel({
  suggestions,
  open,
  onClose,
  onAccept,
  onReject,
  onBulkAccept,
  onBulkReject,
}: SuggestionsPanelProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const filtered = useMemo(() => {
    if (activeTab === "all") return suggestions;
    return suggestions.filter((s) => s.type === activeTab);
  }, [suggestions, activeTab]);

  const pending  = suggestions.filter((s) => s.status === "pending").length;
  const accepted = suggestions.filter((s) => s.status === "accepted").length;
  const rejected = suggestions.filter((s) => s.status === "rejected").length;

  const pendingInTab = filtered.filter((s) => s.status === "pending").length;

  const tabCount = (id: FilterTab) => {
    const src = id === "all" ? suggestions : suggestions.filter((s) => s.type === id);
    return src.filter((s) => s.status === "pending").length;
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[99] bg-black/20 backdrop-blur-[1px]"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div className={cn(
        "fixed top-[73px] right-0 bottom-0 z-[100] w-[400px] flex flex-col",
        "bg-[var(--color-surface)] border-l border-[var(--color-border)]",
        "shadow-2xl transition-transform duration-300 ease-in-out",
        open ? "translate-x-0" : "translate-x-full",
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[var(--color-accent-subtle)] flex items-center justify-center">
              <Sparkles size={14} className="text-[var(--color-accent)]" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-[var(--color-fg)]">AI Suggestions</p>
              <p className="text-[10px] text-[var(--color-fg-faint)]">{pending} pending review</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--color-canvas)] text-[var(--color-fg-faint)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-0.5 px-3 py-2 border-b border-[var(--color-border)] flex-shrink-0 overflow-x-auto">
          {TABS.map((tab) => {
            const count = tabCount(tab.id);
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors",
                  activeTab === tab.id
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-fg-muted)] hover:bg-[var(--color-canvas)]",
                )}
              >
                {tab.label}
                {count > 0 && (
                  <span className={cn(
                    "text-[9px] font-bold px-1 py-0 rounded-full min-w-[14px] text-center",
                    activeTab === tab.id ? "bg-white/25 text-white" : "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]",
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Bulk actions */}
        {pendingInTab > 1 && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-canvas)] flex-shrink-0">
            <span className="text-[11px] text-[var(--color-fg-muted)] flex-1">{pendingInTab} pending</span>
            <button
              onClick={() => onBulkAccept(activeTab === "all" ? undefined : activeTab)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white transition-colors"
            >
              <Check size={10} /> Accept all
            </button>
            <button
              onClick={() => onBulkReject(activeTab === "all" ? undefined : activeTab)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-canvas)] text-[var(--color-fg-muted)] transition-colors"
            >
              <Trash2 size={10} /> Reject all
            </button>
          </div>
        )}

        {/* Suggestion list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-[var(--color-canvas)] flex items-center justify-center">
                <Sparkles size={20} className="text-[var(--color-fg-faint)]" />
              </div>
              <p className="text-[13px] font-medium text-[var(--color-fg-muted)]">No suggestions here</p>
              <p className="text-[11px] text-[var(--color-fg-faint)] max-w-[220px]">
                Suggestions appear as you receive messages in the Inbox.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-3">
              {filtered.map((s) => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  onAccept={onAccept}
                  onReject={onReject}
                />
              ))}
            </div>
          )}
        </div>

        {/* Stats footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--color-border)] bg-[var(--color-canvas)] flex-shrink-0">
          <span className="text-[11px] text-[var(--color-fg-faint)]">
            <span className="text-green-600 font-semibold">{accepted} accepted</span>
            {" · "}
            <span className="text-[var(--color-fg-muted)] font-semibold">{rejected} rejected</span>
            {" · "}
            <span className="font-semibold">{pending} pending</span>
          </span>
          <button onClick={onClose} className="text-[11px] text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] transition-colors">
            Close
          </button>
        </div>
      </div>
    </>
  );
}
