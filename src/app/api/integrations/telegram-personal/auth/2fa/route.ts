/**
 * POST /api/integrations/telegram-personal/auth/2fa
 *
 * Submits the 2FA cloud password.
 * Body: { password: string }
 *
 * Requires: authenticated session + integrations.manage permission.
 * workspaceId is taken from the authenticated session.
 */

import { NextRequest, NextResponse }      from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { verify2FA }                      from "@/lib/mtproto-client";
import type { Auth2FAResponse }           from "@/lib/mtproto-types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "integrations.manage");

    let body: { password?: string };
    try {
      body = await req.json() as { password?: string };
    } catch {
      return NextResponse.json<Auth2FAResponse>({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const { password } = body;
    if (!password || typeof password !== "string") {
      return NextResponse.json<Auth2FAResponse>({ ok: false, error: "password is required" }, { status: 400 });
    }

    await verify2FA(auth.workspaceId, password);
    return NextResponse.json<Auth2FAResponse>({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json<Auth2FAResponse>({ ok: false, error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json<Auth2FAResponse>({ ok: false, error: msg }, { status: 400 });
  }
}
