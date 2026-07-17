/**
 * POST /api/integrations/telegram-personal/send
 *
 * Sends a message via the personal Telegram account (MTProto).
 * Body: { peerId: string, text: string }
 *
 * Requires: authenticated session.
 * workspaceId is taken from the authenticated session.
 */

import { NextRequest, NextResponse }    from "next/server";
import { requireAuth, AuthError }       from "@/lib/server/auth-helpers";
import { sendPersonalMessage }          from "@/lib/mtproto-client";
import type { SendResponse }            from "@/lib/mtproto-types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);

    let body: { peerId?: string; text?: string };
    try {
      body = await req.json() as { peerId?: string; text?: string };
    } catch {
      return NextResponse.json<SendResponse>({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const { peerId, text } = body;
    if (!peerId || typeof peerId !== "string") {
      return NextResponse.json<SendResponse>({ ok: false, error: "peerId is required" }, { status: 400 });
    }
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json<SendResponse>({ ok: false, error: "text is required" }, { status: 400 });
    }

    const msgId = await sendPersonalMessage(auth.workspaceId, peerId, text.trim());
    return NextResponse.json<SendResponse>({ ok: true, msgId });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json<SendResponse>({ ok: false, error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json<SendResponse>({ ok: false, error: msg }, { status: 500 });
  }
}
