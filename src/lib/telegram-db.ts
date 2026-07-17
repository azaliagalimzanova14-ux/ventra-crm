/**
 * src/lib/telegram-db.ts
 *
 * SQLite-backed data layer for the Telegram integration.
 * Replaces the in-memory global singletons in telegram-store.ts.
 *
 * All functions accept an optional workspaceId (default: "default").
 * This enables multi-workspace deployments where each workspace has its own bot.
 *
 * Bot tokens are stored AES-256-GCM encrypted via crypto-token.ts.
 * The raw token is never returned to callers — use getBotToken() server-side only.
 */

import type { TelegramInboxMessage, TelegramConversation } from "./telegram-types";
import { getDb } from "./db";
import { encryptToken, decryptToken } from "./crypto-token";
import { generateWebhookSecret, maskToken } from "./integrations";

const DEFAULT_WS            = "default";
const MAX_MESSAGES_TOTAL    = 500;
const MAX_MESSAGES_PER_CONV = 50;

// ── Internal DB row shapes ────────────────────────────────────────────────────

interface BotRow {
  id:             string;
  workspace_id:   string;
  bot_username:   string;
  bot_name:       string;
  bot_id_str:     string;
  token_enc:      string;
  webhook_secret: string;
  webhook_url:    string;
  status:         string;
  connected_at:   string;
}

interface ConvRow {
  id:                 string;
  workspace_id:       string;
  chat_id:            number;
  chat_type:          string;
  sender_name:        string;
  sender_username:    string | null;
  sender_telegram_id: number;
  first_message_at:   string;
  last_message_at:    string;
  message_count:      number;
}

interface MsgRow {
  id:                 string;
  workspace_id:       string;
  conversation_id:    string;
  update_id:          number | null;
  chat_id:            number;
  chat_type:          string;
  sender_name:        string;
  sender_username:    string | null;
  sender_telegram_id: number;
  text:               string;
  direction:          string;
  is_simulated:       number;
  attachment_json:    string | null;
  received_at:        string;
}

// ── Bot public info (never includes raw token) ────────────────────────────────

export interface BotConfig {
  id:            string;
  workspaceId:   string;
  botUsername:   string;
  botName:       string;
  botId:         string;
  webhookSecret: string;
  webhookUrl:    string;
  status:        string;
  connectedAt:   string;
  tokenMasked:   string;
}

// ── Bot management ────────────────────────────────────────────────────────────

export interface SaveBotParams {
  workspaceId?:   string;
  botUsername:    string;
  botName?:       string;
  botId?:         string;
  token:          string;
  webhookSecret?: string;
}

/**
 * Save (or update) a bot configuration for the given workspace.
 * Generates a fresh webhook secret unless one is explicitly provided.
 */
export function saveBot(params: SaveBotParams): BotConfig {
  const db     = getDb();
  const wsId   = params.workspaceId ?? DEFAULT_WS;
  const id     = `tg_${wsId}_${Date.now()}`;
  const now    = new Date().toISOString();
  const secret = params.webhookSecret ?? generateWebhookSecret();
  const enc    = encryptToken(params.token);

  // Ensure the workspace row exists before inserting the bot.
  // tg_bots.workspace_id has a FK reference to workspaces(id), so trying to
  // save a bot for a workspace that doesn't exist yet would throw a constraint
  // violation. INSERT OR IGNORE is safe — it leaves existing workspace rows untouched.
  db.prepare(
    "INSERT OR IGNORE INTO workspaces (id, name) VALUES (?, ?)",
  ).run(wsId, wsId === DEFAULT_WS ? "Default Workspace" : wsId);

  db.prepare(`
    INSERT INTO tg_bots
      (id, workspace_id, bot_username, bot_name, bot_id_str, token_enc, webhook_secret, status, connected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'connected', ?)
    ON CONFLICT(workspace_id) DO UPDATE SET
      bot_username    = excluded.bot_username,
      bot_name        = excluded.bot_name,
      bot_id_str      = excluded.bot_id_str,
      token_enc       = excluded.token_enc,
      webhook_secret  = excluded.webhook_secret,
      status          = 'connected',
      connected_at    = excluded.connected_at
  `).run(id, wsId, params.botUsername, params.botName ?? "", params.botId ?? "", enc, secret, now);

  const saved = getBot(wsId);
  if (!saved) throw new Error("saveBot: failed to read back saved record");
  return saved;
}

