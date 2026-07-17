/**
 * GET /api/integrations/email/status
 *
 * Returns the email connection status for the current workspace.
 *
 * Response:
 *   { connected: true,  email, displayName, provider, connectedAt, lastSyncAt }
 *   { connected: false }
 *
 * Requires: authenticated session (any role).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError }    from "@/lib/server/auth-helpers";
import { getEmailAccount }           from "@/lib/server/db-email";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth    = await requireAuth(req);
    const account = getEmailAccount(auth.workspaceId, "gmail");

    if (!account) {
      return NextResponse.json({ connected: false });
    }

    return NextResponse.json({
      connected:    true,
      provider:     account.provider,
      email:        account.email,
      displayName:  account.display_name,
      connectedAt:  account.connected_at,
      lastSyncAt:   account.last_sync_at,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
