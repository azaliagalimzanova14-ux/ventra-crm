/**
 * POST /api/integrations/telegram-personal/import
 *
 * Imports selected dialogs into SQLite and the unified inbox.
 * Body: { peerIds: string[], clientLinks?: { peerId: string; clientId: string; clientName: string }[] }
 *
 * Requires: authenticated session + integrations.manage permission.
 * workspaceId is taken from the authenticated session.
 */

import { NextRequest, NextResponse }      from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { importDialogs }                  from "@/lib/mtproto-client";
import type { ImportResponse }            from "@/lib/mtproto-types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "integrations.manage");

    let body: { peerIds?: string[]; clientLinks?: { peerId: string; clientId: string; clientName: string }[] };
    try {
      body = await req.json() as typeof body;
    } catch {
      return NextResponse.json<ImportResponse>({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const { peerIds = [], clientLinks = [] } = body;

    if (!Array.isArray(peerIds) || peerIds.length === 0) {
      return NextResponse.json<ImportResponse>(
        { ok: false, error: "peerIds must be a non-empty array" },
        { status: 400 },
      );
    }

    const { conversationsImported, messagesImported } = await importDialogs(
      auth.workspaceId,
      peerIds,
      50,
      clientLinks.map((l) => ({ peerId: l.peerId, clientId: l.clientId })),
    );

    return NextResponse.json<ImportResponse>({
      ok: true,
      result: {
        clientsCreated:        0,
        clientsMatched:        clientLinks.length,
        conversationsImported,
        messagesImported,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json<ImportResponse>({ ok: false, error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json<ImportResponse>({ ok: false, error: msg }, { status: 500 });
  }
}
