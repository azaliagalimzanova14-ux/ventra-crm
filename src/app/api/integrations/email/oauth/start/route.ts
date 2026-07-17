/**
 * GET /api/integrations/email/oauth/start
 *
 * Initiates the Google OAuth flow.
 * Builds the Google consent URL and redirects the browser to it.
 *
 * The `state` param is an AES-256-GCM encrypted blob containing
 * the user's workspaceId + userId so the callback can identify the user
 * without a session cookie (which won't survive the Google redirect).
 *
 * After Google auth, Google redirects to:
 *   /api/integrations/email/oauth/callback?code=...&state=...
 *
 * Requires: authenticated session + integrations.manage permission.
 *
 * Environment:
 *   GOOGLE_CLIENT_ID       — OAuth client ID
 *   NEXT_PUBLIC_APP_URL    — base URL (e.g. http://localhost:3000)
 */

import { NextRequest, NextResponse }            from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { GmailProvider }                        from "@/lib/gmail-provider";
import { encryptToken }                         from "@/lib/crypto-token";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "integrations.manage");

    const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const redirectUri = `${appUrl}/api/integrations/email/oauth/callback`;

    // State encodes workspaceId:userId — encrypted to prevent CSRF
    const statePayload = `${auth.workspaceId}:${auth.userId}`;
    const state        = encryptToken(statePayload);

    const provider = new GmailProvider();
    const authUrl  = provider.buildAuthUrl(redirectUri, state);

    return NextResponse.redirect(authUrl);
  } catch (err) {
    if (err instanceof AuthError) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      return NextResponse.redirect(
        `${appUrl}/settings?tab=integrations&email_error=${encodeURIComponent(err.message)}`,
      );
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return NextResponse.redirect(
      `${appUrl}/settings?tab=integrations&email_error=server_error`,
    );
  }
}
