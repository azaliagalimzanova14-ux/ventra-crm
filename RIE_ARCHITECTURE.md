# Relationship Intelligence Engine — Architecture Document
## Sprint 2: "Ventra Understands Relationships"

**Version:** 1.0  
**Status:** Awaiting approval before implementation  
**Stack:** Next.js App Router · Node 22 · SQLite (DatabaseSync) · OpenAI-compatible provider  
**Author:** CTO / AI Engineering Team  
**Date:** July 17, 2026

---

## 0. Design Philosophy

The Relationship Intelligence Engine (RIE) is not a feature. It is the nervous system of Ventra.

Every piece of data that flows through Ventra — a new message, a stage change, a replied email, a closed deal — must pass through the RIE. The RIE listens, learns, stores, and surfaces. It never forgets. It connects events that humans wouldn't notice. Over weeks, it builds a model of each relationship that is more accurate than the founder's own memory.

**Seven subsystems, one brain:**

| Subsystem | What it learns | What it produces |
|---|---|---|
| 1. Relationship Rhythm | Communication velocity per client | Deviation alerts when silence is anomalous |
| 2. AI Memory | Facts, signals, preferences per entity | Context injected into every AI call |
| 3. Deal Narrative | Deal trajectory and behavioral signals | A strategic reading of each deal |
| 4. Business Momentum Score | Energy across all relationships + pipeline | A daily composite score with trend |
| 5. Win/Loss Learning | Pattern vectors from closed deals | Coaching overlaid on active deals |
| 6. Proactive Follow-Up | Trigger conditions per client/deal | Scheduled proactive actions |
| 7. Pre-Call Intelligence | Calendar events × relationship context | Meeting briefs 30 minutes before calls |

**Architectural constraints:**
- Server-only processing. No client-side AI logic.
- Every subsystem is workspace-scoped. No data crosses workspace boundaries.
- AI calls are async and gracefully degrade (no API key = rule-based fallback).
- SQLite-first. Schema is forward-compatible with PostgreSQL migration.
- All new tables extend the existing migration system (version 16+).

---

## 1. Data Model

### 1.1 Migration Strategy

All RIE tables are added in a single migration (v16). The migration follows the existing pattern in `migrations.ts`: versioned, transactional, idempotent, non-destructive.

New tables introduced:

```
rie_relationship_rhythms     — per (workspace_id, client_id)
rie_ai_memory                — per (workspace_id, entity_type, entity_id)
rie_deal_narratives          — per (workspace_id, deal_id)
rie_momentum_scores          — per (workspace_id, date)
rie_win_loss_patterns        — per (workspace_id, deal_id) — closed deals only
rie_proactive_triggers       — per (workspace_id) — scheduled actions queue
rie_call_briefs              — per (workspace_id, client_id, brief_date)
rie_signal_events            — per workspace — internal event log for the RIE
```

---

### 1.2 Table Definitions

#### `rie_relationship_rhythms`

Stores the learned communication model for each client relationship.

```sql
CREATE TABLE IF NOT EXISTS rie_relationship_rhythms (
  id                    TEXT    PRIMARY KEY,
  workspace_id          TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id             TEXT    NOT NULL REFERENCES clients(id)    ON DELETE CASCADE,

  -- Baseline metrics (rolling 90-day window, recalculated weekly)
  avg_response_time_hrs REAL,           -- Average hours between client message and agent reply
  avg_contact_gap_days  REAL,           -- Average days between any contact events
  msg_per_week          REAL,           -- Average messages per week (both directions)
  sentiment_baseline    TEXT,           -- "positive" | "neutral" | "negative" — rolling average
  typical_reply_days    TEXT,           -- JSON: [0,1,2,3,4] — which days of week client replies
  typical_reply_hours   TEXT,           -- JSON: [9,10,11] — which hours of day client replies

  -- Current state
  last_contact_at       TEXT,           -- ISO timestamp of most recent message (either direction)
  last_client_msg_at    TEXT,           -- ISO timestamp of client's most recent message
  last_agent_msg_at     TEXT,           -- ISO timestamp of agent's most recent message
  days_since_contact    INTEGER,        -- Computed on read, stored for query performance
  current_gap_score     REAL,           -- How anomalous the current silence is (0–100)

  -- Deviation detection
  silence_threshold_days REAL,          -- Personalized alert threshold (2× avg_contact_gap_days)
  is_overdue            INTEGER NOT NULL DEFAULT 0,  -- 1 if current_gap_score > 70
  deviation_magnitude   TEXT,           -- "normal" | "slight" | "significant" | "critical"

  -- Metadata
  sample_size           INTEGER NOT NULL DEFAULT 0,  -- Number of interactions used to compute baseline
  baseline_computed_at  TEXT,           -- When baseline was last recalculated
  updated_at            TEXT    NOT NULL,

  UNIQUE(workspace_id, client_id)
);
```

**Key design decision:** `silence_threshold_days` is personalized per client (2× their average contact gap), not a global setting. A client you talk to daily gets an alert at 3 days of silence. A client you talk to monthly gets an alert at 60+ days.

---

#### `rie_ai_memory`

The persistent memory store. Everything Ventra learns about an entity that is not a structured field goes here.

```sql
CREATE TABLE IF NOT EXISTS rie_ai_memory (
  id            TEXT    PRIMARY KEY,
  workspace_id  TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type   TEXT    NOT NULL,       -- "client" | "deal" | "workspace"
  entity_id     TEXT    NOT NULL,       -- FK to the relevant entity

  -- Memory entry
  memory_type   TEXT    NOT NULL,       -- See memory types below
  content       TEXT    NOT NULL,       -- The learned fact or observation (human-readable)
  source        TEXT    NOT NULL,       -- "message" | "deal_event" | "task" | "manual" | "pattern"
  source_id     TEXT,                   -- ID of the specific event that generated this memory
  confidence    INTEGER NOT NULL DEFAULT 80,   -- 0–100

  -- Lifecycle
  is_active     INTEGER NOT NULL DEFAULT 1,    -- 0 = superseded or retracted
  superseded_by TEXT,                   -- ID of newer memory that replaced this one
  created_at    TEXT    NOT NULL,
  last_seen_at  TEXT    NOT NULL        -- Updated each time this memory is still true
);
```

