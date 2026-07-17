/**
 * POST /api/integrations/telegram-personal/disconnect
 *
 * Disconnects the personal Telegram account:
 *   - Terminates the GramJS TCP connection
 *   - Deletes the encrypted session from SQLite
 *   - Optionally removes imported dialogs and messages
 *
 * Body: { keepData?: boolean }
 *
 * Requires: authenticated session + integrations.manage permission.
 * workspaceId is taken from the authenticated session.
 */

import { NextRequest, NextResponse }      from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { disconnectPersonal }             from "@/lib/mtproto-client";
import { deletePersonalDialogs, deletePersonalMessages } from "@/lib/mtproto-db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "integrations.manage");

    let body: { keepData?: boolean } = {};
    try { body = await req.json() as typeof body; } catch { /* empty body ok */ }

    await disconnectPersonal(auth.workspaceId);

    if (!body.keepData) {
      deletePersonalMessages(auth.workspaceId);
      deletePersonalDialogs(auth.workspaceId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
