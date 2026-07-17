/**
 * POST /api/integrations/email/disconnect
 *
 * Revokes the Gmail OAuth token, deletes the email_accounts row,
 * and (optionally) removes all email conversations from the unified inbox.
 *
 * Body: { deleteConversations?: boolean }   — defaults to false
 *
 * Response: { ok: true }
 *
 * Requires: authenticated session + integrations.manage permission.
 */

import { NextRequest, NextResponse }     from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import {
  getEmailAccount,
  getDecryptedTokens,
  deleteEmailAccount,
}                                        from "@/lib/server/db-email";
import { GmailProvider }                 from "@/lib/gmail-provider";
import { getDb }                         from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "integrations.manage");

    const body = await req.json().catch(() => ({})) as { deleteConversations?: boolean };

    const account = getEmailAccount(auth.workspaceId, "gmail");
    if (!account) {
      return NextResponse.json({ error: "Gmail not connected" }, { status: 404 });
    }

    // Best-effort token revocation
    const provider = new GmailProvider();
    const tokens   = getDecryptedTokens(auth.workspaceId, "gmail");
    if (tokens) {
      await provider.revokeToken(tokens.accessToken).catch(() => {
        // Revocation failure is non-fatal — we still delete locally
      });
    }

    // Delete the account row (cascade-safe: no FK deps on email_accounts)
    deleteEmailAccount(auth.workspaceId, "gmail");

    // Optionally remove all email conversations for this workspace
    if (body.deleteConversations === true) {
      const db = getDb();
      // Delete messages first (no FK cascade in our schema)
      db.prepare(`
        DELETE FROM messages
        WHERE workspace_id = ? AND conversation_id IN (
          SELECT id FROM conversations WHERE workspace_id = ? AND channel = 'email'
        )
      `).run(auth.workspaceId, auth.workspaceId);

      db.prepare(`
        DELETE FROM conversations WHERE workspace_id = ? AND channel = 'email'
      `).run(auth.workspaceId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[Email disconnect]", err);
    return NextResponse.json({ error: "Disconnect failed" }, { status: 500 });
  }
}