**Memory types (`memory_type` values):**

| Type | Example content |
|---|---|
| `preference` | "Prefers communication via Telegram, not email" |
| `concern` | "Expressed hesitation about implementation timeline in March" |
| `decision_maker` | "Sarah is the decision maker; board approval required for >$20K" |
| `topic` | "Interested in AI features, specifically reply drafts" |
| `pattern` | "Usually replies within 4 hours on weekday mornings" |
| `milestone` | "Signed first contract on 2026-03-15" |
| `risk` | "Mentioned budget review in Q3 — may delay" |
| `intent` | "Expressed intent to upgrade to Pro by end of quarter" |
| `win_signal` | "Asked about contract terms — strong closing signal" |
| `loss_signal` | "Response time dropped from 1 day to 5 days — cooling pattern" |

**Key design decision:** Memory entries are immutable by default. When a memory becomes false or is updated, the old entry is marked `is_active=0` and a new entry is created. This gives us a full history of what the AI believed at any point in time, and enables future "why did you think that?" queries.

---

#### `rie_deal_narratives`

Stores the AI-generated strategic reading of each deal, versioned by when it was generated.

```sql
CREATE TABLE IF NOT EXISTS rie_deal_narratives (
  id              TEXT    PRIMARY KEY,
  workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  deal_id         TEXT    NOT NULL REFERENCES deals(id)      ON DELETE CASCADE,

  -- The narrative
  narrative       TEXT    NOT NULL,     -- 3–5 sentence strategic reading of the deal
  recommended_action TEXT NOT NULL,     -- Single most important next action
  risk_level      TEXT    NOT NULL,     -- "low" | "medium" | "high" | "critical"
  momentum        TEXT    NOT NULL,     -- "accelerating" | "stable" | "slowing" | "stalled"

  -- Signals that generated this narrative
  signal_version  TEXT    NOT NULL,     -- Hash of input signals (used to detect when re-generation is needed)
  signals_json    TEXT    NOT NULL,     -- JSON: the structured signals used to generate this narrative
  active_memories TEXT,                 -- JSON: memory IDs referenced in this narrative

  -- Metadata
  model           TEXT,
  provider        TEXT,
  generated_at    TEXT    NOT NULL,
  is_current      INTEGER NOT NULL DEFAULT 1  -- Only the latest is 1
);
```

---

#### `rie_momentum_scores`

Daily snapshot of the business momentum score.

```sql
CREATE TABLE IF NOT EXISTS rie_momentum_scores (
  id                TEXT    PRIMARY KEY,
  workspace_id      TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  score_date        TEXT    NOT NULL,   -- YYYY-MM-DD

  -- Composite score
  score             INTEGER NOT NULL,   -- 0–100
  trend             TEXT    NOT NULL,   -- "up" | "stable" | "down"
  delta             INTEGER,            -- Change from previous day

  -- Factor breakdown (stored for UI display)
  factor_deals      INTEGER,            -- Sub-score: deal pipeline health (0–100)
  factor_comms      INTEGER,            -- Sub-score: communication health (0–100)
  factor_tasks      INTEGER,            -- Sub-score: task completion rate (0–100)
  factor_clients    INTEGER,            -- Sub-score: client engagement health (0–100)

  -- Narrative
  explanation       TEXT    NOT NULL,   -- 1 sentence: "Momentum is up because..."
  top_driver        TEXT    NOT NULL,   -- Single biggest positive factor
  top_drag          TEXT,               -- Single biggest negative factor (null if all positive)

  -- Metadata
  computed_at       TEXT    NOT NULL,

  UNIQUE(workspace_id, score_date)
);
```

---

#### `rie_win_loss_patterns`

Pattern vectors extracted from every closed deal. This table is the training set for the win/loss learning subsystem.

```sql
CREATE TABLE IF NOT EXISTS rie_win_loss_patterns (
  id                  TEXT    PRIMARY KEY,
  workspace_id        TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  deal_id             TEXT    NOT NULL REFERENCES deals(id)      ON DELETE CASCADE,
  outcome             TEXT    NOT NULL,   -- "won" | "lost"

  -- Timeline signals
  total_days          INTEGER,            -- Days from creation to close
  days_in_each_stage  TEXT,               -- JSON: {"lead": 5, "qualified": 12, ...}
  stage_transitions   INTEGER,            -- Total number of stage moves
  velocity_trend      TEXT,               -- "accelerating" | "stable" | "decelerating"

  -- Communication signals
  total_messages      INTEGER,
  client_initiation_pct REAL,             -- % of conversations initiated by client (high = engaged)
  avg_client_response_hrs REAL,
  response_trend      TEXT,               -- "improving" | "stable" | "declining"
  sentiment_at_close  TEXT,               -- "positive" | "neutral" | "negative"
  decision_maker_involved INTEGER,        -- 1 if decision-maker appeared in conversations

  -- Behavioral signals
  questions_asked     INTEGER,            -- Number of questions the client asked
  price_mentioned     INTEGER,            -- 1 if price/budget discussed
  competitor_mentioned INTEGER,           -- 1 if competitor mentioned
  urgency_signals     INTEGER,            -- Count of urgency-related phrases

  -- AI-extracted pattern labels
  pattern_labels      TEXT,               -- JSON: ["fast_close", "decision_maker_involved", "price_sensitive"]
  autopsy_narrative   TEXT,               -- AI-written post-close analysis

  extracted_at        TEXT    NOT NULL,

  UNIQUE(workspace_id, deal_id)
);
```

---

#### `rie_proactive_triggers`

The queue of proactive actions the RIE wants to take. Actions are evaluated on a schedule and delivered when conditions are met.

