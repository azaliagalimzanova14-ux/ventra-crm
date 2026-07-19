/**
 * DELETE /api/memory/[id] — delete a specific memory entry
 *
 * Requires: workspace membership (clients.view permission)
 *
 * Response:
 *   204 — deleted
 *   404 — entry not found or belongs to another workspace
 *   401/403/500 standard errors
 */

import { NextRequest, NextResponse }                from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { deleteEntry }                              from "@/lib/server/memory/memory-store";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "clients.view");

    const deleted = deleteEntry(auth.workspaceId, params.id);
    if (!deleted) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[DELETE /api/memory/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
