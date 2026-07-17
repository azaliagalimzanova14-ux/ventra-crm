/**
 * src/lib/mtproto-client.ts
 *
 * GramJS (MTProto) client singleton for the Personal Telegram Account feature.
 *
 * Lifecycle:
 *   1. Auth:   initPendingAuth → sendCode → verifyOtp → [verify2FA] → session saved
 *   2. Active: getOrRestoreClient() lazily restores from encrypted SQLite session
 *   3. Events: new messages are pushed to the existing Telegram SSE event bus
 *   4. Disconnect: session deleted from SQLite, client removed from globalThis
 *
 * NOTE: This file imports from 'telegram' (GramJS) which is Node.js-only.
 * It must NEVER be imported from client-side components or the Next.js Edge runtime.
 * Import only from App Router route handlers (src/app/api/...).
 *
 * Requires env vars:
 *   TELEGRAM_PERSONAL_API_ID    — integer application ID from my.telegram.org
 *   TELEGRAM_PERSONAL_API_HASH  — hex string application hash
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { TelegramClient }  from "telegram";
import { StringSession }   from "telegram/sessions";
import { Api }             from "telegram/tl";
import { NewMessage }      from "telegram/events";
import type { NewMessageEvent } from "telegram/events";
import { computeCheck }    from "telegram/Password";

import { savePersonalSession, getPersonalSession, deletePersonalSession, updateLastSync } from "./mtproto-db";
import { scoreDialog, toAvatarInitials, isBusinessLikely }                               from "./mtproto-business-filter";
import { publishPersonalEvent }                                                           from "./personal-event-bus";
import { addPersonalMessage, upsertPersonalDialog, getPersonalDialog }                   from "./mtproto-db";
import type { PersonalDialog, PersonalMessage }                                           from "./mtproto-types";
import { upsertConversation, touchConversation }                                          from "./server/db-conversations";
import { createMessage }                                                                  from "./server/db-messages";

// ── Globals ────────────────────────────────────────────────────────────────────

const ACTIVE_CLIENTS_KEY  = "__ventraMTProtoClients__";
const PENDING_AUTHS_KEY   = "__ventraMTProtoPendingAuths__";
const PENDING_AUTH_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface PendingAuth {
  client:        TelegramClient;
  phoneNumber:   string;
  phoneCodeHash: string;
  createdAt:     number;
  userId?:       string;  // workspace member who initiated auth
}

function getActiveClients(): Map<string, TelegramClient> {
  const g = globalThis as Record<string, unknown>;
  if (!(g[ACTIVE_CLIENTS_KEY] instanceof Map)) {
    g[ACTIVE_CLIENTS_KEY] = new Map<string, TelegramClient>();
  }
  return g[ACTIVE_CLIENTS_KEY] as Map<string, TelegramClient>;
}

function getPendingAuths(): Map<string, PendingAuth> {
  const g = globalThis as Record<string, unknown>;
  if (!(g[PENDING_AUTHS_KEY] instanceof Map)) {
    g[PENDING_AUTHS_KEY] = new Map<string, PendingAuth>();
  }
  return g[PENDING_AUTHS_KEY] as Map<string, PendingAuth>;
}

// ── Env ───────────────────────────────────────────────────────────────────────

function getApiCredentials(): { apiId: number; apiHash: string } | null {
  const rawId   = process.env.TELEGRAM_PERSONAL_API_ID;
  const apiHash = process.env.TELEGRAM_PERSONAL_API_HASH;
  if (!rawId || !apiHash) return null;
  const apiId = parseInt(rawId, 10);
  if (isNaN(apiId) || apiId <= 0) return null;
  return { apiId, apiHash };
}

export function hasApiCredentials(): boolean {
  return getApiCredentials() !== null;
}

// ── Client factory ─────────────────────────────────────────────────────────────

function createClient(sessionStr: string, apiId: number, apiHash: string): TelegramClient {
  // NOTE: do NOT pass a custom baseLogger — GramJS's Logger.getChild() interface
  // requires a recursive return type that our stub cannot satisfy, causing a
  // runtime crash on the first log call. The default GramJS logger is fine.
  return new TelegramClient(
    new StringSession(sessionStr),
    apiId,
    apiHash,
    { connectionRetries: 5 },
  );
}

// ── New message handler ────────────────────────────────────────────────────────

function attachNewMessageHandler(workspaceId: string, client: TelegramClient): void {
  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      const msg = event.message;
      if (!msg || typeof msg.id !== "number") return;

      // Resolve sender info
      const sender = await msg.getSender() as any;
      const isOut  = msg.out === true;

      const peerId = bigintStr(
        msg.peerId instanceof Api.PeerUser    ? msg.peerId.userId    :
        msg.peerId instanceof Api.PeerChat    ? msg.peerId.chatId    :
        msg.peerId instanceof Api.PeerChannel ? msg.peerId.channelId :
        BigInt(0),
      );

      if (peerId === "0") return;

      const fromName = resolveEntityName(sender);
      const dialogId = `${workspaceId}_${peerId}`;
      const msgId    = msg.id;

      const personalMsg: PersonalMessage = {
        id:          `${workspaceId}_${peerId}_${msgId}`,
        workspaceId,
        dialogId,
        msgId,
        fromId:      isOut ? undefined : bigintStr(sender?.id),
        fromName:    isOut ? "Me" : fromName,
        text:        msg.message ?? "",
        date:        new Date((msg.date ?? 0) * 1000).toISOString(),
        direction:   isOut ? "outbound" : "inbound",
        mediaType:   resolveMediaType(msg),
      };

      addPersonalMessage(personalMsg);

      // Bridge to unified inbox tables (best-effort — never drop the event)
      try {
        const dialog = getPersonalDialog(workspaceId, peerId);
        const title  = dialog?.title ?? fromName;
        const conv   = upsertConversation({
          workspace_id: workspaceId,
          channel:      "telegram",
          external_id:  peerId,
          title,
          metadata:     { personal: true, peer_id: peerId },
        });
        createMessage({
          workspace_id:    workspaceId,
          conversation_id: conv.id,
          sender_type:     personalMsg.direction === "inbound" ? "client" : "agent",
          content:         personalMsg.text,
          metadata:        { personal_msg_id: personalMsg.id, peer_id: peerId },
          created_at:      personalMsg.date,
        });
        touchConversation(conv.id, workspaceId, personalMsg.text, personalMsg.date);
      } catch { /* best-effort */ }

      // Publish to personal SSE bus so the UI updates in real time
      const dialog = getPersonalDialog(workspaceId, peerId);
      if (dialog) {
        publishPersonalEvent(workspaceId, {
          type:    "new_message",
          dialog,
          message: personalMsg,
        });
      }
    } catch (err) {
      console.error("[MTProto] new message handler error:", err);
    }
  }, new NewMessage({}));
}

