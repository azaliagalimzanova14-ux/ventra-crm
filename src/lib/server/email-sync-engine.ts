/**
 * src/lib/server/email-sync-engine.ts
 *
 * Shared sync logic for Gmail threads → unified inbox.
 * Called by:
 *   - OAuth callback (initial sync)
 *   - POST /api/integrations/email/sync (manual / periodic)
 *
 * Handles:
 *   - Token auto-refresh
 *   - Message dedup via gmail_msg_id in metadata
 *   - Attachment metadata extraction (per-message)
 *   - Thread-to-conversation upsert
 *   - last_sync_at update
 */

import {
  getEmailAccount,
  getDecryptedTokens,
  updateEmailTokens,
  touchEmailSync,
  isTokenExpired,
}                                        from "./db-email";
import { GmailProvider }                 from "../gmail-provider";
import { upsertConversation, touchConversation } from "./db-conversations";
import { createMessage, listMessages }   from "./db-messages";
import type { DbMessage }                from "./models";

export interface SyncResult {
  threadsImported:  number;
  messagesImported: number;
  error?:           string;
}

export interface SyncOptions {
  maxResults?:       number;   // default 50
  sinceDate?:        string;   // ISO — only sync threads newer than this
  /** If set, update client_id on conversations that match */
  clientLinkMap?:    Map<string, string>; // fromEmail → clientId
}

/**
 * Get a fresh, valid access token — refreshing if expired.
 * Returns null + error message on failure.
 */
export async function getFreshToken(
  workspaceId: string,
): Promise<{ accessToken: string; error?: never } | { accessToken?: never; error: string }> {
  const account = getEmailAccount(workspaceId, "gmail");
  if (!account) return { error: "Gmail not connected" };

  const tokens = getDecryptedTokens(workspaceId, "gmail");
  if (!tokens) return { error: "Failed to decrypt tokens" };

  if (!isTokenExpired(account)) {
    return { accessToken: tokens.accessToken };
  }

  if (!tokens.refreshToken) {
    return { error: "Token expired and no refresh token available — please reconnect Gmail" };
  }

  try {
    const provider = new GmailProvider();
    const fresh    = await provider.refreshTokens(tokens.refreshToken);
    updateEmailTokens(
      workspaceId,
      "gmail",
      fresh.accessToken,
      fresh.refreshToken,
      fresh.expiresAt,
    );
    return { accessToken: fresh.accessToken };
  } catch {
    return { error: "Token refresh failed — please reconnect Gmail" };
  }
}

/**
 * Core sync: fetch Gmail threads, upsert conversations + messages.
 * Returns import counts and any error message.
 */
export async function syncEmailThreads(
  workspaceId: string,
  opts:        SyncOptions = {},
): Promise<SyncResult> {
  const tokenResult = await getFreshToken(workspaceId);
  if (tokenResult.error) {
    return { threadsImported: 0, messagesImported: 0, error: tokenResult.error };
  }

  const provider   = new GmailProvider();
  const maxResults = Math.min(opts.maxResults ?? 50, 200);

  let threads;
  try {
    threads = await provider.syncThreads(tokenResult.accessToken!, {
      maxResults,
      sinceDate: opts.sinceDate,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gmail fetch failed";
    return { threadsImported: 0, messagesImported: 0, error: msg };
  }

  let threadsImported  = 0;
  let messagesImported = 0;

  for (const thread of threads) {
    // Resolve client_id if a match was pre-computed
    const clientId = opts.clientLinkMap?.get(thread.fromEmail.toLowerCase());

    // Upsert conversation — also updates metadata + client_id on existing rows
    const conv = upsertConversation({
      workspace_id: workspaceId,
      channel:      "email",
      external_id:  thread.id,
      title:        thread.fromName || thread.fromEmail || thread.subject,
      client_id:    clientId,
      metadata:     {
        subject:  thread.subject,
        from:     thread.fromEmail,
        provider: "gmail",
      },
    });

    // Collect existing gmail_msg_ids to skip duplicates
    const existingMsgs: DbMessage[] = listMessages({
      workspace_id:    workspaceId,
      conversation_id: conv.id,
      limit:           1000,
    });
    const existingGmailIds = new Set<string>();
    for (const m of existingMsgs) {
      try {
        const meta = JSON.parse(m.metadata ?? "{}") as { gmail_msg_id?: string };
        if (meta.gmail_msg_id) existingGmailIds.add(meta.gmail_msg_id);
      } catch { /* skip */ }
    }

    let newMessages = 0;
    for (const msg of thread.messages) {
      if (existingGmailIds.has(msg.id)) continue;

      createMessage({
        workspace_id:    workspaceId,
        conversation_id: conv.id,
        sender_type:     msg.isOutbound ? "agent" : "client",
        content:         msg.body || msg.subject,
        // Attachment metadata stored in the attachments column
        attachments:     msg.attachments?.map((a) => ({
          kind:         a.kind,
          name:         a.filename,
          mimeType:     a.mimeType,
          sizeBytes:    a.size,
          gmailMsgId:   msg.id,
          attachmentId: a.attachmentId,
        })) ?? [],
        metadata: {
          gmail_msg_id: msg.id,
          subject:      msg.subject,
          from:         msg.fromEmail,
          to:           msg.toEmail,
          message_id:   msg.messageId,
          references:   msg.references,
        },
        created_at: msg.date,
      });
      newMessages++;
      messagesImported++;
    }

    if (newMessages > 0) {
      const lastNew = [...thread.messages]
        .filter((m) => !existingGmailIds.has(m.id))
        .pop();
      if (lastNew) {
        touchConversation(
          conv.id,
          workspaceId,
          lastNew.body.slice(0, 200) || lastNew.subject,
          thread.lastDate,
        );
      }
      threadsImported++;
    }
  }

  touchEmailSync(workspaceId, "gmail");
  return { threadsImported, messagesImported };
}
