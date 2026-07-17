"use client";

/**
 * src/components/auth/require-permission.tsx
 *
 * RequirePermission — declarative permission guard for React UI.
 *
 * Usage (hide mode — default):
 *   <RequirePermission permission="members.invite">
 *     <InviteButton />
 *   </RequirePermission>
 *
 * Usage (disable mode):
 *   <RequirePermission permission="workspace.manage" mode="disable">
 *     <SaveButton />
 *   </RequirePermission>
 *
 * Usage (fallback):
 *   <RequirePermission permission="analytics.view" fallback={<UpgradeBanner />}>
 *     <AnalyticsDashboard />
 *   </RequirePermission>
 */

import type { ReactNode } from "react";
import { usePermissions } from "@/context/permission-context";
import type { Permission } from "@/lib/permissions";

interface RequirePermissionProps {
  /** The permission that must be granted. */
  permission: Permission;

  /**
   * How to handle the missing-permission case.
   * - "hide"    — render nothing (or fallback). Default.
   * - "disable" — render children wrapped in a disabled overlay.
   */
  mode?: "hide" | "disable";

  /**
   * Content to render when permission is denied (only used in "hide" mode).
   * Defaults to null.
   */
  fallback?: ReactNode;

  children: ReactNode;
}

export function RequirePermission({
  permission,
  mode     = "hide",
  fallback = null,
  children,
}: RequirePermissionProps) {
  const { can, loading } = usePermissions();

  // While loading, show nothing to avoid flashes of protected content
  if (loading) return null;

  if (can(permission)) {
    return <>{children}</>;
  }

  if (mode === "disable") {
    return (
      <div
        aria-disabled="true"
        className="pointer-events-none select-none opacity-40 cursor-not-allowed"
        title="You don't have permission to perform this action"
      >
        {children}
      </div>
    );
  }

  // mode === "hide"
  return <>{fallback}</>;
}
