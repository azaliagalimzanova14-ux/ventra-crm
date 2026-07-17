/**
 * GET /api/integrations/email/oauth/callback
 *
 * Google OAuth callback handler.
 *
 * Flow:
 *  1. Validate CSRF state (decrypt → workspaceId:userId)
 *  2. Exchange code for tokens
 *  3. Fetch Gmail profile
 *  4. Save encrypted tokens to email_accounts table
 *  5. Run initial thread sync (up to 50 threads)
 *  6. Redirect to /settings?tab=integrations&email_connected=1
 *
 * On error: redirect to /settings?tab=integrations&email_error=<message>
 *
 * Note: no session cookie check — the encrypted state IS the identity proof.
 *
 * Environment: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXT_PUBLIC_APP_URL
 */

import { NextRequest, NextResponse } from "next/server";
import { decryptToken }              from "@/lib/crypto-token";
import { GmailProvider }             from "@/lib/gmail-provider";
import { saveEmailAccount }          from "@/lib/server/db-email";
import { syncEmailThreads }          from "@/lib/server/email-sync-engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const settingsOk = `${appUrl}/settings?tab=integrations&email_connected=1`;

  function failRedirect(reason: string): NextResponse {
    return NextResponse.redirect(
      `${appUrl}/settings?tab=integrations&email_error=${encodeURIComponent(reason)}`,
    );
  }

  const url   = new URL(req.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return failRedirect(`Google OAuth denied: ${error}`);
  if (!code)  return failRedirect("Missing authorization code");
  if (!state) return failRedirect("Missing state parameter");

  // ── Decode CSRF state → workspaceId:userId ─────────────────────────────────
  let workspaceId: string;
  let userId: string;
  try {
    const payload = decryptToken(state);
    const parts   = payload.split(":");
    if (parts.length < 2) throw new Error("malformed");
    workspaceId = parts[0]!;
    userId      = parts.slice(1).join(":");
  } catch {
    return failRedirect("Invalid OAuth state — please try connecting again");
  }

  const redirectUri = `${appUrl}/api/integrations/email/oauth/callback`;
  const provider    = new GmailProvider();

  try {
    // 1. Exchange code for tokens
    const tokens = await provider.exchangeCode(code, redirectUri);

    // 2. Get Gmail profile
    const profile = await provider.getProfile(tokens.accessToken);

    // 3. Save encrypted tokens
    saveEmailAccount({
      workspaceId,
      userId,
      provider:     "gmail",
      email:        profile.email,
      displayName:  profile.displayName,
      accessToken:  tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt:    tokens.expiresAt,
      scope:        tokens.scope,
    });

    // 4. Initial sync — best-effort, failure does not block connection
    try {
      await syncEmailThreads(workspaceId, { maxResults: 50 });
    } catch (syncErr) {
      console.error("[Email OAuth] Initial sync failed:", syncErr);
    }

    return NextResponse.redirect(settingsOk);
  } catch (err) {
    console.error("[Email OAuth callback]", err);
    const msg = err instanceof Error ? err.message : "Connection failed";
    return failRedirect(msg);
  }
}
