/**
 * GET /api/integrations/telegram-personal/dialogs?source=live|db
 *
 * source=live (default) — fetches dialogs from Telegram and scores them.
 * source=db             — returns already-imported dialogs from SQLite.
 *
 * Requires: authenticated session.
 * workspaceId is taken from the authenticated session.
 */

import { NextRequest, NextResponse }    from "next/server";
import { requireAuth, AuthError }       from "@/lib/server/auth-helpers";
import { scanDialogs }                  from "@/lib/mtproto-client";
import { getPersonalDialogs }           from "@/lib/mtproto-db";
import type { DialogsResponse }         from "@/lib/mtproto-types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth   = await requireAuth(req);
    const source = req.nextUrl.searchParams.get("source") ?? "live";

    if (source === "db") {
      const dialogs = getPersonalDialogs(auth.workspaceId);
      return NextResponse.json<DialogsResponse>({ ok: true, dialogs, myId: "" });
    }

    // source === "live" — scan Telegram directly
    const { dialogs, myId } = await scanDialogs(auth.workspaceId);
    return NextResponse.json<DialogsResponse>({ ok: true, dialogs, myId });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json<DialogsResponse>(
        { ok: false, dialogs: [], myId: "", error: err.message },
        { status: err.status },
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json<DialogsResponse>(
      { ok: false, dialogs: [], myId: "", error: msg },
      { status: 500 },
    );
  }
}
