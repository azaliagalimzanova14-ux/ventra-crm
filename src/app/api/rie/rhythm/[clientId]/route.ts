/**
 * GET /api/rie/rhythm/[clientId]
 *
 * Returns the computed relationship rhythm and health score for a client.
 * Result is cached for 60 minutes in rie_relationship_rhythms.
 *
 * Requires: clients.view permission
 *
 * Response:
 *   200 { rhythm: ClientRhythm }
 *   401 — unauthenticated
 *   403 — insufficient permission
 *   404 — client not found in this workspace
 *   500 — internal error
 */

import { NextRequest, NextResponse }                    from "next/server";
import { requireAuth, AuthError, assertPermission }     from "@/lib/server/auth-helpers";
import { getClient }                                    from "@/lib/server/db-clients";
import { getClientRhythm }                              from "@/lib/server/rie/rhythm-engine";

export const dynamic = "force-dynamic";

export async function GET(
  req:             NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
): Promise<NextResponse> {
  try {
    const auth              = await requireAuth(req);
    assertPermission(auth, "clients.view");

    const { clientId } = await params;

    // Verify the client belongs to this workspace before computing
    const client = getClient(clientId, auth.workspaceId);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const rhythm = getClientRhythm(auth.workspaceId, clientId);

    return NextResponse.json({ rhythm });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/rie/rhythm]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
