# Telegram Bot Integration — Production Audit

**Date:** 2026-07-10  
**Scope:** Full codebase scan for TODO, FIXME, MOCK, simulated, localStorage, hardcoded values, placeholder text, temporary implementations — evaluated against the Telegram Bot integration specifically.  
**Patterns searched:** `TODO`, `FIXME`, `MOCK`, `isMock`, `simulated`, `localStorage`, `DEV ONLY`, `before production`, `hardcoded`, `v2`, `Phase N`, `placeholder`, `coming soon`, `temporary`, `REPLACE`

---

## Changes Applied in This Audit

Four fixes were made. TypeScript and ESLint pass clean after each.

### Fix 1 — Removed 6 dead localStorage functions from `integrations.ts`

`getDevToken()`, `saveDevToken()`, `clearDevToken()` — The raw-token-in-localStorage pattern was superseded when `send/route.ts` was migrated to server-side token lookup. All three functions had **zero callers** outside their own file. Removed the functions and the `TOKEN_KEY` constant (`"ventra_tg_token_dev"`).

`saveWebhookSecret()`, `getWebhookSecret()`, `clearWebhookSecret()` — The webhook secret is stored in SQLite (`tg_bots.webhook_secret`) by `telegram-db.ts`. The localStorage versions had **zero callers** outside their own file. Removed the functions and the `WEBHOOK_SECRET_KEY` constant (`"ventra_tg_webhook_secret"`). `generateWebhookSecret()` (still needed by `telegram-db.ts` for initial secret creation) was kept and its JSDoc updated to explain where the secret actually lives.

### Fix 2 — `chatType: "private"` hardcode in `send/route.ts`

Both real-mode upsert calls in `send/route.ts` (text send and file send) passed `chatType: "private"` unconditionally. For group/supergroup/channel conversations this would store an incorrect chatType if the conversation didn't exist in SQLite yet (an edge case for first-send). 

Fixed by adding a pre-flight lookup:
```typescript
const existingConv     = getTelegramConversation(chatId, wsId);
const resolvedChatType = existingConv?.chatType ?? "private";
```
Both upsert calls now use `resolvedChatType`. Mock-mode keeps `"private"` (no real chats exist there).

### Fix 3 — `outbox.ts` file header updated

Removed the "⚠ DEV ONLY — localStorage. Replace with server-side DB writes before production." banner, which was accurate before the SQLite migration but misleading now. The updated header correctly describes the current two-tier architecture: outbox handles the in-flight window; SQLite is the confirmed-delivery store for Telegram.

### Fix 4 — `autoCreateTelegramClient` comment updated in `storage.ts`

Replaced "⚠ DEV ONLY: persists to localStorage. Replace with a DB write in production." with an accurate note: the chatId → clientId mapping IS now server-side (SQLite `tg_client_links`), and the remaining localStorage dependency is the broader CRM data layer (not Telegram-specific).

---

## Critical Issues

**None.** No production-blocking bugs found after the fixes above.

---

## High Priority

### H1 — CRM Client objects in localStorage (`storage.ts`)

Every CRM entity — Clients, Projects, Tasks, Deals — lives in `localStorage`. This affects the Telegram integration indirectly: `autoCreateTelegramClient` creates and links `Client` objects in localStorage. If localStorage is cleared or a different browser is used, all Telegram-linked clients disappear even though their chatId↔clientId mapping survives in SQLite (`tg_client_links`).

**Why not fixed here:** This is the entire CRM core data layer, not a Telegram-specific issue. Migrating it requires a full server-side client API.

**Mitigation already in place:** `tg_client_links` pre-loads from the server on page mount and re-synthesizes a minimal `Client` stub from the link record if the localStorage entry is missing. The conversation still renders with the correct name and avatar.

### H2 — In-memory SSE event bus (`telegram-event-bus.ts`)

The `EventEmitter` that drives real-time SSE is stored on `globalThis` per workspace. In a multi-process or horizontally-scaled Node deployment (PM2 cluster, serverless cold starts between requests, etc.) each process has its own `globalThis`, so SSE clients connected to process A won't receive events published by a webhook landing on process B.

**Why not fixed here:** Requires introducing a shared pub/sub layer (e.g. Redis Pub/Sub, database polling, or WebSocket gateway). Out of scope for a single-instance deployment.

**Mitigation:** In single-process deployments (standard `next start`, Railway, Render single dyno) this is entirely correct and production-safe.

---

## Medium Priority

### M1 — Voice messages sent as documents (`send/route.ts` line 21)

`kind === "voice"` is routed to `sendDocument` instead of `sendVoice`. The recipient sees a file attachment bubble in Telegram instead of a playable voice note. The comment marks this as a v2 item.

**Intentional:** OGG/Opus conversion from the browser's MediaRecorder output is a known deferred item. The voice note is preserved as an audio file; it just doesn't display as a Telegram voice bubble.

**Fix when ready:** Switch `apiPath = "sendVoice"` and pass `duration` from the attachment metadata (already tracked via `__duration` property on the `File` object).

### M2 — Message limits are low (`telegram-db.ts`)