```sql
CREATE TABLE IF NOT EXISTS rie_proactive_triggers (
  id              TEXT    PRIMARY KEY,
  workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  trigger_type    TEXT    NOT NULL,     -- See trigger types below
  entity_type     TEXT,                 -- "client" | "deal" | "workspace"
  entity_id       TEXT,                 -- FK to relevant entity

  -- Trigger condition
  condition_json  TEXT    NOT NULL,     -- JSON: the condition that must be true to fire
  priority        TEXT    NOT NULL,     -- "low" | "medium" | "high" | "urgent"

  -- Delivery
  status          TEXT    NOT NULL DEFAULT 'pending',  -- "pending" | "delivered" | "dismissed" | "snoozed"
  delivery_surface TEXT,                -- "ambient_bar" | "notification" | "morning_brief" | "dashboard"
  delivered_at    TEXT,
  snoozed_until   TEXT,

  -- Content (pre-generated for fast delivery)
  title           TEXT    NOT NULL,     -- Short headline
  body            TEXT    NOT NULL,     -- Full suggestion text (Ventra's voice)
  action_type     TEXT,                 -- "draft_reply" | "create_task" | "move_deal" | "navigate"
  action_params   TEXT,                 -- JSON: params for the action

  created_at      TEXT    NOT NULL,
  expires_at      TEXT                  -- Auto-dismiss if not acted on
);
```

**Trigger types:**
- `rhythm_deviation` — silence is anomalous for this client
- `deal_stall` — deal has not moved in longer than workspace average
- `deal_closing_soon` — deal close date within 7 days
- `win_pattern_match` — active deal matches historical win patterns
- `loss_pattern_match` — active deal matches historical loss patterns
- `follow_up_due` — scheduled follow-up for a client
- `morning_brief` — daily briefing delivery
- `pre_call` — meeting in <30 minutes

---

#### `rie_call_briefs`

Pre-call intelligence briefs, generated from calendar events × relationship context.

```sql
CREATE TABLE IF NOT EXISTS rie_call_briefs (
  id              TEXT    PRIMARY KEY,
  workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id       TEXT    REFERENCES clients(id) ON DELETE SET NULL,

  -- Brief content
  brief_date      TEXT    NOT NULL,     -- YYYY-MM-DD of the call
  call_at         TEXT,                 -- ISO timestamp of the meeting
  attendee_name   TEXT    NOT NULL,     -- Client name (denormalized for display)
  attendee_email  TEXT,

  -- Sections (all AI-generated)
  context_summary TEXT    NOT NULL,     -- 2–3 sentences: who, history, open items
  key_signals     TEXT    NOT NULL,     -- JSON: behavioral signals from last 2 weeks
  talking_points  TEXT    NOT NULL,     -- JSON: string[] — 3 suggested talking points
  watch_for       TEXT    NOT NULL,     -- 1 sentence: what to listen for in this call
  suggested_outcome TEXT  NOT NULL,     -- What a successful call looks like
  memory_refs     TEXT,                 -- JSON: memory IDs referenced in this brief

  -- Metadata
  model           TEXT,
  provider        TEXT,
  generated_at    TEXT    NOT NULL,

  UNIQUE(workspace_id, client_id, brief_date)
);
```

---

#### `rie_signal_events`

Internal event log. Every signal that flows through the RIE is recorded here. This is the audit trail, the debugging surface, and the raw material for future learning.

```sql
CREATE TABLE IF NOT EXISTS rie_signal_events (
  id              TEXT    PRIMARY KEY,
  workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type      TEXT    NOT NULL,     -- See event taxonomy below
  entity_type     TEXT,
  entity_id       TEXT,
  payload_json    TEXT    NOT NULL,     -- Full event payload
  processed       INTEGER NOT NULL DEFAULT 0,  -- 1 after all handlers have run
  processed_at    TEXT,
  created_at      TEXT    NOT NULL
);
```

---

### 1.3 Indexes

```sql
-- Relationship rhythms: look up by client
CREATE INDEX IF NOT EXISTS idx_rie_rhythms_client    ON rie_relationship_rhythms(workspace_id, client_id);
CREATE INDEX IF NOT EXISTS idx_rie_rhythms_overdue   ON rie_relationship_rhythms(workspace_id, is_overdue);

-- AI memory: look up by entity
CREATE INDEX IF NOT EXISTS idx_rie_memory_entity     ON rie_ai_memory(workspace_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_rie_memory_active     ON rie_ai_memory(workspace_id, entity_type, entity_id, is_active);
CREATE INDEX IF NOT EXISTS idx_rie_memory_type       ON rie_ai_memory(workspace_id, memory_type, is_active);

-- Deal narratives: look up by deal
CREATE INDEX IF NOT EXISTS idx_rie_narratives_deal   ON rie_deal_narratives(workspace_id, deal_id, is_current);

-- Momentum: look up by date
CREATE INDEX IF NOT EXISTS idx_rie_momentum_date     ON rie_momentum_scores(workspace_id, score_date);

-- Win/loss: look up by outcome
CREATE INDEX IF NOT EXISTS idx_rie_patterns_outcome  ON rie_win_loss_patterns(workspace_id, outcome);

-- Triggers: look up pending by priority
CREATE INDEX IF NOT EXISTS idx_rie_triggers_pending  ON rie_proactive_triggers(workspace_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_rie_triggers_entity   ON rie_proactive_triggers(workspace_id, entity_type, entity_id);

-- Signal events: look up unprocessed
CREATE INDEX IF NOT EXISTS idx_rie_signals_pending   ON rie_signal_events(workspace_id, processed, created_at);
```

---

## 2. Backend Architecture

### 2.1 Layer Structure

```
src/lib/server/rie/
├── index.ts              — Public API: exports everything the API routes need
├── signal-bus.ts         — Internal event bus: ingests and dispatches signals
├── rhythm-engine.ts      — Subsystem 1: Relationship Rhythm
├── memory-engine.ts      — Subsystem 2: AI Memory
├── narrative-engine.ts   — Subsystem 3: Deal Narrative
├── momentum-engine.ts    — Subsystem 4: Business Momentum Score
├── winloss-engine.ts     — Subsystem 5: Win/Loss Learning
├── proactive-engine.ts   — Subsystem 6: Proactive Follow-Up
├── precall-engine.ts     — Subsystem 7: Pre-Call Intelligence
├── context-assembler.ts  — Shared: builds AI context from memory + rhythm + patterns
└── db-rie.ts             — Database helpers for all RIE tables
```

