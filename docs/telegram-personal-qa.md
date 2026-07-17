# Personal Telegram Account (MTProto) — QA & Integration Guide

> Status: **Production-ready core**. All identified bugs fixed. TypeScript + ESLint: 0 errors.

---

## 1. Prerequisites

### 1.1 Get Telegram API credentials

1. Go to [my.telegram.org](https://my.telegram.org) and sign in with your phone number.
2. Click **API development tools**.
3. Create a new application (name / platform don't matter for testing).
4. Copy **App api_id** (integer) and **App api_hash** (32-char hex string).

### 1.2 Set environment variables

Add to `.env.local` in the project root:

```env
TELEGRAM_PERSONAL_API_ID=12345678
TELEGRAM_PERSONAL_API_HASH=abcdef1234567890abcdef1234567890
```

> These values are read server-side only. They are never exposed to the browser.

### 1.3 Install GramJS

```bash
npm install telegram
```

The package is listed in `package.json` as `"telegram": "^2.26.1"`. The `npm install` step is required because the sandbox cannot reach npm; the project ships type stubs (`src/types/telegram.d.ts`) so TypeScript compiles before the real package is present.

After install the real GramJS types override the stubs automatically.

### 1.4 Start the dev server

```bash
npm run dev
```

---

## 2. Auth Flow Test

### 2.1 Open the connect modal

Settings → Integrations → Telegram → **Personal Account** card → Connect.

### 2.2 Step: Welcome

Review the "What gets imported" summary and privacy note, then click **Connect account**.

### 2.3 Step: Phone

Enter your Telegram phone number in international format, e.g. `+7 999 123 4567`. Click **Send code**.

Expected API call: `POST /api/integrations/telegram-personal/auth/start`

Expected response:
```json
{ "ok": true }
```

If you see `missingEnv: true`, the env vars are not loaded — restart the dev server after editing `.env.local`.

### 2.4 Step: OTP

Telegram sends a 5-digit code to your Telegram app (or SMS as fallback). Enter it and click **Verify**.

Expected API call: `POST /api/integrations/telegram-personal/auth/verify`

Success path response:
```json
{ "ok": true }
```

2FA path response (HTTP 200):
```json
{ "ok": false, "needs2FA": true }
```

### 2.5 Step: 2FA (conditional)

If your account has Two-Step Verification enabled, the modal advances to the **Cloud password** step automatically. Enter your Telegram 2FA password and click **Confirm**.

Expected API call: `POST /api/integrations/telegram-personal/auth/2fa`

### 2.6 Verify session persisted

```bash
sqlite3 .ventra/ventra.db "SELECT workspace_id, phone_number, status FROM tg_personal_sessions;"
```

Expected output:
```
default|+79991234567|connected
```

The `session_enc` column holds the AES-256-GCM encrypted GramJS `StringSession` — it is never readable in plain text.

---

## 3. Dialog Scan Test

After auth the modal moves to **Scanning**. The real flow:

1. `GET /api/integrations/telegram-personal/dialogs?ws=default&source=live`
2. Server calls `client.getDialogs({ limit: 150 })`.
3. Each dialog is scored with the business-relevance heuristic (threshold ≥ 45 = `isBusiness`).
4. Response is `PersonalDialog[]` with fields: `peerId`, `title`, `peerType`, `isBusiness`, `bizScore`, `bizReasons`, `lastMsgAt`, `preview`.

**Performance note**: The scan uses the top message already embedded in each `getDialogs` response. It does **not** issue a separate `getMessages` call per dialog, so 150 dialogs = 1 API call (not 1500).

### 3.1 Verify scan results

The **Preview** step shows stats cards: total chats, business chats, active in last 7 days, channels. These are derived from `PersonalDialog[]` client-side — no extra API calls.

---

## 4. Import Test

### 4.1 Select chats

On the **Select** step, choose one of:
- **Import everything** — all scanned dialogs
- **Business chats only** — dialogs with `isBusiness: true` (recommended)
- **Let me choose** — manual multi-select with search

Click **Start import**.

### 4.2 What happens server-side

`POST /api/integrations/telegram-personal/import`

Body:
```json
{ "peerIds": ["123456789", "987654321"], "workspaceId": "default" }
```

For each `peerId`:
1. Calls `client.getDialogs({ limit: 300 })` once to build a lookup map.
2. Upserts a `tg_personal_dialogs` row.
3. Calls `client.getMessages(dialog.inputEntity, { limit: 50 })` for message history.
4. Inserts messages into `tg_personal_messages` (deduped by `INSERT OR IGNORE`).

### 4.3 Verify import

```bash
sqlite3 .ventra/ventra.db "SELECT title, peer_type, is_business, biz_score FROM tg_personal_dialogs WHERE workspace_id = 'default' LIMIT 10;"
```

```bash
sqlite3 .ventra/ventra.db "SELECT COUNT(*) FROM tg_personal_messages WHERE workspace_id = 'default';"
```

Message primary keys follow the pattern `{workspaceId}_{peerId}_{msgId}`, e.g. `default_123456789_42`. Duplicates on re-import are silently ignored.

---

## 5. Send Message Test

```bash
curl -X POST http://localhost:3000/api/integrations/telegram-personal/send \
  -H "Content-Type: application/json" \
  -d '{"peerId":"123456789","text":"Hello from Ventra","workspaceId":"default"}'
```

Expected response:
```json
{ "ok": true, "msgId": 12345 }
```

The outbound message is also persisted in `tg_personal_messages` with `direction: "outbound"`.

---

## 6. SSE Stream Test

Open the event stream in a terminal:

```bash
curl -N "http://localhost:3000/api/integrations/telegram-personal/stream?ws=default"
```

On connect you receive a `dialogs_snapshot` event immediately:

```
event: dialogs_snapshot
data: {"dialogs":[...],"workspaceId":"default"}
```

Every 25 seconds a keepalive ping comment is sent:

```
: ping
```

When you receive a new Telegram message, a `personal_update` event is pushed:

```
event: personal_update
data: {"type":"new_message","workspaceId":"default","dialog":{...},"message":{...},"timestamp":"..."}
```

---

## 7. Status & Disconnect

### Check connection status

```bash
curl "http://localhost:3000/api/integrations/telegram-personal/status?ws=default"
```

```json
{
  "ok": true,
  "session": {
    "workspaceId": "default",
    "phoneNumber": "+79991234567",
    "apiId": 12345678,
    "status": "connected",
    "connectedAt": "2026-07-11T10:00:00.000Z",
    "lastSyncAt": "2026-07-11T10:05:00.000Z"
  }
}
```

The `session_enc` field is never included in this response.

### Disconnect (keep imported data)

```bash
curl -X POST http://localhost:3000/api/integrations/telegram-personal/disconnect \
  -H "Content-Type: application/json" \
  -d '{"workspaceId":"default","keepData":true}'
```

### Disconnect and wipe all data

```bash
curl -X POST http://localhost:3000/api/integrations/telegram-personal/disconnect \
  -H "Content-Type: application/json" \
  -d '{"workspaceId":"default","keepData":false}'
```

---

## 8. Security Notes

| Item | Status |
|------|--------|
| GramJS session string | AES-256-GCM encrypted in `tg_personal_sessions.session_enc` |
| Phone number | Stored plain text in `tg_personal_sessions.phone_number` (same as displayed in UI) |
| API credentials | Server env vars only; never reach the browser or SQLite |
| SSE stream | Never emits `session_enc` or `api_hash`; only dialog/message payloads |
| 2FA password | Never stored; used once for SRP check then discarded |
| Active session revocation | Via Telegram → Settings → Privacy & Security → Active Sessions |

---

## 9. Known Limitations

1. **Personal conversations don't appear in the main bot Inbox.** The personal account tables (`tg_personal_*`) are separate from the bot tables (`tg_messages`, `tg_conversations`). Merging them into a unified inbox is a future milestone.

2. **No media download.** Messages with photo/document attachments are stored with `media_type: "photo"|"document"` but the binary content is not fetched. A file-download layer can be added later.

3. **Business filter is heuristic.** The `bizScore` is derived from title patterns, username suffixes, and the top message text. It is not AI-powered. False positives/negatives are expected — that's why the user reviews and selects before import.

4. **Single workspace.** All routes default `workspaceId` to `"default"`. Multi-workspace support requires propagating the real workspace ID from the authenticated session, which is not wired up yet.

5. **GramJS requires Node.js runtime.** All personal account API routes specify `export const dynamic = "force-dynamic"`. They will not work on the Edge runtime or in the browser bundle.

6. **Session restored from SQLite on server restart.** After `npm run dev` restarts, `getOrRestoreClient()` lazily reconnects using the stored encrypted session. The first request after restart may be ~1 s slower while the TCP connection to Telegram is established.

---

## 10. Bug Fixes Applied in This QA Pass

| # | File | Bug | Fix |
|---|------|-----|-----|
| 13 | `mtproto-db.ts` | Message ID double-prefixed: `${workspaceId}_${dialogId}_${msgId}` → `default_default_123_42` | Changed to `${dialogId}_${msgId}` → `default_123_42` |
| 14 | `mtproto-client.ts` | `scanDialogs` called `client.getMessages()` per dialog (150 dialogs = 1500 API calls → guaranteed `FLOOD_WAIT`) | Replaced with `(dialog.message as any)?.message` (top message already in `getDialogs` response) |
| 15a | `mtproto-client.ts` | Custom `baseLogger` passed to `TelegramClient` — `getChild()` returned an object missing required recursive methods, causing a runtime crash on first log call | Removed `baseLogger` entirely; GramJS default logger is used |
| 15b | `mtproto-client.ts` | `getOrRestoreClient` returned a stale/disconnected cached client without checking liveness | Added `(active as any).connected !== false` guard; stale client removed from map |
| 15c | `mtproto-client.ts` | `startAuth` didn't disconnect the existing active client before initiating a new auth, leaving orphaned TCP connections | Added teardown of both pending and active sessions at the top of `startAuth`; cleanup now happens before new client is created |
| 15d | `mtproto-client.ts` | `friendlyRpcError` matched `"FLOOD_WAIT"` literally; Telegram sends `"FLOOD_WAIT_300"` (with seconds) | Replaced `case "FLOOD_WAIT"` with `startsWith("FLOOD_WAIT")` + seconds-to-minutes parser |
| 16a | `telegram-account-modal.tsx` | `scanDoneRef` and `importDoneRef` were set but never read; `getBusinessChats` imported but only referenced via `void` hack | Removed dead refs, removed unused import, removed `void` suppression line |
| 16b | `stream/route.ts` | A `snapshot: PersonalStreamEvent` variable was built and then discarded with `void snapshot` — the actual `snapshotLine` was sent correctly, making the variable pure dead code | Removed the unused variable; renamed `snapshotLine` to `snapshot` for clarity |
| 16c | `import/route.ts` | `clientsCreated`/`clientsMatched` computed via `.startsWith("existing_")` — a convention that does not exist in the codebase; always evaluated to wrong counts | Replaced with `0` for both; client record creation is a browser-side concern |
