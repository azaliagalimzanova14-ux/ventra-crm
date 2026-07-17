// ── Telegram Bot API payload types ────────────────────────────────────────────
// Source: https://core.telegram.org/bots/api#update
// Supported: text, photo, document (+ PDF), voice, audio.

export interface TelegramUser {
  id:           number;
  is_bot:       boolean;
  first_name:   string;
  last_name?:   string;
  username?:    string;
  language_code?: string;
}

export interface TelegramChat {
  id:          number;
  type:        "private" | "group" | "supergroup" | "channel";
  title?:      string;   // group / supergroup / channel
  username?:   string;   // private or public group
  first_name?: string;   // private
  last_name?:  string;   // private
}

// ── Media attachment types ────────────────────────────────────────────────────

/** One size variant of a photo (Telegram always sends multiple sizes). */
export interface TelegramPhotoSize {
  file_id:        string;
  file_unique_id: string;
  width:          number;
  height:         number;
  file_size?:     number;
}

/** Document (any file type) or PDF. */
export interface TelegramDocument {
  file_id:        string;
  file_unique_id: string;
  file_name?:     string;
  mime_type?:     string;
  file_size?:     number;
  /** Thumbnail present when Telegram generates one (e.g. for video documents). */
  thumb?:         TelegramPhotoSize;
}

/** Voice message — requires OGG/Opus encoding when uploaded. */
export interface TelegramVoice {
  file_id:        string;
  file_unique_id: string;
  duration:       number;    // seconds
  mime_type?:     string;    // usually "audio/ogg"
  file_size?:     number;
}

/** Audio file (music track, distinct from voice notes). */
export interface TelegramAudio {
  file_id:        string;
  file_unique_id: string;
  duration:       number;
  performer?:     string;
  title?:         string;
  file_name?:     string;
  mime_type?:     string;
  file_size?:     number;
}

export interface TelegramMessage {
  message_id: number;
  from?:      TelegramUser;      // absent in channel posts
  chat:       TelegramChat;
  date:       number;            // Unix timestamp
  text?:      string;            // present for text messages
  caption?:   string;            // present for photo/document with caption
  // ── Media fields (mutually exclusive in practice) ──────────────────────────
  photo?:     TelegramPhotoSize[]; // array of sizes; last = highest resolution
  document?:  TelegramDocument;
  voice?:     TelegramVoice;
  audio?:     TelegramAudio;
}

/** Top-level Telegram update object. Only `message` is handled in Phase 1. */
export interface TelegramUpdate {
  update_id:       number;
  message?:        TelegramMessage;
  edited_message?: TelegramMessage;   // ignored in Phase 1
  channel_post?:   TelegramMessage;   // ignored in Phase 1
}

// ── Internal representation stored in server mock adapter ────────────────────

/**
 * Telegram getWebhookInfo result.
 * Source: https://core.telegram.org/bots/api#webhookinfo
 */
export interface TelegramWebhookInfo {
  url:                              string;
  has_custom_certificate:           boolean;
  pending_update_count:             number;
  ip_address?:                      string;
  last_error_date?:                 number;   // Unix timestamp
  last_error_message?:              string;
  last_synchronization_error_date?: number;
  max_connections?:                 number;
  allowed_updates?:                 string[];
}

/**
 * Server-side conversation record — groups all messages from one Telegram chat.
 * One entry per unique chat_id. Stored in SQLite (tg_conversations + tg_messages).
 */
export interface TelegramConversation {
  chatId:           number;
  chatType:         TelegramChat["type"];
  senderName:       string;       // Latest display name from the sender
  senderUsername?:  string;       // Latest @username (without leading @)
  senderTelegramId: number;       // Telegram user ID of the sender
  firstMessageAt:   string;       // ISO 8601 — when this conversation started
  lastMessageAt:    string;       // ISO 8601 — most recent message timestamp
  messageCount:     number;       // Total number of messages received
  messages:         TelegramInboxMessage[];  // All messages, newest first (capped at 50)
}

/** Attachment metadata stored with a TelegramInboxMessage. */
export interface TelegramInboxAttachment {
  kind:       "image" | "pdf" | "document" | "voice";
  /** Telegram file_id — use getFile API to download when needed. */
  fileId?:    string;
  name?:      string;       // filename from document.file_name
  mimeType?:  string;
  sizeBytes?: number;
  duration?:  number;       // voice/audio seconds
}

/** Processed Telegram message as stored in SQLite and served by the API. */
export interface TelegramInboxMessage {
  id:               string;       // "tg_{updateId}_{messageId}"
  updateId:         number;
  chatId:           number;
  chatType:         TelegramChat["type"];
  senderName:       string;       // first + last name, or username, or "Unknown"
  senderUsername?:  string;       // @username without @
  senderTelegramId: number;       // from.id or chat.id for channel posts
  text:             string;
  receivedAt:       string;       // ISO 8601
  direction:        "inbound" | "outbound";
  isSimulated:      boolean;      // true when sent via "Send test message" button
  attachment?:      TelegramInboxAttachment;
}
