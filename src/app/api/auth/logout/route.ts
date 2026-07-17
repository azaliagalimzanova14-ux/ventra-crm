/**
 * POST /api/auth/logout
 *
 * Deletes the current session and clears the session cookie.
 *
 * Returns: 200 {} + Set-Cookie (clear)
 */

import { deleteSessionByToken }  from "@/lib/server/db-sessions";
import {
  getTokenFromCookieHeader,
  makeClearCookie,
} from "@/lib/server/auth-helpers";

export async function POST(request: Request): Promise<Response> {
  const token = getTokenFromCookieHeader(request.headers.get("cookie"));

  if (token) {
    try {
      deleteSessionByToken(token);
    } catch {
      // Best-effort — always clear the cookie even if session is already gone
    }
  }

  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": makeClearCookie() } },
  );
}