```
src/app/api/rie/
├── signal/route.ts           — POST: receive signals from API routes
├── rhythm/[clientId]/route.ts — GET: rhythm for a client
├── memory/route.ts            — GET: memory for an entity
├── narrative/[dealId]/route.ts — GET/POST: deal narrative
├── momentum/route.ts          — GET: current momentum score
├── triggers/route.ts          — GET: pending proactive triggers, PATCH: dismiss/snooze
├── brief/morning/route.ts     — GET: today's morning brief
├── brief/precall/route.ts     — GET: pre-call brief for a client
└── winloss/route.ts           — GET: win/loss patterns, POST: trigger autopsy
```

---

### 2.2 The Signal Bus (`signal-bus.ts`)

This is the heart of the RIE. Every system event in Ventra emits a signal. The bus receives, validates, stores, and dispatches each signal to the appropriate engines.

**Signal taxonomy:**

```typescript
type RIESignalType =
  // Communication signals
  | "message.received"       // New inbound message from client
  | "message.sent"           // Agent sent a message
  | "reply.drafted"          // AI drafted a reply
  | "reply.accepted"         // User accepted an AI draft
  
  // Deal signals
  | "deal.created"
  | "deal.stage_changed"
  | "deal.won"
  | "deal.lost"
  | "deal.probability_changed"
  | "deal.updated"
  
  // Client signals
  | "client.created"
  | "client.updated"
  | "client.merged"          // Future: dedup
  
  // Task signals
  | "task.created"
  | "task.completed"
  | "task.overdue"           // Synthesized by the scheduler
  
  // Calendar signals
  | "calendar.event_upcoming" // Meeting in <2 hours — triggers pre-call brief
  
  // System signals (generated internally by the RIE)
  | "rie.rhythm_computed"
  | "rie.narrative_generated"
  | "rie.trigger_fired"
  | "rie.brief_generated";
```

**Signal payload interface:**

```typescript
interface RIESignal {
  type:         RIESignalType;
  workspaceId:  string;
  userId:       string;        // Actor (who caused this signal)
  entityType?:  "client" | "deal" | "task" | "conversation";
  entityId?:    string;
  clientId?:    string;        // Denormalized for faster rhythm lookup
  dealId?:      string;        // Denormalized for faster narrative lookup
  payload:      Record<string, unknown>;  // Signal-specific data
  emittedAt:    string;        // ISO timestamp
}
```

**Dispatch table** — which engines handle which signals:

| Signal | Rhythm | Memory | Narrative | Momentum | WinLoss | Proactive | PreCall |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `message.received` | ✓ | ✓ | | ✓ | | ✓ | |
| `message.sent` | ✓ | | | ✓ | | | |
| `deal.stage_changed` | | ✓ | ✓ | ✓ | | ✓ | |
| `deal.won` | | ✓ | | ✓ | ✓ | | |
| `deal.lost` | | ✓ | | ✓ | ✓ | | |
| `deal.updated` | | | ✓ | ✓ | | | |
| `task.completed` | | | | ✓ | | | |
| `task.overdue` | | | | ✓ | | ✓ | |
| `calendar.event_upcoming` | | | | | | | ✓ |
| `client.updated` | | ✓ | | | | | |

**Processing model:** Synchronous dispatch within the same Node.js request for speed, with a fallback to the `rie_signal_events` table for signals that need async processing or retry. This keeps latency low for the happy path while ensuring reliability.

---

### 2.3 Rhythm Engine (`rhythm-engine.ts`)

**Inputs:** `message.received`, `message.sent`  
**Outputs:** Updated `rie_relationship_rhythms` row + optional `rie_proactive_triggers` entry

**Algorithm:**

```
On every message signal for (workspace_id, client_id):

1. FETCH existing rhythm record (or create new one)
2. UPDATE last_contact_at, last_client_msg_at or last_agent_msg_at
3. INCREMENT sample_size
4. If sample_size >= 5 and baseline_computed_at is >7 days old:
   — RECOMPUTE baseline:
       avg_contact_gap_days = mean(gaps between consecutive contacts over 90 days)
       avg_response_time_hrs = mean(time from client msg to agent reply)
       msg_per_week = total messages / weeks in sample
       silence_threshold_days = max(3, avg_contact_gap_days * 2.0)
5. COMPUTE current deviation:
   days_since_contact = NOW - last_contact_at
   current_gap_score = (days_since_contact / silence_threshold_days) * 100
   capped at 100
6. UPDATE is_overdue = (current_gap_score > 70)
7. If is_overdue transitioned from 0→1:
   EMIT proactive trigger: type="rhythm_deviation", priority based on gap_score
```

**Why this works:** The threshold is personalized. A client you speak to daily has a threshold of 3 days (2× their 1.5-day average). A client you speak to monthly has a threshold of 60 days. The score is 0–100 where 70+ means "unusually long silence for *this* relationship."

---

### 2.4 Memory Engine (`memory-engine.ts`)

**Inputs:** All signals  
**Outputs:** New `rie_ai_memory` rows

**Core operation — `extractAndStore(signal)`:**

```
1. Assemble the last 10 messages from the conversation (if signal is message-related)
2. Assemble recent deal events (if signal is deal-related)
3. Fetch existing active memories for this entity
4. Call AI: "Given these new signals and existing memories, what new facts have you learned? 
   What existing memories should be updated or superseded?"
5. AI returns: 
   { 
     new: [{ memory_type, content, confidence, source }],
     supersede: [{ memory_id: string, reason: string }]
   }
6. INSERT new memory rows
7. UPDATE superseded rows: is_active=0, superseded_by=new_id
```

**Memory deduplication:** Before inserting a new memory, the engine checks for semantic similarity against existing active memories. If a memory of the same type with >85% similar content already exists, it updates `last_seen_at` instead of inserting a duplicate.

**Memory retrieval for context assembly:**

