/**
 * Outbox — client-side in-flight message store.
 *
 * Tracks messages sent from the Inbox with delivery status:
 *   sending → sent → delivered | failed
 *
 * ── Architecture ──────────────────────────────────────────────────────────────
 *
 * Storage key : "ventra_outbox"
 * Shape       : Record<convId, OutboundMessage[]>  (newest first per conv)
 *
 * ── Telegram (production-complete) ────────────────────────────────────────────
 *
 * The outbox is used only for the in-flight window (status "sending" or
 * "failed"). Confirmed sends are written to SQLite by /api/integrations/
 * telegram/send and broadcast over SSE, at which point they appear in the
 * thread as "delivered". On page load, pruneTelegramOutbound() removes any
 * stale "sending" entries so they don't duplicate SSE-confirmed messages.
 *
 * ── Email (mock) ──────────────────────────────────────────────────────────────
 *
 * Gmail sends are fully simulated. The outbox is the sole persistence layer
 * for sent email messages; replace with real server-side storage when the
 * Gmail OAuth integration is wired.
 *
 * ── WhatsApp ──────────────────────────────────────────────────────────────────
 *
 * Not yet implemented — channel shows "coming soon".
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Types ─────────────────────────────────────────────────────────────────────

import type { MessageAttachment } from "./attachment-types";

export type DeliveryStatus = "sending" | "sent" | "delivered" | "failed";

export type OutboundChannel = "telegram" | "email" | "whatsapp";

export interface OutboundMessage {
  /** Unique ID: "out_{timestamp}_{random6}" */
  id:           string;
  /** Matches Conversation.id in the Inbox (e.g. "tg_conv_12345", "email_conv_abc") */
  convId:       string;
  channel:      OutboundChannel;
  content:      string;
  /** ISO 8601 — time the Send button was clicked (optimistic timestamp) */
  sentAt:       string;
  status:       DeliveryStatus;
  /** Set on failure */
  error?:       string;

  // ── Channel-specific metadata ───────────────────────────────────────────────

  /** Telegram chat_id integer (extracted from convId or provided explicitly) */
  chatId?:      number;
  /** Gmail thread ID for threading replies */
  threadId?:    string;
  /** Email recipient address */
  emailTo?:     string;
  /** Email subject line (usually "Re: {original.subject}") */
  emailSubject?: string;

  /** External message ID returned by the send API (Telegram message_id, Gmail id…) */
  apiMessageId?: string;

  /** true when the send was simulated (mock connection or mock API) */
  isMock?:      boolean;

  /**
   * Attached file metadata. dataUrl is included for images/voice (≤ 512 KB)
   * so the attachment preview persists across page reloads.
   */
  attachment?:  MessageAttachment;
}

// ── localStorage helpers ──────────────────────────────────────────────────────

const OUTBOX_KEY = "ventra_outbox";

type OutboxStore = Record<string, OutboundMessage[]>;

function loadStore(): OutboxStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    return raw ? (JSON.parse(raw) as OutboxStore) : {};
  } catch { return {}; }
}

function persistStore(store: OutboxStore): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(store));
}

// ── ID generation ─────────────────────────────────────────────────────────────

export function generateOutboundId(): string {
  return `out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/** Save a new outbound message (prepends to the conv's list). No-op on duplicate id. */
export function saveOutboundMessage(msg: OutboundMessage): void {
  const store = loadStore();
  const existing = store[msg.convId] ?? [];
  if (existing.some((m) => m.id === msg.id)) return; // deduplicate
  store[msg.convId] = [msg, ...existing];
  persistStore(store);
}

/** Update status (and optionally error/apiMessageId) for an existing outbound message. */
export function updateOutboundStatus(
  id:          string,
  status:      DeliveryStatus,
  options?:    { error?: string; apiMessageId?: string },
): void {
  const store   = loadStore();
  let   updated = false;
  for (const convId of Object.keys(store)) {
    store[convId] = store[convId].map((m) => {
      if (m.id !== id) return m;
      updated = true;
      return { ...m, status, error: options?.error, apiMessageId: options?.apiMessageId ?? m.apiMessageId };
    });
  }
  if (updated) persistStore(store);
}

/** Return all outbound messages for a conversation, newest first. */
export function getOutboundForConv(convId: string): OutboundMessage[] {
  return loadStore()[convId] ?? [];
}

/** Return ALL outbound messages across every conversation (for loading on mount). */
export function getAllOutboundMessages(): OutboundMessage[] {
  const store = loadStore();
  return Object.values(store).flat();
}

/** Remove all outbound messages for a specific conversation. */
export function clearOutboundForConv(convId: string): void {
  const store = loadStore();
  delete store[convId];
  persistStore(store);
}

/** Clear the entire outbox (all conversations). */
export function clearOutbox(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(OUTBOX_KEY);
}

/**
 * Remove all non-failed Telegram outbound messages from localStorage and return
 * the surviving messages.
 *
 * Called on Inbox mount so that confirmed Telegram sends from previous sessions
 * don't accumulate as stale "sending" entries — those messages are already in
 * SQLite and will be delivered via SSE. Only "failed" Telegram messages are
 * preserved so the user can still retry them.
 *
 * Non-Telegram messages (email etc.) are left untouched.
 */
export function pruneTelegramOutbound(): OutboundMessage[] {
  const store  = loadStore();
  const pruned: OutboxStore = {};

  for (const [convId, msgs] of Object.entries(store)) {
    if (convId.startsWith("tg_conv_")) {
      // Keep only failed Telegram messages — confirmed sends live in SQLite.
      const kept = msgs.filter((m) => m.status === "failed");
      if (kept.length > 0) pruned[convId] = kept;
    } else {
      pruned[convId] = msgs;
    }
  }

  persistStore(pruned);
  return Object.values(pruned).flat();
}

// ── Status label helpers ──────────────────────────────────────────────────────

export function deliveryStatusLabel(status: DeliveryStatus): string {
  switch (status) {
    case "sending":   return "Sending…";
    case "sent":      return "Sent";
    case "delivered": return "Delivered";
    case "failed":    return "Failed";
  }
}
