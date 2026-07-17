// ── Channel & status enums ────────────────────────────────────────────────────

export type ChannelType       = "telegram" | "whatsapp" | "email" | "calls";
export type IntegrationStatus = "connected" | "disconnected" | "error" | "coming_soon";
export type MessageDirection  = "inbound" | "outbound";

// ── Shared conversation/message types ─────────────────────────────────────────

/** A channel reference attached to a conversation */
export interface ConversationChannel {
  type:         ChannelType;
  displayName:  string;
  handle?:      string;   // @username, email address, phone number
}

/** Direction-tagged message used across all channel integrations */
export interface ChannelMessage {
  id:          string;
  direction:   MessageDirection;
  content:     string;
  mediaType?:  "text" | "photo" | "document" | "voice" | "video" | "sticker";
  senderName:  string;
  receivedAt:  string;    // ISO 8601
}

// ── Integration connection ────────────────────────────────────────────────────

export interface IntegrationConnection {
  id:           string;
  channel:      ChannelType;
  status:       IntegrationStatus;

  // Identity (populated when connected)
  displayName?: string;   // e.g. "@ventra_crm_bot"
  handle?:      string;   // bot username, email address, etc.

  connectedAt?: string;   // ISO 8601
  errorMessage?: string;  // set when status === "error"

  /** true until a real API/webhook is implemented */
  isMock:       boolean;

  /** Arbitrary channel-specific metadata */
  metadata:     Record<string, string>;
}

// ── Display metadata per channel (UI helpers) ─────────────────────────────────

export interface ChannelMeta {
  label:       string;
  description: string;
  color:       string;         // Tailwind text class
  bgColor:     string;         // Tailwind bg class
  borderColor: string;         // Tailwind border class
  available:   boolean;        // false → Coming Soon
}

export const CHANNEL_META: Record<ChannelType, ChannelMeta> = {
  telegram: {
    label:       "Telegram",
    description: "Receive messages from Telegram bots. Connect a bot to bring conversations into your Inbox.",
    color:       "text-[#0088cc]",
    bgColor:     "bg-blue-50",
    borderColor: "border-blue-200",
    available:   true,
  },
  whatsapp: {
    label:       "WhatsApp",
    description: "Connect WhatsApp Business API to receive and send messages from Ventra.",
    color:       "text-[#25d366]",
    bgColor:     "bg-green-50",
    borderColor: "border-green-200",
    available:   false,
  },
  email: {
    label:       "Email",
    description: "Connect Gmail to bring email conversations into your Inbox. Match threads to existing clients and detect tasks and deals automatically.",
    color:       "text-violet-600",
    bgColor:     "bg-violet-50",
    borderColor: "border-violet-200",
    available:   true,
  },
  calls: {
    label:       "Telephony",
    description: "Log calls and view transcripts from connected telephony providers.",
    color:       "text-amber-600",
    bgColor:     "bg-amber-50",
    borderColor: "border-amber-200",
    available:   false,
  },
};

// ── localStorage persistence ───────────────────────────────────────────────────

const INTEGRATIONS_KEY = "ventra_integrations";

export function getIntegrationConnections(): IntegrationConnection[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(INTEGRATIONS_KEY);
    return raw ? (JSON.parse(raw) as IntegrationConnection[]) : [];
  } catch { return []; }
}

