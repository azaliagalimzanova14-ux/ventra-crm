/**
 * PATCH /api/invitations/[id] — resend or cancel an invitation
 *
 * Body: { action: "resend" | "cancel" }
 * Requires owner or admin.
 */

import { NextResponse }                        from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import {
  getInvitationById,
  resendInvitation,
  revokeInvitation,
  withStatus,
} from "@/lib/server/db-invitations";
import { logActivity }               from "@/lib/server/db-activity";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth   = await requireAuth(request);
    const { id } = await params;

    assertPermission(auth, "members.invite");

    const inv = getInvitationById(id);
    if (!inv || inv.workspace_id !== auth.workspaceId) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    const body   = await request.json() as { action?: string };
    const action = body.action;

    if (action === "resend") {
      const fresh = resendInvitation(id, auth.userId);

      // Build new link
      const origin = new URL(request.url).origin;
      const link   = `${origin}/invite/${fresh.token}`;

      logActivity({
        workspace_id: auth.workspaceId,
        user_id:      auth.userId,
        type:         "invite_resent",
        entity_type:  "invitation",
        entity_id:    fresh.id,
        metadata:     { email: fresh.email, role: fresh.role },
      });

      return NextResponse.json({ invitation: withStatus(fresh), link });
    }

    if (action === "cancel") {
      const revoked = revokeInvitation(id);

      logActivity({
        workspace_id: auth.workspaceId,
        user_id:      auth.userId,
        type:         "invitation_cancelled",
        entity_type:  "invitation",
        entity_id:    id,
        metadata:     { email: inv.email, role: inv.role },
      });

      return NextResponse.json({ invitation: withStatus(revoked) });
    }

    return NextResponse.json(
      { error: 'action must be "resend" or "cancel"' },
      { status: 400 },
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[PATCH /api/invitations/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
