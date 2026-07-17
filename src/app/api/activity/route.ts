/**
 * GET /api/activity
 *
 * Returns a paginated, workspace-scoped activity log.
 * Enriches each entry with actor name + email (joined from users table).
 *
 * Query params:
 *   page  — page number (1-based, default 1)
 *   limit — items per page (default 20, max 50)
 *
 * Requires: activity.view permission.
 */

import { NextResponse }                        from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { listActivityPage }                    from "@/lib/server/db-activity";
import { listUsers }                           from "@/lib/server/db-users";

// ── Human-readable action labels ──────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  client_added:               "Added client",
  client_updated:             "Updated client",
  client_deleted:             "Deleted client",
  deal_created:               "Created deal",
  deal_stage_changed:         "Changed deal stage",
  deal_won:                   "Won deal",
  deal_lost:                  "Lost deal",
  task_created:               "Created task",
  task_completed:             "Completed task",
  task_deleted:               "Deleted task",
  project_created:            "Created project",
  project_updated:            "Updated project",
  project_completed:          "Completed project",
  member_invited:             "Invited member",
  member_joined:              "Joined workspace",
  member_removed:             "Removed member",
  role_changed:               "Changed role",
  invite_resent:              "Resent invitation",
  invitation_cancelled:       "Cancelled invitation",
  workspace_created:          "Created workspace",
  workspace_updated:          "Updated workspace",
  workspace_settings_changed: "Updated workspace settings",
};

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    assertPermission(auth, "activity.view");

    const url   = new URL(request.url);
    const page  = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));

    const { entries, total, pages } = listActivityPage(auth.workspaceId, page, limit);

    // Resolve actor names — batch-fetch unique users
    const userIds = [...new Set(entries.map((e) => e.user_id).filter(Boolean))] as string[];
    const users   = userIds.length > 0 ? listUsers(userIds) : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const items = entries.map((entry) => {
      const actor = entry.user_id ? userMap.get(entry.user_id) : null;
      let metadata: Record<string, unknown> = {};
      try {
        if (entry.metadata) metadata = JSON.parse(entry.metadata) as Record<string, unknown>;
      } catch { /* ignore */ }

      return {
        id:          entry.id,
        type:        entry.type,
        label:       ACTION_LABELS[entry.type] ?? entry.type,
        entityType:  entry.entity_type,
        entityId:    entry.entity_id,
        entityName:  entry.entity_name,
        detail:      entry.detail,
        metadata,
        createdAt:   entry.created_at,
        actor: actor
          ? { id: actor.id, name: actor.name, email: actor.email, avatarUrl: actor.avatar_url }
          : null,
      };
    });

    return NextResponse.json({ items, total, page, pages });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/activity]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
