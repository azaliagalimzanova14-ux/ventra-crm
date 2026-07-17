/**
 * GET  /api/invitations — list all invitations for the current workspace
 * POST /api/invitations — create (send) a new invitation
 *
 * GET:  any authenticated member
 * POST: owner or admin only
 */

import { NextResponse }                        from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import {
  createInvitation,
  listWorkspaceInvitations,
} from "@/lib/server/db-invitations";
import {
  getMemberByEmail,
  getWorkspaceById,
} from "@/lib/server/db-workspace";
import { logActivity }               from "@/lib/server/db-activity";
import type { MemberRole }           from "@/lib/server/models";

const VALID_ROLES: MemberRole[] = ["owner", "admin", "team_lead", "sales_manager", "support"];

// ── GET /api/invitations ──────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const auth        = await requireAuth(request);
    const invitations = listWorkspaceInvitations(auth.workspaceId);
    return NextResponse.json({ invitations });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/invitations]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/invitations ─────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);

    assertPermission(auth, "members.invite");

    const body = await request.json() as {
      email?: string;
      role?:  string;
    };

    const email = body.email?.trim().toLowerCase();
    const role  = body.role as MemberRole | undefined;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }
    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` },
        { status: 400 },
      );
    }
    if (role === "owner" && auth.role !== "owner") {
      return NextResponse.json(
        { error: "Only owners can invite with the owner role" },
        { status: 403 },
      );
    }

    // Check if already an active member
    const existing = getMemberByEmail(auth.workspaceId, email);
    if (existing && existing.status === "active") {
      return NextResponse.json(
        { error: "This person is already an active member of the workspace" },
        { status: 409 },
      );
    }

    const workspace  = getWorkspaceById(auth.workspaceId);
    const invitation = createInvitation({
      workspace_id: auth.workspaceId,
      email,
      role,
      invited_by: auth.userId,
    });

    // Build invitation link using request origin
    const origin = new URL(request.url).origin;
    const link   = `${origin}/invite/${invitation.token}`;

    logActivity({
      workspace_id: auth.workspaceId,
      user_id:      auth.userId,
      type:         "member_invited",
      entity_type:  "invitation",
      entity_id:    invitation.id,
      metadata:     { email, role, workspaceName: workspace?.name ?? "" },
    });

    return NextResponse.json(
      { invitation: { ...invitation, status: "pending" }, link },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[POST /api/invitations]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
