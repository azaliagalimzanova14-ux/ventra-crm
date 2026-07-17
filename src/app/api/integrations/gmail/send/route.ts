/**
 * POST /api/integrations/gmail/send  [DEPRECATED]
 *
 * This route is superseded by POST /api/conversations/[id]/messages,
 * which handles email delivery as part of the unified conversation model.
 *
 * This stub remains for backward compatibility with any existing client code
 * that may still reference this path. It is auth-gated and returns a 410 Gone
 * to signal that callers must migrate to the unified messages route.
 *
 * Auth: requireAuth() — any authenticated session.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError }    from "@/lib/server/auth-helpers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Auth guard — was previously missing (security hole now fixed)
    await requireAuth(req);

    return NextResponse.json(
      {
        ok:    false,
        error: "This endpoint is deprecated. Use POST /api/conversations/{id}/messages to send email replies.",
        migration: "POST /api/conversations/[id]/messages",
      },
      { status: 410 },
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
