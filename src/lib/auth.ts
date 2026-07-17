/**
 * src/lib/auth.ts — DEPRECATED
 *
 * This file previously contained a localStorage-based authentication system
 * with plaintext password storage. It has been replaced by:
 *
 *   - src/lib/server/auth-helpers.ts  — password hashing, cookie helpers, requireAuth()
 *   - src/lib/server/db-sessions.ts   — session CRUD against SQLite
 *   - src/app/api/auth/               — register, login, logout, me API routes
 *   - src/context/auth-context.tsx    — SessionProvider + useAuth() hook
 *   - src/middleware.ts               — edge-level route protection
 *
 * Do not add new code here.
 */

// No exports — all consumers have been updated.
export {};
