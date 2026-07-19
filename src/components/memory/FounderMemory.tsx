"use client";

/**
 * src/components/memory/FounderMemory.tsx
 *
 * Founder Memory — Sprint 4
 *
 * Lets the founder view, add, and delete persistent workspace-level context
 * entries that are injected into every AI assistant response.
 *
 * Design:
 *   - GET  /api/memory     → list entries
 *   - POST /api/memory     → create entry  { content }
 *   - DELETE /api/memory/:id → delete entry
 *   - Soft cap: 20 entries (enforced server-side; UI shows count)
 *   - All colors via CSS custom properties
 *   - useCallback on load() for react-hooks/exhaustive-deps compliance
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Brain, Plus, Trash2, RefreshCw } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MemoryEntry {
  id:          string;
  workspaceId: string;
  content:     string;
  createdAt:   string;
  updatedAt:   string;
}

const MAX_ENTRIES = 20;
const MAX_CHARS   = 500;

// ── Sub-components ────────────────────────────────────────────────────────────

function Header({
  count,
  onRefresh,
  loading,
}: {
  count:     number;
  onRefresh: () => void;
  loading:   boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Brain size={16} style={{ color: "var(--color-fg-muted)" }} />
        <div>
          <h2 className="text-base font-semibold" style={{ color: "var(--color-fg)" }}>
            Founder Memory
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-fg-muted)" }}>
            {count}/{MAX_ENTRIES} entries · injected into every AI response
          </p>
        </div>
      </div>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="p-1.5 rounded-md transition-opacity hover:opacity-70 disabled:opacity-40"
        style={{ color: "var(--color-fg-muted)" }}
        aria-label="Refresh memory"
      >
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
      </button>
    </div>
  );
}

function EntryRow({
  entry,
  onDelete,
  deleting,
}: {
  entry:    MemoryEntry;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  return (
    <div
      className="flex items-start gap-2 p-3 rounded-lg border group"
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor:     "var(--color-border)",
      }}
    >
      <p
        className="text-sm flex-1 min-w-0"
        style={{ color: "var(--color-fg)" }}
      >
        {entry.content}
      </p>
      <button
        onClick={() => onDelete(entry.id)}
        disabled={deleting}
        className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:opacity-70 disabled:opacity-30"
        style={{ color: "var(--color-fg-faint)" }}
        aria-label="Delete memory entry"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function AddEntryForm({
  onAdd,
  disabled,
}: {
  onAdd:    (content: string) => Promise<void>;
  disabled: boolean;
}) {
  const [value, setValue]   = useState("");
  const [saving, setSaving] = useState("");
  const textareaRef         = useRef<HTMLTextAreaElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || saving) return;
    setSaving("saving");
    await onAdd(trimmed);
    setValue("");
    setSaving("");
  }

  const remaining = MAX_CHARS - value.length;

  return (
    <form onSubmit={handleSubmit} className="mt-4">
      <div
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: "var(--color-border)" }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_CHARS))}
          placeholder="e.g. Company is a B2B SaaS targeting HR teams. Goal Q3: $50K MRR."
          rows={2}
          disabled={disabled || !!saving}
          className="w-full resize-none px-3 py-2 text-sm bg-transparent outline-none placeholder:text-[color:var(--color-fg-faint)]"
          style={{ color: "var(--color-fg)" }}
        />
        <div
          className="flex items-center justify-between px-3 py-1.5 border-t"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
        >
          <span className="text-xs" style={{ color: "var(--color-fg-faint)" }}>
            {remaining} chars left
          </span>
          <button
            type="submit"
            disabled={!value.trim() || !!saving || disabled}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md transition-opacity disabled:opacity-40"
            style={{
              backgroundColor: "var(--color-accent)",
              color:           "#fff",
            }}
          >
            <Plus size={11} />
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
      </div>
    </form>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function FounderMemory() {
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [entries, setEntries]     = useState<MemoryEntry[]>([]);
  const [deleting, setDeleting]   = useState<string | null>(null);
  const [addError, setAddError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/memory", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { entries: MemoryEntry[] };
      setEntries(json.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load memory");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd(content: string) {
    setAddError(null);
    try {
      const res = await fetch("/api/memory", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ content }),
      });
      if (res.status === 409) {
        setAddError(`Memory full (${MAX_ENTRIES} entries max). Delete one first.`);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { entry: MemoryEntry };
      setEntries((prev) => [json.entry, ...prev]);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/memory/${id}`, {
        method:      "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      // silent — entry stays in UI
    } finally {
      setDeleting(null);
    }
  }

  const atCap = entries.length >= MAX_ENTRIES;

  return (
    <div>
      <Header count={entries.length} onRefresh={load} loading={loading} />

      {loading && (
        <div className="animate-pulse space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-10 rounded-lg"
              style={{ backgroundColor: "var(--color-surface)" }}
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
          {error}
        </p>
      )}

      {!loading && !error && (
        <>
          {entries.length === 0 && (
            <p className="text-sm mb-3" style={{ color: "var(--color-fg-muted)" }}>
              No memory entries yet. Add facts you want the AI to always know.
            </p>
          )}

          {entries.length > 0 && (
            <div className="space-y-2 mb-2">
              {entries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  onDelete={handleDelete}
                  deleting={deleting === entry.id}
                />
              ))}
            </div>
          )}

          {addError && (
            <p className="text-xs mb-2 text-red-500">{addError}</p>
          )}

          {atCap ? (
            <p className="text-xs mt-2" style={{ color: "var(--color-fg-faint)" }}>
              Memory full ({MAX_ENTRIES}/{MAX_ENTRIES}). Delete an entry to add a new one.
            </p>
          ) : (
            <AddEntryForm onAdd={handleAdd} disabled={atCap} />
          )}
        </>
      )}
    </div>
  );
}
