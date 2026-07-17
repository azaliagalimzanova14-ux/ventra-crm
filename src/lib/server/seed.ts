/**
 * src/lib/server/seed.ts
 *
 * Seeds the database with a default workspace only when the DB is empty
 * (i.e., no workspaces with a non-null owner_id exist yet).
 *
 * This runs automatically after migrations on every server start.
 * It is fully idempotent: if seed data already exists, nothing changes.
 *
 * The seed does NOT create a default user — auth (M2) handles user creation.
 * It only ensures a well-formed 'default' workspace row exists so that the
 * existing Telegram integration (which hard-codes workspace_id = 'default')
 * continues to work until M3 wires up real workspace selection.
 */

import type { DatabaseSync } from "node:sqlite";

export function seedDefaultWorkspace(db: DatabaseSync): void {
  // Check if 'default' workspace already has the Block 1 columns populated
  const existing = db
    .prepare("SELECT id, slug FROM workspaces WHERE id = 'default' LIMIT 1")
    .get() as { id: string; slug: string | null } | undefined;

  if (!existing) {
    // The 'default' workspace was not created by the Telegram migrations.
    // This should not happen in practice (the Telegram migration seeds it),
    // but we guard anyway.
    db.prepare(`
      INSERT OR IGNORE INTO workspaces (id, name, slug, plan, created_at, updated_at)
      VALUES ('default', 'Default Workspace', 'default', 'free',
              strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
              strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    `).run();
    return;
  }

  // Backfill slug if the migration hasn't run yet (defensive)
  if (!existing.slug) {
    db.prepare(`
      UPDATE workspaces
      SET slug = 'default', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = 'default'
    `).run();
  }
}