// ── Auth flow ──────────────────────────────────────────────────────────────────

/**
 * Step 1 — Send SMS/Telegram code to the phone number.
 * Creates a pending auth entry with a 5-minute TTL.
 * userId (the authenticated workspace member) is stored so finalizeAuth can record who connected.
 */
export async function startAuth(workspaceId: string, phoneNumber: string, userId?: string): Promise<void> {
  const creds = getApiCredentials();
  if (!creds) throw new Error("TELEGRAM_PERSONAL_API_ID / TELEGRAM_PERSONAL_API_HASH not set");

  // Tear down any existing pending/active sessions BEFORE creating a new client
  // so we don't leave orphaned TCP connections on re-auth.
  const pending = getPendingAuths();
  const existingPending = pending.get(workspaceId);
  if (existingPending) {
    try { await existingPending.client.disconnect(); } catch { /* ignore */ }
    pending.delete(workspaceId);
  }
  const existingActive = getActiveClients().get(workspaceId);
  if (existingActive) {
    try { await existingActive.disconnect(); } catch { /* ignore */ }
    getActiveClients().delete(workspaceId);
  }

  const client = createClient("", creds.apiId, creds.apiHash);
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`Failed to connect to Telegram: ${err instanceof Error ? err.message : String(err)}`);
  }

  // sendCode returns a SentCode result; phoneCodeHash is the key field
  const { phoneCodeHash } = await client.sendCode(
    { apiId: creds.apiId, apiHash: creds.apiHash },
    phoneNumber,
  );

  pending.set(workspaceId, {
    client,
    phoneNumber,
    phoneCodeHash,
    createdAt: Date.now(),
    userId,
  });
}

/**
 * Step 2 — Verify OTP.
 * Returns { needs2FA: true } when the account has 2FA enabled.
 * On success, saves the session string to SQLite.
 */
