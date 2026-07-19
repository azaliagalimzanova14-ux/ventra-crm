# Relationship Intelligence Engine — Architecture Document
## Sprint 2: "Ventra Understands Relationships"

**Version:** 3.0 (Final pre-implementation)
**Previous version:** 2.0 — approved with revisions July 17, 2026
**Status:** Awaiting implementation sign-off
**Stack:** Next.js App Router · Node 22 · SQLite (DatabaseSync) · OpenAI-compatible provider
**Author:** CTO / AI Engineering Team
**Date:** July 18, 2026

---

## Revision Summary (v2 → v3)

Four architectural additions approved after the v2 review. Prior revisions REV-1 through REV-6 are unchanged and not re-justified here.

| # | Revision | Impact |
|---|---|---|
| REV-7 | Decision Engine introduced between Memory and Trigger generation | New subsystem, new table, ranking replaces implicit insight generation |
| REV-8 | Learning Engine records user feedback for continuous adaptation | New subsystem, 2 new tables, feedback loop into Decision Engine |
| REV-9 | Shared Context Builder promoted to top-level service used by ALL AI features | `context-assembler.ts` generalized, moved out of `rie/` directory |
| REV-10 | Phase 1 split into 1A (infrastructure) and 1B (Morning Brief) | Validates architecture with one production feature before scaling |

---

## 0. Design Philosophy

The Relationship Intelligence Engine (RIE) is the nervous system of Ventra. Every piece of data that flows through the product passes through the RIE. It listens, learns, stores, and surfaces. It never forgets. It connects events that humans would not notice. **And starting with v3: it chooses.**

The key shift in v3 is the addition of a **Decision Engine** and a **Learning Engine**. Prior versions of the architecture were observational — they produced insights but left the choice of what to do next implicit. The v3 architecture is decisional: for every entity at every moment, the system knows what the single best next action is and can explain why. The Learning Engine then closes the loop — the system watches what the founder actually does, and adapts.

**[REV-7][REV-8][REV-9] Revised subsystem map — ten subsystems, one brain:**

| # | Subsystem | What it processes | What it produces |
|---|---|---|---|
| 1 | **Context Builder** *(shared)* [REV-9] | Entity + purpose → assembled context | Token-budgeted prompt context for any AI feature |
| 2 | Signal Bus | API events → typed signals | Stored, dispatched signals |
| 3 | Knowledge Engine | Signals → classified knowledge | Staged knowledge items ready for memory |
| 4 | AI Memory (3 classes) | Knowledge items → persistent memory | Episodic, semantic, strategic memory per entity |
| 5 | Relationship Rhythm | Communication velocity per client | Deviation alerts when silence is anomalous |
| 6 | **Decision Engine** *(new)* [REV-7] | Context + memories → ranked actions | The best next action per entity, with rationale |
| 7 | **Learning Engine** *(new)* [REV-8] | User interactions → behavioral profile | Per-workspace style profile fed back into decisions |
| 8 | Relationship Narrative | Entity state × memory × patterns | Strategic reading of any relationship or deal |
| 9 | Proactive Follow-Up | Trigger conditions per client/deal | Scheduled, evidence-backed proactive actions |
| 10 | Pre-Call Intelligence / Morning Brief | Calendar × context × decisions | Grounded meeting briefs and daily operating plan |

