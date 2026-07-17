/**
 * POST /api/integrations/telegram-personal/auth/start
 *
 * Initiates MTProto authentication by sending an OTP to the provided phone number.
 * Body: { phoneNumber: string }
 *
 * Requires: authenticated session + integrations.manage permission.
 * workspaceId is always taken from the authenticated session — never from the body.
 */

import { NextRequest, NextResponse }      from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { startAuth, hasApiCredentials }   from "@/lib/mtproto-client";
import type { AuthStartResponse }         from "@/lib/mtproto-types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "integrations.manage");

    if (!hasApiCredentials()) {
      return NextResponse.json<AuthStartResponse>(
        { ok: false, missingEnv: true, error: "TELEGRAM_PERSONAL_API_ID / TELEGRAM_PERSONAL_API_HASH not set" },
        { status: 503 },
      );
    }

    let body: { phoneNumber?: string };
    try {
      body = await req.json() as { phoneNumber?: string };
    } catch {
      return NextResponse.json<AuthStartResponse>({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const { phoneNumber } = body;
    if (!phoneNumber || typeof phoneNumber !== "string" || !phoneNumber.trim()) {
      return NextResponse.json<AuthStartResponse>({ ok: false, error: "phoneNumber is required" }, { status: 400 });
    }

    await startAuth(auth.workspaceId, phoneNumber.trim(), auth.userId);
    return NextResponse.json<AuthStartResponse>({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json<AuthStartResponse>({ ok: false, error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json<AuthStartResponse>({ ok: false, error: msg }, { status: 500 });
  }
}
