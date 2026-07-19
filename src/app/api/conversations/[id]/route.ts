/**
 * PATCH /api/conversations/[id]
 *
 * Update conversation fields. Currently supports:
 *  - client_id:        string | null  — link/unlink a CRM client
 *  - status:           "open" | "closed" | "snoozed"
 *  - assigned_user_id: string | null
 *  - title:            string
 *
 * Auth: any authenticated session in the workspace.
 * The conversation must belong to the authenticated workspace.
 */

import { NextRequest, NextResponse }  from "next/server";
import { requireAuth, AuthError }     from "@/lib/server/auth-helpers";
import { updateConversation }         from "@/lib/server/db-conversations";
import { refreshRhythm }             from "@/lib/server/rie/rhythm-engine";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    const { id } = await params;

    const body = await req.json().catch(() => ({})) as {
      client_id?:        string | null;
      status?:           string;
      assigned_user_id?: string | null;
      title?:            string;
    };

    // Validate status if provided
    if (body.status && !["open", "closed", "snoozed"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    const updated = updateConversation(id, auth.workspaceId, {
      client_id:        body.client_id        !== undefined ? (body.client_id ?? null)        : undefined,
      assigned_user_id: body.assigned_user_id !== undefined ? (body.assigned_user_id ?? null) : undefined,
      status:           body.status as "open" | "closed" | "snoozed" | undefined,
      title:            body.title,
    });

    // Refresh rhythm when a conversation is linked to a client —
    // all prior messages in this conversation now count toward the client's rhythm
    if (body.client_id) {
      try { refreshRhythm(auth.workspaceId, body.client_id); }
      catch (e) { console.error("[RIE] refreshRhythm after conversation link:", e); }
    }

    return NextResponse.json({ ok: true, conversation: updated });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[PATCH /api/conversations/[id]]", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
