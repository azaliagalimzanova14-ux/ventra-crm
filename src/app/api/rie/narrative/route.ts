/**
 * GET /api/rie/narrative?clientId=<id>
 *
 * Returns the current relationship narrative for a client.
 *
 * Evidence, confidence, and signal_version are computed deterministically
 * server-side. The AI is called only for natural language text.
 *
 * Stale-while-revalidate: if the signal hash has changed, the stale narrative
 * is returned immediately (isStale: true) and regeneration fires in the background.
 *
 * Requires: clients.view permission
 *
 * Response:
 *   200 { narrative: NarrativeResult }
 *   200 { narrative: NarrativeResult, stale: true }  — signal changed; regenerating
 *   400 — missing clientId query param
 *   401 — unauthenticated
 *   403 — insufficient permission
 *   404 — client not found in this workspace
 *   500 — internal error
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { getClient }                                from "@/lib/server/db-clients";
import { getClientNarrative }                       from "@/lib/server/rie/narrative-engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "clients.view");

    const clientId = req.nextUrl.searchParams.get("clientId");
    if (!clientId) {
      return NextResponse.json({ error: "Missing required query param: clientId" }, { status: 400 });
    }

    // Verify the client belongs to this workspace
    const client = getClient(clientId, auth.workspaceId);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const narrative = await getClientNarrative(auth.workspaceId, clientId, client.name);

    return NextResponse.json(
      narrative.isStale
        ? { narrative, stale: true }
        : { narrative },
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/rie/narrative]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
