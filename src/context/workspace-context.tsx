"use client";

/**
 * src/context/workspace-context.tsx
 *
 * Workspace Provider — Milestone 3
 *
 * Exposes:
 *   currentWorkspace   — full workspace record from DB
 *   workspaceId        — shorthand string id
 *   role               — caller's role in the current workspace
 *   permissions        — flat Record<Permission, boolean>
 *   workspaces         — list of all user's workspaces (for switcher)
 *   switchWorkspace()  — switch to a different workspace (persisted in session)
 *   refreshWorkspace() — re-fetch current workspace data from server
 *
 * Backward-compat (used by sidebar + settings):
 *   mode     — "demo" | "empty" | "custom" (localStorage CRM data mode)
 *   loadDemo — reset to demo data
 *   clearAll — clear all local CRM data
 *   setMode  — explicitly set mode
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getWorkspaceMode,
  resetToDemoData,
  clearToEmptyData,
  setWorkspaceMode,
  type WorkspaceMode,
} from "@/lib/workspace";
import {
  getPermissions,
  type Permission,
  type MemberRole,
} from "@/lib/permissions";

// ── API response shapes ───────────────────────────────────────────────────────

export interface WorkspaceSettings {
  accentColor?:  string;
  iconStyle?:    string;
  widgetLayout?: string[];
  locale?:       string;
  timezone?:     string;
  currency?:     string;
}

export interface WorkspaceRecord {
  id:       string;
  name:     string;
  slug:     string;
  plan:     string;
  logoUrl:  string | null;
  settings: WorkspaceSettings;
}

export interface WorkspaceMemberRecord {
  id:     string;
  role:   string;
  status: string;
}

export interface WorkspaceListItem extends WorkspaceRecord {
  role:      string | null;
  isCurrent: boolean;
}

// ── Context type ──────────────────────────────────────────────────────────────

interface WorkspaceContextValue {
  // ── Real workspace (DB) ──
  currentWorkspace:  WorkspaceRecord | null;
  workspaceId:       string | null;
  role:              MemberRole | null;
  permissions:       Record<Permission, boolean> | null;
  workspaces:        WorkspaceListItem[];
  workspaceLoading:  boolean;

  /** Switch session to a different workspace. Re-fetches workspace state. */
  switchWorkspace:  (workspaceId: string) => Promise<void>;
  /** Re-fetch current workspace + list from server. */
  refreshWorkspace: () => Promise<void>;

  // ── Legacy localStorage CRM data mode (backward compat) ──
  mode:     WorkspaceMode;
  loadDemo: () => void;
  clearAll: () => void;
  setMode:  (m: WorkspaceMode) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const WorkspaceContext = createContext<WorkspaceContextValue>({
  currentWorkspace: null,
  workspaceId:      null,
  role:             null,
  permissions:      null,
  workspaces:       [],
  workspaceLoading: true,
  switchWorkspace:  async () => {},
  refreshWorkspace: async () => {},
  mode:     "demo",
  loadDemo: () => {},
  clearAll: () => {},
  setMode:  () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  // Real workspace state
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceRecord | null>(null);
  const [role,             setRole]             = useState<MemberRole | null>(null);
  const [workspaces,       setWorkspaces]       = useState<WorkspaceListItem[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);

  // Legacy localStorage demo mode
  const [mode, setModeState] = useState<WorkspaceMode>("demo");

  useEffect(() => {
    setModeState(getWorkspaceMode());
  }, []);

  // ── Fetch helpers ───────────────────────────────────────────────────────────

  const fetchCurrent = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/workspaces/current", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json() as {
        workspace:  WorkspaceRecord;
        role:       MemberRole;
      };
      setCurrentWorkspace(data.workspace);
      setRole(data.role);
    } catch {
      // silent — workspace stays null until auth is ready
    }
  }, []);

  const fetchList = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/workspaces", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json() as { workspaces: WorkspaceListItem[] };
      setWorkspaces(data.workspaces);
    } catch {
      // silent
    }
  }, []);

  const refreshWorkspace = useCallback(async (): Promise<void> => {
    await Promise.all([fetchCurrent(), fetchList()]);
  }, [fetchCurrent, fetchList]);

  // Hydrate on mount
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshWorkspace();
      if (!cancelled) setWorkspaceLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshWorkspace]);

  // ── Switch workspace ────────────────────────────────────────────────────────

  const switchWorkspace = useCallback(async (targetId: string): Promise<void> => {
    try {
      const res = await fetch("/api/workspaces/switch", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({ workspaceId: targetId }),
      });
      if (!res.ok) return;

      const data = await res.json() as {
        workspace:  WorkspaceRecord;
        role:       MemberRole;
      };

      setCurrentWorkspace(data.workspace);
      setRole(data.role);

      // Refresh the list so isCurrent flags update
      await fetchList();
    } catch {
      // silent — caller can show a toast if needed
    }
  }, [fetchList]);

  // ── Legacy compat ───────────────────────────────────────────────────────────

  const loadDemo = useCallback(() => {
    resetToDemoData();
    setModeState("demo");
  }, []);

  const clearAll = useCallback(() => {
    clearToEmptyData();
    setModeState("empty");
  }, []);

  const setMode = useCallback((m: WorkspaceMode) => {
    setWorkspaceMode(m);
    setModeState(m);
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const permissions = role ? getPermissions(role) : null;
  const workspaceId = currentWorkspace?.id ?? null;

  return (
    <WorkspaceContext.Provider
      value={{
        currentWorkspace,
        workspaceId,
        role,
        permissions,
        workspaces,
        workspaceLoading,
        switchWorkspace,
        refreshWorkspace,
        mode,
        loadDemo,
        clearAll,
        setMode,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWorkspace(): WorkspaceContextValue {
  return useContext(WorkspaceContext);
}
