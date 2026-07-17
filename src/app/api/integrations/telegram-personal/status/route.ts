/**
 * GET /api/integrations/telegram-personal/status
 *
 * Returns the personal Telegram account connection status for the workspace.
 *
 * Requires: authenticated session.
 * workspaceId is taken from the authenticated session.
 */

import { NextRequest, NextResponse }    from "next/server";
import { requireAuth, AuthError }       from "@/lib/server/auth-helpers";
import { getPublicSession }             from "@/lib/mtproto-db";
import type { AuthStatusResponse }          from "@/lib/mtproto-types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth    = await requireAuth(req);
    const session = getPublicSession(auth.workspaceId);

    return NextResponse.json<AuthStatusResponse>({
      ok:        true,
      connected: !!session,
      session:   session ?? undefined,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ ok: false, connected: false, error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, connected: false, error: msg }, { status: 500 });
  }
}