export async function verifyOtp(
  workspaceId: string,
  otp: string,
): Promise<{ success: true } | { success: false; needs2FA: boolean; error?: string }> {
  const pending = getPendingAuths().get(workspaceId);
  if (!pending) return { success: false, needs2FA: false, error: "Auth session expired — please restart" };
  if (Date.now() - pending.createdAt > PENDING_AUTH_TTL_MS) {
    getPendingAuths().delete(workspaceId);
    return { success: false, needs2FA: false, error: "Auth session expired — please restart" };
  }

  const { client, phoneNumber, phoneCodeHash, userId } = pending;
  const creds = getApiCredentials()!;

  try {
    await client.invoke(new Api.auth.SignIn({
      phoneNumber,
      phoneCodeHash,
      phoneCode: otp,
    }));

    // Success — save session
    await finalizeAuth(workspaceId, client, phoneNumber, creds.apiId, userId);
    return { success: true };
  } catch (err: unknown) {
    const rpc = err as { errorMessage?: string };
    if (rpc.errorMessage === "SESSION_PASSWORD_NEEDED") {
      return { success: false, needs2FA: true };
    }
    const friendly = friendlyRpcError(rpc.errorMessage);
    return { success: false, needs2FA: false, error: friendly };
  }
}

/**
 * Step 3 — Verify 2FA password (only needed when verifyOtp returned needs2FA).
 * On success, saves the session string to SQLite.
 */
export async function verify2FA(workspaceId: string, password: string): Promise<void> {
  const pending = getPendingAuths().get(workspaceId);
  if (!pending) throw new Error("Auth session expired — please restart");

  const { client, phoneNumber, userId } = pending;
  const creds = getApiCredentials()!;

  try {
    const passwordInfo = await client.invoke(new Api.account.GetPassword());
    const check        = await computeCheck(passwordInfo, password);
    await client.invoke(new Api.auth.CheckPassword({ password: check }));
    await finalizeAuth(workspaceId, client, phoneNumber, creds.apiId, userId);
  } catch (err: unknown) {
    const rpc     = err as { errorMessage?: string };
    const message = friendlyRpcError(rpc.errorMessage);
    throw new Error(message);
  }
}

/** Save session, attach handler, move to active map. */
async function finalizeAuth(
  workspaceId: string,
  client: TelegramClient,
  phoneNumber: string,
  apiId: number,
  userId?: string,
): Promise<void> {
  const sessionStr = client.session.save() as unknown as string;
  savePersonalSession(workspaceId, phoneNumber, sessionStr, apiId, userId);
  attachNewMessageHandler(workspaceId, client);
  getActiveClients().set(workspaceId, client);
  getPendingAuths().delete(workspaceId);
}

// ── Active client ─────────────────────────────────────────────────────────────

/**
 * Returns a connected TelegramClient for the given workspace.
 * Lazily restores from the encrypted SQLite session on first call after restart.
 * Returns null if no session is stored.
 */
export async function getOrRestoreClient(workspaceId: string): Promise<TelegramClient | null> {
  const active = getActiveClients().get(workspaceId);
  if (active) {
    // connected is undefined when the client has never disconnected intentionally,
    // and false when it has. Treat anything other than explicit false as live.
    if ((active as any).connected !== false) return active;
    // Stale cached client — remove it and fall through to restore from session
    getActiveClients().delete(workspaceId);
  }

  const stored = getPersonalSession(workspaceId);
  if (!stored) return null;

  const creds = getApiCredentials();
  if (!creds) return null;

  const client = createClient(stored.sessionString, creds.apiId, creds.apiHash);
  try {
    await client.connect();
  } catch (err: unknown) {
    const rpc = err as { errorMessage?: string };
    const code = rpc.errorMessage ?? "";
    // Auto-clean expired/revoked sessions so status API reflects reality
    if (
      code === "AUTH_KEY_UNREGISTERED" ||
      code === "AUTH_KEY_INVALID"      ||
      code === "SESSION_REVOKED"       ||
      code === "SESSION_EXPIRED"       ||
      code === "USER_DEACTIVATED"      ||
      code === "USER_DEACTIVATED_BAN"
    ) {
      deletePersonalSession(workspaceId);
      getActiveClients().delete(workspaceId);
    }
    return null;
  }

  attachNewMessageHandler(workspaceId, client);
  getActiveClients().set(workspaceId, client);

  return client;
}

