/**
 * src/middleware.ts
 *
 * Next.js edge middleware for route protection.
 *
 * Strategy:
 *  - Middleware runs on the edge runtime and cannot access SQLite.
 *  - It performs a lightweight check: presence of the session cookie.
 *  - Full session validation (token expiry, user existence, membership status)
 *    happens in the API routes and SessionProvider (via GET /api/auth/me).
 *
 * Public routes (no cookie required):
 *  /login, /register, /invite/*, all /api/auth/* endpoints,
 *  all Telegram/MTProto webhook routes, Next.js static assets.
 *
 * Root route (/):
 *  Redirects to /dashboard (has cookie) or /login (no cookie).
 *
 * Protected routes (everything else):
 *  Redirect to /login?from=<path> if no cookie is present.
 */

import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "ventra_session";

/** Exact paths that are always public */
const PUBLIC_EXACT = new Set(["/login", "/register"]);

/** Prefix patterns that are always public */
const PUBLIC_PREFIXES = [
  "/api/auth/",               // auth endpoints
  "/api/invitations/accept",  // invitation acceptance (public — new users have no session)
  "/api/invitations/validate",// invitation token validation (public — used by invite page)
  "/api/telegram",            // Telegram bot webhooks
  "/api/mtproto",             // MTProto personal account routes
  "/invite/",                 // invite acceptance pages
  "/_next/",                  // Next.js internals
  "/favicon.ico",
];

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // ── Static assets and always-public routes ─────────────────────────────────
  if (
    PUBLIC_EXACT.has(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get(COOKIE_NAME)?.value);

  // ── Root redirect ───────────────────────────────────────────────────────────
  if (pathname === "/") {
    return NextResponse.redirect(
      new URL(hasSession ? "/dashboard" : "/login", request.url),
    );
  }

  // ── Protected routes ────────────────────────────────────────────────────────
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    // Preserve the intended destination for post-login redirect
    if (pathname !== "/dashboard") {
      loginUrl.searchParams.set("from", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Match all routes except:
   *  - _next/static (static assets)
   *  - _next/image  (image optimization)
   *  - favicon.ico
   */
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
