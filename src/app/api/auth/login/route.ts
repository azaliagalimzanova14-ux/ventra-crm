/**
 * POST /api/auth/login
 *
 * Validates credentials and creates a new session.
 *
 * Body: { email, password }
 * Returns: 200 { user, workspace, membership } + Set-Cookie
 * Errors: 400 validation | 401 invalid credentials | 500 server error
 */

import { getUserByEmail }                  from "@/lib/server/db-users";
import { getMemberByUserId,
         listUserWorkspaces,
         getWorkspaceById,
         parseWorkspaceSettings }          from "@/lib/server/db-workspace";
import { createSession }                   from "@/lib/server/db-sessions";
import {
  verifyPassword,
  makeSessionCookie,
  validateEmail,
} from "@/lib/server/auth-helpers";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;
    const { email, password } = body as { email?: string; password?: string };

    // ── Validation ──────────────────────────────────────────────────────────
    if (!email?.trim())    return err(400, "Email is required");
    if (!password)         return err(400, "Password is required");
    if (!validateEmail(email)) return err(400, "Invalid email address");

    // ── Credential check ────────────────────────────────────────────────────
    const user = getUserByEmail(email);
    if (!user) {
      // Use the same message for missing user and wrong password
      // (prevents user enumeration)
      return err(401, "Invalid email or password");
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return err(401, "Invalid email or password");
    }

    // ── Find workspace ──────────────────────────────────────────────────────
    // Use the first active workspace the user belongs to.
    const workspaces = listUserWorkspaces(user.id);
    const workspace  = workspaces[0] ?? null;

    if (!workspace) {
      return err(401, "No workspace found for this account");
    }

    const membership = getMemberByUserId(workspace.id, user.id);
    if (!membership || membership.status !== "active") {
      return err(401, "Account is not active in this workspace");
    }

    // ── Refresh workspace from DB (slug may have been backfilled) ──────────
    const ws = getWorkspaceById(workspace.id) ?? workspace;

    // ── Create session ──────────────────────────────────────────────────────
    const { token } = createSession({
      user_id:      user.id,
      workspace_id: workspace.id,
      user_agent:   request.headers.get("user-agent") ?? undefined,
    });

    return Response.json(
      {
        user: {
          id:        user.id,
          name:      user.name,
          email:     user.email,
          avatarUrl: user.avatar_url,
          timezone:  user.timezone,
          locale:    user.locale,
        },
        workspace: {
          id:       ws.id,
          name:     ws.name,
          slug:     ws.slug,
          plan:     ws.plan,
          settings: parseWorkspaceSettings(ws),
        },
        membership: {
          id:     membership.id,
          role:   membership.role,
          status: membership.status,
        },
      },
      { headers: { "Set-Cookie": makeSessionCookie(token) } },
    );
  } catch (e) {
    console.error("[POST /api/auth/login]", e);
    return err(500, "Internal server error");
  }
}

function err(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}
