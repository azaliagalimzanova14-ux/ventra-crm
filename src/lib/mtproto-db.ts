/**
 * src/lib/mtproto-db.ts
 *
 * SQLite CRUD for the Personal Telegram Account tables:
 *   tg_personal_sessions   — one encrypted GramJS session per workspace
 *   tg_personal_dialogs    — imported Telegram dialogs
 *   tg_personal_messages   — messages within those dialogs
 *
 * All BigInt peer IDs are stored as TEXT strings.
 * Encryption uses the same AES-256-GCM utilities as the bot token layer.
 */

import { getDb } from "./db";
import { encryptToken, decryptToken } from "./crypto-token";
import type { PersonalSession, PersonalDialog, PersonalMessage } from "./mtproto-types";

const DEFAULT_WS = "default";

// ── Sessions ───────────────────────────────────────────────────────────────────

interface SessionRow {
  workspace_id: string;
  phone_number: string;
  session_enc:  string;
  api_id:       number;
  status:       string;
  connected_at: string;
  last_sync_at: string;
  user_id:      string | null;
}

export function savePersonalSession(
  workspaceId: string,
  phoneNumber: string,
  sessionString: string,
  apiId: number,
  userId?: string,
): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO tg_personal_sessions
      (workspace_id, phone_number, session_enc, api_id, status, connected_at, last_sync_at, user_id)
    VALUES (?, ?, ?, ?, 'connected', ?, ?, ?)
    ON CONFLICT(workspace_id) DO UPDATE SET
      phone_number = excluded.phone_number,
      session_enc  = excluded.session_enc,
      api_id       = excluded.api_id,
      status       = 'connected',
      connected_at = excluded.connected_at,
      last_sync_at = excluded.last_sync_at,
      user_id      = COALESCE(excluded.user_id, tg_personal_sessions.user_id)
  `).run(workspaceId, phoneNumber, encryptToken(sessionString), apiId, now, now, userId ?? null);
}

export function getPersonalSession(
  workspaceId: string = DEFAULT_WS,
): (PersonalSession & { sessionString: string }) | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM tg_personal_sessions WHERE workspace_id = ?",
  ).get(workspaceId) as SessionRow | undefined;

  if (!row) return null;

  let sessionString: string;
  try {
    sessionString = decryptToken(row.session_enc);
  } catch {
    return null;  // corrupt / wrong key
  }

  return {
    workspaceId: row.workspace_id,
    phoneNumber: row.phone_number,
    apiId:       row.api_id,
    status:      row.status as PersonalSession["status"],
    connectedAt: row.connected_at,
    lastSyncAt:  row.last_sync_at,
    userId:      row.user_id ?? undefined,
    sessionString,
  };
}

export function updateSessionStatus(
  workspaceId: string,
  status: "connected" | "disconnected",
): void {
  const db = getDb();
  db.prepare(
    "UPDATE tg_personal_sessions SET status = ? WHERE workspace_id = ?",
  ).run(status, workspaceId);
}

export function updateLastSync(workspaceId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE tg_personal_sessions SET last_sync_at = ? WHERE workspace_id = ?",
  ).run(new Date().toISOString(), workspaceId);
}

export function deletePersonalSession(workspaceId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM tg_personal_sessions WHERE workspace_id = ?").run(workspaceId);
}

export function getPublicSession(
  workspaceId: string = DEFAULT_WS,
): PersonalSession | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT workspace_id, phone_number, api_id, status, connected_at, last_sync_at, user_id FROM tg_personal_sessions WHERE workspace_id = ?",
  ).get(workspaceId) as Omit<SessionRow, "session_enc"> | undefined;

  if (!row) return null;
  return {
    workspaceId: row.workspace_id,
    phoneNumber: row.phone_number,
    apiId:       row.api_id,
    status:      row.status as PersonalSession["status"],
    connectedAt: row.connected_at,
    lastSyncAt:  row.last_sync_at,
    userId:      row.user_id ?? undefined,
  };
}

// ── Dialogs ────────────────────────────────────────────────────────────────────

interface DialogRow {
  id:           string;
  workspace_id: string;
  peer_id:      string;
  peer_type:    string;
  title:        string;
  username:     string | null;
  phone:        string | null;
  is_business:  number;
  biz_score:    number;
  biz_reasons:  string;
  unread_count: number;
  last_msg_at:  string;
  client_id:    string | null;
  imported_at:  string;
}

function rowToDialog(row: DialogRow): PersonalDialog {
  return {
    id:          row.id,
    workspaceId: row.workspace_id,
    peerId:      row.peer_id,
    peerType:    row.peer_type as PersonalDialog["peerType"],
    title:       row.title,
    username:    row.username ?? undefined,
    phone:       row.phone ?? undefined,
    isBusiness:  row.is_business === 1,
    bizScore:    row.biz_score,
    bizReasons:  JSON.parse(row.biz_reasons) as string[],
    unreadCount: row.unread_count,
    lastMsgAt:   row.last_msg_at,
    clientId:    row.client_id ?? undefined,
    importedAt:  row.imported_at,
    avatarInitials: toInitials(row.title),
  };
}

export function toInitials(name: string): string {
  return name
    .replace(/[^\w\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "TG";
}

export function upsertPersonalDialog(dialog: Omit<PersonalDialog, "importedAt" | "avatarInitials"> & { importedAt?: string }): void {
  const db = getDb();
  const now = dialog.importedAt ?? new Date().toISOString();
  db.prepare(`
    INSERT INTO tg_personal_dialogs
      (id, workspace_id, peer_id, peer_type, title, username, phone,
       is_business, biz_score, biz_reasons, unread_count, last_msg_at, client_id, imported_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, peer_id) DO UPDATE SET
      peer_type    = excluded.peer_type,
      title        = excluded.title,
      username     = excluded.username,
      phone        = excluded.phone,
      is_business  = excluded.is_business,
      biz_score    = excluded.biz_score,
      biz_reasons  = excluded.biz_reasons,
      unread_count = excluded.unread_count,
      last_msg_at  = excluded.last_msg_at,
      client_id    = COALESCE(excluded.client_id, tg_personal_dialogs.client_id)
  `).run(
    dialog.id,
    dialog.workspaceId,
    dialog.peerId,
    dialog.peerType,
    dialog.title,
    dialog.username ?? null,
    dialog.phone ?? null,
    dialog.isBusiness ? 1 : 0,
    dialog.bizScore,
    JSON.stringify(dialog.bizReasons),
    dialog.unreadCount,
    dialog.lastMsgAt,
    dialog.clientId ?? null,
    now,
  );
}

export function getPersonalDialogs(workspaceId: string = DEFAULT_WS): PersonalDialog[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM tg_personal_dialogs WHERE workspace_id = ? ORDER BY last_msg_at DESC",
  ).all(workspaceId) as unknown as DialogRow[];
  return rows.map(rowToDialog);
}

export function getPersonalDialog(
  workspaceId: string,
  peerId: string,
): PersonalDialog | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM tg_personal_dialogs WHERE workspace_id = ? AND peer_id = ?",
  ).get(workspaceId, peerId) as DialogRow | undefined;
  return row ? rowToDialog(row) : null;
}

export function linkDialogToClient(workspaceId: string, peerId: string, clientId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE tg_personal_dialogs SET client_id = ? WHERE workspace_id = ? AND peer_id = ?",
  ).run(clientId, workspaceId, peerId);
}

export function deletePersonalDialogs(workspaceId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM tg_personal_dialogs WHERE workspace_id = ?").run(workspaceId);
}

// ── Messages ───────────────────────────────────────────────────────────────────

interface MessageRow {
  id:            string;
  workspace_id:  string;
  dialog_id:     string;
  msg_id:        number;
  from_id:       string | null;
  from_name:     string;
  text:          string;
  date:          string;
  direction:     string;
  media_type:    string | null;
  media_caption: string | null;
}

function rowToMessage(row: MessageRow): PersonalMessage {
  return {
    id:           row.id,
    workspaceId:  row.workspace_id,
    dialogId:     row.dialog_id,
    msgId:        row.msg_id,
    fromId:       row.from_id ?? undefined,
    fromName:     row.from_name,
    text:         row.text,
    date:         row.date,
    direction:    row.direction as "inbound" | "outbound",
    mediaType:    row.media_type as PersonalMessage["mediaType"],
    mediaCaption: row.media_caption ?? undefined,
  };
}

export function addPersonalMessage(msg: Omit<PersonalMessage, "id"> & { id?: string }): boolean {
  const db = getDb();
  // dialogId is already `${workspaceId}_${peerId}`, so no workspaceId prefix needed here
  const id = msg.id ?? `${msg.dialogId}_${msg.msgId}`;
  const result = db.prepare(`
    INSERT OR IGNORE INTO tg_personal_messages
      (id, workspace_id, dialog_id, msg_id, from_id, from_name, text,
       date, direction, media_type, media_caption)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    msg.workspaceId,
    msg.dialogId,
    msg.msgId,
    msg.fromId ?? null,
    msg.fromName,
    msg.text,
    msg.date,
    msg.direction,
    msg.mediaType ?? null,
    msg.mediaCaption ?? null,
  );
  return (result.changes as number) > 0;
}

export function getPersonalMessages(
  workspaceId: string,
  dialogId: string,
  limit = 50,
): PersonalMessage[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM tg_personal_messages
    WHERE workspace_id = ? AND dialog_id = ?
    ORDER BY date DESC
    LIMIT ?
  `).all(workspaceId, dialogId, limit) as unknown as MessageRow[];
  return rows.map(rowToMessage);
}

export function deletePersonalMessages(workspaceId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM tg_personal_messages WHERE workspace_id = ?").run(workspaceId);
}