```typescript
function getMemoriesForContext(
  workspaceId: string,
  entityType:  string,
  entityId:    string,
  maxTokens:   number = 500
): string {
  // Fetch all active memories, sorted by: is_active DESC, confidence DESC
  // Format as a structured context block for injection into AI prompts
  // Truncate to fit maxTokens budget
}
```

---

### 2.5 Narrative Engine (`narrative-engine.ts`)

**Inputs:** `deal.stage_changed`, `deal.updated`, `deal.won`, `deal.lost`  
**Outputs:** Updated `rie_deal_narratives` row

**Generation trigger:** A new narrative is generated when the `signal_version` (hash of current deal state + recent messages + active memories) differs from the stored narrative's `signal_version`. This avoids redundant AI calls when nothing has changed.

**Context assembly for narrative generation:**

```
Deal fields: title, stage, value, probability, expected_close, days_since_update
Recent messages: last 20 messages from linked conversations
Active memories: all memories for this client and this deal
Win/loss patterns: pattern labels from workspace's won deals at this stage
Rhythm data: current gap_score for the client
```

**Narrative output format:**

```typescript
interface DealNarrative {
  narrative:          string;   // 3–5 sentences, strategic reading
  recommended_action: string;   // Single most important next action
  risk_level:         "low" | "medium" | "high" | "critical";
  momentum:           "accelerating" | "stable" | "slowing" | "stalled";
}
```

**Example output:**

> "The Apex Digital deal is in its fourth week at Proposal — 2 weeks longer than your average for this stage. Sarah's response time has dropped from 4 hours to 2 days, which is a pattern Ventra has seen in 3 of your last 4 lost deals. However, she asked about implementation costs yesterday — a question type that appeared in 80% of your won deals. The deal is cooling but not lost. Risk: she may need budget approval you haven't accounted for."
>
> Recommended action: "Schedule a direct call to ask about the approval process — don't wait for her to initiate."

---

### 2.6 Momentum Engine (`momentum-engine.ts`)

**Inputs:** All signals + scheduled daily recalculation  
**Outputs:** Daily `rie_momentum_scores` row

**Composite score formula:**

```
factor_deals (0–100):
  base = 50
  + 10 per deal that advanced stage this week
  + 5 per deal with probability > 70%
  - 15 per deal stuck past expected close date
  - 10 per deal where client response time increased 50%+ this week
  capped 0–100

factor_comms (0–100):
  base = 50
  + 10 per client contact in last 3 days
  - 15 per client with is_overdue=1 (rhythm deviation)
  + 5 per AI reply accepted (productivity signal)
  capped 0–100

factor_tasks (0–100):
  completed_this_week / (completed_this_week + overdue_this_week) * 100
  floored at 20 if any tasks are >7 days overdue

factor_clients (0–100):
  active clients contacted in last 14 days / total active clients * 100

composite_score = weighted average:
  factor_deals  × 0.35
  factor_comms  × 0.35
  factor_tasks  × 0.15
  factor_clients × 0.15

trend = compare to 7-day rolling average:
  +5 or more → "up"
  -5 or less → "down"
  otherwise  → "stable"
```

The explanation and top_driver/top_drag fields are AI-generated from the factor breakdown: "Momentum is at 74 (+8 from last week) — mainly because the Apex Digital deal accelerated and you cleared 5 overdue tasks. The HealthStream silence is the biggest drag."

---

### 2.7 Win/Loss Engine (`winloss-engine.ts`)

**Inputs:** `deal.won`, `deal.lost`  
**Outputs:** New `rie_win_loss_patterns` row + overlay on active deals

**Autopsy generation (on deal close):**

```
1. Assemble: full deal history, all messages, all stage transitions, all tasks
2. Extract behavioral signals (all the REAL columns in the table)
3. Call AI: "Analyze this closed deal and extract pattern labels. Write an autopsy."
4. INSERT rie_win_loss_patterns row
5. INSERT ai_memory entries for the workspace: 
   e.g. "When decision maker is in conversations, win rate is 3× higher"
6. Trigger: re-evaluate all active deals against updated patterns
```

**Active deal overlay (pattern matching):**

When a new won/lost pattern is extracted, the engine scans all active deals in the workspace and computes a `pattern_match_score` comparing their current signals to the pattern. Deals that match a loss pattern get a `rie_proactive_triggers` entry with type `loss_pattern_match`.

---

### 2.8 Proactive Engine (`proactive-engine.ts`)

**Inputs:** Outputs from all other engines + scheduled evaluation  
**Outputs:** Populated `rie_proactive_triggers` rows + delivery to frontend

**The trigger queue model:**

The proactive engine does not send notifications directly. It writes to the trigger queue (`rie_proactive_triggers`). The frontend polls or subscribes to this queue and surfaces triggers via the Ambient Bar, Morning Brief, or notifications.

**Scheduled evaluation runs every hour:**
1. Fetch all pending triggers
2. Re-evaluate each trigger's condition (some conditions become invalid — e.g. a "rhythm deviation" trigger for a client who just messaged)
3. Expire stale triggers
4. Generate new triggers from rhythm deviations, deal stalls, deal deadlines

**Trigger priority ladder:**

| Condition | Priority | Surface |
|---|---|---|
| Deal closing in <48 hours | urgent | Ambient Bar + notification |
| Loss pattern match on high-value deal | urgent | Ambient Bar |
| Rhythm deviation (gap_score > 90) | high | Morning Brief + notification |
| Deal stall > 2× workspace average | high | Dashboard |
| Follow-up due (manually scheduled) | high | notification |
| Rhythm deviation (gap_score 70–90) | medium | Ambient Bar |
| Deal stall 1.5–2× average | medium | Dashboard |
| Low-value follow-up | low | Morning Brief only |

---

### 2.9 Pre-Call Engine (`precall-engine.ts`)

**Inputs:** `calendar.event_upcoming` (triggered by calendar sync or manual schedule)  
**Outputs:** New `rie_call_briefs` row

**Brief generation context:**

