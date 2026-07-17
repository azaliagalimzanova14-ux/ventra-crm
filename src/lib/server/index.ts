/**
 * src/lib/server/index.ts
 *
 * Barrel export for the server-only database layer.
 * Import from "@/lib/server" in API routes and server components.
 *
 * ⚠ SERVER-ONLY: Do not import this file from client components.
 *   All exports here run in Node.js (via node:sqlite) and will break
 *   if bundled for the browser.
 */

export * from "./models";
export * from "./db-users";
export * from "./db-workspace";
export * from "./db-invitations";
export * from "./db-activity";
export * from "./db-notifications";
export * from "./db-sessions";
export { getAppliedMigrations } from "./migrations";
// auth-helpers is intentionally NOT re-exported here because it uses async
// scrypt which pulls in node:util/node:crypto — import it directly where needed.
