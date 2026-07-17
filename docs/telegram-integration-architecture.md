# Telegram Integration Architecture
**Ventra CRM — Design Document**
Status: Draft · Date: 2026-07-01 · Phase: Pre-implementation

---

## 1. Integration Flow

```
Telegram User
     │
     │  sends message
     ▼
Telegram Bot API
     │
     │  POST (webhook, HMAC-signed)
     ▼
Next.js API Route
/api/telegram/webhook
     │
     ├─► Dedup check (telegramMessageId already stored?)
     │
     ├─► Persist TelegramMessage + update TelegramConversation
     │
     ├─► Emit real-time event (Pusher / SSE) → Inbox UI badge
     │
     └─► Queue AI analysis job (async, non-blocking)
              │
              ▼
         AI Analysis (Claude API or local prompt)
              │
              ├─► Match sender to existing Client (email / username / phone)
              │
              ├─► Extract intent: task request, follow-up, complaint, info, deal signal
              │
              └─► Persist AIActionSuggestion[]
                       │
                       ▼
                  Inbox Panel (UI)
                       │
                  Agent reviews suggestions:
                  ├─► Create Task
                  ├─► Update Client record
                  ├─► Move Deal stage
                  ├─► Send Telegram reply
                  └─► Link conversation to Client/Deal
```

**Key design principle:** The webhook handler is fire-and-forget fast (< 200 ms) — it saves the raw message and queues AI work. AI suggestions are eventual, not blocking.

---

## 2. Data Models

All models stored in the database (Postgres / Supabase recommended for future). For MVP localStorage keys are listed as a bridge.

### 2.1 TelegramConnection
One per workspace. Represents a connected bot.

```typescript
interface TelegramConnection {
  id:             string;
  workspaceId:    string;

  // Bot identity
  botToken:       string;          // AES-256 encrypted at rest, NEVER sent to client
  botId:          number;          // Telegram bot user ID
  botUsername:    string;          // e.g. "ventra_crm_bot"
  botDisplayName: string;

  // Webhook
  webhookUrl:     string;          // e.g. https://app.ventra.ai/api/telegram/webhook
  webhookSecret:  string;          // random 256-bit hex, used to verify X-Telegram-Bot-Api-Secret-Token

  status:         "active" | "inactive" | "error";
  errorMessage?:  string;

  createdAt:      string;          // ISO 8601
  updatedAt:      string;
}
```
**localStorage key (MVP):** `ventra_telegram_connection`

---

### 2.2 TelegramConversation
One per unique Telegram chat. Maps to a single contact or group thread.

```typescript
interface TelegramConversation {
  id:              string;
  connectionId:    string;          // FK → TelegramConnection

  // Telegram identity of the other party
  telegramChatId:  number;          // Telegram's chat_id (stable, use as dedup key)
  chatType:        "private" | "group" | "supergroup" | "channel";
  telegramUserId:  number | null;   // for private chats
  username:        string | null;   // @handle, if set
  firstName:       string;
  lastName:        string | null;
  phoneNumber:     string | null;   // only if user shared contact

  // CRM links
  linkedClientId:  string | null;   // FK → Client.id
  linkedDealId:    string | null;   // FK → Deal.id

  // State
  status:          "open" | "resolved" | "snoozed";
  assignedTo:      string | null;   // FK → User.id (future teams feature)
  snoozedUntil:    string | null;

  unreadCount:     number;
  lastMessageAt:   string;
  lastMessagePreview: string;       // first 120 chars of last message

  tags:            string[];

  createdAt:       string;
  updatedAt:       string;
}
```
**localStorage key (MVP):** `ventra_telegram_conversations`

---

### 2.3 TelegramMessage