```
Client profile: name, company, status, source
Active memories: all memories for this client (injected in full)
Rhythm data: current gap_score, last contact, response pattern
Recent messages: last 20 messages from all linked conversations
Open deals: titles, stages, values, days since update
Open tasks: titles, due dates, priorities
Win/loss signals: pattern labels from this client's deal history
Workspace patterns: what talking points closed similar deals
```

**Output sections:**
- `context_summary` — 2–3 sentences about who this person is and where the relationship stands
- `key_signals` — 3 structured signals (e.g. "Response time dropped 2× in last 2 weeks")
- `talking_points` — 3 specific talking points grounded in signals and memories
- `watch_for` — 1 sentence: what to listen for that would indicate risk or opportunity
- `suggested_outcome` — what a successful call looks like

**Delivery:** Generated 2 hours before the call. Delivered via the Ambient Bar and notification 30 minutes before.

---

## 3. AI Pipeline

### 3.1 The Context Assembler (`context-assembler.ts`)

Every AI call in the RIE goes through the Context Assembler before the prompt is constructed. This ensures that every AI call is grounded in everything Ventra knows about the relevant entities.

```typescript
interface AssembledContext {
  // Entity context
  client?:        ClientContext;
  deal?:          DealContext;
  conversation?:  ConversationContext;

  // RIE context
  memories:       MemoryEntry[];       // Active memories for all relevant entities
  rhythm?:        RhythmSummary;       // Current rhythm state for the client
  patterns?:      WinLossPatternSummary; // Relevant patterns from workspace history

  // Formatted for injection
  asSystemPrompt(): string;            // Formats all context as a structured system prompt section
  tokenEstimate():  number;            // Rough token count for budget management
}
```

**Context budget management:** Every AI call is allocated a token budget. The Context Assembler fills the budget in priority order:
1. Recent messages (always included, up to 20 messages)
2. Active memories with confidence > 80 (high confidence first)
3. Rhythm summary (always included if available)
4. Win/loss pattern signals (included if deal-related)
5. Older memories (fill remaining budget)

This prevents context overflow while ensuring the most valuable information is always present.

---

### 3.2 AI Call Architecture

All RIE AI calls use the existing `AIProvider` interface (`src/lib/ai/provider.ts`). No new provider interface is needed.

New service functions added to `src/lib/ai/service.ts`:

```typescript
// Memory extraction
extractMemoriesFromConversation(params): Promise<MemoryExtractionResult>

// Deal narrative
generateDealNarrative(params): Promise<DealNarrativeResult>

// Momentum explanation
generateMomentumExplanation(params): Promise<MomentumExplanationResult>

// Win/loss autopsy
generateDealAutopsy(params): Promise<DealAutopsyResult>

// Call brief
generateCallBrief(params): Promise<CallBriefResult>

// Morning brief (workspace-level)
generateMorningBrief(params): Promise<MorningBriefResult>

// Proactive trigger text
generateTriggerContent(params): Promise<TriggerContentResult>
```

Each follows the same pattern as the existing functions: fallback when provider unavailable, JSON mode, parseJSON helper, typed return.

---

### 3.3 Processing Latency Strategy

The RIE must not slow down the user-facing request that caused a signal. The latency strategy:

| Operation | Strategy | Target latency |
|---|---|---|
| Rhythm update (math only) | Synchronous, in-request | <5ms |
| Memory extraction (AI call) | Async, after response sent | Non-blocking |
| Narrative generation (AI call) | Async, triggered by signal | Non-blocking |
| Momentum recalculation (math + AI) | Scheduled, every 6 hours | Background |
| Win/loss autopsy (AI call) | Triggered on deal close, async | Non-blocking |
| Proactive trigger evaluation | Scheduled, every hour | Background |
| Call brief generation (AI call) | Triggered 2h before call | Background |

**Implementation pattern for async AI calls in Next.js:**

```typescript
// In the API route handler — after sending the response:
void processRIESignal(signal).catch((err) => {
  logError("rie.signal_processing", err);
});
// The `void` + `.catch()` pattern: fire-and-forget with error logging,
// never blocks the response.
```

---

## 4. Event System

### 4.1 Signal Emission Points

Signals are emitted at the server layer, not the client layer. Every API route that creates or mutates a relevant entity emits a signal after the database write succeeds.

**Emission locations:**

```
POST /api/messages (new message) 
  → emit: message.received or message.sent

PATCH /api/deals/[id]/stage
  → emit: deal.stage_changed

POST /api/deals → deal.created
PATCH /api/deals/[id] → deal.updated  
  (with outcome: "won" or "lost") → deal.won / deal.lost

POST /api/clients → client.created
PATCH /api/clients/[id] → client.updated

POST /api/tasks → task.created
PATCH /api/tasks/[id] → task.completed (if status → "done")
```

**Signal emission helper:**

```typescript
// Used by every API route that wants to inform the RIE
import { emitSignal } from "@/lib/server/rie";

// After DB write succeeds:
void emitSignal({
  type:        "message.received",
  workspaceId: auth.workspaceId,
  userId:      auth.userId,
  entityType:  "conversation",
  entityId:    conversationId,
  clientId:    conversation.client_id ?? undefined,
  payload:     { messageId: message.id, senderType: message.sender_type, content: message.content },
  emittedAt:   new Date().toISOString(),
});
```

---

### 4.2 Scheduler

Background jobs are implemented as Next.js API routes called by an internal cron-like mechanism. For the current SQLite/single-process architecture, we use a simple in-process interval scheduler initialized at module load time.

```
src/lib/server/rie/scheduler.ts
```

**Schedule table:**

| Job | Frequency | What it does |
|---|---|---|
| `evaluate_proactive_triggers` | Every 60 min | Re-evaluates all pending triggers, expires stale ones |
| `compute_rhythm_deviations` | Every 6 hours | Recomputes gap_scores for all clients, generates new deviation triggers |
| `compute_momentum_score` | Every 6 hours | Recalculates composite momentum, generates daily snapshot at midnight |
| `generate_morning_brief` | Daily at 07:00 (user timezone) | Generates morning brief, delivers via notification |
| `cleanup_signal_events` | Daily | Marks old processed signals as archived (keeps last 30 days) |

