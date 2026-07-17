// ─── Workspace mode ───────────────────────────────────────────────────────────
//
// "demo"   — app is loaded with default mock data, safe to reset at any time
// "empty"  — user explicitly cleared all data; empty states are shown
// "custom" — user has added at least one real record

export type WorkspaceMode = "demo" | "empty" | "custom";

const MODE_KEY = "ventra_workspace_mode";

export function getWorkspaceMode(): WorkspaceMode {
  if (typeof window === "undefined") return "demo";
  return (localStorage.getItem(MODE_KEY) as WorkspaceMode) ?? "demo";
}

export function setWorkspaceMode(mode: WorkspaceMode): void {
  if (typeof window !== "undefined") localStorage.setItem(MODE_KEY, mode);
}

// ─── Data keys cleared on reset ───────────────────────────────────────────────

const CRM_KEYS = [
  "nexus_crm_clients",
  "nexus_crm_projects",
  "nexus_crm_tasks",
  "ventra_deals",
  "ventra_activity_log",
  "ventra_notifications_read",
  "ventra_notif_unread_count",
  "ventra_inbox_read",
];

/**
 * Removes all custom CRM data so the next getClients() / getDeals() / etc.
 * call falls back to the built-in defaults from mock-data.ts.
 * Sets workspace mode to "demo".
 */
export function resetToDemoData(): void {
  if (typeof window === "undefined") return;
  CRM_KEYS.forEach((k) => localStorage.removeItem(k));
  setWorkspaceMode("demo");
}

/**
 * Writes empty arrays for all CRM data keys so every page shows empty states.
 * Sets workspace mode to "empty".
 */
export function clearToEmptyData(): void {
  if (typeof window === "undefined") return;
  const emptyArr = JSON.stringify([]);
  localStorage.setItem("nexus_crm_clients",  emptyArr);
  localStorage.setItem("nexus_crm_projects", emptyArr);
  localStorage.setItem("nexus_crm_tasks",    emptyArr);
  localStorage.setItem("ventra_deals",        emptyArr);
  localStorage.removeItem("ventra_activity_log");
  localStorage.removeItem("ventra_notifications_read");
  localStorage.removeItem("ventra_notif_unread_count");
  localStorage.removeItem("ventra_inbox_read");
  setWorkspaceMode("empty");
}

/**
 * Call this whenever the user saves a new real record so the badge updates.
 * Only upgrades from demo/empty → custom; never downgrades.
 */
export function markCustomData(): void {
  const current = getWorkspaceMode();
  if (current !== "custom") setWorkspaceMode("custom");
}
