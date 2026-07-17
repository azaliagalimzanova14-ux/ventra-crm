/**
 * src/lib/db/seed.ts
 *
 * Idempotent seeder — ensures the legacy 'default' workspace has all
 * required Block 1 columns populated.
 *
 * Rules:
 *   • Never inserts data if a real workspace already exists (i.e. a user
 *     has already registered via the M2 auth flow).
 *   • Safe to call on every server startup.
 *   • The 'default' workspace is the pre-Block-1 legacy workspace used by
 *     the Telegram integration. It remains until a full data migration to
 *     real user-owned workspaces happens in a later Block.
 */

import { DatabaseSync } from "node:sqlite";

interface LegacyWorkspaceRow {
  id: string;
  slug: string | null;
  plan: string | null;
  owner_id: string | null;
  settings: string | null;
}

export function seedDefaultWorkspace(db: DatabaseSync): void {
  const row = db
    .prepare("SELECT id, slug, plan, owner_id, settings FROM workspaces WHERE id = 'default'")
    .get() as LegacyWorkspaceRow | undefined;

  if (!row) return; // 'default' workspace doesn't exist — nothing to seed

  const now = new Date().toISOString();

  // Back-fill any missing columns on the legacy workspace row.
  db.prepare(`
    UPDATE workspaces SET
      slug       = CASE WHEN (slug IS NULL OR slug = '') THEN $slug ELSE slug END,
      plan       = CASE WHEN (plan IS NULL OR plan = '') THEN $plan ELSE plan END,
      settings   = CASE WHEN (settings IS NULL OR settings = '') THEN $settings ELSE settings END,
      updated_at = $now
    WHERE id = 'default'
  `).run({
    $slug:     "default",
    $plan:     "free",
    $settings: "{}",
    $now:      now,
  });
}
