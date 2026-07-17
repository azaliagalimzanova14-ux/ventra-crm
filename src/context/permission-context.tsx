"use client";

/**
 * src/context/permission-context.tsx
 *
 * PermissionProvider — Milestone 6
 *
 * Wraps WorkspaceProvider state and exposes a `can(permission)` helper
 * that components can call without importing the permission matrix directly.
 *
 * Usage:
 *   const { can, role, permissions } = usePermissions();
 *   can("members.invite")  // → boolean
 */

import { createContext, useContext, type ReactNode } from "react";
import { useWorkspace } from "@/context/workspace-context";
import { hasPermission, type Permission, type MemberRole } from "@/lib/permissions";
import type { } from "@/lib/permissions";

// ── Context type ──────────────────────────────────────────────────────────────

export interface PermissionContextValue {
  /** The caller's role in the current workspace, or null while loading. */
  role:        MemberRole | null;

  /** Flat permission map — true for granted, false for denied. */
  permissions: Record<Permission, boolean> | null;

  /**
   * Returns true if the current user has the specified permission.
   * Always returns false when workspace data is still loading.
   */
  can: (permission: Permission) => boolean;

  /** True while the workspace (and therefore role/permissions) are loading. */
  loading: boolean;
}

// ── Context ───────────────────────────────────────────────────────────────────

const PermissionContext = createContext<PermissionContextValue>({
  role:        null,
  permissions: null,
  can:         () => false,
  loading:     true,
});

// ── Provider ──────────────────────────────────────────────────────────────────

/**
 * Must be rendered inside WorkspaceProvider.
 * Derives all permission state from workspace context — no extra fetches.
 */
export function PermissionProvider({ children }: { children: ReactNode }) {
  const { role, permissions, workspaceLoading } = useWorkspace();

  function can(permission: Permission): boolean {
    if (!role) return false;
    return hasPermission(role, permission);
  }

  return (
    <PermissionContext.Provider value={{ role, permissions, can, loading: workspaceLoading }}>
      {children}
    </PermissionContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/** Consume permission state anywhere inside PermissionProvider. */
export function usePermissions(): PermissionContextValue {
  return useContext(PermissionContext);
}