export function saveIntegrationConnections(connections: IntegrationConnection[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(INTEGRATIONS_KEY, JSON.stringify(connections));
}

/** Returns the first Telegram connection, or null if not connected */
export function getTelegramConnection(): IntegrationConnection | null {
  return getIntegrationConnections().find((c) => c.channel === "telegram") ?? null;
}

/** Upsert a Telegram connection (replaces existing one if present) */
export function saveTelegramConnection(conn: IntegrationConnection): void {
  const all     = getIntegrationConnections().filter((c) => c.channel !== "telegram");
  saveIntegrationConnections([conn, ...all]);
}

/** Remove Telegram connection entirely */
export function disconnectTelegram(): void {
  const all = getIntegrationConnections().filter((c) => c.channel !== "telegram");
  saveIntegrationConnections(all);
}

/**
 * Mask a bot token for display — reveals only the last 4 characters.
 * e.g. "123456789:ABCdefGHIjklmnOPQrstuVWXyz0123" → "••••••••••••••••••••••••••••0123"
 */
export function maskToken(token: string): string {
  if (!token || token.length < 4) return "••••";
  const last4 = token.slice(-4);
  return "•".repeat(Math.min(token.length - 4, 28)) + last4;
}

/**
 * Validate Telegram bot token format (client-side, before API call).
 * Format: {8-12 digits}:{35+ alphanumeric/dash/underscore chars}
 * Example: "123456789:ABCdefGhIjKlMnOpQrStUvWxYz0123456"
 */
export function validateTokenFormat(token: string): boolean {
  return /^\d{8,12}:[A-Za-z0-9_-]{35,}$/.test(token.trim());
}

/**
 * Return the full webhook URL for the given workspace.
 * Includes workspace ID so Telegram can route updates to the correct tenant.
 * Client-only: uses window.location.origin.
 */
export function getWebhookUrl(workspaceId: string = "default"): string {
  const path = `/api/integrations/telegram/webhook/${workspaceId}`;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${path}`;
  }
  return path;
}

// ── Gmail connection helpers (re-exports from gmail.ts for settings page) ─────

export {
  getGmailConnection,
  saveGmailConnection,
  disconnectGmail,
  type GmailConnection,
} from "./gmail";

/** Build a real (non-mock) Telegram connection record. */
export function buildRealTelegramConnection(params: {
  botUsername:  string;
  botName?:     string;
  botId?:       string;
  tokenMasked?: string;
}): IntegrationConnection {
  const display = params.botUsername.startsWith("@")
    ? params.botUsername
    : `@${params.botUsername}`;
  return {
    id:          `tg_real_${Date.now()}`,
    channel:     "telegram",
    status:      "connected",
    displayName: display,
    handle:      params.botUsername.replace(/^@/, ""),
    connectedAt: new Date().toISOString(),
    isMock:      false,
    metadata:    {
      connectionMode: "real",
      botName:        params.botName      ?? "",
      botId:          params.botId        ?? "",
      tokenMasked:    params.tokenMasked  ?? "",
    },
  };
}

// ── Webhook secret ────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random webhook secret.
 * Telegram allows 1-256 chars from [A-Za-z0-9_-].
 * The secret is stored server-side in SQLite (tg_bots.webhook_secret) and
 * sent to Telegram as X-Telegram-Bot-Api-Secret-Token.
 * Called by telegram-db.ts on bot registration — NOT stored in localStorage.
 */
export function generateWebhookSecret(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => chars[b % chars.length]).join("");
}

// ── Webhook status cache ──────────────────────────────────────────────────────

const WEBHOOK_STATUS_KEY = "ventra_tg_webhook_status";

/** Cached result of getWebhookInfo, stored locally to avoid extra API calls. */
export interface WebhookStatus {
  url:               string;       // empty string = no webhook registered
  pendingUpdateCount: number;
  lastErrorDate?:    number;       // Unix timestamp
  lastErrorMessage?: string;
  maxConnections?:   number;
  ipAddress?:        string;
  fetchedAt:         string;       // ISO 8601
}

export function saveWebhookStatus(status: WebhookStatus): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(WEBHOOK_STATUS_KEY, JSON.stringify(status));
}

export function getWebhookStatus(): WebhookStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(WEBHOOK_STATUS_KEY);
    return raw ? (JSON.parse(raw) as WebhookStatus) : null;
  } catch { return null; }
}

export function clearWebhookStatus(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(WEBHOOK_STATUS_KEY);
}

/** Build a simulated Telegram connection (no real API — preview mode) */
export function buildMockTelegramConnection(botUsername: string): IntegrationConnection {
  return {
    id:          `tg_${Date.now()}`,
    channel:     "telegram",
    status:      "connected",
    displayName: botUsername.startsWith("@") ? botUsername : `@${botUsername}`,
    handle:      botUsername,
    connectedAt: new Date().toISOString(),
    isMock:      true,
    metadata:    { note: "Mock connection — real API not yet implemented" },
  };
}
