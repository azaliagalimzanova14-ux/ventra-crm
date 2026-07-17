/**
 * GET  /api/workspaces — list all workspaces the authenticated user is a member of
 * POST /api/workspaces — create a new workspace and make the caller its owner
 */

import { NextResponse }       from "next/server";
import { requireAuth, AuthError } from "@/lib/server/auth-helpers";
import {
  listUserWorkspaces,
  createWorkspace,
  createMember,
  getMemberByUserId,
  parseWorkspaceSettings,
} from "@/lib/server/db-workspace";
import { logActivity }         from "@/lib/server/db-activity";

// ── GET /api/workspaces ───────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);

    const workspaces = listUserWorkspaces(auth.userId);

    const items = workspaces.map((ws) => {
      const membership = getMemberByUserId(ws.id, auth.userId);
      return {
        id:       ws.id,
        name:     ws.name,
        slug:     ws.slug,
        plan:     ws.plan,
        logoUrl:  ws.logo_url,
        settings: parseWorkspaceSettings(ws),
        role:     membership?.role ?? null,
        isCurrent: ws.id === auth.workspaceId,
      };
    });

    return NextResponse.json({ workspaces: items });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/workspaces]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/workspaces ──────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    const body = await request.json() as { name?: string };

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Workspace name is required" }, { status: 400 });
    }
    if (name.length < 2) {
      return NextResponse.json({ error: "Workspace name must be at least 2 characters" }, { status: 400 });
    }
    if (name.length > 80) {
      return NextResponse.json({ error: "Workspace name must be under 80 characters" }, { status: 400 });
    }

    // Fetch user email for the member record
    const { getUserById } = await import("@/lib/server/db-users");
    const user = getUserById(auth.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    const workspace = createWorkspace({ name, owner_id: auth.userId });

    const membership = createMember({
      workspace_id: workspace.id,
      email:        user.email,
      role:         "owner",
      invited_by:   auth.userId,
      user_id:      auth.userId,
      status:       "active",
    });

    logActivity({
      workspace_id: workspace.id,
      user_id:      auth.userId,
      type:         "workspace_created",
      entity_type:  "workspace",
      entity_id:    workspace.id,
      metadata:     { name: workspace.name },
    });

    return NextResponse.json(
      {
        workspace:  { id: workspace.id, name: workspace.name, slug: workspace.slug, plan: workspace.plan },
        membership: { id: membership.id, role: membership.role, status: membership.status },
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[POST /api/workspaces]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