/** Return masked bot config for the workspace (no raw token). Null if not configured. */
export function getBot(workspaceId: string = DEFAULT_WS): BotConfig | null {
  const row = getDb()
    .prepare("SELECT * FROM tg_bots WHERE workspace_id = ?")
    .get(workspaceId) as BotRow | null | undefined;

  if (!row) return null;

  let tokenMasked = "••••";
  try {
    tokenMasked = maskToken(decryptToken(row.token_enc));
  } catch { /* decryption failed — key mismatch */ }

  return {
    id:            row.id,
    workspaceId:   row.workspace_id,
    botUsername:   row.bot_username,
    botName:       row.bot_name,
    botId:         row.bot_id_str,
    webhookSecret: row.webhook_secret,
    webhookUrl:    row.webhook_url,
    status:        row.status,
    connectedAt:   row.connected_at,
    tokenMasked,
  };
}

/**
 * Return the decrypted bot token — server-side use only.
 * NEVER send this value to the client.
 */
export function getBotToken(workspaceId: string = DEFAULT_WS): string | null {
  const row = getDb()
    .prepare("SELECT token_enc FROM tg_bots WHERE workspace_id = ?")
    .get(workspaceId) as Pick<BotRow, "token_enc"> | null | undefined;
  if (!row) return null;
  try {
    return decryptToken(row.token_enc);
  } catch {
    return null;
  }
}

/** Return the webhook secret used to validate X-Telegram-Bot-Api-Secret-Token. */
export function getBotWebhookSecret(workspaceId: string = DEFAULT_WS): string | null {
  const row = getDb()
    .prepare("SELECT webhook_secret FROM tg_bots WHERE workspace_id = ?")
    .get(workspaceId) as Pick<BotRow, "webhook_secret"> | null | undefined;
  return row?.webhook_secret ?? null;
}

/** Update the stored webhook URL after successful setWebhook registration. */
export function updateBotWebhookUrl(workspaceId: string, url: string): void {
  getDb()
    .prepare("UPDATE tg_bots SET webhook_url = ? WHERE workspace_id = ?")
    .run(url, workspaceId);
}

/** Remove the bot configuration for the workspace. */
export function disconnectBot(workspaceId: string = DEFAULT_WS): void {
  getDb()
    .prepare("DELETE FROM tg_bots WHERE workspace_id = ?")
    .run(workspaceId);
}

// ── Message store ─────────────────────────────────────────────────────────────

/**
 * Add a message to the flat store. Deduplicates by id.
 * Returns true if the message was inserted, false if it was a duplicate (no-op).
 * The return value lets callers decide whether to increment derived counters.
 */