```typescript
interface TelegramMessage {
  id:                string;
  conversationId:    string;          // FK → TelegramConversation

  // Telegram's own IDs (used for dedup + reply threading)
  telegramMessageId: number;
  telegramChatId:    number;

  direction:         "inbound" | "outbound";

  // Content
  text:              string | null;
  mediaType:         "text" | "photo" | "document" | "voice" | "video" | "sticker" | "location" | null;
  mediaFileId:       string | null;   // Telegram file_id (valid ~24–48h; re-download promptly)
  mediaStorageUrl:   string | null;   // URL after we've re-hosted the file
  caption:           string | null;

  // Reply chain
  replyToMessageId:  number | null;   // Telegram message_id this replies to

  // Sender
  senderTelegramId:  number;
  senderName:        string;
  senderIsBot:       boolean;

  // Processing
  receivedAt:        string;          // Telegram's message.date (Unix → ISO)
  processedAt:       string | null;   // when AI analysis ran
  readAt:            string | null;   // when agent opened the conversation

  createdAt:         string;
}
```
**localStorage key (MVP):** `ventra_telegram_messages`

---

### 2.4 AIActionSuggestion
Generated per message (or per conversation turn). One message can yield multiple suggestions.

```typescript
type SuggestionType =
  | "create_task"       // "Schedule follow-up call with Ivan"
  | "update_client"     // "Update status to Active"
  | "move_deal"         // "Move deal to Proposal stage"
  | "create_deal"       // "New inbound lead detected"
  | "send_reply"        // Drafted reply text
  | "link_client"       // "This looks like client: Apex Digital"
  | "add_tag"           // Tag the conversation
  | "escalate";         // Flag as urgent

interface AIActionSuggestion {
  id:              string;
  messageId:       string;          // FK → TelegramMessage
  conversationId:  string;          // FK → TelegramConversation

  type:            SuggestionType;
  label:           string;          // Human-readable e.g. "Create task: Call Ivan by Friday"
  confidence:      number;          // 0.0–1.0

  // Structured payload — shape depends on `type`
  payload:         Record<string, unknown>;
  /*
    create_task:   { title, priority, dueDate, clientName }
    update_client: { clientId, field, newValue }
    move_deal:     { dealId, toStage }
    create_deal:   { title, clientName, estimatedValue }
    send_reply:    { text }
    link_client:   { clientId, clientName, matchReason }
    add_tag:       { tag }
    escalate:      { reason }
  */

  status:          "pending" | "accepted" | "rejected" | "auto_applied";
  appliedAt:       string | null;
  appliedBy:       string | null;   // FK → User.id

  createdAt:       string;
}
```
**localStorage key (MVP):** `ventra_telegram_suggestions`

---

### 2.5 Supplementary: InboxItem
A unified Inbox entry that wraps a TelegramConversation (and future: email, WhatsApp threads).

```typescript
interface InboxItem {
  id:             string;
  channel:        "telegram" | "email" | "whatsapp";   // extensible
  conversationId: string;
  unreadCount:    number;
  assignedTo:     string | null;
  status:         "open" | "resolved" | "snoozed";
  lastActivityAt: string;
  preview:        string;
  linkedClientId: string | null;
  pendingSuggestions: number;       // count of unactioned AI suggestions
}
```

---

## 3. MVP Scope

### What's in MVP
- Connect **one Telegram bot** per workspace (BotFather token)
- Webhook handler receives and stores inbound messages
- **Inbox page** shows Telegram conversations with unread counts
- Open a conversation → see full message thread
- AI analyzes each message → surface 1–3 suggestions per message
- Agent can **accept a suggestion** (creates Task, updates Client, etc.) or **reject it**
- Manual **link conversation → Client**
- Basic **outbound reply** via bot (bot can reply to user)
- Settings page: connect/disconnect bot

### What's NOT in MVP
- Multiple bots
- Team assignment
- Auto-routing rules
- Group chats
- Media/file handling (text only)
- Read receipts
- Scheduled messages

---

## 4. Future Version

