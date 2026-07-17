/**
 * GET    /api/clients/[id] — get client with contacts, tags, conversations
 * PATCH  /api/clients/[id] — update client fields
 * DELETE /api/clients/[id] — delete client (hard delete)
 *
 * GET    requires: clients.view
 * PATCH  requires: clients.edit (or clients.assign for assigned_user_id only)
 * DELETE requires: clients.delete
 */

import { NextRequest, NextResponse }             from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import {
  getClientFull,
  getClient,
  updateClient,
  deleteClient,
  getClientContacts,
  getClientTagValues,
  replaceClientTags,
}                                                from "@/lib/server/db-clients";
import { listConversations }                     from "@/lib/server/db-conversations";
import { logActivity }                           from "@/lib/server/db-activity";
import type { ClientStatus, ClientSource }       from "@/lib/server/models";

export const dynamic = "force-dynamic";

// ── GET /api/clients/[id] ─────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth    = await requireAuth(req);
    assertPermission(auth, "clients.view");
    const { id }  = await params;

    const client  = getClientFull(id, auth.workspaceId);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Load recent conversations linked to this client
    const { conversations } = listConversations({
      workspace_id: auth.workspaceId,
      client_id:    id,
      limit:        20,
    });

    return NextResponse.json({
      client,
      conversations: conversations.map((c) => ({
        id:             c.id,
        channel:        c.channel,
        title:          c.title,
        status:         c.status,
        lastMessageAt:  c.last_message_at,
        lastMessageText: c.last_message_text,
        createdAt:      c.created_at,
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/clients/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PATCH /api/clients/[id] ───────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth   = await requireAuth(req);
    const { id } = await params;

    const existing = getClient(id, auth.workspaceId);
    if (!existing) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const body = await req.json() as {
      name?:             string;
      company?:          string | null;
      email?:            string | null;
      phone?:            string | null;
      position?:         string | null;
      source?:           ClientSource | null;
      status?:           ClientStatus;
      assigned_user_id?: string | null;
      notes?:            string | null;
      tags?:             string[];
    };

    // Determine required permission
    // If patching only assigned_user_id, clients.assign is sufficient
    const isAssignOnly =
      Object.keys(body).length === 1 && "assigned_user_id" in body;

    if (isAssignOnly) {
      assertPermission(auth, "clients.assign");
    } else {
      assertPermission(auth, "clients.edit");
    }

    const updated = updateClient(id, auth.workspaceId, {
      name:             body.name,
      company:          body.company,
      email:            body.email,
      phone:            body.phone,
      position:         body.position,
      source:           body.source,
      status:           body.status,
      assigned_user_id: body.assigned_user_id,
      notes:            body.notes,
    });

    // Replace tags if provided
    if (body.tags !== undefined) {
      replaceClientTags(id, auth.workspaceId, body.tags);
    }

    // Log the activity
    if (isAssignOnly) {
      logActivity({
        workspace_id: auth.workspaceId,
        user_id:      auth.userId,
        type:         "client_assigned",
        entity_type:  "client",
        entity_id:    id,
        entity_name:  existing.name,
        detail:       `Assigned client "${existing.name}"`,
        metadata:     { assigned_user_id: body.assigned_user_id ?? null },
      });
    } else {
      logActivity({
        workspace_id: auth.workspaceId,
        user_id:      auth.userId,
        type:         "client_updated",
        entity_type:  "client",
        entity_id:    id,
        entity_name:  updated.name,
        detail:       `Updated client "${updated.name}"`,
      });
    }

    const contacts = getClientContacts(id, auth.workspaceId);
    const tags     = getClientTagValues(id, auth.workspaceId);

    return NextResponse.json({ client: { ...updated, contacts, tags } });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[PATCH /api/clients/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── DELETE /api/clients/[id] ──────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth   = await requireAuth(req);
    assertPermission(auth, "clients.delete");
    const { id } = await params;

    const existing = getClient(id, auth.workspaceId);
    if (!existing) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    deleteClient(id, auth.workspaceId);

    logActivity({
      workspace_id: auth.workspaceId,
      user_id:      auth.userId,
      type:         "client_deleted",
      entity_type:  "client",
      entity_id:    id,
      entity_name:  existing.name,
      detail:       `Deleted client "${existing.name}"`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[DELETE /api/clients/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
