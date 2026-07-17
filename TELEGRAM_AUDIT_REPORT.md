# Telegram Integration — Audit Report

**Date:** 2026-07-10  
**Scope:** Full end-to-end audit of the Telegram Bot integration as a real user.  
**Audited by:** Claude (Cowork)

---

## 1. What Was Tested

Nine user flows were traced from browser to Telegram and back:

1. Connect bot (token entry → validation → save → webhook register)
2. Token validation (client-side `getMe` check before server save)
3. Webhook registration (`setWebhook` call + secret token setup)
4. Receive text message (webhook → SQLite → SSE → Inbox)
5. Receive photo, PDF, document, voice message (same pipeline + attachment parsing)
6. Send reply from Inbox back to Telegram (`/api/integrations/telegram/send`)
7. Automatic client matching / creation (`autoCreateTelegramClient` → `matchClient`)
8. AI suggestions generation (`analyzeConversationMessages` → localStorage)
9. Create task and deal from AI suggestion (`handleAcceptSuggestion`)

---

## 2. What Works (Real Implementation)

### API layer — fully real
| Route | Status |
|---|---|
| `POST /api/integrations/telegram/connect` | ✅ Token encrypted in SQLite (AES-256-GCM) |
| `GET /api/integrations/telegram/connect` | ✅ Returns masked token from DB |
| `DELETE /api/integrations/telegram/connect` | ✅ Disconnects bot from DB |
| `POST /api/integrations/telegram/set-webhook` | ✅ Calls Telegram's `setWebhook`, persists URL |
| `GET /api/integrations/telegram/webhook-info` | ✅ Calls Telegram's `getWebhookInfo` |
| `POST /api/integrations/telegram/webhook/[wsId]` | ✅ Full inbound handler with secret validation |
| `POST /api/integrations/telegram/webhook` | ✅ Legacy catch-all, same logic |
| `POST /api/integrations/telegram/send` | ✅ Sends text / photo / document via Telegram Bot API |
| `GET /api/integrations/telegram/stream/[wsId]` | ✅ SSE with auto-ping; delivers snapshot + live events |
| `GET /api/integrations/telegram/file/[wsId]/[fileId]` | ✅ Proxies Telegram files (no token exposure) |
| `GET /api/integrations/telegram/conversations` | ✅ SQLite-backed |
| `GET /api/integrations/telegram/messages` | ✅ SQLite-backed |

### Data layer — fully real
- `telegram-db.ts`: SQLite via Node 22 built-in `node:sqlite`. Token encrypted at rest. Upsert logic, conversation/message limits (500 total, 50 per conv).
- `telegram-event-bus.ts`: In-memory pub/sub per workspace via `EventEmitter` on `globalThis`.
- `client-matcher.ts`: Jaccard + bigram similarity for name matching; priority: username (99%) → phone (95%) → email (95%) → name+company (60-89%).
- `ai-suggestions.ts`: Regex heuristics for task/deal/followup detection — real analysis engine.

### UI layer — working
- `TelegramConnectModal`: Real token → server save → webhook register → status display.
- `InboxPage`: SSE stream, client auto-create, AI suggestion cards, accept/dismiss actions.
- `ReplyBar`: Text + file send with optimistic UI, retry on failure, delivery status indicators.
- Attachment display: images, PDFs, documents, voice notes via file proxy.
- New-message pill, ConvRow flash animation, scroll preservation.

---

## 3. Bugs Found and Fixed

### Bug 1 — Dead `getDevToken()` in `reply-bar.tsx`
**Problem:** `getDevToken()` read the raw bot token from localStorage and passed it as an `Authorization: Bearer` header — which `/api/integrations/telegram/send` never reads (it looks up the token server-side by workspace ID).  
**Fix:** Removed the `getDevToken()` call, the `token` variable, and the `Authorization` header from `callSendApi`. The import was also removed.

### Bug 2 — Incorrect `direction` type cast in `send/route.ts`
**Problem:** All three `upsertTelegramConversation` calls for outbound messages used `direction: "outbound" as "inbound"` — a TypeScript lie that stored the string `"outbound"` while telling the type system it was `"inbound"`.  
**Fix:** Removed all three `as "inbound"` casts. The `TelegramInboxMessage.direction` type already includes `"outbound"`.

