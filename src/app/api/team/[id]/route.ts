/**
 * PATCH  /api/team/[id] — update member role or status
 * DELETE /api/team/[id] — remove member from workspace
 *
 * Both require owner or admin.
 * An owner cannot be removed or demoted by an admin.
 */

import { NextResponse }                        from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import {
  getMemberById,
  updateMember,
  deleteMember,
} from "@/lib/server/db-workspace";
import { logActivity }            from "@/lib/server/db-activity";
import type { MemberRole, MemberStatus } from "@/lib/server/models";

const VALID_ROLES: MemberRole[]     = ["owner", "admin", "team_lead", "sales_manager", "support"];
const VALID_STATUSES: MemberStatus[] = ["active", "invited", "inactive"];

// ── PATCH /api/team/[id] ──────────────────────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth     = await requireAuth(request);
    const { id }   = await params;

    assertPermission(auth, "members.manage_roles");

    const target = getMemberById(id);
    if (!target || target.workspace_id !== auth.workspaceId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Admins cannot change owners' roles
    if (target.role === "owner" && auth.role === "admin") {
      return NextResponse.json({ error: "Admins cannot modify owner accounts" }, { status: 403 });
    }

    // Prevent the sole owner from demoting themselves
    if (target.id === auth.membership.id && target.role === "owner") {
      return NextResponse.json({ error: "You cannot change your own owner role" }, { status: 400 });
    }

    const body = await request.json() as { role?: string; status?: string };

    const updateParams: Parameters<typeof updateMember>[1] = {};

    if (body.role !== undefined) {
      const role = body.role as MemberRole;
      if (!VALID_ROLES.includes(role)) {
        return NextResponse.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` }, { status: 400 });
      }
      // Only owners can assign owner role
      if (role === "owner" && auth.role !== "owner") {
        return NextResponse.json({ error: "Only owners can assign the owner role" }, { status: 403 });
      }
      updateParams.role = role;
    }

    if (body.status !== undefined) {
      const status = body.status as MemberStatus;
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
      }
      updateParams.status = status;
    }

    const updated = updateMember(id, updateParams);

    // Activity log
    if (body.role !== undefined && body.role !== target.role) {
      logActivity({
        workspace_id: auth.workspaceId,
        user_id:      auth.userId,
        type:         "role_changed",
        entity_type:  "member",
        entity_id:    id,
        metadata:     { from: target.role, to: body.role, email: target.email },
      });
    }

    return NextResponse.json({
      member: {
        id:       updated.id,
        userId:   updated.user_id,
        email:    updated.email,
        role:     updated.role,
        status:   updated.status,
        joinedAt: updated.joined_at,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[PATCH /api/team/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── DELETE /api/team/[id] ─────────────────────────────────────────────────────

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth   = await requireAuth(request);
    const { id } = await params;

    assertPermission(auth, "members.remove");

    const target = getMemberById(id);
    if (!target || target.workspace_id !== auth.workspaceId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Cannot remove yourself
    if (target.id === auth.membership.id) {
      return NextResponse.json({ error: "You cannot remove yourself from the workspace" }, { status: 400 });
    }

    // Admins cannot remove owners
    if (target.role === "owner" && auth.role === "admin") {
      return NextResponse.json({ error: "Admins cannot remove owner accounts" }, { status: 403 });
    }

    const email = target.email;
    deleteMember(id);

    logActivity({
      workspace_id: auth.workspaceId,
      user_id:      auth.userId,
      type:         "member_removed",
      entity_type:  "member",
      entity_id:    id,
      metadata:     { email, role: target.role },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[DELETE /api/team/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