// ── Dialog scan ────────────────────────────────────────────────────────────────

/**
 * Fetch all dialogs and score them for business relevance.
 * Returns up to `limit` dialogs, sorted by most recent activity.
 */
export async function scanDialogs(
  workspaceId: string,
  limit = 150,
): Promise<{ dialogs: PersonalDialog[]; myId: string }> {
  const client = await getOrRestoreClient(workspaceId);
  if (!client) throw new Error("Not connected — please authenticate first");

  const me    = await client.getMe() as any;
  const myId  = bigintStr(me.id);

  const rawDialogs = await client.getDialogs({ limit });
  const result: PersonalDialog[] = [];

  for (const dialog of rawDialogs) {
    const entity = dialog.entity as any;
    if (!entity) continue;
    const className: string = entity.className ?? "";

    // Skip self (Saved Messages), empty/forbidden entities
    if (["UserEmpty", "ChatEmpty", "ChatForbidden", "ChannelForbidden"].includes(className)) continue;
    if (className === "User" && bigintStr(entity.id) === myId) continue;

    const peerId    = bigintStr(entity.id);
    const peerType  = resolvePeerType(className);
    const title     = (dialog.title as string) ?? resolveEntityName(entity) ?? "Unknown";
    const username  = entity.username ?? undefined;
    const phone     = (entity.phone as string | undefined) ?? undefined;
    const lastDate  = (dialog.date as number | undefined) ?? 0;

    // Use the top message already embedded in the dialog object.
    // Avoids N×getMessages API calls (which guaranteed FLOOD_WAIT at scale).
    const topMsgText = (dialog.message as any)?.message ?? "";
    const recentTexts: string[] = topMsgText ? [topMsgText] : [];

    const lastActivityDaysAgo = lastDate
      ? Math.floor((Date.now() / 1000 - lastDate) / 86400)
      : 999;

    const bs = scoreDialog({
      title,
      peerType,
      username,
      phone:               !!phone,
      recentMessages:      recentTexts,
      unreadCount:         dialog.unreadCount ?? 0,
      lastActivityDaysAgo,
    });

    const dialogId = `${workspaceId}_${peerId}`;

    result.push({
      id:             dialogId,
      workspaceId,
      peerId,
      peerType,
      title,
      username,
      phone,
      isBusiness:     isBusinessLikely(bs),
      bizScore:       bs.score,
      bizReasons:     bs.reasons,
      unreadCount:    dialog.unreadCount ?? 0,
      lastMsgAt:      lastDate ? new Date(lastDate * 1000).toISOString() : new Date().toISOString(),
      importedAt:     new Date().toISOString(),
      avatarInitials: toAvatarInitials(title),
      preview:        recentTexts[0]?.slice(0, 80) ?? "",
    });
  }

  // Sort by recency
  result.sort((a, b) => new Date(b.lastMsgAt).getTime() - new Date(a.lastMsgAt).getTime());

  return { dialogs: result, myId };
}

// ── Import ─────────────────────────────────────────────────────────────────────

/**
 * Import selected dialogs (by peerId) into SQLite.
 * Fetches up to `historyLimit` messages per dialog.
 */
