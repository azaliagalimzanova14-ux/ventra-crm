/**
 * POST /api/workspaces/switch
 *
 * Updates the current session's workspace_id so subsequent requests are scoped
 * to the chosen workspace. The caller must be an active member of the target
 * workspace.
 *
 * Body: { workspaceId: string }
 * Response: { workspace, membership, role }
 */

import { NextResponse }       from "next/server";
import {
  requireAuth,
  AuthError,
  getTokenFromCookieHeader,
} from "@/lib/server/auth-helpers";
import { getMemberByUserId, getWorkspaceById, parseWorkspaceSettings } from "@/lib/server/db-workspace";
import { updateSessionWorkspace } from "@/lib/server/db-sessions";

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);

    const body = await request.json() as { workspaceId?: string };
    const targetId = body.workspaceId?.trim();

    if (!targetId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    // No-op if already on the target workspace
    if (targetId === auth.workspaceId) {
      const ws = getWorkspaceById(auth.workspaceId);
      return NextResponse.json({
        workspace:  ws ? { id: ws.id, name: ws.name, slug: ws.slug, plan: ws.plan, logoUrl: ws.logo_url, settings: parseWorkspaceSettings(ws) } : null,
        membership: { id: auth.membership.id, role: auth.membership.role, status: auth.membership.status },
        role:       auth.role,
      });
    }

    // Verify target workspace exists
    const targetWs = getWorkspaceById(targetId);
    if (!targetWs) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Verify the user is an active member of the target workspace
    const membership = getMemberByUserId(targetId, auth.userId);
    if (!membership || membership.status !== "active") {
      return NextResponse.json(
        { error: "You are not an active member of this workspace" },
        { status: 403 },
      );
    }

    // Update the session in the database
    const token = getTokenFromCookieHeader(request.headers.get("cookie"));
    if (token) {
      updateSessionWorkspace(token, targetId);
    }

    return NextResponse.json({
      workspace: {
        id:       targetWs.id,
        name:     targetWs.name,
        slug:     targetWs.slug,
        plan:     targetWs.plan,
        logoUrl:  targetWs.logo_url,
        settings: parseWorkspaceSettings(targetWs),
      },
      membership: {
        id:     membership.id,
        role:   membership.role,
        status: membership.status,
      },
      role: membership.role,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[POST /api/workspaces/switch]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
