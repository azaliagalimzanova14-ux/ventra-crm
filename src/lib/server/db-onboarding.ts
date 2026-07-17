/**
 * src/lib/server/db-onboarding.ts
 *
 * DB helpers for workspace onboarding progress.
 * Each workspace gets a row per step; steps are upserted (INSERT OR REPLACE).
 *
 * Server-only — do NOT import in client components.
 */

import { getDb }         from "../db";
import { randomUUID }    from "node:crypto";
import type { DbOnboardingProgress, OnboardingStep } from "./models";

// All steps in display order
export const ALL_ONBOARDING_STEPS: OnboardingStep[] = [
  "create_workspace",
  "connect_channel",
  "invite_team",
  "import_clients",
  "create_deal",
  "create_task",
];

/** Get all onboarding rows for a workspace (creates missing rows on first call). */
export function getOnboardingProgress(workspaceId: string): DbOnboardingProgress[] {
  const db = getDb();

  // Ensure all steps exist
  const existing = db
    .prepare("SELECT step FROM onboarding_progress WHERE workspace_id = ?")
    .all(workspaceId) as Array<{ step: string }>;

  const existingSteps = new Set(existing.map((r) => r.step));

  for (const step of ALL_ONBOARDING_STEPS) {
    if (!existingSteps.has(step)) {
      db.prepare(
        `INSERT INTO onboarding_progress (id, workspace_id, step, completed, completed_at)
         VALUES (?, ?, ?, 0, NULL)`,
      ).run(randomUUID(), workspaceId, step);
    }
  }

  return db
    .prepare(
      `SELECT id, workspace_id, step, completed, completed_at
       FROM onboarding_progress WHERE workspace_id = ?`,
    )
    .all(workspaceId) as unknown as DbOnboardingProgress[];
}

/** Mark a step as completed (idempotent). */
export function completeOnboardingStep(
  workspaceId: string,
  step:        OnboardingStep,
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO onboarding_progress (id, workspace_id, step, completed, completed_at)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(workspace_id, step) DO UPDATE SET
       completed    = 1,
       completed_at = excluded.completed_at`,
  ).run(randomUUID(), workspaceId, step, new Date().toISOString());
}

/** Returns true when every step is marked completed. */
export function isOnboardingComplete(workspaceId: string): boolean {
  const rows = getOnboardingProgress(workspaceId);
  return rows.length > 0 && rows.every((r) => r.completed === 1);
}

/** Completed step count out of total. */
export function onboardingStats(workspaceId: string): { completed: number; total: number } {
  const rows = getOnboardingProgress(workspaceId);
  return {
    completed: rows.filter((r) => r.completed === 1).length,
    total:     ALL_ONBOARDING_STEPS.length,
  };
}
