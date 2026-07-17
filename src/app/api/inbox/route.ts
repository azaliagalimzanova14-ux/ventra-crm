/**
 * GET /api/inbox
 *
 * Returns a workspace-scoped, paginated list of conversations.
 *
 * Query params:
 *   channel        — filter by channel ('telegram' | 'email' | 'whatsapp')
 *   status         — filter by status  ('open' | 'closed' | 'snoozed')
 *   assigned_to_me — '1' | 'true' → only conversations assigned to current user
 *   search         — text search on title or last_message_text
 *   limit          — default 30, max 100
 *   cursor         — keyset cursor (ISO string of last_message_at from previous page)
 *
 * Requires: authenticated session (any role).
 */

import { NextResponse }                              from "next/server";
import { requireAuth, AuthError }                    from "@/lib/server/auth-helpers";
import { listConversations, parseConversationMetadata } from "@/lib/server/db-conversations";
import type {
  ConversationChannel,
  ConversationStatus,
} from "@/lib/server/models";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const url  = new URL(request.url);

    const channel       = url.searchParams.get("channel") as ConversationChannel | null;
    const status        = url.searchParams.get("status")  as ConversationStatus  | null;
    const assignedToMe  = url.searchParams.get("assigned_to_me");
    const search        = url.searchParams.get("search")?.trim() || undefined;
    const cursor        = url.searchParams.get("cursor") || undefined;
    const limit         = Math.min(
      100,
      Math.max(1, parseInt(url.searchParams.get("limit") ?? "30", 10) || 30),
    );

    const VALID_CHANNELS: ConversationChannel[] = ["telegram", "email", "whatsapp"];
    const VALID_STATUSES:  ConversationStatus[]  = ["open", "closed", "snoozed"];

    const { conversations: rawConvs } = listConversations({
      workspace_id:     auth.workspaceId,
      channel:          channel && VALID_CHANNELS.includes(channel) ? channel : undefined,
      status:           status  && VALID_STATUSES.includes(status)   ? status  : undefined,
      assigned_user_id: (assignedToMe === "1" || assignedToMe === "true")
        ? auth.userId
        : undefined,
      search,
      limit: limit + 1,   // fetch one extra to detect hasMore
      cursor,
    });

    const hasMore = rawConvs.length > limit;
    const items   = hasMore ? rawConvs.slice(0, limit) : rawConvs;

    const nextCursor = hasMore && items.length > 0
      ? (items[items.length - 1]?.last_message_at ?? items[items.length - 1]?.created_at ?? null)
      : null;

    return NextResponse.json({
      conversations: items.map((c) => {
        const meta = parseConversationMetadata(c);
        return {
          id:              c.id,
          channel:         c.channel,
          title:           c.title,
          status:          c.status,
          clientId:        c.client_id,
          externalId:      c.external_id,
          assignedUserId:  c.assigned_user_id,
          lastMessageAt:   c.last_message_at,
          lastMessageText: c.last_message_text,
          createdAt:       c.created_at,
          isPersonal:      meta.personal === true,
          // Email-specific metadata for subject, from, provider
          metadata:        c.channel === "email" ? {
            subject:  meta.subject ?? null,
            from:     meta.from    ?? null,
            provider: meta.provider ?? null,
          } : undefined,
        };
      }),
      hasMore,
      nextCursor,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/inbox]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
