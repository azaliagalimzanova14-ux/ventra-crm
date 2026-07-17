/**
 * GET  /api/clients — list clients (search, status, assigned, pagination)
 * POST /api/clients — create a new client
 *
 * GET  requires: clients.view
 * POST requires: clients.create
 */

import { NextRequest, NextResponse }             from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { listClients, createClient }             from "@/lib/server/db-clients";
import { logActivity }                           from "@/lib/server/db-activity";
import { trackEvent }                            from "@/lib/server/db-analytics";
import { completeOnboardingStep }                from "@/lib/server/db-onboarding";
import type { ClientStatus, ClientSource }       from "@/lib/server/models";

export const dynamic = "force-dynamic";

// ── GET /api/clients ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "clients.view");

    const url    = new URL(req.url);
    const search = url.searchParams.get("search")           ?? undefined;
    const status = url.searchParams.get("status")           ?? undefined;
    const assign = url.searchParams.get("assigned_user_id") ?? undefined;
    const limit  = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit")  ?? "50",  10) || 50));
    const offset = Math.max(0,                parseInt(url.searchParams.get("offset") ?? "0",   10) || 0);

    const { clients, total } = listClients({
      workspace_id:      auth.workspaceId,
      search,
      status:            status as ClientStatus | undefined,
      assigned_user_id:  assign,
      limit,
      offset,
    });

    return NextResponse.json({ clients, total, limit, offset });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[GET /api/clients]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/clients ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "clients.create");

    const body = await req.json() as {
      name?:             string;
      company?:          string;
      email?:            string;
      phone?:            string;
      position?:         string;
      source?:           ClientSource;
      status?:           ClientStatus;
      assigned_user_id?: string;
      notes?:            string;
      tags?:             string[];
    };

    const name = body.name?.trim() ?? "";
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const client = createClient({
      workspace_id:     auth.workspaceId,
      name,
      company:          body.company    || undefined,
      email:            body.email      || undefined,
      phone:            body.phone      || undefined,
      position:         body.position   || undefined,
      source:           body.source     || "manual",
      status:           body.status     || "lead",
      assigned_user_id: body.assigned_user_id || undefined,
      notes:            body.notes      || undefined,
      tags:             body.tags       || [],
    });

    logActivity({
      workspace_id: auth.workspaceId,
      user_id:      auth.userId,
      type:         "client_added",
      entity_type:  "client",
      entity_id:    client.id,
      entity_name:  client.name,
      detail:       `Created client "${client.name}"`,
    });

    try {
      trackEvent({ workspaceId: auth.workspaceId, userId: auth.userId, event: "client_created" });
      completeOnboardingStep(auth.workspaceId, "import_clients");
    } catch { /* non-fatal */ }

    return NextResponse.json({ client }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[POST /api/clients]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