### Bug 3 — Outbound messages from SQLite shown as `role: "client"`
**Problem:** `buildLiveConversations()` mapped every message from SQLite (including sent replies) as `role: "client"`. This caused two issues: (a) sent messages shown on the wrong side of the thread; (b) duplication when the same message also appeared from the localStorage outbox.  
**Fix:** Added `.filter((m) => m.direction === "inbound")` before sorting. SQLite outbound messages are now excluded; the localStorage outbox remains the authoritative source for sent messages during the session.

### Bug 4 — Outbound messages not pushed via SSE
**Problem:** After `send/route.ts` stored an outbound message in SQLite, it never called `publishTelegramEvent`, so connected clients only saw sent messages if they happened to reload or receive a new inbound message.  
**Fix:** Added `publishTelegramEvent(wsId, getTelegramConversations(wsId))` after each `upsertTelegramConversation` call in `send/route.ts` (text send, file send, and mock mode).

### Bug 5 — Placeholder AI summaries (`"Full AI analysis available in Phase 5."`)
**Problem:** `buildLiveConversations()` set `aiSummary` and `aiNextAction` to hardcoded placeholder strings for every live Telegram conversation.  
**Fix:** Replaced with two helpers — `buildTgSummary()` and `buildTgNextAction()` — that call `analyzeConversationMessages()` on inbound messages and produce: message count, recency, detected deal/task/followup signals, and a concrete next action.

---

## 4. What Is Still Mock / Dev-Only (By Design)

These are intentional stubs, explicitly documented in code, and do **not** affect real Telegram functionality:

| Location | What it does | Status |
|---|---|---|
| `MOCK_CONVERSATIONS` in `inbox/page.tsx` | 8 demo conversations shown alongside real ones | Design decision for demo UX; filter by `id.startsWith("conv-")` to hide if needed |
| `outbox.ts` | localStorage-based sent-message tracking | Marked **DEV ONLY**; replace with server-side DB writes before production |
| `autoCreateTelegramClient()` in `storage.ts` | Creates/links clients in localStorage | Marked **DEV ONLY**; replace with API call to server-side client DB |
| `buildMockTelegramConnection()` in `integrations.ts` | No-bot preview mode in Connect modal | Intentional for demo/testing without a real bot |
| `generateImportSuggestions()` in `ai-suggestions.ts` | Fake data for "Personal Account import" | Only used by the Coming Soon feature; not in any active flow |
| `getDevToken()` / `saveDevToken()` in `integrations.ts` | Raw token in localStorage | Marked **DEV ONLY**; now unused after Bug 1 fix |

---

## 5. What Remains Before Production

In priority order:

### P0 — Required for production
1. **Replace localStorage client store** (`storage.ts`) with server-side API calls. Currently all CRM clients (Clients, Tasks, Deals) live in `localStorage`. This means data is lost on different browsers/devices and never server-validated.
2. **Replace localStorage outbox** (`outbox.ts`) with server-side sent-message persistence. Currently sent messages disappear on page reload.
3. **Multi-workspace support**: all routes default to `"default"` workspace. The `workspaceId` is not sent by `reply-bar.tsx`. Wire a real workspace ID if multi-tenant is needed.

### P1 — Important for reliability
4. **Webhook HTTPS requirement**: `set-webhook/route.ts` allows `localhost` for dev but Telegram requires HTTPS in production. Ensure the deployed URL is always HTTPS.
5. **Message limit**: `telegram-db.ts` caps at 500 total messages and 50 per conversation. Add pagination or archiving before hitting limits in active usage.
6. **Voice message send**: `send/route.ts` routes `kind === "voice"` to `sendDocument` (comment says "OGG/Opus conversion is v2"). Users recording voice notes get a document bubble on the Telegram side, not a voice note.

### P2 — Nice to have
7. **`MOCK_CONVERSATIONS` separation**: add a visual "demo" badge or move them to a separate list so real conversations aren't mixed with static fixtures.
8. **Read receipts / `seen` state**: currently tracked only client-side in a `Set`. Would need server storage to persist across sessions.
9. **Personal Account import** (the "Coming Soon" tab in the connect modal) — a separate integration project.

---

## 6. Summary

The Telegram Bot integration is **functionally real** end-to-end. Messages flow in via webhook, are stored in SQLite, broadcast over SSE, and displayed live in the Inbox. Replies go out through the real Telegram Bot API. Client matching, AI analysis, and task/deal creation all use real logic (no AI API calls — pure heuristics, but real ones).

The main gaps before production are the localStorage-based data stores (clients, outbox) that need to move server-side, and the missing `workspaceId` in the send flow. Everything else is solid.