export function addTelegramMessage(
  msg:         TelegramInboxMessage,
  workspaceId: string = DEFAULT_WS,
): boolean {
  const db = getDb();

  const dup = db
    .prepare("SELECT id FROM tg_messages WHERE id = ?")
    .get(msg.id);
  if (dup) return false;

  // Evict oldest messages if at capacity
  const { cnt } = db
    .prepare("SELECT COUNT(*) AS cnt FROM tg_messages WHERE workspace_id = ?")
    .get(workspaceId) as { cnt: number };
  if (cnt >= MAX_MESSAGES_TOTAL) {
    db.prepare(`
      DELETE FROM tg_messages WHERE id IN (
        SELECT id FROM tg_messages WHERE workspace_id = ?
        ORDER BY received_at ASC LIMIT 20
      )
    `).run(workspaceId);
  }

  db.prepare(`
    INSERT OR IGNORE INTO tg_messages
      (id, workspace_id, conversation_id, update_id, chat_id, chat_type,
       sender_name, sender_username, sender_telegram_id,
       text, direction, is_simulated, attachment_json, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    msg.id,
    workspaceId,
    `${workspaceId}_${msg.chatId}`,
    msg.updateId ?? null,
    msg.chatId,
    msg.chatType,
    msg.senderName,
    msg.senderUsername ?? null,
    msg.senderTelegramId,
    msg.text,
    msg.direction,
    msg.isSimulated ? 1 : 0,
    msg.attachment ? JSON.stringify(msg.attachment) : null,
    msg.receivedAt,
  );
  return true;
}

/** Return all messages for the workspace, newest first, up to the cap. */
export function getTelegramMessages(workspaceId: string = DEFAULT_WS): TelegramInboxMessage[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM tg_messages WHERE workspace_id = ? ORDER BY received_at DESC LIMIT ?",
    )
    .all(workspaceId, MAX_MESSAGES_TOTAL) as unknown as MsgRow[];
  return rows.map(rowToMsg);
}

/** Delete all messages for the workspace. */
export function clearTelegramMessages(workspaceId: string = DEFAULT_WS): void {
  getDb()
    .prepare("DELETE FROM tg_messages WHERE workspace_id = ?")
    .run(workspaceId);
}

/** Total message count for the workspace. */
export function getTelegramMessageCount(workspaceId: string = DEFAULT_WS): number {
  const { cnt } = getDb()
    .prepare("SELECT COUNT(*) AS cnt FROM tg_messages WHERE workspace_id = ?")
    .get(workspaceId) as { cnt: number };
  return cnt;
}

// ── Conversation store ────────────────────────────────────────────────────────

/**
 * Upsert a message into the per-chat conversation record.
 * Also persists the message via addTelegramMessage (deduplication handled there).
 */
export function upsertTelegramConversation(
  msg:         TelegramInboxMessage,
  workspaceId: string = DEFAULT_WS,
): void {
  const db     = getDb();
  const convId = `${workspaceId}_${msg.chatId}`;

  // Persist message first. Only update conversation counters when the message
  // is genuinely new — addTelegramMessage returns false for duplicates so that
  // Telegram webhook retries don't inflate message_count.
  const isNew = addTelegramMessage(msg, workspaceId);

  const existing = db
    .prepare("SELECT id FROM tg_conversations WHERE id = ?")
    .get(convId);

  if (!existing) {
    db.prepare(`
      INSERT INTO tg_conversations
        (id, workspace_id, chat_id, chat_type,
         sender_name, sender_username, sender_telegram_id,
         first_message_at, last_message_at, message_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      convId,
      workspaceId,
      msg.chatId,
      msg.chatType,
      msg.senderName,
      msg.senderUsername ?? null,
      msg.senderTelegramId,
      msg.receivedAt,
      msg.receivedAt,
    );
  } else if (isNew && msg.direction === "inbound") {
    db.prepare(`
      UPDATE tg_conversations SET
        sender_name        = ?,
        sender_username    = ?,
        sender_telegram_id = ?,
        message_count      = message_count + 1,
        last_message_at    = CASE WHEN ? > last_message_at THEN ? ELSE last_message_at END
      WHERE id = ?
    `).run(
      msg.senderName,
      msg.senderUsername ?? null,
      msg.senderTelegramId,
      msg.receivedAt,
      msg.receivedAt,
      convId,
    );
  } else if (isNew) {
    db.prepare(`
      UPDATE tg_conversations SET
        message_count   = message_count + 1,
        last_message_at = CASE WHEN ? > last_message_at THEN ? ELSE last_message_at END
      WHERE id = ?
    `).run(msg.receivedAt, msg.receivedAt, convId);
  }
}

/** Return all conversations for the workspace sorted newest-first, with messages. */
export function getTelegramConversations(workspaceId: string = DEFAULT_WS): TelegramConversation[] {
  const db      = getDb();
  const convRows = db
    .prepare(
      "SELECT * FROM tg_conversations WHERE workspace_id = ? ORDER BY last_message_at DESC",
    )
    .all(workspaceId) as unknown as ConvRow[];

  return convRows.map((conv) => {
    const msgs = db
      .prepare(
        "SELECT * FROM tg_messages WHERE conversation_id = ? ORDER BY received_at DESC LIMIT ?",
      )
      .all(`${workspaceId}_${conv.chat_id}`, MAX_MESSAGES_PER_CONV) as unknown as MsgRow[];

    return convRowToConversation(conv, msgs);
  });
}

/** Return a single conversation by chatId, or null. */
export function getTelegramConversation(
  chatId:      number,
  workspaceId: string = DEFAULT_WS,
): TelegramConversation | null {
  const db     = getDb();
  const convId = `${workspaceId}_${chatId}`;
  const conv   = db
    .prepare("SELECT * FROM tg_conversations WHERE id = ?")
    .get(convId) as ConvRow | null | undefined;

  if (!conv) return null;

  const msgs = db
    .prepare(
      "SELECT * FROM tg_messages WHERE conversation_id = ? ORDER BY received_at DESC LIMIT ?",
    )
    .all(convId, MAX_MESSAGES_PER_CONV) as unknown as MsgRow[];

  return convRowToConversation(conv, msgs);
}

/** Delete all conversation and message data for the workspace. */
export function clearTelegramConversations(workspaceId: string = DEFAULT_WS): void {
  const db = getDb();
  db.prepare("DELETE FROM tg_messages      WHERE workspace_id = ?").run(workspaceId);
  db.prepare("DELETE FROM tg_conversations WHERE workspace_id = ?").run(workspaceId);
}

// ── Client link store ─────────────────────────────────────────────────────────

