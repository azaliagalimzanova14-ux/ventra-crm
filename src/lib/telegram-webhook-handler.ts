/**
 * src/lib/telegram-webhook-handler.ts
 *
 * Shared Telegram webhook update processor.
 *
 * Both webhook routes delegate to `handleWebhookUpdate()`:
 *   POST /api/integrations/telegram/webhook          → wsId = "default"
 *   POST /api/integrations/telegram/webhook/[wsId]   → wsId from URL param
 *
 * This keeps all parsing, validation, and persistence logic in one place.
 *
 * Supported update types:
 *   message.text       — plain text
 *   message.photo      — image (stores highest-res file_id)
 *   message.document   — any file / PDF
 *   message.voice      — voice note
 *   message.audio      — audio file
 *   (with optional caption for photo/document)
 *
 * Security:
 *   - X-Telegram-Bot-Api-Secret-Token validated against DB-stored value using
 *     a constant-time HMAC comparison to prevent timing-based secret leakage.
 *   - The raw bot token is never read or exposed in this handler.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse }    from "next/server";
import type {
  TelegramUpdate,
  TelegramInboxMessage,
  TelegramInboxAttachment,
} from "./telegram-types";
import {
  upsertTelegramConversation,
  getTelegramConversations,
  getBotWebhookSecret,
} from "./telegram-db";
import { publishTelegramEvent }         from "./telegram-event-bus";
import { upsertConversation, touchConversation } from "./server/db-conversations";
import { createMessage }                         from "./server/db-messages";
import { refreshRhythm }                         from "./server/rie/rhythm-engine";
import { kindFromMime, kindFromFilename } from "./attachment-types";

// ── Constant-time secret comparison ──────────────────────────────────────────
//
// Using a zero key HMAC comparison prevents length-extension attacks and makes
// the comparison constant-time even when the strings have different lengths.
// The key is fixed (and does not need to be secret) — its only purpose is to
// produce same-length digests for timingSafeEqual.

const HMAC_KEY = Buffer.alloc(32); // zero key — intentional

function secretsMatch(incoming: string, expected: string): boolean {
  const ha = createHmac("sha256", HMAC_KEY).update(incoming).digest();
  const hb = createHmac("sha256", HMAC_KEY).update(expected).digest();
  return timingSafeEqual(ha, hb);
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function handleWebhookUpdate(
  wsId: string,
  req:  NextRequest,
): Promise<NextResponse> {

  // ── 1. Validate X-Telegram-Bot-Api-Secret-Token ───────────────────────────
  const incomingSecret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const expectedSecret = getBotWebhookSecret(wsId);

  if (!expectedSecret) {
    return NextResponse.json(
      { ok: false, error: "No bot configured for this workspace" },
      { status: 401 },
    );
  }

  if (!incomingSecret || !secretsMatch(incomingSecret, expectedSecret)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  // ── 2. Parse body ─────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON — expected a Telegram Update object" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { ok: false, error: "Expected a JSON object" },
      { status: 400 },
    );
  }

  // ── 3. Validate top-level update_id ──────────────────────────────────────
  const update = body as Partial<TelegramUpdate>;

  if (typeof update.update_id !== "number") {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid update_id" },
      { status: 400 },
    );
  }

  // ── 4. Route by update type ───────────────────────────────────────────────
  if (!update.message) {
    return NextResponse.json({
      ok:   true,
      note: "Unsupported update type — no `message` field. Acknowledged.",
    });
  }

  const msg = update.message;

  // ── 5. Validate required message fields ──────────────────────────────────
  if (!msg.chat || typeof msg.chat.id !== "number") {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid message.chat.id" },
      { status: 400 },
    );
  }

  if (typeof msg.message_id !== "number") {
    return NextResponse.json(
      { ok: false, error: "Missing message.message_id" },
      { status: 400 },
    );
  }

  // ── 6. Resolve content: text/caption + optional attachment ────────────────
  const caption = (msg.caption ?? "").trim();

  let displayText: string;
  let attachment:  TelegramInboxAttachment | undefined;

  if (msg.photo && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1];
    attachment = {
      kind:      "image",
      fileId:    largest.file_id,
      mimeType:  "image/jpeg",
      sizeBytes: largest.file_size,
    };
    displayText = caption || "[Photo]";

  } else if (msg.document) {
    const doc  = msg.document;
    const name = doc.file_name ?? "file";
    const kind = doc.mime_type ? kindFromMime(doc.mime_type) : kindFromFilename(name);
    attachment = {
      kind,
      fileId:    doc.file_id,
      name,
      mimeType:  doc.mime_type,
      sizeBytes: doc.file_size,
    };
    displayText = caption || `[${kind === "pdf" ? "PDF" : "Document"}: ${name}]`;

  } else if (msg.voice) {
    const v = msg.voice;
    attachment = {
      kind:      "voice",
      fileId:    v.file_id,
      mimeType:  v.mime_type ?? "audio/ogg",
      sizeBytes: v.file_size,
      duration:  v.duration,
    };
    displayText = caption || `[Voice message · ${v.duration}s]`;

  } else if (msg.audio) {
    const a    = msg.audio;
    const name = a.file_name ?? a.title ?? "audio";
    attachment = {
      kind:      "voice",
      fileId:    a.file_id,
      name,
      mimeType:  a.mime_type ?? "audio/mpeg",
      sizeBytes: a.file_size,
      duration:  a.duration,
    };
    displayText = caption || `[Audio: ${name}]`;

  } else {
    const rawText = (msg.text ?? "").trim();
    if (!rawText) {
      return NextResponse.json({
        ok:   true,
        note: "No text or media content — message skipped.",
      });
    }
    displayText = rawText;
  }

  // ── 7. Build sender name ──────────────────────────────────────────────────
  const from      = msg.from;
  const nameParts = [from?.first_name, from?.last_name].filter(Boolean);
  const senderName =
    nameParts.length > 0
      ? nameParts.join(" ")
      : (from?.username ?? msg.chat.title ?? `Chat ${msg.chat.id}`);

  // ── 8. Detect simulated messages ──────────────────────────────────────────
  //
  // The Settings page "Send test message" button adds x-ventra-simulated: 1
  // so test messages are stored with isSimulated=true and can be filtered in UI.
  const isSimulated = req.headers.get("x-ventra-simulated") === "1";

  // ── 9. Build internal message ─────────────────────────────────────────────
  const inboxMsg: TelegramInboxMessage = {
    id:               `tg_${update.update_id}_${msg.message_id}`,
    updateId:         update.update_id,
    chatId:           msg.chat.id,
    chatType:         msg.chat.type,
    senderName,
    senderUsername:   from?.username,
    senderTelegramId: from?.id ?? msg.chat.id,
    text:             displayText,
    receivedAt:       new Date(msg.date * 1000).toISOString(),
    direction:        "inbound",
    isSimulated,
    attachment,
  };

  // ── 10. Persist to SQLite (idempotent — duplicate update_id is a no-op) ───
  upsertTelegramConversation(inboxMsg, wsId);

  // ── 10b. Bridge to unified inbox tables ──────────────────────────────────
  try {
    const conv = upsertConversation({
      workspace_id: wsId,
      channel:      "telegram",
      external_id:  String(inboxMsg.chatId),
      title:        inboxMsg.senderName,
    });

    createMessage({
      workspace_id:    wsId,
      conversation_id: conv.id,
      sender_type:     "client",
      content:         inboxMsg.text,
      attachments:     inboxMsg.attachment ? [inboxMsg.attachment] : undefined,
      metadata:        {
        tg_msg_id:    inboxMsg.id,
        update_id:    inboxMsg.updateId,
        chat_type:    inboxMsg.chatType,
        username:     inboxMsg.senderUsername,
        is_simulated: inboxMsg.isSimulated,
      },
      created_at: inboxMsg.receivedAt,
    });

    touchConversation(conv.id, wsId, inboxMsg.text, inboxMsg.receivedAt);

    if (conv.client_id) {
      try { refreshRhythm(wsId, conv.client_id); }
      catch { /* best-effort — never fail a webhook */ }
    }
  } catch { /* best-effort — never fail a webhook because of unified bridge */ }

  // ── 11. Broadcast to connected SSE clients ────────────────────────────────
  try {
    publishTelegramEvent(wsId, getTelegramConversations(wsId));
  } catch { /* event bus publish is best-effort — never fail a webhook */ }

  return NextResponse.json({ ok: true, processed: inboxMsg.id });
}
