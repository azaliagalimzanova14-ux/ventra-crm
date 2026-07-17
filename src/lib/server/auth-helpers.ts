/**
 * src/lib/server/auth-helpers.ts
 *
 * Server-only authentication utilities.
 *   - Password hashing / verification via node:crypto scrypt
 *   - Session cookie construction
 *   - requireAuth() — validates session and returns caller context
 *
 * ⚠ SERVER-ONLY: Never import from client components.
 *
 * Password format stored in DB:
 *   "<16-byte salt hex>:<64-byte scrypt-derived key hex>"
 *
 * scrypt parameters (N=16384, r=8, p=1) provide ~100ms derivation on
 * modern hardware — comparable security to bcrypt rounds=12.
 */

import { scrypt, randomBytes, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { getSessionByToken } from "./db-sessions";
import { getUserById } from "./db-users";
import { getMemberByUserId } from "./db-workspace";
import type { DbUser, DbSession, DbWorkspaceMember, MemberRole } from "./models";
import { hasPermission, type Permission } from "@/lib/permissions";

// ── Password hashing ──────────────────────────────────────────────────────────

const SCRYPT_N      = 16384; // CPU/memory cost
const SCRYPT_R      = 8;     // block size
const SCRYPT_P      = 1;     // parallelism
const KEY_LEN       = 64;    // output key length in bytes

const SCRYPT_OPTS: ScryptOptions = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P };

/** Promisified scrypt with options support (promisify loses the options overload). */
function scryptDeriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LEN, SCRYPT_OPTS, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/**
 * Hashes a plaintext password.
 * Returns a string in the format "<salt_hex>:<hash_hex>" suitable for DB storage.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt    = randomBytes(16).toString("hex");
  const derived = await scryptDeriveKey(password, salt);
  return `${salt}:${derived.toString("hex")}`;
}

/**
 * Verifies a plaintext password against a stored hash.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export async function verifyPassword(
  password:   string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;

  const [salt, hash] = parts as [string, string];
  try {
    const derived   = await scryptDeriveKey(password, salt);
    const storedBuf = Buffer.from(hash, "hex");
    if (derived.length !== storedBuf.length) return false;
    return timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

export const COOKIE_NAME    = "ventra_session";
export const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

/**
 * Returns the Set-Cookie header value for a valid session.
 */
export function makeSessionCookie(token: string): string {
  const isProduction = process.env.NODE_ENV === "production";
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${COOKIE_MAX_AGE}`,
  ];
  if (isProduction) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Returns a Set-Cookie header value that clears the session cookie.
 */
export function makeClearCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/**
 * Extracts the session token from a Cookie header string.
 */
export function getTokenFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const re    = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`);
  const match = re.exec(cookieHeader);
  return match?.[1] ?? null;
}

// ── Session validation ────────────────────────────────────────────────────────

export interface AuthContext {
  session:    DbSession;
  user:       DbUser;
  membership: DbWorkspaceMember;
  userId:     string;
  workspaceId: string;
  role:       MemberRole;
}

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Validates the session token from the Cookie header and returns full context.
 * Throws AuthError(401) if the token is missing or expired.
 * Throws AuthError(403) if the user is not an active member of the workspace.
 */
export async function requireAuth(request: Request): Promise<AuthContext> {
  const cookieHeader = request.headers.get("cookie");
  const token        = getTokenFromCookieHeader(cookieHeader);

  if (!token) {
    throw new AuthError(401, "Not authenticated");
  }

  const session = getSessionByToken(token);
  if (!session) {
    throw new AuthError(401, "Session expired or invalid");
  }

  const user = getUserById(session.user_id);
  if (!user) {
    throw new AuthError(401, "User not found");
  }

  if (!session.workspace_id) {
    throw new AuthError(401, "No workspace selected");
  }

  const membership = getMemberByUserId(session.workspace_id, session.user_id);
  if (!membership || membership.status !== "active") {
    throw new AuthError(403, "Not an active member of this workspace");
  }

  return {
    session,
    user,
    membership,
    userId:      session.user_id,
    workspaceId: session.workspace_id,
    role:        membership.role as MemberRole,
  };
}

/**
 * Like requireAuth but returns null instead of throwing.
 * Used in the /me endpoint to silently return null when unauthenticated.
 */
export async function tryAuth(request: Request): Promise<AuthContext | null> {
  try {
    return await requireAuth(request);
  } catch {
    return null;
  }
}

// ── Permission enforcement ────────────────────────────────────────────────────

/**
 * Throws AuthError(403) if the authenticated caller lacks the given permission.
 *
 * Usage in API routes (single source of truth — no role checks in route handlers):
 *   assertPermission(auth, "members.invite");
 */
export function assertPermission(auth: AuthContext, permission: Permission): void {
  if (!hasPermission(auth.role, permission)) {
    throw new AuthError(403, `Permission denied: ${permission}`);
  }
}

// ── Input validation ──────────────────────────────────────────────────────────

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function validatePassword(password: string): string | null {
  if (password.length < 8)  return "Password must be at least 8 characters";
  if (password.length > 128) return "Password must be under 128 characters";
  return null;
}