`MAX_MESSAGES_TOTAL = 500`, `MAX_MESSAGES_PER_CONV = 50`. An active Telegram user will hit these ceilings quickly. When the total cap is hit, the 20 oldest messages are evicted in bulk — no archiving, no pagination.

**Intentional:** Documented known limitation. Acceptable for low-volume pilots.

**Fix when ready:** Add a `tg_messages_archive` table or increase limits, and add pagination to `getTelegramConversations`.

### M3 — `MOCK_CONVERSATIONS` mixed with real data in Inbox (`inbox/page.tsx`)

Eight static demo conversations (email, telegram, call channels) are included in `allConversations` alongside live SSE data. They share the same UI and can confuse a real deployment.

**Intentional:** Demo/sales UX decision. Filter by `!conv.id.startsWith("conv-")` to hide them.

**Fix when ready:** Gate behind a `NEXT_PUBLIC_DEMO_MODE=1` env flag and exclude from `allConversations` by default.

---

## Low Priority

### L1 — Webhook secret localStorage remnants

The localStorage keys `"ventra_tg_webhook_secret"` and `"ventra_tg_token_dev"` may still exist in users' browsers from before the SQLite migration. They are now dead — nothing reads them — but they waste a few bytes of storage.

**Fix when ready:** Add a one-time migration in the app's root `useEffect` to `localStorage.removeItem("ventra_tg_webhook_secret")` and `localStorage.removeItem("ventra_tg_token_dev")`.

### L2 — Simulated-mode bot username not validated (`telegram-connect-modal.tsx`)

In simulated mode the user enters any string as bot username. No `@username` format check is enforced. The string is stored in localStorage as-is.

**Intentional:** Simulated mode is explicitly not a real connection. No real API call is made.

### L3 — Webhook status cached in localStorage (`integrations.ts`)

`saveWebhookStatus` / `getWebhookStatus` persist the result of `getWebhookInfo` in `"ventra_tg_webhook_status"`. This is a UI display cache (shows last-known webhook URL and error in Settings). It is not security-sensitive and not used in any data-flow. The cache is read on Settings page load to avoid a flickering empty state before the real fetch completes.

**Intentional:** Correct pattern for a non-critical UI cache.

### L4 — `DEFAULT_WS = "default"` across all routes

Every API route defaults to workspace `"default"`. The `workspaceId` is accepted as a parameter but the UI always sends `"default"` (the Inbox and Settings pages hardcode it).

**Intentional:** The app is single-workspace. Multi-tenant support would require auth middleware to inject the real workspace ID. No action needed until multi-tenancy is planned.

### L5 — `telegram-account.ts` is entirely mock data

The "Personal Account" tab (Telegram MTProto import) uses `MOCK_CHATS` and `fetchAccountChats` stubs that return fabricated data with a simulated scan animation. The localStorage key `"ventra_tg_personal_mock"` is written during the demo flow.

**Intentional:** The feature is labeled "Coming Soon" in the UI. The mock data supports the demo UX. MTProto integration is a separate project.

### L6 — `generateImportSuggestions()` returns hardcoded AI suggestions

`MOCK_IMPORT_SUGGESTIONS` in `ai-suggestions.ts` is a static array of 5 fabricated suggestions seeded when Gmail or Personal Account import completes. These appear as real AI-detected tasks/deals.

**Intentional:** Powers the import demo flow. Not part of the real Telegram Bot pipeline.

---

## Items Confirmed Intentional (no action required)

| Item | Location | Reason |
|---|---|---|
| `buildMockTelegramConnection()` | `integrations.ts` | Simulated mode — lets users preview Inbox without a real bot |
| `isMock` flag on connections | `integrations.ts`, `reply-bar.tsx` | Distinguishes real vs simulated path throughout the send flow |
| Mock send path in `reply-bar.tsx` | Line 261 | Fires only when `conv.id` starts with `"conv-"` (demo conversations) or `tgChatId` is NaN; never fires for real Telegram conversations |
| Mock mode in `send/route.ts` | Lines 80–107 | Fires only when no bot is configured for workspace — correct fallback |
| `senderTelegramId: 0` for outbound | `send/route.ts` | The bot sends as itself; `0` is a known sentinel for "bot-side sender" |
| `senderName: "You"` for outbound | `send/route.ts` | Correct display label for messages sent by the operator |
| `⚠ DEV ONLY` in `gmail.ts` | Multiple | Gmail OAuth flow is fully mocked — separate integration, not Telegram |
| `MOCK_EMAIL_THREADS` | `gmail.ts` | Gmail mock data — separate integration |
| `isSimulated` flag in webhook routes | `webhook/[wsId]/route.ts` | Used by Settings "Send test message" button via `x-ventra-simulated: 1` header |
| Light theme / compact density "coming soon" | `i18n.ts`, `settings/page.tsx` | UI roadmap items, no relation to Telegram |
| `telegram-account-modal.tsx` simulated preview | All of it | Entire "Personal Account" tab is a Coming Soon demo |

---

## Confirmation

**TypeScript:** `npx tsc --noEmit` — **0 errors**  
**ESLint:** `npx eslint src/lib/integrations.ts src/lib/outbox.ts src/lib/storage.ts src/app/api/integrations/telegram/send/route.ts` — **0 errors, 0 warnings**