| Feature | Notes |
|---|---|
| Multiple bots / accounts | One per team, department, or brand |
| Team assignment | Round-robin, manual, or skill-based routing |
| Auto-routing rules | "If message contains invoice → assign to billing" |
| Full two-way messaging | Outbound scheduling, templates, quick replies |
| Group chat support | Mentions, thread tracking |
| Media storage | Re-host Telegram files to S3/R2 before they expire |
| Read receipts | Telegram delivery/read status for bots |
| Conversation SLA | Breach alerts for unanswered messages |
| WhatsApp / Email unified Inbox | Channel-agnostic InboxItem model supports this |
| Contact sync | Import Telegram contact info into Client record |
| Broadcast messages | Send to a segment of linked clients |
| Analytics | Response time, message volume, conversion from chat to deal |

---

## 5. Security

### 5.1 Token Storage
- Bot token stored **server-side only**, encrypted with AES-256-GCM
- Encryption key from environment variable (`TELEGRAM_ENCRYPTION_KEY`), never in source
- API routes return `botUsername` and `status` to the frontend — **never the token**
- Token rotation: UI allows re-entering a new token; old one is overwritten

### 5.2 Webhook Validation
Telegram supports a `secret_token` header on webhook registration. Every incoming request must be validated before processing:

```typescript
// /api/telegram/webhook.ts
const incoming = req.headers["x-telegram-bot-api-secret-token"];
const expected = connection.webhookSecret;  // 256-bit random hex stored server-side

if (!timingSafeEqual(Buffer.from(incoming), Buffer.from(expected))) {
  return res.status(401).json({ error: "Invalid signature" });
}
```

Use `crypto.timingSafeEqual` — never string equality (timing attack).

