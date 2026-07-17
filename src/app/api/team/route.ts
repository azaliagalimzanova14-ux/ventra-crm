/**
 * GET  /api/team — list all workspace members (with joined user data)
 * POST /api/team — add a new member to the workspace
 *
 * GET:  any authenticated member
 * POST: owner or admin only
 */

import { NextResponse }                        from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import {
  listWorkspaceMembers,
  createMember,
  getMemberByEmail,
} from "@/lib/server/db-workspace";
import { getUserByEmail }            from "@/lib/server/db-users";
import { logActivity }              from "@/lib/server/db-activity";
import type { MemberRole }          from "@/lib/server/models";

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_ROLES: MemberRole[] = ["owner", "admin", "team_lead", "sales_manager", "support"];

/** Resolved display name: user.name → display_name → email prefix */
function resolveName(
  userName:    string | null,
  displayName: string | null,
  email:       string,
): string {
  return userName ?? displayName ?? email.split("@")[0] ?? email;
}

function formatMember(m: {
  id:             string;
  user_id:        string | null;
  email:          string;
  display_name:   string | null;
  role:           string;
  status:         string;
  invited_at:     string;
  joined_at:      string | null;
  user_name:      string | null;
  user_avatar_url: string | null;
}) {
  return {
    id:        m.id,
    userId:    m.user_id,
    email:     m.email,
    name:      resolveName(m.user_name, m.display_name, m.email),
    avatarUrl: m.user_avatar_url,
    role:      m.role,
    status:    m.status,
    invitedAt: m.invited_at,
    joinedAt:  m.joined_at,
  };
}

// ── GET /api/team ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);

    const rows    = listWorkspaceMembers(auth.workspaceId);
    const members = rows.map(formatMember);

    return NextResponse.json({ members });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/team]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/team ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);

    assertPermission(auth, "members.invite");

    const body = await request.json() as {
      name?:  string;
      email?: string;
      role?:  string;
    };

    const email = body.email?.trim().toLowerCase();
    const name  = body.name?.trim();
    const role  = body.role as MemberRole | undefined;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }
    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` }, { status: 400 });
    }
    // Only owners can assign owner role
    if (role === "owner" && auth.role !== "owner") {
      return NextResponse.json({ error: "Only owners can assign the owner role" }, { status: 403 });
    }

    // Check if already a member
    const existing = getMemberByEmail(auth.workspaceId, email);
    if (existing) {
      return NextResponse.json({ error: "This person is already a member of the workspace" }, { status: 409 });
    }

    // Look up whether this email belongs to an existing user
    const existingUser = getUserByEmail(email);

    const member = createMember({
      workspace_id: auth.workspaceId,
      email,
      role,
      invited_by:   auth.userId,
      user_id:      existingUser?.id,
      display_name: name ?? undefined,
      status:       existingUser ? "active" : "invited",
      ...(existingUser ? { joined_at: new Date().toISOString() } : {}),
    });

    // Activity log
    logActivity({
      workspace_id: auth.workspaceId,
      user_id:      auth.userId,
      type:         "member_invited",
      entity_type:  "member",
      entity_id:    member.id,
      metadata:     { email, role, name: name ?? null },
    });

    // Return the member with resolved display name
    return NextResponse.json(
      {
        member: {
          id:        member.id,
          userId:    member.user_id,
          email:     member.email,
          name:      resolveName(existingUser?.name ?? null, member.display_name, member.email),
          avatarUrl: existingUser?.avatar_url ?? null,
          role:      member.role,
          status:    member.status,
          invitedAt: member.invited_at,
          joinedAt:  member.joined_at,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[POST /api/team]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
