/**
 * GET  /api/integrations/email/sync — return sync status (last_sync_at, connected)
 * POST /api/integrations/email/sync — trigger a manual sync
 *
 * GET response:
 *   { connected: bool, lastSyncAt: string|null, email: string|null }
 *
 * POST body: { maxResults?: number, sinceDate?: string }
 * POST response: { ok: true, threadsImported, messagesImported }
 *
 * GET requires: any authenticated session
 * POST requires: authenticated session + integrations.manage
 */

import { NextRequest, NextResponse }     from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { getEmailAccount }               from "@/lib/server/db-email";
import { syncEmailThreads }              from "@/lib/server/email-sync-engine";

export const dynamic = "force-dynamic";

// ── GET — sync status ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth    = await requireAuth(req);
    const account = getEmailAccount(auth.workspaceId, "gmail");

    if (!account) {
      return NextResponse.json({ connected: false, lastSyncAt: null, email: null });
    }

    return NextResponse.json({
      connected:   true,
      email:       account.email,
      displayName: account.display_name,
      lastSyncAt:  account.last_sync_at,
      connectedAt: account.connected_at,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST — manual sync ────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "integrations.manage");

    const body = await req.json().catch(() => ({})) as {
      maxResults?: number;
      sinceDate?:  string;
    };

    const result = await syncEmailThreads(auth.workspaceId, {
      maxResults: body.maxResults,
      sinceDate:  body.sinceDate,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      threadsImported:  result.threadsImported,
      messagesImported: result.messagesImported,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[Email sync POST]", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