export async function importDialogs(
  workspaceId: string,
  peerIds: string[],
  historyLimit = 50,
  clientLinks: { peerId: string; clientId: string }[] = [],
): Promise<{ conversationsImported: number; messagesImported: number }> {
  const client = await getOrRestoreClient(workspaceId);
  if (!client) throw new Error("Not connected");

  const me    = await client.getMe() as any;
  const myId  = bigintStr(me.id);

  const rawDialogs = await client.getDialogs({ limit: 300 });
  const dialogMap  = new Map<string, any>();
  for (const d of rawDialogs) {
    const entity = d.entity as any;
    if (entity) dialogMap.set(bigintStr(entity.id), d);
  }

  let conversationsImported = 0;
  let messagesImported      = 0;

  for (const peerId of peerIds) {
    const dialog = dialogMap.get(peerId);
    if (!dialog) continue;

    const entity   = dialog.entity as any;
    const title    = (dialog.title as string) ?? resolveEntityName(entity) ?? "Unknown";
    const username = entity.username ?? undefined;
    const phone    = (entity.phone as string | undefined) ?? undefined;
    const lastDate = (dialog.date as number | undefined) ?? 0;
    const peerType = resolvePeerType(entity.className ?? "");

    const bs = scoreDialog({
      title,
      peerType,
      username,
      phone:               !!phone,
      recentMessages:      [],
      unreadCount:         dialog.unreadCount ?? 0,
      lastActivityDaysAgo: lastDate
        ? Math.floor((Date.now() / 1000 - lastDate) / 86400)
        : 999,
    });

    const link      = clientLinks.find((l) => l.peerId === peerId);
    const dialogId  = `${workspaceId}_${peerId}`;

    const lastMsgAt = lastDate ? new Date(lastDate * 1000).toISOString() : new Date().toISOString();

    // Save/update the dialog record
    upsertPersonalDialog({
      id:          dialogId,
      workspaceId,
      peerId,
      peerType,
      title,
      username,
      phone,
      isBusiness:  isBusinessLikely(bs),
      bizScore:    bs.score,
      bizReasons:  bs.reasons,
      unreadCount: dialog.unreadCount ?? 0,
      lastMsgAt,
      clientId:    link?.clientId,
      importedAt:  new Date().toISOString(),
    });
    conversationsImported++;

    // Bridge to unified conversations table (best-effort)
    let unifiedConvId: string | null = null;
    try {
      const conv = upsertConversation({
        workspace_id: workspaceId,
        channel:      "telegram",
        external_id:  peerId,
        title,
        client_id:    link?.clientId,
        metadata:     { personal: true, peer_id: peerId },
      });
      touchConversation(conv.id, workspaceId, "", lastMsgAt);
      unifiedConvId = conv.id;
    } catch { /* best-effort */ }

    // Fetch message history
    try {
      const msgs = await client.getMessages(dialog.inputEntity, { limit: historyLimit });
      for (const msg of msgs as any[]) {
        if (!msg.id) continue;
        const isOut   = msg.out === true;
        const fromId  = isOut ? myId : bigintStr(msg.fromId?.userId ?? msg.fromId?.channelId ?? 0);
        const fromEnt = isOut ? me : await msg.getSender() as any;
        const fromName = isOut ? "Me" : resolveEntityName(fromEnt);
        const msgDate  = new Date((msg.date ?? 0) * 1000).toISOString();
        const msgText  = (msg.message ?? "") as string;

        const added = addPersonalMessage({
          workspaceId,
          dialogId,
          msgId:       msg.id as number,
          fromId:      fromId !== "0" ? fromId : undefined,
          fromName,
          text:        msgText,
          date:        msgDate,
          direction:   isOut ? "outbound" : "inbound",
          mediaType:   resolveMediaType(msg),
        });
        if (added) messagesImported++;

        // Mirror into unified messages (best-effort, skip duplicates via INSERT OR IGNORE)
        if (unifiedConvId && added) {
          try {
            createMessage({
              workspace_id:    workspaceId,
              conversation_id: unifiedConvId,
              sender_type:     isOut ? "agent" : "client",
              content:         msgText,
              metadata:        { personal_msg_id: `${dialogId}_${msg.id as number}`, peer_id: peerId },
              created_at:      msgDate,
            });
          } catch { /* best-effort */ }
        }
      }
    } catch (err) {
      console.error(`[MTProto] Failed to fetch history for peer ${peerId}:`, err);
    }
  }

  updateLastSync(workspaceId);

  return { conversationsImported, messagesImported };
}

// ── Send message ──────────────────────────────────────────────────────────────