### 5.3 Rate Limiting
- Webhook endpoint: max 30 requests/second per bot (Telegram's own rate)
- Apply Next.js middleware rate limiting (`upstash/ratelimit` or simple token bucket) to prevent replay flooding

### 5.4 User Permissions
| Action | Required role |
|---|---|
| View Inbox | Member |
| Reply to conversation | Member |
| Accept/reject AI suggestion | Member |
| Link conversation to Client | Member |
| Connect/disconnect bot | Admin |
| View raw bot token | Never (no route exposes it) |
| Delete conversation data | Admin |

### 5.5 Data Privacy
- Store only what's needed: `text`, `senderId`, `timestamp` — no metadata beyond what Telegram sends
- **Retention policy**: configurable (default 90 days); cron job purges expired messages
- User deletion: if a client requests data erasure, delete all TelegramMessages linked to their conversation
- Messages tagged with the workspace ID — no cross-workspace data leakage
- If GDPR applies: display data processing notice in bot's `/start` message

---

## 6. Next.js API Routes

All under `/api/telegram/`.

### Connection management
| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/telegram/connect` | Register bot token, generate webhookSecret, call `setWebhook` on Telegram API |
| `DELETE` | `/api/telegram/disconnect` | Call `deleteWebhook`, clear token from DB |
| `GET` | `/api/telegram/status` | Return connection health (status, botUsername, messageCount) |

### Webhook
| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/telegram/webhook` | Telegram calls this. Validate signature → persist message → queue AI job |

### Conversations (Inbox)
| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/telegram/conversations` | List conversations (paginated, filter by status/assignee) |
| `GET` | `/api/telegram/conversations/[id]` | Single conversation + messages |
| `PATCH` | `/api/telegram/conversations/[id]` | Update status, assignee, tags, snoozedUntil |
| `POST` | `/api/telegram/conversations/[id]/link-client` | Link to CRM Client |
| `DELETE` | `/api/telegram/conversations/[id]` | Hard delete (GDPR / admin only) |

### Messaging
| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/telegram/conversations/[id]/reply` | Send outbound message via bot (calls Telegram `sendMessage`) |
| `POST` | `/api/telegram/conversations/[id]/read` | Mark all messages as read |

### AI Suggestions
| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/telegram/conversations/[id]/suggestions` | Fetch suggestions for a conversation |
| `POST` | `/api/telegram/suggestions/[id]/accept` | Apply suggestion (creates task / updates client / etc.) |
| `POST` | `/api/telegram/suggestions/[id]/reject` | Dismiss suggestion |

### Totals: 13 routes

---

## 7. Existing Pages — Required Updates

### 7.1 Inbox page (`/inbox`)
Currently: empty or placeholder.
**Changes needed:**
- Add "Telegram" filter tab alongside "All", "Email", etc.
- Conversation list: avatar (initials from name), unread count badge, last message preview, time, assigned agent, linked client chip
- Message thread panel: chronological messages, direction-styled bubbles (inbound left / outbound right), reply input box (textarea + send button)
- AI Suggestions panel: right sidebar showing pending suggestions as action cards with Accept / Reject buttons
- Real-time unread badge in sidebar nav icon (connect to SSE/Pusher channel)

### 7.2 Clients page (`/clients`)
**Changes needed:**
- In client detail panel: add "Telegram" section showing linked conversations (count + latest preview)
- Clicking "View conversation" opens the Inbox thread for that conversation
- In client list: optional "Last Telegram contact" column
- Link/unlink button on the conversation → client link

### 7.3 Tasks page (`/tasks`)
**Changes needed:**
- Tasks created from Telegram suggestions get a `source: "telegram"` metadata field
- In task detail panel: show "Created from Telegram message" with a link to the conversation
- In task list: optional Telegram icon indicator on sourced tasks

### 7.4 Notifications
**Changes needed:**
- New notification type: `"telegram_message"` — triggers when unread Telegram message sits unanswered for > 30 min (configurable)
- New notification type: `"suggestion_pending"` — when AI suggestion goes unactioned for > 2 hours
- Notification bell in top bar shows unread Telegram count as a badge sub-count

### 7.5 Settings page (`/settings`)
**Changes needed:**
- New "Integrations" section (currently absent)
- Telegram subsection:
  - "Connect Bot" flow: input field for bot token, validation call, success state showing bot username
  - Webhook status indicator (active / error with error message)
  - "Disconnect" button with confirmation
  - Message retention period selector (30 / 90 / 365 days / forever)
  - (Future) Multiple bots list with per-bot controls

---

## 8. Implementation Phases

### Phase 1 — Foundation (MVP Core) · ~2 weeks
1. Settings: bot connection UI + `/api/telegram/connect` + `/api/telegram/disconnect`
2. Webhook handler: `/api/telegram/webhook` with signature validation + message persistence
3. Data layer: TelegramConnection, TelegramConversation, TelegramMessage models (localStorage for now)
4. Inbox page: conversation list + message thread view (read-only, no suggestions yet)
5. Real-time: unread badge in nav via polling (500ms interval, replace with SSE in Phase 2)

**Exit criteria:** A Telegram user messages the bot → it appears in Ventra Inbox within 2 seconds.

### Phase 2 — AI Suggestions · ~1 week
1. AI analysis job: called after message is persisted, runs Claude prompt with message + conversation context
2. AIActionSuggestion model + persistence
3. Inbox: suggestions sidebar with Accept/Reject
4. Accept handlers: task creation, client update, deal stage move
5. Client link: match by username/phone → auto-suggest link on first message

**Exit criteria:** Agent receives a message, sees "Create task: Call Ivan" suggestion, clicks Accept → task appears in Tasks page.

### Phase 3 — Two-way Messaging · ~1 week
1. Outbound reply: `/api/telegram/conversations/[id]/reply` → Telegram `sendMessage`
2. Reply input in Inbox thread panel
3. Outbound messages stored as TelegramMessage with `direction: "outbound"`
4. AI-drafted replies: suggestion type `send_reply` → one-click send

**Exit criteria:** Agent replies to Telegram message from inside Ventra. User receives it on Telegram.

### Phase 4 — Client & CRM Integration · ~1 week
1. Clients page: Telegram section in detail panel
2. Tasks: `source: telegram` metadata + conversation link
3. Notifications: unread + suggestion-pending alerts
4. Conversation tags + snooze

### Phase 5 — Scale & Teams · ~3 weeks
1. Multiple bots (one connection per channel/team)
2. Team assignment: assign conversation to agent
3. Auto-routing rules engine
4. Media file re-hosting (S3/R2 proxy before Telegram CDN expiry)
5. SSE/Pusher for true real-time (replace polling)
6. Analytics dashboard: message volume, response time, conversion rate

---

## 9. Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| **Bot-only limitation** — Telegram bots can only receive messages if the user initiates first (no cold outreach) | High | Certain | Document clearly; add a bot `/start` link to client onboarding emails |
| **File expiry** — Telegram `file_id` links expire within ~24–48 hours | Medium | Certain | Phase 3: download and re-host files immediately on receipt |
| **Webhook downtime** — if Ventra's server is down, Telegram queues updates for 24h then drops them | High | Low | Implement catch-up polling on startup via `getUpdates` offset |
| **AI hallucination** — wrong client link or wrong task created | High | Medium | Suggestions are always human-approved in MVP; confidence threshold < 0.6 shows suggestion but warns "low confidence" |
| **Token compromise** — bot token leaked gives attacker full bot control | Critical | Low | Encrypt at rest, rotate via UI, alert on unexpected webhook registrations |
| **Telegram rate limits** — 30 msg/sec outbound per bot | Low | Low | Queue outbound messages; surface errors in UI |
| **GDPR scope creep** — messages may include PII of EU contacts | High | Medium | Add retention policy from day 1; provide data export/delete per conversation |
| **Webhook signature bypass** — forged requests | High | Low | `timingSafeEqual` validation; reject on any mismatch with 401 |
| **Scalability of localStorage** — thousands of messages per workspace | Medium | Certain (future) | Architecture defined with DB models from day 1; localStorage is a temporary bridge |

---

## 10. Recommended First Task

**Build the Telegram bot connection + webhook handler (Phase 1, steps 1–2)**

Why this first:
- Everything downstream depends on messages arriving reliably
- It's fully self-contained (Settings UI + 2 API routes + 1 model)
- Produces a visible, testable result immediately (message appears in console log before Inbox is built)
- Validates that Next.js API routes can handle Telegram's webhook format and signature
- No AI, no UI complexity — pure infrastructure

**Concrete deliverables for Task 1:**
1. `src/lib/telegram.ts` — TelegramConnection type, `encryptToken`/`decryptToken`, `setWebhook`, `deleteWebhook` helpers
2. `src/app/api/telegram/connect/route.ts` — registers token, calls Telegram API, stores connection
3. `src/app/api/telegram/disconnect/route.ts` — removes webhook, clears connection
4. `src/app/api/telegram/webhook/route.ts` — validates `X-Telegram-Bot-Api-Secret-Token`, parses update, stores TelegramMessage + upserts TelegramConversation
5. `src/app/(app)/settings/page.tsx` — Integrations section with bot connect form
6. `localStorage` keys for TelegramConnection, TelegramConversation, TelegramMessage

**Test:** Run a local ngrok tunnel → register webhook → send a message from Telegram → confirm it appears in `localStorage` via browser devtools.

---

## Appendix: Telegram Bot Setup Flow (User Journey)

```
Settings → Integrations → Telegram → "Connect Bot"
  │
  ├─ 1. User opens @BotFather on Telegram → /newbot → gets token
  │
  ├─ 2. User pastes token into Ventra Settings form
  │
  ├─ 3. Ventra calls GET https://api.telegram.org/bot{token}/getMe
  │      → validates token, reads botUsername and botId
  │
  ├─ 4. Ventra generates random webhookSecret (256-bit)
  │
  ├─ 5. Ventra calls setWebhook with:
  │      url: https://{ventra-domain}/api/telegram/webhook
  │      secret_token: webhookSecret
  │
  ├─ 6. Ventra encrypts token, stores TelegramConnection
  │
  └─ 7. Settings shows: ✓ Connected as @ventra_crm_bot
         Share this link with clients: t.me/ventra_crm_bot
```

---

*Document owner: Ventra engineering · Next review: after Phase 1 completion*
