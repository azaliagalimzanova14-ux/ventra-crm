/**
 * GET   /api/workspaces/current — get the current workspace details
 * PATCH /api/workspaces/current — update workspace name / logo / settings
 */

import { NextResponse }                        from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import {
  getWorkspaceById,
  updateWorkspace,
  parseWorkspaceSettings,
  nameToSlug,
  uniqueSlug,
} from "@/lib/server/db-workspace";
import { getMemberByUserId }   from "@/lib/server/db-workspace";
import { logActivity }          from "@/lib/server/db-activity";
import type { WorkspaceSettings } from "@/lib/server/models";

// ── GET /api/workspaces/current ───────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);

    const workspace = getWorkspaceById(auth.workspaceId);
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const membership = getMemberByUserId(auth.workspaceId, auth.userId);

    return NextResponse.json({
      workspace: {
        id:       workspace.id,
        name:     workspace.name,
        slug:     workspace.slug,
        plan:     workspace.plan,
        logoUrl:  workspace.logo_url,
        settings: parseWorkspaceSettings(workspace),
      },
      membership: membership
        ? { id: membership.id, role: membership.role, status: membership.status }
        : null,
      role: auth.role,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/workspaces/current]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PATCH /api/workspaces/current ─────────────────────────────────────────────

interface PatchBody {
  name?:     string;
  logoUrl?:  string | null;
  settings?: Partial<WorkspaceSettings>;
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuth(request);

    assertPermission(auth, "workspace.manage");

    const body = await request.json() as PatchBody;

    const current = getWorkspaceById(auth.workspaceId);
    if (!current) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const updateParams: Parameters<typeof updateWorkspace>[1] = {};

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (name.length < 2) {
        return NextResponse.json({ error: "Workspace name must be at least 2 characters" }, { status: 400 });
      }
      if (name.length > 80) {
        return NextResponse.json({ error: "Workspace name must be under 80 characters" }, { status: 400 });
      }
      updateParams.name = name;
      // Update slug only if name changed
      if (name !== current.name) {
        const base      = nameToSlug(name);
        const candidate = uniqueSlug(base);
        // Don't change slug if base matches existing (avoid unnecessary slug churn)
        if (current.slug !== base && current.slug !== candidate) {
          updateParams.slug = candidate;
        }
      }
    }

    if (body.logoUrl !== undefined) {
      updateParams.logo_url = body.logoUrl;
    }

    if (body.settings !== undefined) {
      // Merge new settings over current settings
      const existing = parseWorkspaceSettings(current);
      updateParams.settings = { ...existing, ...body.settings } as WorkspaceSettings;
    }

    const updated = updateWorkspace(auth.workspaceId, updateParams);

    logActivity({
      workspace_id: auth.workspaceId,
      user_id:      auth.userId,
      type:         "workspace_settings_changed",
      entity_type:  "workspace",
      entity_id:    auth.workspaceId,
      entity_name:  updated.name,
      metadata:     {
        changed: Object.keys(updateParams),
        name:    updateParams.name ?? null,
      },
    });

    return NextResponse.json({
      workspace: {
        id:       updated.id,
        name:     updated.name,
        slug:     updated.slug,
        plan:     updated.plan,
        logoUrl:  updated.logo_url,
        settings: parseWorkspaceSettings(updated),
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[PATCH /api/workspaces/current]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