**[REV-6][REV-9] Full system data flow — end to end:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VENTRA API ROUTES                               │
│  (messages, deals, clients, tasks, conversations, calendar, feedback)   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ emitSignal()         │ recordFeedback()
                                ▼                      ▼
              ┌─────────────────────────┐   ┌──────────────────────────┐
              │      SIGNAL BUS         │   │    LEARNING ENGINE       │
              │  Validate → Store →     │   │  Feedback → Profile      │
              │  Dispatch               │   │  Stores: rie_feedback_   │
              └──────────┬──────────────┘   │          rie_learning_   │
                         │                  └──────────┬───────────────┘
                         ▼                             │ style profile
              ┌──────────────────────────────┐         │
              │     KNOWLEDGE ENGINE         │         │
              │  Filter → Extract →          │         │
              │  Classify → Dedup → Commit   │         │
              │  Stores: rie_knowledge_items │         │
              └──────────┬───────────────────┘         │
                         │ knowledge items              │
                         ▼                             │
              ┌──────────────────────────────┐         │
              │     AI MEMORY ENGINE         │         │
              │  Episodic · Semantic ·       │         │
              │  Strategic                   │         │
              │  Stores: rie_ai_memory       │         │
              └──────────┬───────────────────┘         │
                         │ active memories              │
                         ▼                             │
              ┌══════════════════════════════╗         │
              ║   SHARED CONTEXT BUILDER     ║◄────────┘
              ║   [REV-9] Top-level service  ║   learning profile
              ║   Purpose-aware assembly     ║
              ║   Token budget management    ║
              ╚══════════════╤═══════════════╝
                             │ AssembledContext
          ┌──────────────────┼─────────────────────────────────────────┐
          │                  │                                         │
          ▼                  ▼                                         ▼
  ┌────────────────┐  ┌──────────────────────┐             ┌──────────────────────┐
  │  RHYTHM        │  │  DECISION ENGINE     │             │  NARRATIVE ENGINE    │
  │  ENGINE        │  │  [REV-7]             │             │  client / deal /     │
  │  (math only)   │  │  Rank candidates →   │             │  conversation        │
  └────────────────┘  │  Choose best action  │             └──────────────────────┘
                      │  Stores:             │
                      │  rie_decision_log    │
                      └──────────┬───────────┘
                                 │ decision
                    ┌────────────┼──────────────────────┐
                    │            │                      │
                    ▼            ▼                      ▼
           PROACTIVE        MORNING BRIEF         AMBIENT BAR
           ENGINE           ENGINE                (immediate)
           (trigger queue)  (daily rollup)
                    │            │
                    └────────────┘
                                 │
                    ┌────────────────────────────┐
                    │    RIE API ROUTES           │
                    │    /api/rie/*               │
                    └────────────────────────────┘
```

**Architectural constraints (all prior constraints unchanged):**
- Server-only processing. No client-side AI logic.
- Every subsystem is workspace-scoped. No data crosses workspace boundaries.
- AI calls are async and gracefully degrade when no API key is present.
- SQLite-first. Schema is forward-compatible with PostgreSQL.
- All new tables extend the existing migration system (v16).

---

## 1. Data Model

### 1.1 Complete Table Inventory

**Tables added in v3 (in addition to all v2 tables):**
- `rie_decision_log` — **new** [REV-7]
- `rie_feedback_events` — **new** [REV-8]
- `rie_learning_profiles` — **new** [REV-8]

All 13 tables created in migration v16 (single transaction, idempotent).

```
rie_signal_events              — raw event log
rie_knowledge_items            — staged knowledge before memory commitment
rie_relationship_rhythms       — communication baseline per client
rie_ai_memory                  — episodic / semantic / strategic memory
rie_relationship_narratives    — narratives for client, deal, conversation
rie_momentum_config            — per-workspace scoring pipeline config
rie_momentum_scores            — daily composite scores
rie_win_loss_patterns          — closed deal pattern vectors
rie_proactive_triggers         — proactive action queue
rie_call_briefs                — pre-call meeting briefs
rie_decision_log               — [NEW] Decision Engine outputs and rationale
rie_feedback_events            — [NEW] user interactions with AI recommendations
rie_learning_profiles          — [NEW] per-workspace behavioral profiles
```

---

### 1.2–1.12 (unchanged from v2)

All schemas from v2 §1.2 through §1.12 are retained without modification:
`rie_signal_events`, `rie_knowledge_items`, `rie_relationship_rhythms`, `rie_ai_memory`, `rie_relationship_narratives`, `rie_momentum_config`, `rie_momentum_scores`, `rie_win_loss_patterns`, `rie_proactive_triggers`, `rie_call_briefs`.

See `RIE_ARCHITECTURE_V2.md` §1.2–1.12 for full schemas. Not repeated here to avoid drift risk — the implementation source of truth is this document's §1.13–1.15 plus the v2 schemas for all prior tables.

---

### 1.13 `rie_decision_log` [REV-7 — NEW]

The Decision Engine writes one row per decision made for an entity. The log is the audit trail of what Ventra chose to recommend and why — it is the basis for trust, explainability, and learning.

```sql
CREATE TABLE IF NOT EXISTS rie_decision_log (
  id              TEXT    PRIMARY KEY,
  workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- What entity this decision is about
  entity_type     TEXT    NOT NULL,   -- "client" | "deal" | "conversation" | "workspace"
  entity_id       TEXT    NOT NULL,

  -- Decision output
  decision_type   TEXT    NOT NULL,
  -- "best_next_action"  — the single most important action right now
  -- "morning_brief_item" — a prioritized item for the daily brief
  -- "proactive_trigger"  — a time-sensitive recommendation
  -- "reply_suggestion"   — a reply to send in a conversation
  -- "coaching_note"      — a pattern-based observation to the founder

  chosen_action_type  TEXT NOT NULL,
  -- e.g. "send_follow_up" | "schedule_call" | "update_deal_stage" |
  --      "address_risk" | "re_engage" | "close_loop" | "celebrate_win" | "ask_for_referral"

  chosen_action_label TEXT NOT NULL,  -- Human-readable: "Follow up with Sarah about board decision"
  chosen_action_params TEXT,          -- JSON: parameters for the action (client_id, draft_text, etc.)
  rationale           TEXT NOT NULL,  -- 1-2 sentence explanation in Ventra's voice

  -- Candidate ranking (all considered actions, not just the chosen one)
  candidates_json TEXT NOT NULL DEFAULT '[]',
  -- JSON: ActionCandidate[]
  -- { type, label, score, score_breakdown: { urgency, impact, confidence, style_fit }, rationale }

  -- Scoring inputs
  urgency_score   INTEGER NOT NULL,   -- 0–100: how time-sensitive
  impact_score    INTEGER NOT NULL,   -- 0–100: how consequential if ignored
  confidence_score INTEGER NOT NULL,  -- 0–100: how certain we are this is right
  style_fit_score  INTEGER NOT NULL,  -- 0–100: how well this matches founder's style (from Learning Engine)
  composite_score  INTEGER NOT NULL,  -- final weighted score

  -- Evidence [REV-5]
  evidence_json   TEXT    NOT NULL DEFAULT '[]',
  evidence_strength TEXT  NOT NULL DEFAULT 'anecdotal',

  -- Source memories and context
  memory_refs     TEXT,               -- JSON: string[] of rie_ai_memory IDs used
  context_version TEXT    NOT NULL,   -- Hash of context used (matches signal_version in narratives)
  learning_profile_version TEXT,      -- Hash of learning profile used at decision time

  -- Outcome (filled by Learning Engine when feedback received)
  outcome         TEXT,               -- "accepted" | "rejected" | "edited" | "ignored" | "pending"
  outcome_at      TEXT,
  outcome_feedback_id TEXT REFERENCES rie_feedback_events(id) ON DELETE SET NULL,

  -- Surface delivered to
  delivered_to    TEXT,               -- "morning_brief" | "ambient_bar" | "trigger_card" | "sidebar" | null
  delivered_at    TEXT,

  created_at      TEXT    NOT NULL,

  -- Indexes
  -- (workspace_id, entity_type, entity_id, created_at) — entity decision history
  -- (workspace_id, decision_type, outcome)              — outcome analysis by type
  -- (workspace_id, composite_score DESC)                — ranked pending decisions
);
```

**Action candidate structure:**

```typescript
interface ActionCandidate {
  type:       string;          // action type key
  label:      string;          // human-readable label
  score:      number;          // 0–100 composite
  score_breakdown: {
    urgency:    number;        // 0–100
    impact:     number;        // 0–100
    confidence: number;        // 0–100
    style_fit:  number;        // 0–100 — from Learning Engine profile
  };
  rationale:  string;          // why this action was considered
  discard_reason?: string;     // why it was not chosen (if not selected)
}
```

---

### 1.14 `rie_feedback_events` [REV-8 — NEW]

Records every interaction the founder has with an AI recommendation. This is the raw input to the Learning Engine. Fine-grained — every accept, reject, edit, and ignore is a signal.

```sql
CREATE TABLE IF NOT EXISTS rie_feedback_events (
  id              TEXT    PRIMARY KEY,
  workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- What recommendation was interacted with
  decision_id     TEXT    REFERENCES rie_decision_log(id) ON DELETE SET NULL,
  surface         TEXT    NOT NULL,
  -- "morning_brief" | "ambient_bar" | "trigger_card" | "record_sidebar" |
  -- "conversation_drawer" | "call_brief" | "reply_draft"

  -- The feedback signal
  feedback_type   TEXT    NOT NULL,
  -- "accepted"          — used the AI recommendation as-is
  -- "accepted_edited"   — used it but made edits before acting
  -- "rejected"          — explicitly dismissed
  -- "snoozed"           — deferred for later
  -- "ignored"           — shown but no interaction (implicit rejection after timeout)
  -- "manual_override"   — founder took a different action independently
  -- "draft_accepted"    — AI-written text sent without editing
  -- "draft_edited_minor" — AI draft edited <20% before sending
  -- "draft_edited_major" — AI draft edited >20% before sending
  -- "draft_rejected"    — AI draft discarded, founder wrote their own

  -- For draft feedback: capture the delta
  original_content  TEXT,   -- AI-generated text
  final_content     TEXT,   -- What was actually sent/used (if different)
  edit_distance     INTEGER, -- Levenshtein distance (computed at record time)
  edit_ratio        REAL,    -- edit_distance / length(original_content), 0–1

  -- For action feedback: what they did instead (if manual_override)
  override_action_type  TEXT,
  override_action_label TEXT,

  -- Timing
  recommendation_shown_at TEXT,  -- When the recommendation was first displayed
  feedback_given_at       TEXT,  -- When the user acted (or timeout for "ignored")
  time_to_decision_ms     INTEGER,

  -- Context at feedback time
  entity_type   TEXT,
  entity_id     TEXT,

  created_at    TEXT    NOT NULL
);
```

---

### 1.15 `rie_learning_profiles` [REV-8 — NEW]

The Learning Engine's output — a per-workspace behavioral profile derived from accumulated feedback. Updated incrementally on each feedback event. Read by the Decision Engine at ranking time to compute `style_fit_score`.

```sql
CREATE TABLE IF NOT EXISTS rie_learning_profiles (
  id              TEXT    PRIMARY KEY,
  workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Acceptance patterns
  -- JSON: { [action_type: string]: { accepted: number, rejected: number, edited: number, rate: number } }
  action_acceptance_json TEXT NOT NULL DEFAULT '{}',

  -- Draft edit patterns
  avg_edit_ratio        REAL    NOT NULL DEFAULT 0.0,   -- Average edit ratio across all draft feedback
  median_edit_ratio     REAL    NOT NULL DEFAULT 0.0,
  prefers_shorter       INTEGER NOT NULL DEFAULT 0,      -- 1 if founder consistently shortens AI drafts
  prefers_longer        INTEGER NOT NULL DEFAULT 0,      -- 1 if founder consistently expands AI drafts
  formality_delta       REAL    NOT NULL DEFAULT 0.0,
  -- -1.0 = founder consistently makes text more casual
  -- +1.0 = founder consistently makes text more formal

  -- Timing preferences
  -- JSON: { hour_of_day: number, day_of_week: number, avg_response_delay_ms: number }
  timing_json     TEXT    NOT NULL DEFAULT '{}',

  -- Surface preferences (which surfaces get the most accepted recommendations)
  -- JSON: { [surface: string]: { shown: number, accepted: number, rate: number } }
  surface_preferences_json TEXT NOT NULL DEFAULT '{}',

  -- Preferred communication style (derived from accepted reply drafts)
  -- JSON: { greeting: boolean, sign_off: boolean, emoji_frequency: number, avg_length_words: number }
  comm_style_json TEXT    NOT NULL DEFAULT '{}',

  -- Manual override patterns (what founders do instead of using suggestions)
  -- JSON: { override_types: string[], frequency: number }
  override_patterns_json TEXT NOT NULL DEFAULT '{}',

  -- Confidence calibration
  -- How often do we get the action right vs. needing to learn?
  total_decisions     INTEGER NOT NULL DEFAULT 0,
  accepted_count      INTEGER NOT NULL DEFAULT 0,
  rejected_count      INTEGER NOT NULL DEFAULT 0,
  edited_count        INTEGER NOT NULL DEFAULT 0,
  ignored_count       INTEGER NOT NULL DEFAULT 0,
  overall_accept_rate REAL    NOT NULL DEFAULT 0.0,

  -- Profile version (hashed from key fields — used by Decision Engine)
  profile_version TEXT    NOT NULL DEFAULT 'v0',

  -- Sample confidence
  -- Profile is unreliable below 20 decisions — style_fit_score capped at 50 until then
  is_calibrated   INTEGER NOT NULL DEFAULT 0,   -- 1 when total_decisions >= 20

  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL,

  UNIQUE(workspace_id)
);
```

---

### 1.16 Indexes (additions to v2)

```sql
-- Decision log
CREATE INDEX IF NOT EXISTS idx_rie_decisions_entity   ON rie_decision_log(workspace_id, entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rie_decisions_pending  ON rie_decision_log(workspace_id, decision_type, outcome) WHERE outcome IS NULL;
CREATE INDEX IF NOT EXISTS idx_rie_decisions_score    ON rie_decision_log(workspace_id, composite_score DESC);

-- Feedback events
CREATE INDEX IF NOT EXISTS idx_rie_feedback_decision  ON rie_feedback_events(decision_id);
CREATE INDEX IF NOT EXISTS idx_rie_feedback_workspace ON rie_feedback_events(workspace_id, feedback_type, created_at);
CREATE INDEX IF NOT EXISTS idx_rie_feedback_entity    ON rie_feedback_events(workspace_id, entity_type, entity_id);

-- Learning profiles
CREATE INDEX IF NOT EXISTS idx_rie_profiles_workspace ON rie_learning_profiles(workspace_id);
```

---

## 2. Backend Architecture

### 2.1 File Structure (v3)

```
src/lib/server/
├── context-builder.ts          — [NEW REV-9] Shared Context Builder (top-level, not RIE-specific)
│
└── rie/
    ├── index.ts                — Public API surface
    ├── signal-bus.ts           — Signal ingestion and dispatch
    ├── knowledge-engine.ts     — Signal → Knowledge pipeline (6 steps)
    ├── rhythm-engine.ts        — Relationship Rhythm (math only)
    ├── memory-engine.ts        — Episodic/Semantic/Strategic lifecycle
    ├── decision-engine.ts      — [NEW REV-7] Context → Ranked actions → Best choice
    ├── learning-engine.ts      — [NEW REV-8] Feedback → Profile → Adaptation
    ├── narrative-engine.ts     — Relationship Narrative (client/deal/conversation)
    ├── momentum-engine.ts      — Configurable scoring pipeline
    ├── winloss-engine.ts       — Win/Loss patterns and autopsy
    ├── proactive-engine.ts     — Trigger queue and evaluation
    ├── precall-engine.ts       — Pre-call brief assembly
    ├── morning-brief-engine.ts — Morning brief generation (Phase 1B target)
    ├── confidence.ts           — Confidence scoring and evidence utilities
    └── db-rie.ts               — All RIE database helpers
```

Key change from v2: `context-assembler.ts` is **removed** from the `rie/` directory. It is replaced by `src/lib/server/context-builder.ts` — a top-level server service available to all AI features, not just RIE.

---

### 2.2 Shared Context Builder [REV-9]

**Purpose:** Every AI feature in Ventra needs context about the entity being discussed. Before v3, each feature assembled its own context ad-hoc, leading to inconsistency — a reply draft might not know about a client's board approval requirement that a morning brief entry knows about. The Shared Context Builder fixes this: all AI calls go through one place, so every feature gets the same quality of context.

**[REV-6] Context Builder in the system:**

```
Any AI feature needs context
          │
          ▼
  buildContext({
    purpose:     "morning_brief" | "reply_draft" | "precall_brief"
                 "narrative" | "coaching" | "decision",
    entityType:  "client" | "deal" | "conversation" | "workspace",
    entityId:    string,
    workspaceId: string,
    tokenBudget: number (default: 2000)
  })
          │
          ▼
  ┌───────────────────────────────────────────────────────────┐
  │            CONTEXT BUILDER                                │
  │                                                           │
  │  1. Load active memories (all three classes)              │
  │     — Strategic: highest priority (always included)       │
  │     — Semantic: high confidence first                     │
  │     — Episodic: recent milestones                         │
  │                                                           │
  │  2. Load rhythm data (if entity is client or deal)        │
  │                                                           │
  │  3. Load current narrative (if exists and recent)         │
  │                                                           │
  │  4. Load recent decisions for this entity                 │
  │     (so features don't re-recommend what was just acted)  │
  │                                                           │
  │  5. Inject learning profile style hints                   │
  │     (e.g., "founder prefers direct tone, short replies")  │
  │                                                           │
  │  6. Apply purpose-specific priority overrides             │
  │     — "reply_draft":   emphasize comm style + recent msgs │
  │     — "precall_brief": emphasize strategic + milestones   │
  │     — "morning_brief": workspace-wide, all entities       │
  │     — "decision":      emphasize urgency signals          │
  │                                                           │
  │  7. Truncate to tokenBudget (drop lowest-priority items)  │
  │                                                           │
  └───────────────────────────────────────────────────────────┘
          │
          ▼
  AssembledContext {
    entityType, entityId,
    purpose,
    memories: { strategic[], semantic[], episodic[] },
    rhythmSummary: string | null,
    currentNarrative: string | null,
    recentDecisions: DecisionSummary[],
    styleHints: StyleHints,       // from Learning Engine profile
    tokenCount: number,
    truncated: boolean
  }
          │
          ▼
  AI service function receives AssembledContext
  and injects context.toPromptBlock() into system message
```

**`toPromptBlock()` output format (same as v2 context block, now generated centrally):**

```
=== RELATIONSHIP CONTEXT ===
Entity: Sarah Mitchell (Apex Digital) — active client
Purpose: reply_draft

[STRATEGIC — expires in 4 days, confidence: 85%]
→ Lead with ROI argument. Sarah responds poorly to feature demos.
→ Best time to reach: Tuesday/Thursday 9–11am (confirmed 4× interactions)

[SEMANTIC — confidence: 92%]
→ Economic buyer. Board approval required for contracts >$20K.
→ Prefers Telegram; replies 3× faster than email.

[RHYTHM]
→ Current gap: 6 days (threshold: 4 days — OVERDUE)
→ Gap score: 74/100

[RECENT DECISIONS]
→ 2026-07-16: Ventra suggested "Follow up about board decision" — accepted ✓

[STYLE HINTS — from your history]
→ You prefer shorter replies (avg 40 words vs. Ventra's 80-word default)
→ You prefer direct openers (skip pleasantries)
```

Every AI feature using the Context Builder gets this block injected. Reply drafts get better because they know about board approval constraints. Morning briefs get better because they know about what follow-ups were accepted yesterday.

---

### 2.3 Decision Engine [REV-7]

The Decision Engine is the executive layer of the RIE. Where the Knowledge Engine extracts, the Memory Engine stores, and the Narrative Engine synthesizes — the Decision Engine **chooses**.

**Core responsibility:** For any entity (client, deal, workspace), at any trigger point (signal received, morning brief time, manual request), the Decision Engine produces a single ranked recommendation: the one thing the founder should do next, with full rationale.

**[REV-6] Decision Engine pipeline:**

```
Trigger (signal | schedule | manual)
          │
          ▼
  ┌───────────────────────────────────────────────┐
  │  1. CONTEXT ASSEMBLY                          │
  │     Call buildContext(purpose="decision", ...) │
  │     Returns: memories + rhythm + narrative +   │
  │     recent decisions + style hints             │
  └──────────────────────┬────────────────────────┘
                         │
                         ▼
  ┌───────────────────────────────────────────────┐
  │  2. CANDIDATE GENERATION                      │
  │     Ask AI: "Given this context, what are     │
  │     the 5 most important actions right now?"  │
  │     Returns: ActionCandidate[] (unranked)     │
  └──────────────────────┬────────────────────────┘
                         │
                         ▼
  ┌───────────────────────────────────────────────┐
  │  3. SCORING                                   │
  │  For each candidate, compute:                 │
  │                                               │
  │  urgency_score   = f(days_silent, close_date, │
  │                      trigger_type, rhythm)    │
  │                                               │
  │  impact_score    = f(deal_value, risk_level,  │
  │                      relationship_health,     │
  │                      pattern_match_severity)  │
  │                                               │
  │  confidence_score = from AI + evidence chain  │
  │                                               │
  │  style_fit_score = Learning Engine profile    │
  │                    — how often does founder   │
  │                      accept this action type? │
  │                    — uncalibrated: 50 (flat)  │
  │                    — calibrated: 0–100        │
  │                                               │
  │  composite = (urgency × 0.30)                 │
  │            + (impact  × 0.35)                 │
  │            + (confidence × 0.20)              │
  │            + (style_fit × 0.15)               │
  └──────────────────────┬────────────────────────┘
                         │
                         ▼
  ┌───────────────────────────────────────────────┐
  │  4. DEDUPLICATION                             │
  │     Has this same action been recommended     │
  │     and rejected in the last N days?          │
  │     If yes: penalize score by 0.7 per         │
  │     rejection (max 3 penalties before         │
  │     suppressing for 7 days)                   │
  └──────────────────────┬────────────────────────┘
                         │
                         ▼
  ┌───────────────────────────────────────────────┐
  │  5. SELECTION                                 │
  │     Choose highest composite_score candidate  │
  │     Write to rie_decision_log                 │
  │     Include all candidates in candidates_json │
  │     for transparency                          │
  └──────────────────────┬────────────────────────┘
                         │
                         ▼
  ┌───────────────────────────────────────────────┐
  │  6. DISPATCH                                  │
  │     Route decision to appropriate surface:    │
  │                                               │
  │     composite > 80: Ambient Bar (immediate)   │
  │     decision_type = morning_brief_item:       │
  │       → Morning Brief engine                  │
  │     decision_type = proactive_trigger:        │
  │       → Proactive engine trigger queue        │
  │     decision_type = reply_suggestion:         │
  │       → Conversation sidebar                  │
  └───────────────────────────────────────────────┘
```

**Decision types by trigger:**

| Trigger | Decision type produced | Primary surface |
|---|---|---|
| `message.received` | `reply_suggestion` | Conversation drawer |
| `rhythm.deviation` | `proactive_trigger` | Ambient Bar or trigger card |
| `deal.stage_changed` | `best_next_action` | Deal sidebar |
| `calendar.event_upcoming` | `best_next_action` → Pre-call Brief | Call brief drawer |
| Daily scheduler | `morning_brief_item` × N | Morning Brief |
| Manual (Cmd+K) | `best_next_action` | Command Palette result |

**Suppression rules (preventing noise):**

The Decision Engine never recommends the same action for the same entity if:
- It was accepted and acted on in the last 3 days
- It was rejected 3 times in the last 14 days
- A similar action is already in the proactive trigger queue with `status='pending'`

This ensures the system surfaces the next-best action when the best one has already been handled.

---

### 2.4 Learning Engine [REV-8]

**Purpose:** The Learning Engine watches what the founder actually does and updates the workspace behavioral profile accordingly. It has no AI calls — it is pure observation and statistics. The AI layer (Decision Engine) reads the profile; the Learning Engine only writes it.

**[REV-6] Learning loop:**

```
Founder interacts with a recommendation
          │
          ▼
  POST /api/rie/feedback
  { decision_id, feedback_type, original_content?, final_content? }
          │
          ▼
  ┌───────────────────────────────────────────────┐
  │  1. RECORD                                    │
  │     INSERT into rie_feedback_events           │
  │     Compute edit_ratio if draft feedback      │
  │     Link to decision (outcome FK)             │
  └──────────────────────┬────────────────────────┘
                         │
                         ▼
  ┌───────────────────────────────────────────────┐
  │  2. RESOLVE DECISION                          │
  │     UPDATE rie_decision_log                   │
  │     SET outcome = feedback_type               │
  │     outcome_at = now                          │
  │     outcome_feedback_id = feedback.id         │
  └──────────────────────┬────────────────────────┘
                         │
                         ▼
  ┌───────────────────────────────────────────────┐
  │  3. UPDATE PROFILE (incremental, synchronous) │
  │     Load rie_learning_profiles for workspace  │
  │     Apply update based on feedback_type:      │
  │                                               │
  │     accepted:                                 │
  │       action_acceptance[type].accepted += 1   │
  │       overall_accept_rate recalculated        │
  │                                               │
  │     rejected:                                 │
  │       action_acceptance[type].rejected += 1   │
  │                                               │
  │     draft_accepted:                           │
  │       avg_edit_ratio weighted toward 0        │
  │       comm_style: update length, formality    │
  │                                               │
  │     draft_edited_major:                       │
  │       avg_edit_ratio weighted toward 1        │
  │       detect: shorter/longer/style change     │
  │       update formality_delta                  │
  │                                               │
  │     manual_override:                          │
  │       override_patterns: record action_type   │
  │                                               │
  │     All paths:                                │
  │       total_decisions += 1                    │
  │       is_calibrated = total_decisions >= 20   │
  │       profile_version = new SHA-256 of fields │
  └──────────────────────┬────────────────────────┘
                         │
                         ▼
  rie_learning_profiles updated
  Next Decision Engine call reads fresh profile
  style_fit_score recalculated for future candidates
```

**Style hints generated from profile:**

The Learning Engine generates human-readable style hints from the profile that are injected into the Context Builder:

```typescript
function generateStyleHints(profile: LearningProfile): StyleHints {
  const hints: string[] = [];

  if (profile.prefers_shorter) {
    hints.push("Founder prefers shorter replies (consistently shortens AI drafts)");
  }
  if (profile.formality_delta < -0.3) {
    hints.push("Founder prefers casual tone (makes AI drafts less formal)");
  }
  if (profile.formality_delta > 0.3) {
    hints.push("Founder prefers formal tone (makes AI drafts more formal)");
  }

  // Top rejected action types
  const rejectedTypes = Object.entries(profile.action_acceptance)
    .filter(([_, v]) => v.rate < 0.2 && v.rejected >= 3)
    .map(([k]) => k);
  if (rejectedTypes.length > 0) {
    hints.push(`Avoid recommending: ${rejectedTypes.join(", ")}`);
  }

  return { hints, is_calibrated: profile.is_calibrated };
}
```

**What the Learning Engine does NOT do:**
- It does not re-train model weights
- It does not infer intent from unrelated behavior
- It does not track individual user sessions
- It does not share profiles across workspaces

All learning is per-workspace, explicit, and derived only from interactions with Ventra's own AI recommendations.

---

### 2.5 Knowledge Engine (unchanged from v2 §2.2)

See v2 §2.2. Full 6-step pipeline: Relevance Filter → Extractor → Classifier → Deduplicator → Quality Gate → Memory Router.

---

### 2.6 AI Memory Engine (unchanged from v2 §2.3)

See v2 §2.3. Three-class lifecycle (episodic/semantic/strategic), 6-hour strategic memory validation scheduler.

---

### 2.7 Context Assembler — RETIRED

The `context-assembler.ts` described in v2 is superseded by `context-builder.ts` (§2.2 above). Any reference to `context-assembler.ts` in prior documents should be treated as referring to `context-builder.ts`.

---

### 2.8 Relationship Narrative Engine (unchanged from v2 §2.5)

See v2 §2.5. Now uses `buildContext(purpose="narrative", ...)` instead of the old internal assembler.

---

### 2.9 Configurable Momentum Pipeline (unchanged from v2 §2.6)

See v2 §2.6. Now uses `buildContext(purpose="coaching", ...)` for its narrative generation step.

---

### 2.10 Morning Brief Engine [Phase 1B target]

The Morning Brief is the single visible feature being built in Phase 1B. All infrastructure from Phase 1A feeds it.

**What a Morning Brief contains:**

```
Good morning, Azaliya.

Today's focus:
  [DECISION — composite 94] ← from Decision Engine
  → Follow up with Sarah Mitchell about the board decision.
    She hasn't replied in 8 days (3× her normal silence).
    Based on: 2 mentions of board timeline, rhythm deviation, win pattern match.
    [Why?] [Draft reply →] [Snooze 2 days]

  [DECISION — composite 87]
  → Priya Kapoor's deal has been in Proposal for 11 days with no update.
    Two of three deals lost at this stage took 12+ days with no contact.
    [Why?] [Schedule call →] [Update stage →]

Pipeline snapshot:
  3 deals advancing · 1 deal at risk · 2 clients overdue

One thing you can't miss:
  → Apex Digital close expected in 6 days — no signed contract yet.
```

**Morning Brief generation flow:**

```
Daily scheduler fires at 07:00 (user timezone)
          │
          ▼
  1. Load all active clients (last 90 days activity)
  2. Load all open deals
  3. For each entity:
     a. buildContext(purpose="morning_brief", entityType, entityId)
     b. Decision Engine: generateDecision(context)
        → produces morning_brief_item decisions
  4. Rank all morning_brief_items by composite_score
  5. Select top 5 (configurable)
  6. buildContext(purpose="morning_brief", entityType="workspace")
     → workspace-level context for the "one thing" block
  7. AI call: generateMorningBriefNarrative(top5Decisions, workspaceContext)
     → produces the human-readable brief
  8. Store result (reuse morning brief table from v2 / existing brief endpoint)
  9. Emit to: Dashboard component + (future) push notification
```

**Why Morning Brief is Phase 1B:**

It exercises the entire Phase 1A infrastructure in one visible loop:
- Signals are emitted (from existing routes)
- Knowledge Engine extracts from those signals
- Memory Engine stores what was learned
- Context Builder assembles per-client context
- Decision Engine ranks and selects
- One AI call generates the output
- One frontend component renders it

If any layer has a bug, the Morning Brief will surface it. This is exactly the validation the architecture needs before scaling to Win/Loss, Proactive Triggers, Relationship Narratives, and Momentum.

---

## 3. AI Pipeline

### 3.1 AI Service Functions (v3 additions)

New functions in `src/lib/ai/service.ts`:

```typescript
// Knowledge extraction — called by Knowledge Engine
extractKnowledge(params: {
  signalType:      string;
  entityType:      string;
  entityName:      string;
  payload:         string;
  existingMemories: string;
}): Promise<KnowledgeExtractionResult>

// Strategic memory validation — called by Memory Engine scheduler
validateStrategicMemory(params: {
  memory:         MemoryEntry;
  currentContext: string;
}): Promise<ValidationResult>

// Decision candidate generation — called by Decision Engine step 2
generateActionCandidates(params: {
  context:        AssembledContext;   // from Context Builder
  decisionType:   string;
  entityName:     string;
}): Promise<ActionCandidate[]>

// Morning brief narrative — called by Morning Brief Engine step 7
generateMorningBriefNarrative(params: {
  topDecisions:   DecisionSummary[];
  workspaceContext: AssembledContext;
  founderName:    string;
}): Promise<MorningBriefNarrative>

// Relationship narrative (unified by entity type)
generateRelationshipNarrative(params: {
  entityType:     "client" | "deal" | "conversation";
  context:        AssembledContext;
}): Promise<RelationshipNarrativeResult>

// Momentum explanation (after factor calculation)
generateMomentumExplanation(params: {
  score:          number;
  delta:          number;
  factorScores:   Record<string, number>;
  topDriver:      string;
  topDrag:        string | null;
}): Promise<MomentumExplanationResult>
```

All functions follow the existing `service.ts` pattern: JSON mode, `parseJSON` helper, typed return, graceful fallback when no API key.

---

### 3.2 AI Call Budget (updated for Decision Engine)

| Subsystem | Model tier | Max tokens | Temp | Frequency |
|---|---|---|---|---|
| Knowledge extraction | fast | 400 | 0.2 | Per signal |
| Memory validation | fast | 200 | 0.1 | Per strategic memory, weekly |
| **Action candidates** | fast | 500 | 0.3 | Per decision trigger |
| **Morning brief narrative** | standard | 800 | 0.5 | Daily |
| Client narrative | standard | 600 | 0.4 | Per material change |
| Deal narrative | standard | 600 | 0.4 | Per signal (deal-related) |
| Conversation narrative | fast | 400 | 0.3 | Per inbound message |
| Momentum explanation | fast | 200 | 0.5 | Daily |
| Win/loss autopsy | standard | 800 | 0.3 | Per deal close |
| Call brief | standard | 800 | 0.4 | Per calendar event |
| Trigger content | fast | 150 | 0.6 | Per trigger |

The Learning Engine has **zero AI calls** — it is pure statistics on observed behavior.

---

## 4. Event System

### 4.1 Signal Taxonomy (additions to v2)

All 14 signal types from v2 are retained. New signals added for Learning Engine:

| Signal | Who emits | Who subscribes |
|---|---|---|
| `feedback.action_accepted` | `/api/rie/feedback` route | Learning Engine |
| `feedback.action_rejected` | `/api/rie/feedback` route | Learning Engine |
| `feedback.draft_accepted` | `/api/rie/feedback` route | Learning Engine |
| `feedback.draft_edited` | `/api/rie/feedback` route | Learning Engine |
| `feedback.manual_override` | `/api/rie/feedback` route | Learning Engine |

These signals do **not** go through the Knowledge Engine — they go directly to the Learning Engine. Feedback about AI recommendations is not the same kind of knowledge as facts about clients.

---

### 4.2 Updated Dispatch Table (v3)

| Signal | Rhythm | Knowledge | Decision | Learning | Narrative | Momentum | WinLoss | Proactive |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `message.received` | ✓ | ✓ | ✓ | | ✓ | ✓ | | ✓ |
| `message.sent` | ✓ | ✓ | | | | ✓ | | |
| `deal.stage_changed` | | ✓ | ✓ | | ✓ | ✓ | | ✓ |
| `deal.won` | | ✓ | | | | ✓ | ✓ | |
| `deal.lost` | | ✓ | | | | ✓ | ✓ | |
| `deal.updated` | | ✓ | | | ✓ | ✓ | | |
| `task.completed` | | | | | | ✓ | | |
| `task.overdue` | | | ✓ | | | ✓ | | ✓ |
| `calendar.event_upcoming` | | | ✓ | | | | | |
| `client.updated` | | ✓ | | | ✓ | | | |
| `feedback.*` | | | | ✓ | | | | |
| `rhythm.deviation` | | | ✓ | | | | | ✓ |

Decision Engine subscribes to high-signal events (message received, deal changed, task overdue, calendar event, rhythm deviation). It does not re-run on every signal — only on events that meaningfully change what the best next action would be.

---

### 4.3 Scheduler (v3 additions)

| Job | Frequency | What it does |
|---|---|---|
| `generate_morning_brief` | Daily at 07:00 | Decision Engine × all active entities → Morning Brief |
| `validate_strategic_memories` | Every 6 hours | Re-validates expiring strategic memories |
| `evaluate_proactive_triggers` | Every 60 min | Re-evaluates pending triggers |
| `compute_rhythm_deviations` | Every 6 hours | Recomputes gap_scores |
| `compute_momentum_score` | Every 6 hours | Runs configurable pipeline |
| `cleanup_stale_decisions` | Daily | Marks old unresolved decisions as "ignored" after 72 hours |
| `recalibrate_learning_profile` | Weekly | Full recalculation of learning profile from all feedback history |
| `cleanup_signal_events` | Daily | Archives processed signals >30 days old |

---

## 5. Frontend Architecture

### 5.1 RIEContext (v3 additions)

```typescript
interface RIEContextValue {
  // ... all v2 fields ...

  // Decision Engine [REV-7]
  getEntityDecision:     (entityType: string, entityId: string) => Decision | null;
  getPendingDecisions:   () => Decision[];     // all workspace decisions awaiting action
  refreshDecision:       (entityType: string, entityId: string) => void;

  // Feedback / Learning [REV-8]
  recordFeedback:        (params: FeedbackParams) => void;
  getLearningProfile:    () => LearningProfile | null;
}
```

---

### 5.2 New Components (v3)

```
src/components/rie/
├── ...all v2 components...
│
├── decision-card.tsx           — [NEW REV-7] Renders a single Decision with rationale + actions
├── morning-brief.tsx           — [UPDATED] Driven by Decision Engine output (not raw triggers)
├── feedback-buttons.tsx        — [NEW REV-8] Accept / Edit / Reject / Snooze on any AI surface
├── learning-profile-panel.tsx  — [NEW REV-8] Settings panel: "How Ventra has learned from you"
└── context-debug-panel.tsx     — [NEW REV-9] Dev-only: shows assembled context for any entity
```

**`FeedbackButtons` component is the Learning Engine's UI hook:**

```tsx
// Appears on every AI recommendation surface
<FeedbackButtons
  decisionId={decision.id}
  surface="morning_brief"
  onAccept={() => recordFeedback({ decisionId, type: "accepted" })}
  onReject={() => recordFeedback({ decisionId, type: "rejected" })}
  onSnooze={(days) => recordFeedback({ decisionId, type: "snoozed", snoozeDays: days })}
/>
```

Every "thumbs up / thumbs down / dismiss" button in the UI writes a feedback event. Every feedback event updates the learning profile.

---

## 6. API Route Map (v3 additions)

```
# Decision Engine [REV-7]
GET  /api/rie/decision?entity=client&id=XXX   — Current best decision for an entity
GET  /api/rie/decisions                        — All pending workspace decisions (sorted by score)
POST /api/rie/decision/refresh                 — Force re-run for an entity

# Feedback / Learning [REV-8]
POST /api/rie/feedback                         — Record a feedback event (accept/reject/edit)
GET  /api/rie/learning-profile                 — Current workspace learning profile
GET  /api/rie/learning-profile/insights        — Human-readable summary of what Ventra has learned

# Morning Brief (Phase 1B)
GET  /api/rie/morning-brief                    — Today's brief (generates if not yet created)
POST /api/rie/morning-brief/refresh            — Force regeneration

# All v2 routes unchanged
GET  /api/rie/knowledge?entity=client&id=XXX
GET  /api/rie/memory?entity=client&id=XXX
GET  /api/rie/narrative?entity=client&id=XXX
GET  /api/rie/momentum
GET  /api/rie/momentum/config
PATCH /api/rie/momentum/config
GET  /api/rie/rhythm/[clientId]
GET  /api/rie/triggers
PATCH /api/rie/triggers/[id]
GET  /api/rie/brief/precall?clientId=XXX
GET  /api/rie/winloss
POST /api/rie/signal
```

---

## 7. Implementation Sequence

### Phase 1A — Infrastructure (Week 1)

Goal: build every foundation layer. Zero visible UI changes. Every piece is tested before Phase 1B starts.

| # | Task | File(s) | Notes |
|---|---|---|---|
| 1 | Migration v16 | `src/lib/server/migrations.ts` | All 13 RIE tables + indexes in one transaction |
| 2 | Database helpers | `src/lib/server/rie/db-rie.ts` | CRUD for every table; workspace-scoped |
| 3 | Confidence utilities | `src/lib/server/rie/confidence.ts` | `computeConfidence`, `deriveStrength`, `mergeEvidence`, `knowledgeHash` |
| 4 | Signal bus | `src/lib/server/rie/signal-bus.ts` | 14 + 5 feedback signal types, store → dispatch |
| 5 | Signal emission | All existing API routes | `emitSignal()` call after DB write, fire-and-forget |
| 6 | Knowledge Engine | `src/lib/server/rie/knowledge-engine.ts` | 6-step pipeline with AI extraction |
| 7 | Memory Engine | `src/lib/server/rie/memory-engine.ts` | All three class write paths |
| 8 | **Shared Context Builder** | `src/lib/server/context-builder.ts` | Purpose-aware, token-budgeted, style-hint-aware |
| 9 | Learning Engine (record only) | `src/lib/server/rie/learning-engine.ts` | `recordFeedback()` + `updateProfile()` (no AI) |
| 10 | `/api/rie/signal` route | `src/app/api/rie/signal/route.ts` | Signal emission endpoint |
| 11 | `/api/rie/feedback` route | `src/app/api/rie/feedback/route.ts` | Feedback recording endpoint |
| 12 | Unit tests | `src/lib/server/rie/__tests__/` | Knowledge dedup hash · Context Builder token budget · Signal dispatch · Memory class write paths |

**1A is complete when:** `npx tsc --noEmit` passes, all unit tests pass, and a manual API call to `/api/rie/signal` with a `message.received` payload successfully creates a knowledge item and memory entry.

---

### Phase 1B — AI Morning Brief (Week 2)

Goal: one end-to-end visible feature. The founder opens the dashboard and sees their morning brief.

| # | Task | File(s) | Notes |
|---|---|---|---|
| 13 | Rhythm Engine | `src/lib/server/rie/rhythm-engine.ts` | Baseline + gap_score computation |
| 14 | Decision Engine | `src/lib/server/rie/decision-engine.ts` | Candidate gen → scoring → selection → log |
| 15 | `generateActionCandidates` AI fn | `src/lib/ai/service.ts` | Fast model, JSON mode |
| 16 | Morning Brief Engine | `src/lib/server/rie/morning-brief-engine.ts` | Assemble top decisions → AI narrative |
| 17 | `generateMorningBriefNarrative` AI fn | `src/lib/ai/service.ts` | Standard model, 800 tokens |
| 18 | `/api/rie/morning-brief` route | `src/app/api/rie/morning-brief/route.ts` | GET + POST refresh |
| 19 | `/api/rie/decision` route | `src/app/api/rie/decision/route.ts` | GET entity decision |
| 20 | Daily scheduler job | Scheduler system | 07:00 generation trigger |
| 21 | `MorningBrief` component | `src/components/rie/morning-brief.tsx` | Decision cards + FeedbackButtons |
| 22 | `DecisionCard` component | `src/components/rie/decision-card.tsx` | With rationale + evidence panel link |
| 23 | `FeedbackButtons` component | `src/components/rie/feedback-buttons.tsx` | Accept / Reject / Snooze |
| 24 | Wire into Dashboard | `src/app/(app)/dashboard/page.tsx` | Morning brief zone |
| 25 | End-to-end QA | — | TypeScript · ESLint · Manual test with seed data |

**1B is complete when:** A founder logs in, the dashboard shows a morning brief with 3–5 AI-ranked decisions, each with a rationale and evidence link. Clicking Accept/Reject on any item updates the learning profile. `npx tsc --noEmit` passes. `npx eslint` passes.

---

### Phase 2 and Beyond (deferred until Phase 1B validated)

| Phase | Feature | Depends on |
|---|---|---|
| 2A | Win/Loss Learning + Deal Autopsy | Phase 1A (signal bus, memory) |
| 2B | Relationship Narratives (client + deal) | Phase 1A + Decision Engine |
| 2C | Proactive Follow-Up Engine | Phase 1A + Decision Engine |
| 2D | Pre-Call Intelligence | Phase 1A + Decision Engine + Narratives |
| 2E | Configurable Momentum Pipeline | Phase 1A |
| 3A | Command Palette RIE commands | All Phase 2 features |
| 3B | Ambient Bar (persistent suggestions) | Phase 2 + Learning Engine |
| 3C | Learning Profile Settings Panel | Phase 1B (enough feedback to show) |
| 3D | Conversation Narrative + Reply Drafts with context | Phase 1A + Memory |

---

## 8. Future Scalability (unchanged from v2 + v3 additions)

**All v2 scalability notes apply.** New additions:

### 8.1 Decision Engine Model Specialization

The Decision Engine currently uses one fast model for candidate generation. Future: fine-tune a domain-specific model on the workspace's own decision history:
- Training signal: `rie_decision_log` rows where `outcome = 'accepted'` and `composite_score = high`
- The fine-tuned model gets better at the specific founder's business context over time
- Enabled per workspace when feedback volume crosses a threshold (est. 500+ decisions)

### 8.2 Cross-Workspace Learning (Anonymized)

The Learning Engine currently operates per-workspace with zero data sharing. Future opt-in: anonymized pattern aggregation across workspaces to improve cold-start recommendations for new workspaces. Implementation: separate `global_action_patterns` table fed by an opt-in pipeline. Existing `rie_learning_profiles` schema unchanged.

### 8.3 Active Learning Interface

The Learning Profile Settings Panel (`learning-profile-panel.tsx`) currently shows what Ventra has learned. Future: it becomes interactive — the founder can correct the profile directly ("I don't want follow-up suggestions when a deal is in Legal Review"). These manual corrections are stored as hard constraints in `rie_learning_profiles.override_patterns_json` and are respected unconditionally by the Decision Engine.

---

## 9. Approval Checklist

**From v1 (8 items):**
- [ ] Data model — base table schemas and relationships
- [ ] Signal taxonomy — 14 signal types
- [ ] Rhythm algorithm — personalized threshold, 0–100 score
- [ ] AI memory lifecycle — immutable entries, supersede pattern
- [ ] Processing model — sync rhythm, async AI calls
- [ ] Scheduler approach — in-process intervals
- [ ] Frontend component list
- [ ] Implementation sequence

**From v2 (6 items):**
- [ ] Knowledge Engine staging table and 6-step pipeline
- [ ] Three-class memory taxonomy and lifecycle rules
- [ ] Strategic memory expiry windows (3–30 days by type)
- [ ] Default Momentum Config (4 factors, `weighted_average`)
- [ ] Relationship Narrative entity types (client/deal/conversation) and context inputs
- [ ] Evidence item structure and evidence strength labels

**New in v3 (6 items):**
- [ ] **[REV-7]** Decision Engine pipeline (candidate gen → 4-factor scoring → dedup → selection → dispatch) approved
- [ ] **[REV-7]** Decision suppression rules (repeated rejection → penalty → 7-day suppression) approved
- [ ] **[REV-8]** Learning Engine feedback taxonomy (8 feedback types) approved
- [ ] **[REV-8]** Learning profile schema and incremental update logic approved
- [ ] **[REV-9]** Shared Context Builder interface and purpose-aware assembly order approved
- [ ] **[REV-10]** Phase 1A / 1B split (infrastructure first, Morning Brief as validation feature) approved

---

*Architecture document v3.0 — complete.*
*Awaiting final approval before Phase 1A implementation begins.*
