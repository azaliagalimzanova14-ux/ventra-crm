/**
 * GET /api/invitations/validate?token=<token>
 *
 * PUBLIC — no authentication required.
 * Returns invitation details (workspace name, role, email, status)
 * so the invite page can render before the user logs in or registers.
 */

import { NextResponse }          from "next/server";
import {
  getInvitationByToken,
  getInvitationStatus,
} from "@/lib/server/db-invitations";
import { getWorkspaceById }      from "@/lib/server/db-workspace";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const inv = getInvitationByToken(token);
    if (!inv) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    const status    = getInvitationStatus(inv);
    const workspace = getWorkspaceById(inv.workspace_id);

    return NextResponse.json({
      invitation: {
        id:          inv.id,
        email:       inv.email,
        role:        inv.role,
        status,
        expiresAt:   inv.expires_at,
      },
      workspace: workspace
        ? { id: workspace.id, name: workspace.name }
        : null,
    });
  } catch (err) {
    console.error("[GET /api/invitations/validate]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
