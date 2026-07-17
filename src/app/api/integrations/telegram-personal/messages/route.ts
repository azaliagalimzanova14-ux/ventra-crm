/**
 * GET /api/integrations/telegram-personal/messages?dialogId=...&limit=50
 *
 * Returns messages for a personal account dialog from SQLite.
 *
 * Requires: authenticated session.
 * workspaceId is taken from the authenticated session.
 */

import { NextRequest, NextResponse }    from "next/server";
import { requireAuth, AuthError }       from "@/lib/server/auth-helpers";
import { getPersonalMessages }          from "@/lib/mtproto-db";
import type { MessagesResponse }        from "@/lib/mtproto-types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth     = await requireAuth(req);
    const dialogId = req.nextUrl.searchParams.get("dialogId") ?? null;
    const limit    = parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10);

    if (!dialogId) {
      return NextResponse.json<MessagesResponse>(
        { ok: false, messages: [], error: "dialogId is required" },
        { status: 400 },
      );
    }

    const messages = getPersonalMessages(auth.workspaceId, dialogId, isNaN(limit) ? 50 : limit);
    return NextResponse.json<MessagesResponse>({ ok: true, messages });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json<MessagesResponse>(
        { ok: false, messages: [], error: err.message },
        { status: err.status },
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json<MessagesResponse>(
      { ok: false, messages: [], error: msg },
      { status: 500 },
    );
  }
}
