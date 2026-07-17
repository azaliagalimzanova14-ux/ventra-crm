/**
 * GET /api/auth/me
 *
 * Returns the currently authenticated user, workspace, and membership.
 * Used by SessionProvider on mount to hydrate client state.
 *
 * Returns: 200 { user, workspace, membership }
 *          401 { error } — not authenticated or session expired
 */

import { tryAuth }             from "@/lib/server/auth-helpers";
import { parseWorkspaceSettings,
         getWorkspaceById }    from "@/lib/server/db-workspace";

export async function GET(request: Request): Promise<Response> {
  const ctx = await tryAuth(request);

  if (!ctx) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const ws = getWorkspaceById(ctx.workspaceId) ?? null;
  if (!ws) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }

  return Response.json({
    user: {
      id:        ctx.user.id,
      name:      ctx.user.name,
      email:     ctx.user.email,
      avatarUrl: ctx.user.avatar_url,
      timezone:  ctx.user.timezone,
      locale:    ctx.user.locale,
    },
    workspace: {
      id:       ws.id,
      name:     ws.name,
      slug:     ws.slug,
      plan:     ws.plan,
      settings: parseWorkspaceSettings(ws),
    },
    membership: {
      id:     ctx.membership.id,
      role:   ctx.membership.role,
      status: ctx.membership.status,
    },
  });
}
