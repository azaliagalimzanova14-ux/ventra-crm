/**
 * POST /api/integrations/telegram-personal/auth/verify
 *
 * Verifies the OTP code sent by Telegram.
 * Body: { otp: string }
 *
 * Requires: authenticated session + integrations.manage permission.
 * workspaceId is taken from the authenticated session.
 */

import { NextRequest, NextResponse }      from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { verifyOtp }                      from "@/lib/mtproto-client";
import type { AuthVerifyResponse }        from "@/lib/mtproto-types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "integrations.manage");

    let body: { otp?: string };
    try {
      body = await req.json() as { otp?: string };
    } catch {
      return NextResponse.json<AuthVerifyResponse>({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const { otp } = body;
    if (!otp || typeof otp !== "string") {
      return NextResponse.json<AuthVerifyResponse>({ ok: false, error: "otp is required" }, { status: 400 });
    }

    const result = await verifyOtp(auth.workspaceId, otp.trim());
    if (result.success) {
      return NextResponse.json<AuthVerifyResponse>({ ok: true });
    }
    return NextResponse.json<AuthVerifyResponse>({
      ok:       false,
      needs2FA: result.needs2FA,
      error:    result.error,
    }, { status: result.needs2FA ? 200 : 400 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json<AuthVerifyResponse>({ ok: false, error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json<AuthVerifyResponse>({ ok: false, error: msg }, { status: 500 });
  }
}