export async function sendPersonalMessage(
  workspaceId: string,
  peerId: string,
  text: string,
): Promise<number> {
  const client = await getOrRestoreClient(workspaceId);
  if (!client) throw new Error("Not connected");

  // Resolve input peer
  const entity = await client.getEntity(BigInt(peerId)) as any;
  const result = await client.sendMessage(entity, { message: text }) as any;
  const msgId  = result.id as number;

  // Persist outbound message
  const dialogId = `${workspaceId}_${peerId}`;
  const me       = await client.getMe() as any;
  const sentAt   = new Date().toISOString();

  addPersonalMessage({
    workspaceId,
    dialogId,
    msgId,
    fromId:    bigintStr(me.id),
    fromName:  "Me",
    text,
    date:      sentAt,
    direction: "outbound",
  });

  // Bridge outbound to unified messages (best-effort)
  try {
    const dialog = getPersonalDialog(workspaceId, peerId);
    const conv   = upsertConversation({
      workspace_id: workspaceId,
      channel:      "telegram",
      external_id:  peerId,
      title:        dialog?.title ?? "Unknown",
      metadata:     { personal: true, peer_id: peerId },
    });
    createMessage({
      workspace_id:    workspaceId,
      conversation_id: conv.id,
      sender_type:     "agent",
      content:         text,
      metadata:        { personal_msg_id: `${dialogId}_${msgId}`, peer_id: peerId },
      created_at:      sentAt,
    });
    touchConversation(conv.id, workspaceId, text, sentAt);
  } catch { /* best-effort */ }

  return msgId;
}

// ── Disconnect ────────────────────────────────────────────────────────────────

export async function disconnectPersonal(workspaceId: string): Promise<void> {
  const active = getActiveClients().get(workspaceId);
  if (active) {
    try { await active.disconnect(); } catch { /* ignore */ }
    getActiveClients().delete(workspaceId);
  }

  const pending = getPendingAuths().get(workspaceId);
  if (pending) {
    try { await pending.client.disconnect(); } catch { /* ignore */ }
    getPendingAuths().delete(workspaceId);
  }

  deletePersonalSession(workspaceId);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Convert a BigInt (or number) peer ID to a decimal string. */
function bigintStr(id: bigint | number | undefined | null): string {
  if (id == null) return "0";
  return String(id);
}

function resolvePeerType(className: string): "user" | "chat" | "channel" {
  if (className === "User") return "user";
  if (className === "Channel") return "channel";
  return "chat";
}

function resolveEntityName(entity: any): string {
  if (!entity) return "Unknown";
  if (entity.title)     return String(entity.title);
  if (entity.firstName) return [entity.firstName, entity.lastName].filter(Boolean).join(" ");
  if (entity.username)  return `@${entity.username}`;
  return "Unknown";
}

function resolveMediaType(msg: any): PersonalMessage["mediaType"] {
  if (!msg.media) return undefined;
  const cls: string = msg.media?.className ?? "";
  if (cls === "MessageMediaPhoto")    return "photo";
  if (cls === "MessageMediaDocument") return "document";
  return undefined;
}

function friendlyRpcError(errorMessage: string | undefined): string {
  if (!errorMessage) return "Unknown error from Telegram.";
  // FLOOD_WAIT errors carry the wait duration: FLOOD_WAIT_300
  if (errorMessage.startsWith("FLOOD_WAIT")) {
    const secs = parseInt(errorMessage.replace(/^FLOOD_WAIT_?/, ""), 10);
    const mins = isNaN(secs) ? 0 : Math.ceil(secs / 60);
    return mins > 0
      ? `Too many attempts — please wait ${mins} minute${mins !== 1 ? "s" : ""} and retry.`
      : "Too many attempts — please wait a few minutes and retry.";
  }
  switch (errorMessage) {
    case "PHONE_CODE_INVALID":        return "Incorrect code — please try again.";
    case "PHONE_CODE_EXPIRED":        return "Code expired — please restart authentication.";
    case "PHONE_NUMBER_INVALID":      return "Invalid phone number format.";
    case "PHONE_NUMBER_BANNED":       return "This phone number is banned by Telegram.";
    case "PASSWORD_HASH_INVALID":     return "Incorrect 2FA password.";
    case "AUTH_KEY_UNREGISTERED":     return "Session expired — please reconnect your account.";
    case "AUTH_KEY_INVALID":          return "Session invalid — please reconnect your account.";
    case "USER_DEACTIVATED":          return "This Telegram account has been deactivated.";
    case "USER_DEACTIVATED_BAN":      return "This Telegram account has been suspended.";
    case "PHONE_NUMBER_UNOCCUPIED":   return "No Telegram account found for this number.";
    case "PHONE_CODE_HASH_EMPTY":     return "Verification failed — please restart authentication.";
    case "SESSION_REVOKED":           return "Your session was revoked from another device.";
    case "SESSION_EXPIRED":           return "Your session has expired — please reconnect.";
    case "API_ID_INVALID":            return "Server configuration error — contact support.";
    default: return `Telegram error: ${errorMessage}`;
  }
}
