/**
 * POST /api/clients/match
 *
 * Server-side client matching for inbox conversations.
 * Replaces the browser-side localStorage matchClient() approach.
 *
 * Body: { email?: string; name?: string; phone?: string }
 * Response: { clientId: string | null; confidence: number; method: string }
 *
 * Auth: any authenticated session.
 */

import { NextRequest, NextResponse }    from "next/server";
import { requireAuth, AuthError }       from "@/lib/server/auth-helpers";
import { listClients }                  from "@/lib/server/db-clients";
import { matchClient }                  from "@/lib/client-matcher";
import type { ClientMatchInput }        from "@/lib/client-matcher";
import type { Client }                  from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);

    const body = await req.json() as {
      email?:   string;
      name?:    string;
      phone?:   string;
      channel?: "email" | "telegram" | "whatsapp";
    };

    if (!body.email && !body.name && !body.phone) {
      return NextResponse.json({ clientId: null, confidence: 0, method: null });
    }

    // Fetch up to 200 clients from the DB (enough for most workspaces)
    const { clients: dbClients } = listClients({
      workspace_id: auth.workspaceId,
      limit: 200,
    });

    // Adapt DbClient → Client interface (subset needed by matchClient)
    const clients: Client[] = dbClients.map((c) => ({
      id:           c.id,
      name:         c.name,
      company:      c.company ?? "",
      email:        c.email ?? "",
      phone:        c.phone ?? "",
      avatar:       "",
      status:       (c.status === "active" ? "active" : "inactive") as Client["status"],
      totalValue:   0,
      projectCount: 0,
      location:     "",
      industry:     "",
      joinedAt:     c.created_at,
      lastContact:  c.updated_at,
      tags:         [],
    }));

    const input: ClientMatchInput = {
      channel:  body.channel ?? "email",
      name:     body.name    ?? "",
      email:    body.email   ?? undefined,
      phone:    body.phone   ?? undefined,
    };

    const result = matchClient(input, clients);

    return NextResponse.json({
      clientId:   result?.client.id   ?? null,
      confidence: result?.confidence  ?? 0,
      method:     result?.method      ?? null,
      tier:       result?.tier        ?? "none",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[POST /api/clients/match]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
