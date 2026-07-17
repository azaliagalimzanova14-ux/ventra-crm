/**
 * GET /api/integrations/email/attachment/[msgId]/[attachId]
 *
 * Proxy that fetches a Gmail attachment's bytes and streams them to the browser.
 * This keeps the OAuth access_token server-side — clients never see it.
 *
 * Path params:
 *  msgId    — Gmail message ID that owns the attachment
 *  attachId — Gmail attachment ID (from EmailAttachment.attachmentId)
 *
 * Response:
 *  The raw attachment bytes with Content-Type and Content-Disposition headers.
 *
 * Auth: any authenticated session in the same workspace.
 */

import { NextRequest, NextResponse }    from "next/server";
import { requireAuth, AuthError }       from "@/lib/server/auth-helpers";
import { getFreshToken }                from "@/lib/server/email-sync-engine";

export const dynamic = "force-dynamic";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ msgId: string; attachId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    const { msgId, attachId } = await params;

    if (!msgId || !attachId) {
      return NextResponse.json({ error: "Missing msgId or attachId" }, { status: 400 });
    }

    // Get (or refresh) the workspace's Gmail access token
    const tokenResult = await getFreshToken(auth.workspaceId);
    if ("error" in tokenResult) {
      return NextResponse.json({ error: tokenResult.error }, { status: 401 });
    }

    // Fetch the attachment from Gmail
    const gmailRes = await fetch(
      `${GMAIL_BASE}/messages/${encodeURIComponent(msgId)}/attachments/${encodeURIComponent(attachId)}`,
      { headers: { Authorization: `Bearer ${tokenResult.accessToken}` } },
    );

    if (!gmailRes.ok) {
      const errText = await gmailRes.text();
      console.error("[Email attachment proxy] Gmail error:", gmailRes.status, errText);
      return NextResponse.json(
        { error: `Gmail attachment fetch failed: ${gmailRes.status}` },
        { status: gmailRes.status >= 400 && gmailRes.status < 500 ? gmailRes.status : 502 },
      );
    }

    // Gmail returns { size, data } where data is base64url-encoded
    const body = await gmailRes.json() as { size?: number; data?: string };
    if (!body.data) {
      return NextResponse.json({ error: "Empty attachment data" }, { status: 502 });
    }

    // Decode base64url → Buffer
    const base64 = body.data.replace(/-/g, "+").replace(/_/g, "/");
    const bytes  = Buffer.from(base64, "base64");

    // Derive filename + content-type from query params (set by the UI when linking)
    const url         = new URL(req.url);
    const filename    = url.searchParams.get("filename") ?? "attachment";
    const contentType = url.searchParams.get("type")     ?? "application/octet-stream";

    // Stream bytes to the client
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type":        contentType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
        "Content-Length":      String(bytes.length),
        // Attachments are user-specific — don't cache at CDN level
        "Cache-Control":       "private, max-age=300",
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[Email attachment proxy]", err);
    return NextResponse.json({ error: "Attachment fetch failed" }, { status: 500 });
  }
}