**Scheduler bootstrap:** The scheduler is initialized in the `getDb()` function (called on first server request) so it starts without requiring a separate process. This is intentional for the current single-process architecture and is the first thing to extract when moving to a queue-based system.

---

### 4.3 Future: Event Queue Migration Path

The current in-process dispatcher is designed to be dropped into a queue system with zero API changes. The migration path:

```
Current (v1):  emitSignal() → synchronous dispatch → engines run in-process
Future (v2):   emitSignal() → publish to Redis/BullMQ → worker process consumes
```

The `rie_signal_events` table already serves as a persistent queue — any unprocessed signals survive server restarts and can be replayed. The `processed` and `processed_at` columns track state. Moving to a proper queue means replacing the in-process consumer with a BullMQ worker, not changing the emission points or the engine interfaces.

---

## 5. Frontend Architecture

### 5.1 New Context: `RIEContext`

A single React context wraps all RIE data access for the frontend. Pages and components do not call RIE API routes directly — they read from this context.

```typescript
// src/context/rie-context.tsx

interface RIEContextValue {
  // Momentum (loaded once per session, refreshed every 30 min)
  momentum:         MomentumScore | null;
  momentumLoading:  boolean;

  // Morning brief (loaded once per session)
  morningBrief:     MorningBrief | null;
  briefLoading:     boolean;

  // Proactive triggers (polled every 5 min)
  triggers:         ProactiveTrigger[];
  triggersLoading:  boolean;
  dismissTrigger:   (id: string) => void;
  snoozeTrigger:    (id: string, minutes: number) => void;

  // Per-entity data (fetched on demand, cached in memory)
  getClientRhythm:  (clientId: string) => ClientRhythm | null;
  getClientMemory:  (clientId: string) => MemoryEntry[];
  getDealNarrative: (dealId: string)   => DealNarrative | null;
  getCallBrief:     (clientId: string) => CallBrief | null;

  // Refresh functions
  refreshTriggers:  () => void;
  refreshMomentum:  () => void;
}
```

---

### 5.2 New Components

All new components live in `src/components/rie/`.

```
src/components/rie/
├── ambient-bar.tsx           — Context-sensitive one-line suggestion strip
├── record-sidebar.tsx        — AI sidebar for client/deal detail pages
├── deal-narrative-card.tsx   — Deal narrative display + momentum badge
├── momentum-widget.tsx       — Score display with factor breakdown
├── morning-brief.tsx         — Formatted brief for dashboard
├── call-brief-drawer.tsx     — Pre-call brief slide-in panel
├── proactive-trigger-card.tsx — Single trigger: text + action + dismiss
├── memory-panel.tsx          — Debug/power-user view of AI memory entries
└── rhythm-indicator.tsx      — Visual health indicator for a relationship
```

---

### 5.3 Component Specifications

#### `AmbientBar`

```
Location: top of every page, below TopBar
Height: 40px fixed
Behavior:
  — Shows highest-priority pending trigger for the current page context
  — On client pages: shows rhythm-related trigger for that client
  — On deal pages: shows narrative-related trigger for that deal
  — On dashboard: shows highest overall priority trigger
  — Auto-rotates through triggers if multiple are present (every 8 seconds)
  — Dismiss button (×) on right
  — Primary action button (e.g. "Draft reply") on left of text
  — Disappears when no triggers are pending
  — Never interrupts — it is a header bar, not a modal
```

#### `RecordSidebar`

```
Location: right side of /clients/[id] and /deals/[id]
Width: 280px, collapsible
Tabs:
  [Now]     — Top insight: rhythm status + current AI memory entries
  [History] — AI-narrated timeline of key relationship events
  [Do]      — 2–3 executable actions with one-click buttons

Loading: skeleton shimmer while data loads
Collapsed state: collapses to 40px with expand chevron
```

#### `DealNarrativeCard`

```
Location: replaces the static "Deal Details" section on /deals/[id]
Shows:
  — Narrative paragraph (AI-written)
  — Risk level badge (color-coded)
  — Momentum badge (icon + label)
  — Recommended action with one-click execute button
  — "Last updated X minutes ago" footer
  — Regenerate button (triggers async re-generation)
```

#### `MorningBrief`

```
Location: top of /dashboard, above all other content
Layout: card with Ventra pulse mark
Content:
  — 4-sentence AI brief paragraph (links to named entities inline)
  — 3 action buttons: today's three recommended actions
  — Momentum score chip (e.g. "Momentum 74 ↑")
Loading: animated text reveal (character by character, like the onboarding)
Refresh: loads fresh on every dashboard visit (cached for 1 hour)
```

---

### 5.4 Page Integration Points

| Page | RIE Components Added |
|---|---|
| `/dashboard` | `MorningBrief`, `MomentumWidget`, `AmbientBar` |
| `/clients` | `AmbientBar`, `RhythmIndicator` on each row |
| `/clients/[id]` | `RecordSidebar`, `AmbientBar` (client context) |
| `/deals` | `AmbientBar`, momentum micro-badges on deal cards |
| `/deals/[id]` | `DealNarrativeCard`, `RecordSidebar`, `AmbientBar` (deal context) |
| `/inbox` | `AmbientBar` (conversation context), rhythm badge on client name |
| All pages | `AmbientBar` |

---

### 5.5 Command Palette Integration

The Command Palette (Cmd+K) gains new RIE-powered commands:

```
"What should I do today?"           → opens Morning Brief
"Show relationship with [name]"     → opens client record with RecordSidebar
"Deal status for [deal name]"       → opens deal with DealNarrativeCard
"Pre-call brief for [name]"         → opens CallBriefDrawer
"Why did I lose [deal]?"            → opens win/loss autopsy for that deal
"Business momentum"                 → opens MomentumWidget detail
```

---

## 6. API Route Map

### New RIE Routes

