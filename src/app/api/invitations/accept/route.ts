/**
 * POST /api/invitations/accept
 *
 * PUBLIC — works with or without an active session.
 *
 * Two flows:
 *
 * 1. New user (name + password provided):
 *    - Validates the token is pending
 *    - Creates a user account
 *    - Creates a workspace_member record (status=active)
 *    - Marks the invitation accepted
 *    - Creates a session cookie and returns it
 *
 * 2. Existing logged-in user (session cookie present):
 *    - Validates the token is pending
 *    - Creates / activates the workspace_member record
 *    - Marks the invitation accepted
 *
 * Body: { token, name?, password? }
 */

import {
  getInvitationByToken,
  acceptInvitation,
  getInvitationStatus,
} from "@/lib/server/db-invitations";
import {
  createMember,
  getMemberByEmail,
  updateMember,
  getWorkspaceById,
} from "@/lib/server/db-workspace";
import { createUser, emailExists }    from "@/lib/server/db-users";
import { createSession, getSessionByToken } from "@/lib/server/db-sessions";
import { logActivity }                from "@/lib/server/db-activity";
import {
  hashPassword,
  makeSessionCookie,
  validatePassword,
  getTokenFromCookieHeader,
} from "@/lib/server/auth-helpers";

function err(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as {
      token?:    string;
      name?:     string;
      password?: string;
    };

    const token    = body.token?.trim();
    const name     = body.name?.trim();
    const password = body.password;

    if (!token) return err(400, "token is required");

    // Validate invitation
    const inv = getInvitationByToken(token);
    if (!inv)                                    return err(404, "Invitation not found");
    if (getInvitationStatus(inv) !== "pending")  return err(410, "Invitation has expired or is no longer valid");

    const workspace = getWorkspaceById(inv.workspace_id);
    if (!workspace) return err(404, "Workspace not found");

    // ── Detect existing session ─────────────────────────────────────────────
    const cookieHeader    = request.headers.get("cookie");
    const sessionToken    = getTokenFromCookieHeader(cookieHeader);
    const existingSession = sessionToken ? getSessionByToken(sessionToken) : null;

    // ── Flow 1: logged-in user ──────────────────────────────────────────────
    if (existingSession) {
      const userId = existingSession.user_id;

      const existing = getMemberByEmail(inv.workspace_id, inv.email);
      if (existing) {
        if (existing.status !== "active") {
          updateMember(existing.id, {
            user_id: userId,
            status:  "active",
          });
        }
      } else {
        createMember({
          workspace_id: inv.workspace_id,
          email:        inv.email,
          role:         inv.role,
          invited_by:   inv.invited_by,
          user_id:      userId,
          status:       "active",
        });
      }

      acceptInvitation(token);

      logActivity({
        workspace_id: inv.workspace_id,
        user_id:      userId,
        type:         "member_joined",
        entity_type:  "invitation",
        entity_id:    inv.id,
        metadata:     { email: inv.email, role: inv.role },
      });

      return Response.json({
        success:   true,
        workspace: { id: workspace.id, name: workspace.name },
      });
    }

    // ── Flow 2: new user registration ───────────────────────────────────────
    if (!name)     return err(400, "Name is required");
    if (!password) return err(400, "Password is required");

    const pwErr = validatePassword(password);
    if (pwErr) return err(400, pwErr);

    if (emailExists(inv.email)) {
      return err(
        409,
        "An account with this email already exists. Please log in and accept the invitation.",
      );
    }

    const passwordHash = await hashPassword(password);

    const user = createUser({
      name,
      email:         inv.email,
      password_hash: passwordHash,
    });

    createMember({
      workspace_id: inv.workspace_id,
      email:        inv.email,
      role:         inv.role,
      invited_by:   inv.invited_by,
      user_id:      user.id,
      status:       "active",
    });

    acceptInvitation(token);

    logActivity({
      workspace_id: inv.workspace_id,
      user_id:      user.id,
      type:         "member_joined",
      entity_type:  "invitation",
      entity_id:    inv.id,
      metadata:     { email: inv.email, role: inv.role },
    });

    const session = createSession({
      user_id:      user.id,
      workspace_id: inv.workspace_id,
      user_agent:   request.headers.get("user-agent") ?? undefined,
    });

    return Response.json(
      {
        success: true,
        user:      { id: user.id, name: user.name, email: user.email },
        workspace: { id: workspace.id, name: workspace.name },
      },
      {
        status:  201,
        headers: { "Set-Cookie": makeSessionCookie(session.token) },
      },
    );
  } catch (e) {
    console.error("[POST /api/invitations/accept]", e);
    return err(500, "Internal server error");
  }
}