/** Represents a resolved Telegram chatId → CRM client mapping. */
export interface TgClientLink {
  workspaceId:   string;
  chatId:        number;
  clientId:      string;
  clientName:    string;
  clientAvatar:  string;
  clientCompany: string;
  isAutoCreated: boolean;
  linkedAt:      string;
}

interface TgClientLinkRow {
  workspace_id:    string;
  chat_id:         number;
  client_id:       string;
  client_name:     string;
  client_avatar:   string;
  client_company:  string;
  is_auto_created: number;
  linked_at:       string;
}

function rowToLink(row: TgClientLinkRow): TgClientLink {
  return {
    workspaceId:   row.workspace_id,
    chatId:        row.chat_id,
    clientId:      row.client_id,
    clientName:    row.client_name,
    clientAvatar:  row.client_avatar,
    clientCompany: row.client_company,
    isAutoCreated: row.is_auto_created === 1,
    linkedAt:      row.linked_at,
  };
}

/**
 * Upsert a chatId → clientId link for the workspace.
 * Called after autoCreateTelegramClient resolves a new or matched client.
 */
export function saveClientLink(params: {
  workspaceId:   string;
  chatId:        number;
  clientId:      string;
  clientName:    string;
  clientAvatar:  string;
  clientCompany: string;
  isAutoCreated: boolean;
}): void {
  const db  = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO tg_client_links
      (workspace_id, chat_id, client_id, client_name, client_avatar, client_company, is_auto_created, linked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, chat_id) DO UPDATE SET
      client_id       = excluded.client_id,
      client_name     = excluded.client_name,
      client_avatar   = excluded.client_avatar,
      client_company  = excluded.client_company,
      is_auto_created = excluded.is_auto_created,
      linked_at       = excluded.linked_at
  `).run(
    params.workspaceId,
    params.chatId,
    params.clientId,
    params.clientName,
    params.clientAvatar,
    params.clientCompany,
    params.isAutoCreated ? 1 : 0,
    now,
  );
}

/** Return all client links for the workspace. */
export function getClientLinks(workspaceId: string = DEFAULT_WS): TgClientLink[] {
  const rows = getDb()
    .prepare("SELECT * FROM tg_client_links WHERE workspace_id = ? ORDER BY linked_at DESC")
    .all(workspaceId) as unknown as TgClientLinkRow[];
  return rows.map(rowToLink);
}

/** Return the link for a specific chat, or null if not found. */
export function getClientLink(
  chatId:      number,
  workspaceId: string = DEFAULT_WS,
): TgClientLink | null {
  const row = getDb()
    .prepare("SELECT * FROM tg_client_links WHERE workspace_id = ? AND chat_id = ?")
    .get(workspaceId, chatId) as TgClientLinkRow | null | undefined;
  return row ? rowToLink(row) : null;
}

/** Remove the client link for a specific chat. */
export function deleteClientLink(
  chatId:      number,
  workspaceId: string = DEFAULT_WS,
): void {
  getDb()
    .prepare("DELETE FROM tg_client_links WHERE workspace_id = ? AND chat_id = ?")
    .run(workspaceId, chatId);
}

/** Remove all client links for a workspace (called on bot disconnect). */
export function clearClientLinks(workspaceId: string = DEFAULT_WS): void {
  getDb()
    .prepare("DELETE FROM tg_client_links WHERE workspace_id = ?")
    .run(workspaceId);
}

// ── Row → type converters ─────────────────────────────────────────────────────

function rowToMsg(row: MsgRow): TelegramInboxMessage {
  return {
    id:               row.id,
    updateId:         row.update_id ?? 0,
    chatId:           row.chat_id,
    chatType:         row.chat_type as TelegramInboxMessage["chatType"],
    senderName:       row.sender_name,
    senderUsername:   row.sender_username ?? undefined,
    senderTelegramId: row.sender_telegram_id,
    text:             row.text,
    direction:        row.direction as TelegramInboxMessage["direction"],
    isSimulated:      row.is_simulated === 1,
    attachment:       row.attachment_json
      ? (JSON.parse(row.attachment_json) as TelegramInboxMessage["attachment"])
      : undefined,
    receivedAt: row.received_at,
  };
}

function convRowToConversation(conv: ConvRow, msgs: MsgRow[]): TelegramConversation {
  return {
    chatId:           conv.chat_id,
    chatType:         conv.chat_type as TelegramConversation["chatType"],
    senderName:       conv.sender_name,
    senderUsername:   conv.sender_username ?? undefined,
    senderTelegramId: conv.sender_telegram_id,
    firstMessageAt:   conv.first_message_at,
    lastMessageAt:    conv.last_message_at,
    messageCount:     conv.message_count,
    messages:         msgs.map(rowToMsg),
  };
}