```
GET  /api/rie/morning-brief           — Daily AI brief for the workspace
GET  /api/rie/momentum                — Current momentum score + 7-day trend
GET  /api/rie/triggers                — Pending proactive triggers (filterable)
PATCH /api/rie/triggers/[id]          — Dismiss or snooze a trigger

GET  /api/rie/rhythm/[clientId]       — Rhythm data for a client
GET  /api/rie/memory?entity=client&id=XXX  — Active memories for an entity
GET  /api/rie/narrative/[dealId]      — Latest deal narrative
POST /api/rie/narrative/[dealId]/refresh  — Force narrative regeneration
GET  /api/rie/brief/precall?clientId=XXX  — Pre-call brief for a client
GET  /api/rie/winloss                 — Pattern summary for the workspace
GET  /api/rie/winloss/[dealId]        — Autopsy for a specific closed deal

POST /api/rie/signal                  — Internal: emit a signal (used by other routes)
```

All routes: `requireAuth` + `assertPermission(auth, "ai.view")` + workspace-scoped queries.

---

## 7. Future Scalability

### 7.1 PostgreSQL Migration

The schema is forward-compatible with PostgreSQL with these changes:
- `TEXT PRIMARY KEY` → `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `INTEGER` (0/1 booleans) → `BOOLEAN`
- `TEXT` (JSON fields) → `JSONB`
- `DatabaseSync` → `pg` or `prisma` client

The JSONB conversion is the highest-value change — it enables querying inside JSON fields (e.g. `WHERE signals_json->>'risk_level' = 'critical'`), which will be needed for pattern matching at scale.

The RIE engine interfaces do not change. Only `db-rie.ts` changes when migrating.

---

### 7.2 Worker Process Extraction

The scheduler runs in-process now. When traffic requires it, the jobs extract to separate worker processes without changing the engine code:

```
Current:  API server → in-process scheduler → engine functions
Future:   API server → BullMQ publisher
          Worker process → BullMQ consumer → same engine functions
```

The `rie_signal_events` table already provides durability. No data is lost during the migration.

---

### 7.3 Model Specialization

Today all RIE AI calls use the same `AIProvider` (gpt-4o-mini or equivalent). As the system matures, different subsystems benefit from different models:

| Subsystem | Current | Future |
|---|---|---|
| Memory extraction | gpt-4o-mini | Fine-tuned extraction model |
| Deal narrative | gpt-4o-mini | gpt-4o (higher quality) |
| Morning brief | gpt-4o-mini | gpt-4o (higher quality) |
| Trigger text | gpt-4o-mini | gpt-4o-mini (stays — cost) |
| Autopsy | gpt-4o-mini | gpt-4o (higher quality) |

The provider interface already supports model-per-call via `AIProviderConfig`. Specialization requires no architectural change.

---

### 7.4 Multi-Workspace Learning (Future v3)

Individual workspaces learn from their own deals. Future: aggregate anonymized pattern signals across all workspaces to build global benchmarks:

- "The average deal close time in your industry (Agency) is 18 days"
- "Win rate at Proposal with decision-maker involvement: 71% globally"
- "Most common loss reason for $10K–$25K deals: price objection in Negotiation"

This requires a separate `global_patterns` table and an opt-in signal aggregation pipeline. No changes to the current RIE architecture — it adds a new data source to the Context Assembler.

---

### 7.5 Voice Interface (Future v4)

The Morning Brief and Call Brief are designed as audio-first artifacts — short, linear, spoken-word friendly. Adding voice output requires:
- TTS (text-to-speech) API call on brief generation
- Audio file stored in object storage
- Mobile push notification with audio attachment

The content format does not need to change. The delivery mechanism adds a new surface type (`delivery_surface: "audio"`).

---

## 8. Implementation Sequence

Once this architecture is approved, implementation proceeds in this order:

**Phase 1 — Foundation (Week 1)**
1. Migration v16: all 8 RIE tables + indexes
2. `db-rie.ts`: all database helpers
3. `signal-bus.ts`: signal types, store-and-dispatch
4. Emit signals from existing API routes (messages, deals, clients, tasks)
5. `rhythm-engine.ts`: baseline computation + deviation detection

**Phase 2 — AI Memory + Narrative (Week 2)**
6. `memory-engine.ts`: extraction + storage + deduplication
7. `context-assembler.ts`: budget-aware context building
8. `narrative-engine.ts`: deal narrative generation
9. New AI service functions in `service.ts`

**Phase 3 — Proactive + Momentum (Week 3)**
10. `momentum-engine.ts`: composite score + scheduler
11. `proactive-engine.ts`: trigger queue + evaluation
12. `winloss-engine.ts`: autopsy on deal close + pattern matching
13. Morning brief generation

**Phase 4 — Frontend (Week 4)**
14. `RIEContext` + all RIE API routes
15. `AmbientBar` component
16. `MorningBrief` component + dashboard integration
17. `RecordSidebar` on client + deal pages
18. `DealNarrativeCard` replacing static deal fields
19. Command Palette RIE commands
20. `MomentumWidget` on dashboard

**Phase 5 — Pre-Call + Polish (Week 5)**
21. `precall-engine.ts` + calendar signal integration
22. `CallBriefDrawer` component
23. Win/loss autopsy UI
24. Full QA: TypeScript + ESLint + end-to-end testing

---

## Approval Checklist

Before implementation begins, the following decisions require explicit approval:

- [ ] **Data model approved** — table schemas, column names, and relationships
- [ ] **Signal taxonomy approved** — the 14 signal types cover all necessary events
- [ ] **Rhythm algorithm approved** — personalized threshold (2× average gap), 0–100 score
- [ ] **Momentum formula approved** — 4 factors, weights (0.35 / 0.35 / 0.15 / 0.15)
- [ ] **AI memory lifecycle approved** — immutable entries, supersede-not-delete pattern
- [ ] **Processing model approved** — synchronous rhythm + async AI calls
- [ ] **Scheduler approach approved** — in-process intervals (not separate worker)
- [ ] **Frontend component list approved** — 8 new components, integration points
- [ ] **Implementation sequence approved** — 5-phase, 5-week plan

---

*Architecture document complete. Awaiting approval to begin Phase 1 implementation.*
