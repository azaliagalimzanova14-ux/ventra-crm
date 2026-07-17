/**
 * POST /api/auth/register
 *
 * Creates a new user account, workspace, owner membership, and session.
 *
 * Body: { name, email, password, workspaceName }
 * Returns: 201 { user, workspace, membership } + Set-Cookie
 * Errors: 400 validation | 409 duplicate email | 500 server error
 */

import { emailExists, createUser }        from "@/lib/server/db-users";
import { createWorkspace, createMember }   from "@/lib/server/db-workspace";
import { createSession }                   from "@/lib/server/db-sessions";
import { logActivity }                     from "@/lib/server/db-activity";
import {
  hashPassword,
  makeSessionCookie,
  validateEmail,
  validatePassword,
} from "@/lib/server/auth-helpers";
import { parseWorkspaceSettings }          from "@/lib/server/db-workspace";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;
    const { name, email, password, workspaceName } = body as {
      name?:          string;
      email?:         string;
      password?:      string;
      workspaceName?: string;
    };

    // ── Validation ──────────────────────────────────────────────────────────
    if (!name?.trim())          return err(400, "Name is required");
    if (!email?.trim())         return err(400, "Email is required");
    if (!password)              return err(400, "Password is required");
    if (!workspaceName?.trim()) return err(400, "Workspace name is required");

    if (!validateEmail(email))  return err(400, "Invalid email address");

    const pwErr = validatePassword(password);
    if (pwErr) return err(400, pwErr);

    if (emailExists(email)) {
      return err(409, "An account with this email already exists");
    }

    // ── Create entities ─────────────────────────────────────────────────────
    const passwordHash = await hashPassword(password);

    const user = createUser({
      name:          name.trim(),
      email:         email.trim(),
      password_hash: passwordHash,
    });

    const workspace = createWorkspace({
      name:     workspaceName.trim(),
      owner_id: user.id,
    });

    const membership = createMember({
      workspace_id: workspace.id,
      email:        user.email,
      role:         "owner",
      invited_by:   user.id,
      user_id:      user.id,
      status:       "active",
    });

    logActivity({
      workspace_id: workspace.id,
      user_id:      user.id,
      type:         "workspace_updated",
      entity_type:  "workspace",
      entity_id:    workspace.id,
      entity_name:  workspace.name,
      detail:       "Workspace created",
    });

    // ── Create session ──────────────────────────────────────────────────────
    const { token } = createSession({
      user_id:      user.id,
      workspace_id: workspace.id,
      user_agent:   request.headers.get("user-agent") ?? undefined,
    });

    // ── Response ────────────────────────────────────────────────────────────
    return Response.json(
      {
        user:       safeUser(user),
        workspace:  safeWorkspace(workspace),
        membership: safeMembership(membership),
      },
      {
        status:  201,
        headers: { "Set-Cookie": makeSessionCookie(token) },
      },
    );
  } catch (e) {
    console.error("[POST /api/auth/register]", e);
    return err(500, "Internal server error");
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function err(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

function safeUser(u: ReturnType<typeof createUser>) {
  return {
    id:        u.id,
    name:      u.name,
    email:     u.email,
    avatarUrl: u.avatar_url,
    timezone:  u.timezone,
    locale:    u.locale,
  };
}

function safeWorkspace(w: ReturnType<typeof createWorkspace>) {
  return {
    id:       w.id,
    name:     w.name,
    slug:     w.slug,
    plan:     w.plan,
    settings: parseWorkspaceSettings(w),
  };
}

function safeMembership(m: ReturnType<typeof createMember>) {
  return {
    id:     m.id,
    role:   m.role,
    status: m.status,
  };
}
