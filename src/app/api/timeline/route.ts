/**
 * GET /api/timeline
 *
 * Unified timeline: merges activity_log events (task, client, deal) with
 * conversation messages, sorted newest-first.
 *
 * Query params:
 *   limit  — default 50, max 100
 *   offset — default 0
 *   types  — comma-separated list of event types to include
 *             (messages, tasks, clients, deals, all)
 */

import { NextRequest, NextResponse }               from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { getDb }                                   from "@/lib/db";

export const dynamic = "force-dynamic";

export interface TimelineItem {
  id:          string;
  kind:        "message" | "activity";
  type:        string;
  title:       string;
  body:        string | null;
  actor_id:    string | null;
  entity_id:   string | null;
  entity_type: string | null;
  href:        string | null;
  created_at:  string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "activity.view");

    const url    = new URL(req.url);
    const limit  = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit")  ?? "50", 10) || 50));
    const offset = Math.max(0,              parseInt(url.searchParams.get("offset") ?? "0",   10) || 0);
    const types  = url.searchParams.get("types") ?? "all";

    const db = getDb();

    // ── Activity events ────────────────────────────────────────────────────────
    const activityTypeFilter: string[] = [];

    if (types === "all" || types.includes("tasks")) {
      activityTypeFilter.push("task_created", "task_completed", "task_updated", "task_assigned", "task_deleted");
    }
    if (types === "all" || types.includes("clients")) {
      activityTypeFilter.push("client_added", "client_updated", "client_deleted", "client_assigned");
    }
    if (types === "all" || types.includes("deals")) {
      activityTypeFilter.push("deal_created", "deal_stage_changed", "deal_won", "deal_lost");
    }

    const activityRows: TimelineItem[] = [];

    if (activityTypeFilter.length > 0) {
      const placeholders = activityTypeFilter.map(() => "?").join(",");
      const rows = db.prepare(`
        SELECT
          id,
          'activity'  AS kind,
          type,
          COALESCE(entity_name, type) AS title,
          detail      AS body,
          user_id     AS actor_id,
          entity_id,
          entity_type,
          CASE entity_type
            WHEN 'task'   THEN '/tasks'
            WHEN 'client' THEN '/clients/' || COALESCE(entity_id,'')
            WHEN 'deal'   THEN '/pipeline'
            ELSE NULL
          END         AS href,
          created_at
        FROM activity_log
        WHERE workspace_id = ?
          AND type IN (${placeholders})
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(auth.workspaceId, ...activityTypeFilter, limit, offset) as unknown as TimelineItem[];
      activityRows.push(...rows);
    }

    // ── Conversation messages ──────────────────────────────────────────────────
    const messageRows: TimelineItem[] = [];

    if (types === "all" || types.includes("messages")) {
      const rows = db.prepare(`
        SELECT
          m.id,
          'message'    AS kind,
          'message'    AS type,
          c.title      AS title,
          m.content    AS body,
          m.sender_id  AS actor_id,
          m.conversation_id AS entity_id,
          'conversation' AS entity_type,
          '/inbox?conv=' || m.conversation_id AS href,
          m.created_at
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE m.workspace_id = ?
        ORDER BY m.created_at DESC
        LIMIT ? OFFSET ?
      `).all(auth.workspaceId, limit, offset) as unknown as TimelineItem[];
      messageRows.push(...rows);
    }

    // ── Merge & sort ──────────────────────────────────────────────────────────
    const merged = [...activityRows, ...messageRows].sort(
      (a, b) => b.created_at.localeCompare(a.created_at),
    ).slice(0, limit);

    return NextResponse.json({ events: merged, total: merged.length, limit, offset });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/timeline]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
