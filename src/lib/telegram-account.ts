/**
 * src/lib/telegram-account.ts
 *
 * Client-side API for the Personal Telegram Account (MTProto) integration.
 *
 * All functions call API routes under /api/integrations/telegram-personal/.
 * No GramJS imports — this file is safe to use in browser-side components.
 *
 * Types are re-exported from mtproto-types so consumers have a single import point.
 */

// ── Re-export shared types ─────────────────────────────────────────────────────

export type {
  PersonalSession,
  PersonalDialog,
  PersonalMessage,
  PersonalPeerType,
  BusinessScore,
  AuthStartResponse,
  AuthVerifyResponse,
  Auth2FAResponse,
  AuthStatusResponse,
  DialogsResponse,
  MessagesResponse,
  ImportRequest,
  ImportResult,
  ImportResponse,
  SendRequest,
  SendResponse,
} from "./mtproto-types";

import type {
  AuthStatusResponse,
  DialogsResponse,
  ImportResponse,
  SendResponse,
} from "./mtproto-types";

// ── Legacy types kept for modal compatibility ─────────────────────────────────

export type TelegramChatType = "private" | "group" | "supergroup" | "channel";
export type ImportScope      = "all" | "business" | "selected";

/**
 * Mirrors PersonalDialog but with legacy field names used by the existing modal.
 * The modal now uses PersonalDialog directly, but this alias prevents breaking
 * other files that may reference TelegramAccountChat.
 */
export type TelegramAccountChat = {
  id:               number;
  name:             string;
  type:             TelegramChatType;
  messageCount:     number;
  lastActivity:     string;
  isBusinessLikely: boolean;
  avatarInitials:   string;
  username?:        string;
  bizScore:         number;
  peerId:           string;
};

export interface TelegramAccountScanResult {
  totalChats:           number;
  privateChats:         number;
  groupChats:           number;
  supergroups:          number;
  channels:             number;
  estimatedClients:     number;
  activeConversations:  number;
  potentialTasks:       number;
  chats:                TelegramAccountChat[];
  myId:                 string;
}

export interface TelegramImportConfig {
  scope:           ImportScope;
  selectedChatIds: number[];
}

export interface TelegramImportResult {
  clientsCreated:        number;
  clientsMatched:        number;
  conversationsImported: number;
  tasksSuggested:        number;
  dealsDetected:         number;
}

// ── Scan messages ─────────────────────────────────────────────────────────────

export const SCAN_MESSAGES: string[] = [
  "Connecting to Telegram…",
  "Fetching chat list…",
  "Analyzing conversations…",
  "Identifying business contacts…",
  "Scoring business relevance…",
  "Almost done…",
];

export const IMPORT_STAGES: string[] = [
  "Fetching message history…",
  "Creating client records…",
  "Importing conversations…",
  "Running AI analysis…",
  "Finalizing…",
];

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Build initials (up to 2 chars) from a name string. */
export function toInitials(name: string): string {
  return name
    .replace(/[^\w\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "TG";
}

/** Return only business-likely chats. */
export function getBusinessChats(chats: TelegramAccountChat[]): TelegramAccountChat[] {
  return chats.filter((c) => c.isBusinessLikely);
}

// ── Auth API calls ─────────────────────────────────────────────────────────────

export async function startPersonalAuth(
  phoneNumber: string,
  workspaceId = "default",
): Promise<{ ok: boolean; error?: string; missingEnv?: boolean }> {
  const res = await fetch("/api/integrations/telegram-personal/auth/start", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ phoneNumber, workspaceId }),
  });
  return res.json() as Promise<{ ok: boolean; error?: string; missingEnv?: boolean }>;
}

export async function verifyPersonalOtp(
  otp: string,
  workspaceId = "default",
): Promise<{ ok: boolean; needs2FA?: boolean; error?: string }> {
  const res = await fetch("/api/integrations/telegram-personal/auth/verify", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ otp, workspaceId }),
  });
  return res.json() as Promise<{ ok: boolean; needs2FA?: boolean; error?: string }>;
}

export async function verifyPersonal2FA(
  password: string,
  workspaceId = "default",
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/integrations/telegram-personal/auth/2fa", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ password, workspaceId }),
  });
  return res.json() as Promise<{ ok: boolean; error?: string }>;
}

export async function getPersonalAuthStatus(
  workspaceId = "default",
): Promise<AuthStatusResponse> {
  const res = await fetch(`/api/integrations/telegram-personal/status?ws=${workspaceId}`);
  return res.json() as Promise<AuthStatusResponse>;
}

export async function disconnectPersonalAccount(
  workspaceId = "default",
  keepData = false,
): Promise<{ ok: boolean }> {
  const res = await fetch("/api/integrations/telegram-personal/disconnect", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ workspaceId, keepData }),
  });
  return res.json() as Promise<{ ok: boolean }>;
}

// ── Dialog / message API calls ────────────────────────────────────────────────

/**
 * Scan Telegram account and return dialogs with business scores.
 * Calls live Telegram API — may take a few seconds.
 */
export async function scanPersonalDialogs(
  workspaceId = "default",
): Promise<DialogsResponse> {
  const res = await fetch(
    `/api/integrations/telegram-personal/dialogs?ws=${workspaceId}&source=live`,
  );
  return res.json() as Promise<DialogsResponse>;
}

/** Return already-imported dialogs from the local DB. */
export async function getImportedDialogs(
  workspaceId = "default",
): Promise<DialogsResponse> {
  const res = await fetch(
    `/api/integrations/telegram-personal/dialogs?ws=${workspaceId}&source=db`,
  );
  return res.json() as Promise<DialogsResponse>;
}

/** Import selected dialogs (by peerId) into the CRM. */
export async function importPersonalDialogs(
  peerIds: string[],
  workspaceId = "default",
  clientLinks: { peerId: string; clientId: string; clientName: string }[] = [],
): Promise<ImportResponse> {
  const res = await fetch("/api/integrations/telegram-personal/import", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ peerIds, workspaceId, clientLinks }),
  });
  return res.json() as Promise<ImportResponse>;
}

/** Send a message from the personal account. */
export async function sendPersonalMessage(
  peerId: string,
  text: string,
  workspaceId = "default",
): Promise<SendResponse> {
  const res = await fetch("/api/integrations/telegram-personal/send", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ peerId, text, workspaceId }),
  });
  return res.json() as Promise<SendResponse>;
}

// ── Legacy functions (kept for backward compatibility) ─────────────────────────
// These were in the mock implementation and are still imported by some components.

export function savePersonalMockResult(): void {
  // No-op — data is now persisted server-side in SQLite
}

export function getPersonalMockResult(): TelegramImportResult | null {
  // No-op — data comes from the API
  return null;
}

export function clearPersonalMockResult(): void {
  // No-op
}
