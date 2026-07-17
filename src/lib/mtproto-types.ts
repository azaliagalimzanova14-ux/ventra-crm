/**
 * src/lib/mtproto-types.ts
 *
 * TypeScript types for the Personal Telegram Account (MTProto) integration.
 * Shared between API routes, lib utilities, and client-side fetch wrappers.
 */

// ── Session / connection ───────────────────────────────────────────────────────

export interface PersonalSession {
  workspaceId: string;
  phoneNumber: string;
  apiId:       number;
  status:      "connected" | "disconnected";
  connectedAt: string;   // ISO 8601
  lastSyncAt:  string;   // ISO 8601
  /** Which workspace member connected this personal account (user_id). */
  userId?:     string;
}

// ── Auth flow ─────────────────────────────────────────────────────────────────

export interface AuthStartRequest {
  phoneNumber:  string;
  workspaceId?: string;
}

export interface AuthStartResponse {
  ok:         boolean;
  error?:     string;
  /** Only present when ok is false due to missing env vars. */
  missingEnv?: true;
}

export interface AuthVerifyRequest {
  otp:          string;
  workspaceId?: string;
}

export interface AuthVerifyResponse {
  ok:        boolean;
  needs2FA?: boolean;   // true when Telegram requires 2FA password
  error?:    string;
}

export interface Auth2FARequest {
  password:     string;
  workspaceId?: string;
}

export interface Auth2FAResponse {
  ok:     boolean;
  error?: string;
}

export interface AuthStatusResponse {
  ok:        boolean;
  connected: boolean;
  session?:  PersonalSession;
}

// ── Dialogs ───────────────────────────────────────────────────────────────────

export type PersonalPeerType = "user" | "chat" | "channel";

/** Business-relevance score produced by the AI filter. */
export interface BusinessScore {
  /** 0 – 100 */
  score:      number;
  /** Threshold-derived label. */
  confidence: "high" | "medium" | "low" | "personal";
  /** Human-readable reasons why this chat scored as business (or not). */
  reasons:    string[];
}

/** One Telegram dialog, enriched with business-scoring metadata. */
export interface PersonalDialog {
  /** Stable composite key: '{workspaceId}_{peerId}' */
  id:          string;
  workspaceId: string;
  peerId:      string;             // stringified BigInt
  peerType:    PersonalPeerType;
  title:       string;
  username?:   string;
  phone?:      string;
  isBusiness:  boolean;
  bizScore:    number;
  bizReasons:  string[];
  unreadCount: number;
  lastMsgAt:   string;             // ISO 8601
  clientId?:   string;             // linked CRM client (post-import)
  importedAt:  string;             // ISO 8601
  /** Only present in scan response (not in DB records). */
  preview?:    string;             // latest message text snippet
  /** Avatar initials derived server-side. */
  avatarInitials: string;
}

export interface DialogsResponse {
  ok:      boolean;
  dialogs: PersonalDialog[];
  myId:    string;   // stringified own Telegram ID
  error?:  string;
}

// ── Messages ──────────────────────────────────────────────────────────────────

export interface PersonalMessage {
  id:         string;    // '{workspaceId}_{peerId}_{msgId}'
  workspaceId: string;
  dialogId:   string;
  msgId:      number;
  fromId?:    string;
  fromName:   string;
  text:       string;
  date:       string;    // ISO 8601
  direction:  "inbound" | "outbound";
  mediaType?: "photo" | "document" | "voice";
  mediaCaption?: string;
}

export interface MessagesResponse {
  ok:       boolean;
  messages: PersonalMessage[];
  error?:   string;
}

// ── Import ────────────────────────────────────────────────────────────────────

export interface ImportRequest {
  peerIds:      string[];   // which dialogs to import
  workspaceId?: string;
  /** Client mappings resolved in the UI before calling import. */
  clientLinks?: { peerId: string; clientId: string; clientName: string }[];
}

export interface ImportResult {
  clientsCreated:        number;
  clientsMatched:        number;
  conversationsImported: number;
  messagesImported:      number;
}

export interface ImportResponse {
  ok:      boolean;
  result?: ImportResult;
  error?:  string;
}

// ── Send ──────────────────────────────────────────────────────────────────────

export interface SendRequest {
  peerId:       string;
  text:         string;
  workspaceId?: string;
}

export interface SendResponse {
  ok:      boolean;
  msgId?:  number;
  error?:  string;
}

// ── SSE events ────────────────────────────────────────────────────────────────

export interface PersonalInboxEvent {
  type:    "new_message" | "dialog_update";
  dialog:  PersonalDialog;
  message: PersonalMessage;
}
