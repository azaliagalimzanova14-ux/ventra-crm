"use client";

/**
 * WorkspaceSwitcher
 *
 * Dropdown in the sidebar for:
 *   - Viewing current workspace name + plan
 *   - Switching to another workspace
 *   - Creating a new workspace
 */

import { useState, useRef, useEffect } from "react";
import {
  ChevronDown, Plus, Check, Building2, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace, type WorkspaceListItem } from "@/context/workspace-context";

// ── Plan badge color ──────────────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: string }) {
  const map: Record<string, string> = {
    free:       "text-[var(--color-fg-faint)]",
    pro:        "text-[var(--color-accent)]",
    enterprise: "text-emerald-600",
  };
  return (
    <span className={cn("text-[10px] font-semibold capitalize", map[plan] ?? map.free)}>
      {plan} plan
    </span>
  );
}

// ── Avatar for a workspace (initials or logo) ─────────────────────────────────

function WorkspaceAvatar({ name, logoUrl, size = "sm" }: {
  name:    string;
  logoUrl: string | null;
  size?:   "sm" | "md";
}) {
  const dim = size === "sm" ? "w-6 h-6 text-[10px]" : "w-7 h-7 text-[11px]";
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        className={cn(dim, "rounded-md object-cover flex-shrink-0")}
      />
    );
  }
  return (
    <div className={cn(
      dim,
      "rounded-md bg-amber-100 border border-amber-200 flex items-center justify-center font-bold text-amber-700 flex-shrink-0",
    )}>
      {(name[0] ?? "W").toUpperCase()}
    </div>
  );
}

// ── Create workspace mini-form ────────────────────────────────────────────────

function CreateWorkspaceForm({ onCreated, onCancel }: {
  onCreated: (workspaceId: string) => void;
  onCancel:  () => void;
}) {
  const [name,    setName]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) { setError("Name is required"); return; }
    if (trimmed.length < 2) { setError("At least 2 characters"); return; }
    setLoading(true);
    setError("");
    try {
      const res  = await fetch("/api/workspaces", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({ name: trimmed }),
      });
      const data = await res.json() as { workspace?: { id: string }; error?: string };
      if (!res.ok || !data.workspace) {
        setError(data.error ?? "Failed to create workspace");
      } else {
        onCreated(data.workspace.id);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-t border-[var(--color-border-subtle)] px-2 py-2 space-y-2">
      <p className="text-[10px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider px-1">
        New workspace
      </p>
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => { setName(e.target.value); setError(""); }}
        onKeyDown={(e) => { if (e.key === "Enter") { void handleCreate(); } if (e.key === "Escape") onCancel(); }}
        placeholder="Workspace name"
        className="w-full bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-placeholder)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
      />
      {error && (
        <p className="text-[10px] text-red-500 px-1">{error}</p>
      )}
      <div className="flex gap-1.5">
        <button
          onClick={onCancel}
          className="flex-1 py-1.5 rounded-lg text-[11px] font-medium text-[var(--color-fg-muted)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => { void handleCreate(); }}
          disabled={loading}
          className="flex-1 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
        >
          {loading ? <Loader2 size={10} className="animate-spin" /> : null}
          Create
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function WorkspaceSwitcher() {
  const {
    currentWorkspace,
    workspaces,
    workspaceLoading,
    switchWorkspace,
  } = useWorkspace();

  const [open,      setOpen]      = useState(false);
  const [creating,  setCreating]  = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleSwitch(ws: WorkspaceListItem) {
    if (ws.isCurrent || switching) return;
    setSwitching(ws.id);
    await switchWorkspace(ws.id);
    setSwitching(null);
    setOpen(false);
  }

  async function handleCreated(newId: string) {
    setSwitching(newId);
    await switchWorkspace(newId);
    setSwitching(null);
    setOpen(false);
    setCreating(false);
  }

  const displayName = currentWorkspace?.name ?? "Workspace";
  const displayPlan = currentWorkspace?.plan ?? "free";
  const displayLogo = currentWorkspace?.logoUrl ?? null;

  return (
    <div className="relative px-3 py-2.5 border-b border-[var(--color-border-subtle)]" ref={dropRef}>
      {/* Trigger */}
      <button
        onClick={() => { setOpen((o) => !o); setCreating(false); }}
        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-[var(--color-canvas)] group transition-colors"
      >
        <WorkspaceAvatar name={displayName} logoUrl={displayLogo} size="md" />
        <div className="flex flex-col items-start min-w-0 flex-1">
          <span className="text-[13px] font-medium text-[var(--color-fg)] truncate max-w-full">
            {workspaceLoading ? "Loading…" : displayName}
          </span>
          <PlanBadge plan={displayPlan} />
        </div>
        {workspaceLoading ? (
          <Loader2 size={13} className="ml-auto text-[var(--color-fg-faint)] animate-spin flex-shrink-0" />
        ) : (
          <ChevronDown
            size={13}
            className={cn(
              "ml-auto text-[var(--color-fg-faint)] group-hover:text-[var(--color-fg-muted)] transition-transform flex-shrink-0",
              open && "rotate-180",
            )}
          />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg z-50 overflow-hidden">

          {/* Workspace list */}
          <div className="max-h-48 overflow-y-auto py-1">
            {workspaces.length === 0 && !workspaceLoading && (
              <p className="text-[11px] text-[var(--color-fg-faint)] px-3 py-2">
                No workspaces found
              </p>
            )}
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => { void handleSwitch(ws); }}
                disabled={switching === ws.id}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                  ws.isCurrent
                    ? "bg-[var(--color-accent-subtle)]"
                    : "hover:bg-[var(--color-canvas)] cursor-pointer",
                )}
              >
                <WorkspaceAvatar name={ws.name} logoUrl={ws.logoUrl} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-[12px] font-medium truncate",
                    ws.isCurrent ? "text-[var(--color-accent)]" : "text-[var(--color-fg)]",
                  )}>
                    {ws.name}
                  </p>
                  <p className="text-[10px] text-[var(--color-fg-faint)] capitalize">{ws.role}</p>
                </div>
                {ws.isCurrent && <Check size={12} className="text-[var(--color-accent)] flex-shrink-0" />}
                {switching === ws.id && <Loader2 size={12} className="text-[var(--color-fg-faint)] animate-spin flex-shrink-0" />}
              </button>
            ))}
          </div>

          {/* Create workspace */}
          {!creating ? (
            <div className="border-t border-[var(--color-border-subtle)]">
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] transition-colors"
              >
                <Building2 size={12} className="text-[var(--color-fg-faint)]" />
                <Plus size={10} className="text-[var(--color-fg-faint)] -ml-1" />
                Create workspace
              </button>
            </div>
          ) : (
            <CreateWorkspaceForm
              onCreated={(id) => { void handleCreated(id); }}
              onCancel={() => setCreating(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
