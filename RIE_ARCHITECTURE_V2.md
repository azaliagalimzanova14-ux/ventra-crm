# Relationship Intelligence Engine — Architecture Document
## Sprint 2: "Ventra Understands Relationships"

**Version:** 2.0 (Revised)
**Previous version:** 1.0 — approved with revisions July 17, 2026
**Status:** Awaiting final approval before implementation
**Stack:** Next.js App Router · Node 22 · SQLite (DatabaseSync) · OpenAI-compatible provider
**Author:** CTO / AI Engineering Team
**Date:** July 17, 2026

---

## Revision Summary (v1 → v2)

Six architectural revisions were requested after the v1 review. Every change is annotated `[REV-N]` throughout this document.

| # | Revision | Impact |
|---|---|---|
| REV-1 | Knowledge Engine introduced between Signal Bus and AI Memory | New subsystem, new table, new processing layer |
| REV-2 | AI Memory extended to episodic / semantic / strategic classes | Schema changes to `rie_ai_memory`, new memory lifecycle rules |
| REV-3 | Momentum Score weights replaced with configurable scoring pipeline | New table `rie_momentum_config`, engine rewrite |
| REV-4 | Deal Narrative generalized to Relationship Narrative | Table renamed, `entity_type` discriminator added, client narratives enabled |
| REV-5 | Confidence Score and Evidence tracking on every AI insight | New `evidence_json` + `confidence_score` columns across all output tables |
| REV-6 | Architecture diagrams and data flow updated throughout | Affects §0, §2, §3, §4 |

---

## 0. Design Philosophy

The Relationship Intelligence Engine (RIE) is the nervous system of Ventra. Every piece of data that flows through the product — a new message, a stage change, a replied email, a closed deal — passes through the RIE. It listens, learns, stores, and surfaces. It never forgets. It connects events that humans would not notice.

**[REV-1][REV-2] Revised subsystem map — eight subsystems, one brain:**

| # | Subsystem | What it processes | What it produces |
|---|---|---|---|
| 1 | Relationship Rhythm | Communication velocity per client | Deviation alerts when silence is anomalous |
| 2 | **Knowledge Engine** *(new)* | Raw signals → structured knowledge items | Classified, deduplicated knowledge ready for memory |
| 3 | AI Memory (3 classes) | Knowledge items → persistent memory | Episodic, semantic, and strategic memory per entity |
| 4 | Relationship Narrative *(was Deal Narrative)* | Entity state × memory × patterns | Strategic reading of any relationship or deal |
| 5 | Business Momentum Score | Energy signals across workspace | Configurable composite score with trend |
| 6 | Win/Loss Learning | Closed deal signal vectors | Pattern coaching overlaid on active deals |
| 7 | Proactive Follow-Up | Trigger conditions per client/deal | Scheduled, evidence-backed proactive actions |
| 8 | Pre-Call Intelligence | Calendar events × relationship context | Grounded meeting briefs 30 minutes before calls |

**[REV-6] System data flow — end to end:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VENTRA API ROUTES                               │
│   (messages, deals, clients, tasks, conversations, calendar)            │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ emitSignal()
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          SIGNAL BUS                                      │
│   Validates · Stores to rie_signal_events · Dispatches to subscribers   │
└────────────┬─────────────────────┬──────────────────────────────────────┘
             │                     │
             ▼                     ▼
  ┌──────────────────┐   ┌──────────────────────────────────────────────┐
  │  RHYTHM ENGINE   │   │         KNOWLEDGE ENGINE  [REV-1]            │
  │  (math-only,     │   │  Classify → Extract → Deduplicate → Route    │
  │   synchronous)   │   │  Stores to: rie_knowledge_items              │
  └──────────────────┘   └─────────────────────┬────────────────────────┘
                                               │ knowledge items
                                               ▼
                         ┌──────────────────────────────────────────────┐
                         │           AI MEMORY ENGINE  [REV-2]          │
                         │  Episodic · Semantic · Strategic             │
                         │  Stores to: rie_ai_memory                   │
                         └──────────────────────┬───────────────────────┘
                                                │ assembled context
                                                ▼
                         ┌──────────────────────────────────────────────┐
                         │         CONTEXT ASSEMBLER                    │
                         │  Memory + Rhythm + Patterns → prompt context │
                         └──┬───────────────┬──────────────────────────┘
                            │               │
              ┌─────────────┘     ┌─────────┘
              ▼                   ▼
  ┌─────────────────────┐  ┌───────────────────────┐
  │  RELATIONSHIP       │  │  MOMENTUM ENGINE      │
  │  NARRATIVE [REV-4]  │  │  (configurable        │
  │  client / deal /    │  │   pipeline) [REV-3]   │
  │  conversation       │  └───────────────────────┘
  └─────────────────────┘
              │
    ┌─────────┴─────────────────────────────────┐
    │                                           │
    ▼                                           ▼
  WIN/LOSS ENGINE                     PROACTIVE ENGINE
  Pattern extraction                  Trigger queue
  Autopsy generation                  Delivery routing
              │                                 │
              └────────────────┬────────────────┘
                               ▼
                    PRE-CALL ENGINE
                    Meeting brief assembly
                               │
                               ▼
              ┌────────────────────────────────────┐
              │      RIE API ROUTES                │
              │  /api/rie/* → frontend consumers   │
              └────────────────────────────────────┘
                               │
              ┌────────────────┼────────────────────┐
              ▼                ▼                     ▼
        AmbientBar       RecordSidebar          MorningBrief
        Dashboard        CallBriefDrawer        CommandPalette
```

**Architectural constraints (unchanged from v1):**
- Server-only processing. No client-side AI logic.
- Every subsystem is workspace-scoped. No data crosses workspace boundaries.
- AI calls are async and gracefully degrade when no API key is present.
- SQLite-first. Schema is forward-compatible with PostgreSQL.
- All new tables extend the existing migration system (v16).

---

## 1. Data Model

### 1.1 Complete Table Inventory

**[REV-1][REV-3][REV-4][REV-5] Changes from v1:**
- `rie_knowledge_items` — **new** (REV-1)
- `rie_momentum_config` — **new** (REV-3)
- `rie_deal_narratives` — **renamed** to `rie_relationship_narratives` + schema extended (REV-4, REV-5)
- `rie_ai_memory` — **extended** with memory class columns and evidence (REV-2, REV-5)
- All output tables — **extended** with `confidence_score` + `evidence_json` (REV-5)

```
rie_signal_events              — raw event log (unchanged)
rie_knowledge_items            — [NEW] processed knowledge before memory commitment
rie_relationship_rhythms       — communication baseline per client (unchanged schema)
rie_ai_memory                  — [EXTENDED] episodic / semantic / strategic memory
rie_relationship_narratives    — [RENAMED+EXTENDED] narratives for client, deal, conversation
rie_momentum_config            — [NEW] per-workspace scoring pipeline configuration
rie_momentum_scores            — daily composite score (extended with evidence)
rie_win_loss_patterns          — closed deal pattern vectors (extended with confidence)
rie_proactive_triggers         — proactive action queue (extended with evidence)
rie_call_briefs                — pre-call meeting briefs (extended with per-section evidence)
```

Migration split: all tables added in **migration v16** (one transaction, idempotent).

---

### 1.2 `rie_signal_events` (unchanged)

```sql
CREATE TABLE IF NOT EXISTS rie_signal_events (
  id              TEXT    PRIMARY KEY,
  workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type      TEXT    NOT NULL,
  entity_type     TEXT,
  entity_id       TEXT,
  payload_json    TEXT    NOT NULL,
  processed       INTEGER NOT NULL DEFAULT 0,
  processed_at    TEXT,
  created_at      TEXT    NOT NULL
);
```

---

### 1.3 `rie_knowledge_items` [REV-1 — NEW]

The Knowledge Engine writes here. This table is the boundary between raw signals and structured memory. Every row represents a piece of knowledge that has been extracted, classified, and validated — but not yet committed to long-term memory.

```sql
CREATE TABLE IF NOT EXISTS rie_knowledge_items (
  id              TEXT    PRIMARY KEY,
  workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Provenance
  signal_id       TEXT    REFERENCES rie_signal_events(id) ON DELETE SET NULL,
  source_type     TEXT    NOT NULL,   -- "message" | "deal_event" | "task" | "calendar" | "pattern"
  source_id       TEXT    NOT NULL,   -- ID of the originating record

  -- Target entity
  entity_type     TEXT    NOT NULL,   -- "client" | "deal" | "conversation" | "workspace"
  entity_id       TEXT    NOT NULL,

  -- Classification [REV-1]
  knowledge_class TEXT    NOT NULL,   -- "episodic" | "semantic" | "strategic"
  knowledge_type  TEXT    NOT NULL,   -- Fine-grained type within class (see §2.2)
  content         TEXT    NOT NULL,   -- Human-readable extracted knowledge
  content_vector  TEXT,               -- Reserved: future embedding storage (JSON float array)

  -- Confidence [REV-5]
  confidence_score  INTEGER NOT NULL DEFAULT 80,   -- 0–100
  evidence_strength TEXT    NOT NULL DEFAULT 'anecdotal',
                                      -- "anecdotal"|"pattern"|"strong_pattern"|"definitive"
  evidence_json     TEXT    NOT NULL DEFAULT '[]', -- JSON: EvidenceItem[]

  -- Deduplication
  dedup_hash      TEXT    NOT NULL,   -- SHA-256 of (workspace_id + entity_id + knowledge_type + normalized_content)
  supersedes_id   TEXT,               -- If this item supersedes an existing memory

  -- Lifecycle
  status          TEXT    NOT NULL DEFAULT 'pending',
                                      -- "pending"|"committed"|"rejected"|"superseded"
  committed_memory_id TEXT,           -- Set when committed to rie_ai_memory
  rejection_reason    TEXT,           -- Set when rejected by dedup or quality filter

  created_at      TEXT    NOT NULL,
  committed_at    TEXT,

  UNIQUE(dedup_hash)                  -- Prevents duplicate knowledge extraction
);
```

**Evidence item structure** [REV-5]:
```typescript
interface EvidenceItem {
  type:      "message" | "memory" | "signal" | "pattern" | "external";
  id:        string;       // FK to source record
  excerpt:   string;       // Short quote or description (max 150 chars)
  weight:    number;       // 0–1: contribution to confidence
  timestamp: string;       // ISO — when observed
}
```

**Why a staging table:** The Knowledge Engine needs to deduplicate, score, and sometimes batch multiple signals before committing to long-term memory. The staging table makes this pipeline inspectable and debuggable. Items in `status='pending'` can be reviewed; `status='committed'` items have a traceable FK back to the memory that was created. Failed items are not silently dropped — they are `status='rejected'` with a reason.

---

### 1.4 `rie_relationship_rhythms` (schema unchanged from v1)

```sql
CREATE TABLE IF NOT EXISTS rie_relationship_rhythms (
  id                     TEXT    PRIMARY KEY,
  workspace_id           TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id              TEXT    NOT NULL REFERENCES clients(id)    ON DELETE CASCADE,
  avg_response_time_hrs  REAL,
  avg_contact_gap_days   REAL,
  msg_per_week           REAL,
  sentiment_baseline     TEXT,
  typical_reply_days     TEXT,
  typical_reply_hours    TEXT,
  last_contact_at        TEXT,
  last_client_msg_at     TEXT,
  last_agent_msg_at      TEXT,
  days_since_contact     INTEGER,
  current_gap_score      REAL,
  silence_threshold_days REAL,
  is_overdue             INTEGER NOT NULL DEFAULT 0,
  deviation_magnitude    TEXT,
  sample_size            INTEGER NOT NULL DEFAULT 0,
  baseline_computed_at   TEXT,
  updated_at             TEXT    NOT NULL,
  UNIQUE(workspace_id, client_id)
);
```

---

### 1.5 `rie_ai_memory` [REV-2 — EXTENDED]

Extended to support three memory classes (episodic, semantic, strategic), a structured evidence trail, and strategic memory expiry. The `memory_type` flat taxonomy from v1 is replaced by a two-level system: `memory_class` (the structural kind) + `memory_type` (the semantic kind within that class).

```sql
CREATE TABLE IF NOT EXISTS rie_ai_memory (
  id              TEXT    PRIMARY KEY,
  workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type     TEXT    NOT NULL,   -- "client" | "deal" | "workspace"
  entity_id       TEXT    NOT NULL,

  -- Memory classification [REV-2]
  memory_class    TEXT    NOT NULL,   -- "episodic" | "semantic" | "strategic"
  memory_type     TEXT    NOT NULL,   -- See type taxonomy in §2.2 below

  -- Content
  content         TEXT    NOT NULL,   -- Human-readable learned fact or observation
  content_summary TEXT,               -- ≤60-char summary for UI chips and context truncation

  -- Provenance
  knowledge_item_id TEXT REFERENCES rie_knowledge_items(id) ON DELETE SET NULL,
  source_type     TEXT    NOT NULL,   -- "message"|"deal_event"|"task"|"pattern"|"manual"|"inference"
  source_id       TEXT,

  -- Confidence and evidence [REV-5]
  confidence_score  INTEGER NOT NULL DEFAULT 80,
  evidence_strength TEXT    NOT NULL DEFAULT 'anecdotal',
  evidence_json     TEXT    NOT NULL DEFAULT '[]',   -- JSON: EvidenceItem[]

  -- Strategic memory lifecycle [REV-2]
  -- episodic: never expires (facts are facts)
  -- semantic: expires only when superseded
  -- strategic: has an explicit expiry — strategy must be re-validated
  expires_at              TEXT,       -- NULL for episodic and semantic
  validation_required_at  TEXT,       -- When to re-evaluate whether this is still true
  last_validated_at       TEXT,

  -- Supersession chain (immutable by default)
  is_active       INTEGER NOT NULL DEFAULT 1,
  superseded_by   TEXT,               -- FK to newer rie_ai_memory row
  supersession_reason TEXT,           -- Why this memory was replaced

  created_at      TEXT    NOT NULL,
  last_seen_at    TEXT    NOT NULL    -- Updated when this memory is confirmed still true
);
```

---

### 1.6 Memory Class & Type Taxonomy [REV-2]

**Episodic Memory** — *What happened, when.* Timestamped events, immutable after recording. The historical record of the relationship.

| `memory_type` | Example content |
|---|---|
| `interaction` | "Sarah called on March 15 and confirmed budget approval" |
| `milestone` | "First contract signed on 2026-03-15, value $24K" |
| `turning_point` | "Deal stalled for 3 weeks then accelerated after the video demo" |
| `statement` | "James said 'we're comparing you with two other tools' on April 2" |
| `event` | "Priya missed the scheduled follow-up call on June 10" |

**Semantic Memory** — *What is true about this entity.* General knowledge that describes the entity's current state. Updated as reality changes.

| `memory_type` | Example content |
|---|---|
| `preference` | "Prefers Telegram over email; responds 3× faster on Telegram" |
| `constraint` | "Board approval required for contracts >$20K" |
| `concern` | "Expressed repeated hesitation about implementation complexity" |
| `relationship_fact` | "Sarah is the economic buyer; James is the technical champion" |
| `topic_interest` | "Specifically interested in AI reply drafts and inbox consolidation" |
| `risk` | "Budget freeze expected in Q3; mentioned in two conversations" |
| `pattern` | "Typically replies within 4 hours on Tuesday–Thursday mornings" |

**Strategic Memory** — *What to do about this entity.* Derived from episodic + semantic. Has an expiry because strategy must be re-validated as conditions change.

| `memory_type` | Expiry | Example content |
|---|---|---|
| `approach` | 30 days | "Lead with ROI argument for Sarah; she responds poorly to feature demos" |
| `timing` | 14 days | "Best window to reach James: Tuesday 9–11am — confirmed across 4 interactions" |
| `win_path` | 7 days | "To close: get Priya to include procurement contact in next call" |
| `risk_mitigation` | 14 days | "If price objection raised: offer phased payment; has worked with 2 similar deals" |
| `next_move` | 3 days | "Follow up Thursday with the revised implementation timeline document" |

**Lifecycle rules by class:**

```
Episodic:  created → active (permanent, never expires, never superseded)
           Exception: factual corrections create new episodic entry with note

Semantic:  created → active → [superseded if fact changes] → inactive
           Superseded entry marked is_active=0, superseded_by=new_id
           New entry points back to old entry via supersession_reason

Strategic: created → active → [expires at expires_at] → requires_validation
           Engine re-evaluates strategic memories on schedule
           If still valid: extends expires_at, updates last_validated_at
           If no longer valid: marks superseded, generates new strategic memory
           If uncertain: lowers confidence_score, flags for human review
```

---

### 1.7 `rie_relationship_narratives` [REV-4 — RENAMED & EXTENDED]

Previously `rie_deal_narratives`. Now generalized to cover three entity types: `client`, `deal`, and `conversation`. The context inputs and AI prompt differ by entity type; the output schema is unified.

```sql
CREATE TABLE IF NOT EXISTS rie_relationship_narratives (
  id              TEXT    PRIMARY KEY,
  workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Entity discrimination [REV-4]
  entity_type     TEXT    NOT NULL,   -- "client" | "deal" | "conversation"
  entity_id       TEXT    NOT NULL,   -- FK to clients.id / deals.id / conversations.id

  -- The narrative
  narrative       TEXT    NOT NULL,   -- 3–5 sentence strategic reading
  recommended_action TEXT NOT NULL,   -- Single most important next action
  risk_level      TEXT    NOT NULL,   -- "low" | "medium" | "high" | "critical"
  momentum        TEXT    NOT NULL,   -- "accelerating" | "stable" | "slowing" | "stalled"
  relationship_health TEXT NOT NULL,  -- "strong" | "healthy" | "at_risk" | "critical" | "unknown"

  -- Confidence and evidence [REV-5]
  confidence_score  INTEGER NOT NULL DEFAULT 80,
  evidence_strength TEXT    NOT NULL DEFAULT 'anecdotal',
  evidence_json     TEXT    NOT NULL DEFAULT '[]',

  -- Generation metadata
  signal_version  TEXT    NOT NULL,   -- Hash of input context (triggers re-generation when changed)
  context_json    TEXT    NOT NULL,   -- Full input context used (for auditability)
  memory_refs     TEXT,               -- JSON: string[] of rie_ai_memory IDs referenced
  model           TEXT,
  provider        TEXT,
  generated_at    TEXT    NOT NULL,
  is_current      INTEGER NOT NULL DEFAULT 1
);
```

**Context inputs by entity type** [REV-4]:

| Entity | Context inputs |
|---|---|
| `client` | Client profile · all conversations (last 30 msgs each) · all open deals · open tasks · rhythm data · all active memories · workspace win/loss patterns |
| `deal` | Deal fields + stage history · linked conversation (last 20 msgs) · client memories · deal memories · rhythm data · workspace win/loss patterns for this stage |
| `conversation` | Thread messages (all) · client profile · linked deal (if any) · client memories · rhythm data |

**Narrative content by entity type:**

- **Client narrative:** Reads the relationship as a whole. Covers relationship health, communication patterns, open business, next recommended engagement.
- **Deal narrative:** Reads the deal's trajectory. Covers stage progress, behavioral signals, win/loss pattern matches, single best next action.
- **Conversation narrative:** Reads the thread. Covers intent, urgency, tone, what the client is signaling, and the best reply approach.

---

### 1.8 `rie_momentum_config` [REV-3 — NEW]

Stores the per-workspace momentum scoring pipeline configuration. Default rows are inserted for every workspace on creation. Values can be updated by the workspace owner via Settings.

```sql
CREATE TABLE IF NOT EXISTS rie_momentum_config (
  id              TEXT    PRIMARY KEY,
  workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Factor registry
  -- Each factor is a JSON object in the factors_json array:
  -- {
  --   id:          string,         -- Unique factor identifier
  --   name:        string,         -- Display name
  --   description: string,         -- What this factor measures
  --   enabled:     boolean,        -- Whether this factor is active
  --   weight:      number,         -- 0–1; enabled factor weights must sum to 1.0
  --   calculator:  string,         -- Calculator function name (registered in momentum-engine.ts)
  --   bounds:      [number,number],-- [min, max] for normalization
  --   penalty_multiplier: number,  -- 0–1; multiplied into score when factor drops below threshold
  --   alert_threshold: number      -- Score below this triggers a momentum warning
  -- }
  factors_json    TEXT    NOT NULL,

  -- Aggregation method [REV-3]
  aggregation     TEXT    NOT NULL DEFAULT 'weighted_average',
                                    -- "weighted_average" | "geometric_mean" | "min_penalized"

  -- Penalty rules (applied after aggregation)
  -- JSON array of { condition: string, multiplier: number, description: string }
  penalty_rules_json TEXT NOT NULL DEFAULT '[]',

  -- Calibration
  baseline_period_days INTEGER NOT NULL DEFAULT 30,  -- Lookback window for "normal" calculation
  score_floor     INTEGER NOT NULL DEFAULT 10,        -- Minimum score regardless of signals

  updated_at      TEXT    NOT NULL,

  UNIQUE(workspace_id)
);
```

**Default factor configuration (inserted on workspace creation):**

```json
{
  "factors_json": [
    {
      "id": "deal_health",
      "name": "Deal Pipeline Health",
      "description": "Are deals advancing, stalling, or closing?",
      "enabled": true,
      "weight": 0.35,
      "calculator": "dealHealthCalculator",
      "bounds": [0, 100],
      "penalty_multiplier": 0.5,
      "alert_threshold": 40
    },
    {
      "id": "comm_health",
      "name": "Communication Health",
      "description": "Are key relationships staying active?",
      "enabled": true,
      "weight": 0.35,
      "calculator": "commHealthCalculator",
      "bounds": [0, 100],
      "penalty_multiplier": 0.6,
      "alert_threshold": 35
    },
    {
      "id": "task_completion",
      "name": "Task Execution Rate",
      "description": "Are commitments being fulfilled on time?",
      "enabled": true,
      "weight": 0.15,
      "calculator": "taskCompletionCalculator",
      "bounds": [0, 100],
      "penalty_multiplier": 0.7,
      "alert_threshold": 50
    },
    {
      "id": "client_engagement",
      "name": "Client Engagement Breadth",
      "description": "What fraction of active clients were contacted recently?",
      "enabled": true,
      "weight": 0.15,
      "calculator": "clientEngagementCalculator",
      "bounds": [0, 100],
      "penalty_multiplier": 0.8,
      "alert_threshold": 30
    }
  ],
  "aggregation": "weighted_average",
  "penalty_rules_json": [
    {
      "condition": "any_factor_below_20",
      "multiplier": 0.75,
      "description": "Any critical factor below 20 drags the composite score down"
    }
  ],
  "baseline_period_days": 30,
  "score_floor": 10
}
```

**Aggregation methods:**

| Method | Behavior | When to use |
|---|---|---|
| `weighted_average` | `Σ(factor × weight)` | Default: balanced view |
| `geometric_mean` | `∏(factor^weight)` | Punishes weak factors more harshly |
| `min_penalized` | `weighted_average × (min_factor / 100)` | Ensures no factor can be completely ignored |

**Custom factors (extensibility):** New calculators can be registered in `momentum-engine.ts` by name. Once registered, they can be activated per workspace via `factors_json` without engine code changes. This enables future domain-specific factors (e.g., `nps_trend`, `expansion_revenue`, `response_sla_compliance`).

---

### 1.9 `rie_momentum_scores` [REV-3 — EXTENDED]

Schema extended to store per-factor evidence and support the configurable pipeline.

```sql
CREATE TABLE IF NOT EXISTS rie_momentum_scores (
  id              TEXT    PRIMARY KEY,
  workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  score_date      TEXT    NOT NULL,

  -- Composite score
  score           INTEGER NOT NULL,
  trend           TEXT    NOT NULL,
  delta           INTEGER,

  -- Factor scores (dynamic — mirrors enabled factors from rie_momentum_config)
  factor_scores_json TEXT NOT NULL,
  -- JSON: { [factorId]: { score: number, evidence_json: EvidenceItem[], driver: string } }

  -- Aggregation used [REV-3]
  aggregation_method TEXT NOT NULL,
  penalty_applied    INTEGER NOT NULL DEFAULT 0,
  penalty_details    TEXT,

  -- Narrative [REV-5]
  explanation     TEXT    NOT NULL,
  top_driver      TEXT    NOT NULL,
  top_drag        TEXT,
  confidence_score INTEGER NOT NULL DEFAULT 90,
  evidence_json   TEXT    NOT NULL DEFAULT '[]',

  computed_at     TEXT    NOT NULL,

  UNIQUE(workspace_id, score_date)
);
```

---

### 1.10 `rie_win_loss_patterns` [REV-5 — EXTENDED]

```sql
CREATE TABLE IF NOT EXISTS rie_win_loss_patterns (
  id                      TEXT    PRIMARY KEY,
  workspace_id            TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  deal_id                 TEXT    NOT NULL REFERENCES deals(id)      ON DELETE CASCADE,
  outcome                 TEXT    NOT NULL,

  -- Timeline signals (unchanged from v1)
  total_days              INTEGER,
  days_in_each_stage      TEXT,
  stage_transitions       INTEGER,
  velocity_trend          TEXT,

  -- Communication signals (unchanged from v1)
  total_messages          INTEGER,
  client_initiation_pct   REAL,
  avg_client_response_hrs REAL,
  response_trend          TEXT,
  sentiment_at_close      TEXT,
  decision_maker_involved INTEGER,

  -- Behavioral signals (unchanged from v1)
  questions_asked         INTEGER,
  price_mentioned         INTEGER,
  competitor_mentioned    INTEGER,
  urgency_signals         INTEGER,

  -- Pattern labels
  pattern_labels          TEXT,
  autopsy_narrative       TEXT,

  -- Confidence and evidence [REV-5]
  confidence_score        INTEGER NOT NULL DEFAULT 80,
  evidence_strength       TEXT    NOT NULL DEFAULT 'anecdotal',
  evidence_json           TEXT    NOT NULL DEFAULT '[]',

  extracted_at            TEXT    NOT NULL,

  UNIQUE(workspace_id, deal_id)
);
```

---

### 1.11 `rie_proactive_triggers` [REV-5 — EXTENDED]

```sql
CREATE TABLE IF NOT EXISTS rie_proactive_triggers (
  id              TEXT    PRIMARY KEY,
  workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  trigger_type    TEXT    NOT NULL,
  entity_type     TEXT,
  entity_id       TEXT,
  condition_json  TEXT    NOT NULL,
  priority        TEXT    NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'pending',
  delivery_surface TEXT,
  delivered_at    TEXT,
  snoozed_until   TEXT,

  -- Content
  title           TEXT    NOT NULL,
  body            TEXT    NOT NULL,
  action_type     TEXT,
  action_params   TEXT,

  -- Confidence and evidence [REV-5]
  confidence_score  INTEGER NOT NULL DEFAULT 80,
  evidence_strength TEXT    NOT NULL DEFAULT 'anecdotal',
  evidence_json     TEXT    NOT NULL DEFAULT '[]',

  created_at      TEXT    NOT NULL,
  expires_at      TEXT
);
```

---

### 1.12 `rie_call_briefs` [REV-4][REV-5 — EXTENDED]

Call briefs can now reference client narratives directly. Per-section evidence added.

```sql
CREATE TABLE IF NOT EXISTS rie_call_briefs (
  id              TEXT    PRIMARY KEY,
  workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id       TEXT    REFERENCES clients(id) ON DELETE SET NULL,
  brief_date      TEXT    NOT NULL,
  call_at         TEXT,
  attendee_name   TEXT    NOT NULL,
  attendee_email  TEXT,

  -- Brief sections
  context_summary   TEXT  NOT NULL,
  key_signals       TEXT  NOT NULL,   -- JSON: SignalItem[]
  talking_points    TEXT  NOT NULL,   -- JSON: string[]
  watch_for         TEXT  NOT NULL,
  suggested_outcome TEXT  NOT NULL,

  -- Per-section evidence [REV-5]
  context_evidence  TEXT  NOT NULL DEFAULT '[]',   -- EvidenceItem[] backing context_summary
  signals_evidence  TEXT  NOT NULL DEFAULT '[]',   -- EvidenceItem[] backing key_signals
  points_evidence   TEXT  NOT NULL DEFAULT '[]',   -- EvidenceItem[] backing talking_points

  -- Linked narrative [REV-4]
  client_narrative_id TEXT REFERENCES rie_relationship_narratives(id) ON DELETE SET NULL,

  -- Aggregate confidence [REV-5]
  confidence_score  INTEGER NOT NULL DEFAULT 80,
  evidence_strength TEXT    NOT NULL DEFAULT 'anecdotal',

  memory_refs     TEXT,
  model           TEXT,
  provider        TEXT,
  generated_at    TEXT    NOT NULL,

  UNIQUE(workspace_id, client_id, brief_date)
);
```

---

### 1.13 Indexes

```sql
-- Knowledge items
CREATE INDEX IF NOT EXISTS idx_rie_knowledge_entity   ON rie_knowledge_items(workspace_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_rie_knowledge_pending  ON rie_knowledge_items(workspace_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_rie_knowledge_dedup    ON rie_knowledge_items(dedup_hash);

-- AI Memory (extended)
CREATE INDEX IF NOT EXISTS idx_rie_memory_entity      ON rie_ai_memory(workspace_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_rie_memory_class       ON rie_ai_memory(workspace_id, entity_type, entity_id, memory_class, is_active);
CREATE INDEX IF NOT EXISTS idx_rie_memory_strategic   ON rie_ai_memory(workspace_id, memory_class, expires_at) WHERE memory_class = 'strategic';
CREATE INDEX IF NOT EXISTS idx_rie_memory_validation  ON rie_ai_memory(workspace_id, validation_required_at) WHERE is_active = 1;

-- Relationship narratives (renamed)
CREATE INDEX IF NOT EXISTS idx_rie_narratives_entity  ON rie_relationship_narratives(workspace_id, entity_type, entity_id, is_current);
CREATE INDEX IF NOT EXISTS idx_rie_narratives_risk    ON rie_relationship_narratives(workspace_id, risk_level, is_current);

-- Momentum
CREATE INDEX IF NOT EXISTS idx_rie_momentum_date      ON rie_momentum_scores(workspace_id, score_date);
CREATE INDEX IF NOT EXISTS idx_rie_momentum_config    ON rie_momentum_config(workspace_id);

-- Rhythm, patterns, triggers, briefs (unchanged from v1)
CREATE INDEX IF NOT EXISTS idx_rie_rhythms_client     ON rie_relationship_rhythms(workspace_id, client_id);
CREATE INDEX IF NOT EXISTS idx_rie_rhythms_overdue    ON rie_relationship_rhythms(workspace_id, is_overdue);
CREATE INDEX IF NOT EXISTS idx_rie_patterns_outcome   ON rie_win_loss_patterns(workspace_id, outcome);
CREATE INDEX IF NOT EXISTS idx_rie_triggers_pending   ON rie_proactive_triggers(workspace_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_rie_triggers_entity    ON rie_proactive_triggers(workspace_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_rie_signals_pending    ON rie_signal_events(workspace_id, processed, created_at);
```

---

## 2. Backend Architecture

### 2.1 File Structure

```
src/lib/server/rie/
├── index.ts                  — Public API surface
├── signal-bus.ts             — Signal ingestion and dispatch
├── knowledge-engine.ts       — [NEW REV-1] Signal → Knowledge pipeline
├── rhythm-engine.ts          — Relationship Rhythm (unchanged algorithm)
├── memory-engine.ts          — [EXTENDED REV-2] Episodic/Semantic/Strategic
├── narrative-engine.ts       — [EXTENDED REV-4] Relationship Narrative (client+deal+conv)
├── momentum-engine.ts        — [EXTENDED REV-3] Configurable scoring pipeline
├── winloss-engine.ts         — Win/Loss patterns and autopsy
├── proactive-engine.ts       — Trigger queue and evaluation
├── precall-engine.ts         — Pre-call brief assembly
├── context-assembler.ts      — Budget-aware context building (extended for memory classes)
├── confidence.ts             — [NEW REV-5] Confidence scoring and evidence utilities
└── db-rie.ts                 — All database helpers for RIE tables
```

---

### 2.2 Knowledge Engine [REV-1]

The Knowledge Engine is the boundary between raw signals and stored understanding. Nothing enters AI Memory without passing through it.

**[REV-6] Knowledge Engine internal flow:**

```
Signal received
      │
      ▼
  ┌───────────────────────────────────┐
  │  1. RELEVANCE FILTER              │
  │  Is this signal knowledge-worthy? │
  │  (filters out noise: read events, │
  │   failed sends, duplicates)       │
  └────────────────┬──────────────────┘
                   │ yes
                   ▼
  ┌───────────────────────────────────┐
  │  2. EXTRACTOR                     │
  │  Call AI: "What new knowledge     │
  │  does this signal contain?"       │
  │  Output: raw KnowledgeCandidate[] │
  └────────────────┬──────────────────┘
                   │
                   ▼
  ┌───────────────────────────────────┐
  │  3. CLASSIFIER                    │
  │  Assign memory_class + type       │
  │  Score confidence + evidence      │
  │  Set expires_at for strategic     │
  └────────────────┬──────────────────┘
                   │
                   ▼
  ┌───────────────────────────────────┐
  │  4. DEDUPLICATOR                  │
  │  Compute dedup_hash               │
  │  Check rie_knowledge_items        │
  │  Check rie_ai_memory              │
  │  Decision: new | update | skip    │
  └────────────────┬──────────────────┘
                   │
          ┌────────┴────────┐
          ▼                 ▼
      INSERT             UPDATE
   pending item       last_seen_at on
   to knowledge       existing memory
      table
          │
          ▼
  ┌───────────────────────────────────┐
  │  5. QUALITY GATE                  │
  │  confidence_score ≥ threshold?    │
  │  (episodic: 60, semantic: 70,     │
  │   strategic: 75)                  │
  └────────────────┬──────────────────┘
                   │ passes
                   ▼
  ┌───────────────────────────────────┐
  │  6. MEMORY ROUTER                 │
  │  Commit to rie_ai_memory          │
  │  Update knowledge item:           │
  │  status → committed               │
  │  committed_memory_id → new id     │
  └───────────────────────────────────┘
```

**Extractor AI prompt pattern:**

```
System: You are extracting structured knowledge from a CRM signal.
        Signal type: {signal.type}
        Entity: {entity_type} — {entity_name}

        Existing knowledge about this entity:
        {existing_semantic_memories_summarized}

        Extract any NEW knowledge from the following signal.
        For each piece of knowledge, classify it:
          - episodic: a specific event that happened (what, when)
          - semantic: a general fact that is now true about this entity
          - strategic: an actionable insight about what to do next

        Only extract knowledge that is meaningfully new.
        Do not re-extract facts already in existing knowledge above.

        Return JSON: KnowledgeCandidate[]

User: {signal.payload formatted as context}
```

**Deduplication hash:**
```
SHA-256(workspace_id + entity_type + entity_id + memory_class + normalize(content))
```
`normalize()` lowercases, strips punctuation, and collapses whitespace. Prevents near-identical extractions from different signals.

---

### 2.3 AI Memory Engine [REV-2]

Receives committed knowledge items from the Knowledge Engine and manages their lifecycle in `rie_ai_memory`.

**[REV-6] Memory lifecycle diagram:**

```
Knowledge Item (committed)
        │
        ▼
 ┌──────────────────────────────────────────────────┐
 │              MEMORY ENGINE                       │
 │                                                  │
 │  EPISODIC  ──────────────── → INSERT, permanent │
 │                                                  │
 │  SEMANTIC  ── check exists? ─── YES → UPDATE    │
 │              (by entity+type)      last_seen_at  │
 │                       │                          │
 │                       NO → INSERT new entry      │
 │                       │    if contradicts old:   │
 │                       └──→ mark old superseded   │
 │                                                  │
 │  STRATEGIC ── check expires_at                   │
 │               set 3–30 day window by type        │
 │               INSERT with expiry                 │
 │               SCHEDULE validation job            │
 └──────────────────────────────────────────────────┘
        │
        ▼
 rie_ai_memory (active entries only surfaced to AI)
```

**Strategic memory validation scheduler:**

Every 6 hours, the scheduler checks `rie_ai_memory` for rows where:
- `memory_class = 'strategic'`
- `is_active = 1`
- `validation_required_at <= NOW`

For each, the engine re-assembles current context and asks the AI: *"Is this strategic memory still valid?"* Possible outcomes:
- **Still valid** → extend `expires_at`, update `last_validated_at`, boost `confidence_score`
- **Needs update** → supersede with new strategic memory
- **No longer valid** → mark `is_active = 0`, no replacement needed
- **Uncertain** → lower `confidence_score` by 10, schedule re-validation in 24 hours

---

### 2.4 Context Assembler [REV-2 Extended]

The Context Assembler now understands the three memory classes and assembles context with class-aware priority.

**Context assembly order (by token budget priority):**

```
Budget: 2000 tokens (configurable)

Priority 1 (always included):
  — Recent messages: last 15 messages from relevant conversation(s)
  — Strategic memories: all active, not expired (highest relevance)

Priority 2 (fill remaining budget):
  — Semantic memories: high confidence first (confidence ≥ 80)
  — Rhythm summary: current gap_score + last contact

Priority 3 (if budget allows):
  — Semantic memories: medium confidence (confidence 60–79)
  — Win/loss pattern labels (if deal-related)
  — Episodic milestones: most recent 3–5

Priority 4 (if budget allows):
  — Episodic statements: most recent
  — Older semantic memories
```

**Context block format injected into every AI prompt:**

```
=== RELATIONSHIP CONTEXT ===
Entity: Sarah Mitchell (Apex Digital) — active client

[STRATEGIC — expires in 4 days, confidence: 85%]
→ Lead with ROI argument. Sarah responds poorly to feature demos.
→ Best time to reach: Tuesday/Thursday 9–11am (confirmed 4× interactions)

[SEMANTIC — confidence: 92%]
→ Economic buyer. Board approval required for contracts >$20K.
→ Prefers Telegram; replies 3× faster than email.
→ Budget freeze risk in Q3 (mentioned twice, last: 2026-06-15).

[EPISODIC — recent events]
→ 2026-07-10: Asked about implementation timeline again (3rd time)
→ 2026-07-08: Response time dropped from 4h to 2 days
→ 2026-06-28: Called to confirm board review is underway

[RHYTHM]
→ Current gap: 6 days (threshold: 4 days — OVERDUE)
→ Gap score: 74/100 (significant deviation)
```

---

### 2.5 Relationship Narrative Engine [REV-4]

Generalized from Deal Narrative. The engine now handles three entity types with distinct context inputs and distinct narrative aims.

**Narrative generation dispatch:**

```typescript
function generateNarrative(params: {
  entityType: "client" | "deal" | "conversation";
  entityId:   string;
  workspaceId: string;
}): Promise<RelationshipNarrative>
```

Internally routes to three specialized context builders, then to a shared AI generation call.

**[REV-6] Narrative context by entity type:**

```
CLIENT narrative context:
  — Client profile fields
  — All open and recently closed deals (stage, value, age)
  — All linked conversations (last 10 messages each)
  — All open tasks
  — Rhythm: gap_score, baseline, deviation
  — All active memories (all classes, budget-managed)
  — Workspace win/loss pattern labels

  Narrative aim: holistic relationship health reading
  Update trigger: new message · deal event · task event · rhythm deviation

DEAL narrative context:
  — Deal fields: stage, value, probability, expected_close, days_since_update
  — Stage history: transitions with timestamps
  — Linked conversation: last 20 messages
  — Client memories: semantic + strategic only
  — Deal memories: all classes
  — Rhythm: current gap_score for the client
  — Win/loss patterns: workspace patterns for this stage and value range

  Narrative aim: deal trajectory and next action
  Update trigger: stage change · deal update · new message from client · rhythm deviation

CONVERSATION narrative context:
  — Full message thread
  — Client profile
  — Linked deal (if any): stage, value
  — Client semantic memories (preferences, constraints)
  — Client rhythm

  Narrative aim: thread intent, tone, best reply approach
  Update trigger: every new inbound message
```

**Signal version hash** (determines when re-generation is needed):
```
SHA-256(
  entity_id +
  latest_message_id_in_context +
  latest_memory_updated_at +
  deal_stage (for deal entities) +
  rhythm_gap_score_bucket  // bucketized: 0-25, 26-50, 51-75, 76-100
)
```

This avoids redundant AI calls — a narrative is only regenerated when something materially changed.

---

### 2.6 Configurable Momentum Scoring Pipeline [REV-3]

**[REV-6] Pipeline flow:**

```
rie_momentum_config (workspace config)
        │
        ▼
┌───────────────────────────────────────────────────────┐
│              MOMENTUM ENGINE                          │
│                                                       │
│  1. LOAD CONFIG                                       │
│     factors = enabled factors from rie_momentum_config│
│     aggregation = config.aggregation                  │
│                                                       │
│  2. CALCULATE FACTORS (parallel)                      │
│     For each enabled factor:                          │
│       score = calculator(workspaceId, lookback_days)  │
│       evidence = collect EvidenceItems from DB        │
│       clamp to factor.bounds                          │
│                                                       │
│  3. APPLY PENALTY RULES                               │
│     For each penalty rule in config.penalty_rules:    │
│       if condition is met: multiply composite by rule │
│                                                       │
│  4. AGGREGATE                                         │
│     if weighted_average:  Σ(score_i × weight_i)       │
│     if geometric_mean:    ∏(score_i ^ weight_i)       │
│     if min_penalized:     weighted_avg × (min/100)    │
│     apply score_floor                                 │
│                                                       │
│  5. GENERATE NARRATIVE                                │
│     AI call: explain score in Ventra's voice          │
│     Identify top_driver and top_drag                  │
│     Assign confidence_score to the explanation        │
│                                                       │
│  6. PERSIST                                           │
│     INSERT into rie_momentum_scores                   │
│     Generate proactive trigger if trend is "down"     │
│       for 2+ consecutive days                         │
└───────────────────────────────────────────────────────┘
```

**Registered calculators in `momentum-engine.ts`:**

```typescript
type FactorCalculator = (
  db: DatabaseSync,
  workspaceId: string,
  lookbackDays: number,
  bounds: [number, number]
) => { score: number; evidence: EvidenceItem[]; driver: string };

const CALCULATORS: Record<string, FactorCalculator> = {
  dealHealthCalculator,
  commHealthCalculator,
  taskCompletionCalculator,
  clientEngagementCalculator,
  // Future calculators registered here by name
};
```

**Why callable by name:** The calculator name is stored as a string in `rie_momentum_config.factors_json`. When a new factor is needed (e.g., `npsCalculator`), the function is registered in the engine file and the config row is updated — no schema changes, no migration, no deploy required beyond the code change.

---

### 2.7 Confidence & Evidence System [REV-5]

**[REV-6] Evidence flows through the system:**

```
Raw Signal
  │
  ▼  Knowledge Engine extracts candidates
  │  Each candidate includes: evidence_json = [{ type, id, excerpt, weight, timestamp }]
  │
  ▼  Memory Engine stores to rie_ai_memory
  │  Inherits evidence_json from knowledge item
  │  confidence_score = weighted average of evidence weights × 100
  │
  ▼  Context Assembler injects memory into AI prompt
  │  Includes confidence in context block: "confidence: 85%"
  │
  ▼  Narrative / Brief / Trigger generated
     Each output includes:
       confidence_score = min(referenced memory confidences)
       evidence_json = union of all EvidenceItems from referenced memories
       evidence_strength = derived from sample size + confidence:
         anecdotal:      1 evidence item, confidence < 70
         pattern:        2–4 evidence items
         strong_pattern: 5+ evidence items, confidence ≥ 80
         definitive:     8+ evidence items, confidence ≥ 90
```

**Confidence utilities (`confidence.ts`):**

```typescript
// Compute composite confidence from multiple evidence items
function computeConfidence(evidence: EvidenceItem[]): number

// Derive evidence strength label from evidence array
function deriveStrength(evidence: EvidenceItem[]): EvidenceStrength

// Merge two evidence arrays, deduplicating by id
function mergeEvidence(a: EvidenceItem[], b: EvidenceItem[]): EvidenceItem[]

// Budget-trim evidence to fit in output (highest weight first)
function trimEvidence(evidence: EvidenceItem[], maxItems: number): EvidenceItem[]

// Generate the dedup hash for knowledge items
function knowledgeHash(
  workspaceId: string,
  entityType: string,
  entityId: string,
  memoryClass: string,
  content: string
): string
```

**UI contract for evidence display:**

Every AI-generated surface in the frontend can show a "Why did Ventra say this?" panel. The pattern:

```tsx
// On any AI insight card:
<InsightCard
  text={trigger.body}
  confidence={trigger.confidence_score}
  evidenceStrength={trigger.evidence_strength}
  evidence={JSON.parse(trigger.evidence_json)}
  onShowEvidence={() => setEvidenceOpen(true)}
/>

// Evidence panel shows:
// "This insight is based on 4 signals:"
// — "Sarah's message on July 10: 'the board needs to sign off'" [message]
// — "Response time pattern: 4× longer than baseline" [pattern]
// — "Memory: Budget freeze mentioned twice" [memory]
// — "Win/loss pattern: price objection in Negotiation → 72% loss rate" [pattern]
```

This is the concrete mechanism by which Ventra becomes trustworthy rather than opaque.

---

## 3. AI Pipeline

### 3.1 AI Service Functions (additions to `service.ts`)

In addition to the v1 additions, the revised architecture adds:

```typescript
// Knowledge extraction (called by Knowledge Engine)
extractKnowledge(params: {
  signalType:  string;
  entityType:  string;
  entityName:  string;
  payload:     string;             // Formatted signal content
  existingMemories: string;        // Formatted existing semantic memory summary
}): Promise<KnowledgeExtractionResult>

// Strategic memory validation
validateStrategicMemory(params: {
  memory:       MemoryEntry;
  currentContext: string;          // Current assembled context for the entity
}): Promise<ValidationResult>     // { valid: boolean; updatedContent?: string; confidence: number }

// Relationship narrative (unified, dispatches internally by entity_type)
generateRelationshipNarrative(params: {
  entityType:   "client" | "deal" | "conversation";
  context:      AssembledContext;
}): Promise<RelationshipNarrativeResult>

// Momentum explanation (called after factor calculation)
generateMomentumExplanation(params: {
  score:        number;
  delta:        number;
  factorScores: Record<string, number>;
  topDriver:    string;
  topDrag:      string | null;
}): Promise<MomentumExplanationResult>

// Win/loss autopsy (unchanged signature from v1)
generateDealAutopsy(params): Promise<DealAutopsyResult>

// Morning brief (unchanged signature from v1)
generateMorningBrief(params): Promise<MorningBriefResult>

// Call brief (extended with narrative reference)
generateCallBrief(params: {
  context:         AssembledContext;
  clientNarrative: RelationshipNarrative | null;
}): Promise<CallBriefResult>
```

---

### 3.2 AI Call Budget

Different subsystems have different quality vs. cost tradeoffs:

| Subsystem | Model tier | Max tokens | Temperature | Call frequency |
|---|---|---|---|---|
| Knowledge extraction | fast (mini) | 400 | 0.2 | Per signal |
| Memory validation | fast (mini) | 200 | 0.1 | Per strategic memory, weekly |
| Client narrative | standard | 600 | 0.4 | Per material change |
| Deal narrative | standard | 600 | 0.4 | Per signal (deal-related) |
| Conversation narrative | fast (mini) | 400 | 0.3 | Per inbound message |
| Momentum explanation | fast (mini) | 200 | 0.5 | Daily |
| Win/loss autopsy | standard | 800 | 0.3 | Per deal close |
| Call brief | standard | 800 | 0.4 | Per calendar event |
| Morning brief | standard | 600 | 0.5 | Daily |
| Trigger content | fast (mini) | 150 | 0.6 | Per trigger |

"fast (mini)" = `gpt-4o-mini` or equivalent. "standard" = `gpt-4o` or equivalent. Controlled via `AI_MODEL` and `AI_FAST_MODEL` env vars.

---

## 4. Event System

### 4.1 Signal Taxonomy (unchanged from v1)

All 14 signal types from v1 are retained. The Knowledge Engine subscribes to all of them.

**Updated dispatch table** [REV-1]:

| Signal | Rhythm | **Knowledge** | Memory | Narrative | Momentum | WinLoss | Proactive | PreCall |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `message.received` | ✓ | **✓** | via KE | ✓ | ✓ | | ✓ | |
| `message.sent` | ✓ | **✓** | via KE | | ✓ | | | |
| `deal.stage_changed` | | **✓** | via KE | ✓ | ✓ | | ✓ | |
| `deal.won` | | **✓** | via KE | | ✓ | ✓ | | |
| `deal.lost` | | **✓** | via KE | | ✓ | ✓ | | |
| `deal.updated` | | **✓** | via KE | ✓ | ✓ | | | |
| `task.completed` | | | | | ✓ | | | |
| `task.overdue` | | | | | ✓ | | ✓ | |
| `calendar.event_upcoming` | | | | | | | | ✓ |
| `client.updated` | | **✓** | via KE | ✓ | | | | |

**Key change:** Memory Engine no longer subscribes directly to signals. All memory writes flow through the Knowledge Engine (column "**Knowledge**" → "via KE"). This enforces the single-entry-point principle for memory creation.

---

### 4.2 Scheduler (extended for REV-2)

| Job | Frequency | What it does |
|---|---|---|
| `validate_strategic_memories` | Every 6 hours | Re-validates expiring strategic memories |
| `evaluate_proactive_triggers` | Every 60 min | Re-evaluates pending triggers, expires stale |
| `compute_rhythm_deviations` | Every 6 hours | Recomputes gap_scores, generates deviation triggers |
| `compute_momentum_score` | Every 6 hours + midnight snapshot | Runs configurable pipeline |
| `generate_morning_brief` | Daily at 07:00 (user timezone) | Brief generation + notification |
| `cleanup_signal_events` | Daily | Archives processed signals >30 days old |
| `cleanup_knowledge_items` | Daily | Archives committed/rejected items >7 days old |

---

## 5. Frontend Architecture

### 5.1 New Context: `RIEContext` (extended)

```typescript
interface RIEContextValue {
  // Momentum
  momentum:        MomentumScore | null;
  momentumConfig:  MomentumConfig | null;   // [REV-3] config for settings UI
  momentumLoading: boolean;
  refreshMomentum: () => void;

  // Morning brief
  morningBrief:    MorningBrief | null;
  briefLoading:    boolean;

  // Proactive triggers
  triggers:        ProactiveTrigger[];
  triggersLoading: boolean;
  dismissTrigger:  (id: string) => void;
  snoozeTrigger:   (id: string, minutes: number) => void;
  refreshTriggers: () => void;

  // Per-entity data (fetched on demand, cached in context)
  getClientRhythm:      (clientId: string) => ClientRhythm | null;
  getClientMemory:      (clientId: string) => MemoryEntry[];      // [REV-2] returns all classes
  getClientNarrative:   (clientId: string) => RelationshipNarrative | null;  // [REV-4]
  getDealNarrative:     (dealId: string)   => RelationshipNarrative | null;  // [REV-4]
  getConversationNarrative: (convId: string) => RelationshipNarrative | null; // [REV-4]
  getCallBrief:         (clientId: string) => CallBrief | null;
}
```

---

### 5.2 New Components (extended for REV-4 and REV-5)

```
src/components/rie/
├── ambient-bar.tsx                — Context-sensitive suggestion strip (unchanged)
├── record-sidebar.tsx             — AI sidebar: now uses RelationshipNarrative for both client + deal
├── relationship-narrative-card.tsx — [REV-4] Replaces deal-narrative-card; handles all entity types
├── momentum-widget.tsx            — [REV-3] Shows configurable factor breakdown
├── momentum-config-panel.tsx      — [NEW REV-3] Settings panel to adjust factor weights
├── morning-brief.tsx              — Dashboard morning brief (unchanged)
├── call-brief-drawer.tsx          — Pre-call brief with linked client narrative [REV-4]
├── proactive-trigger-card.tsx     — Single trigger with evidence panel [REV-5]
├── evidence-panel.tsx             — [NEW REV-5] "Why did Ventra say this?" panel
├── memory-panel.tsx               — Memory viewer with class tabs [REV-2]
├── confidence-indicator.tsx       — [NEW REV-5] Visual confidence badge with strength label
└── rhythm-indicator.tsx           — Relationship health dot (unchanged)
```

---

### 5.3 Evidence Panel [REV-5]

The most important new UI component. It appears on any AI-generated insight when the user clicks "Why?" or hovers on the confidence indicator.

```
┌─────────────────────────────────────────────────────────┐
│  Why did Ventra say this?                            ×  │
│                                                         │
│  "Sarah hasn't replied in 8 days — this is unusual."   │
│                                                         │
│  Confidence: 87%  ████████░░  Strong pattern           │
│                                                         │
│  Based on 4 signals:                                    │
│                                                         │
│  ① [message] Jul 10 — Sarah's last message              │
│    "we'll get back to you after the board meeting"      │
│    8 days ago · weight: high                            │
│                                                         │
│  ② [pattern] Response time 8× her normal average        │
│    Baseline: 1 day · Current gap: 8 days                │
│    weight: high                                         │
│                                                         │
│  ③ [memory] She's mentioned the board twice             │
│    "Board approval required for >$20K" (confidence 92%) │
│    weight: medium                                       │
│                                                         │
│  ④ [pattern] 3 of 4 deals lost when gap exceeded 7 days │
│    in Proposal stage (workspace pattern)                │
│    weight: medium                                       │
│                                                         │
│                              [View full memory →]       │
└─────────────────────────────────────────────────────────┘
```

---

### 5.4 Memory Panel [REV-2]

The memory panel on `RecordSidebar` gains three tabs matching the three memory classes.

```
┌──────────────────────────────────────────────────┐
│  AI Memory — Sarah Mitchell                      │
│                                                  │
│  [Episodic]  [Semantic]  [Strategic]             │
│  ──────────────────────────────────────────      │
│  STRATEGIC — 3 active, 1 expired                 │
│                                                  │
│  ● Lead with ROI argument                        │
│    confidence 85% · expires in 4 days            │
│    [Why?]                                        │
│                                                  │
│  ● Best contact: Tue/Thu 9–11am                  │
│    confidence 91% · expires in 9 days            │
│    [Why?]                                        │
│                                                  │
│  ● Next move: send implementation plan           │
│    confidence 78% · expires in 2 days            │
│    [Why?]                                        │
│                                                  │
│  ── SEMANTIC ─────────────────────────────       │
│  ✓ Board approval required for >$20K   92%       │
│  ✓ Prefers Telegram                   89%        │
│  ✓ Budget freeze risk in Q3           74%        │
│  ✓ Economic buyer (not technical)     95%        │
│                                                  │
│  [Episodic tab: timeline view]                   │
└──────────────────────────────────────────────────┘
```

---

## 6. API Route Map

```
# Knowledge
GET  /api/rie/knowledge?entity=client&id=XXX   — Pending + committed knowledge items

# Memory (extended)
GET  /api/rie/memory?entity=client&id=XXX&class=semantic   — Filtered by memory class
GET  /api/rie/memory?entity=client&id=XXX                  — All active memories
POST /api/rie/memory/[id]/validate                         — Manually trigger re-validation

# Narratives (renamed + generalized)
GET  /api/rie/narrative?entity=client&id=XXX      — Client relationship narrative
GET  /api/rie/narrative?entity=deal&id=XXX        — Deal narrative
GET  /api/rie/narrative?entity=conversation&id=XXX — Conversation narrative
POST /api/rie/narrative/refresh                   — Force regeneration for any entity

# Momentum (extended)
GET  /api/rie/momentum                 — Current score + 7-day trend
GET  /api/rie/momentum/config          — Current scoring pipeline config
PATCH /api/rie/momentum/config         — Update factor weights / aggregation method

# All other routes unchanged from v1
GET  /api/rie/morning-brief
GET  /api/rie/rhythm/[clientId]
GET  /api/rie/triggers
PATCH /api/rie/triggers/[id]
GET  /api/rie/brief/precall?clientId=XXX
GET  /api/rie/winloss
GET  /api/rie/winloss/[dealId]
POST /api/rie/signal
```

---

## 7. Future Scalability (additions to v1)

### 7.1 Knowledge Engine Pluggability [REV-1]

The Knowledge Engine's Extractor is the most AI-intensive step. Future extractors can be specialized per signal type:

```
Current:  one general extractor for all signals
Future:   signal-type-specific extractors (fine-tuned models)
          e.g., MessageExtractor / DealEventExtractor / CalendarExtractor
```

The extractor is called by name in the Knowledge Engine config (future: `KE_EXTRACTOR_TYPE` env var). No change to signal emission or memory storage.

### 7.2 Memory Embedding Index [REV-2]

The `content_vector` column on `rie_knowledge_items` is reserved for future vector embeddings. When added:
- `content_vector = JSON float array (1536 dims)` — stored in SQLite as TEXT
- Vector similarity search replaces the current dedup hash approach for semantic deduplication
- Enables "find all memories similar to this new signal" queries
- Migration: backfill embeddings for all existing `is_active=1` memories via a batch job

### 7.3 Momentum Factor Marketplace [REV-3]

The configurable pipeline enables a future factor marketplace: workspace owners can enable community-contributed or Ventra-published factors:

```
Built-in factors (v1):  deal_health · comm_health · task_completion · client_engagement
Future factors:         nps_trend · expansion_revenue · response_sla · lead_conversion_rate
Custom factors:         workspace admins can define formula-based factors via Settings
```

### 7.4 Cross-Workspace Narrative Calibration [REV-4]

Client and deal narratives currently use only workspace-internal context. Future: anonymized narrative quality scoring allows Ventra to calibrate narrative generation against actual outcomes:

- "Did the founder follow the recommended action?"
- "Did following the recommendation correlate with a positive outcome?"

This requires an opt-in feedback signal and a cross-workspace (anonymized) pattern database. No schema changes to the core RIE tables — it adds a feedback loop.

### 7.5 Confidence Calibration Over Time [REV-5]

Confidence scores are currently model-assigned at extraction time. Future: calibrate them against actual outcomes.

- If a strategic memory with confidence 90 consistently leads to correct predictions → boost the extraction model's confidence assignments
- If a strategic memory with confidence 90 is frequently wrong → introduce a calibration factor that lowers effective confidence for that memory type

Implementation: `rie_confidence_calibration` table (future), referenced by the confidence utilities module.

---

## 8. Implementation Sequence

The 5-phase, 5-week plan from v1 is updated to incorporate the revisions.

**Phase 1 — Foundation (Week 1)**
1. Migration v16: all 10 RIE tables + indexes
2. `db-rie.ts`: all database helpers (including Knowledge Items, Momentum Config)
3. `confidence.ts`: utilities module [REV-5]
4. `signal-bus.ts`: signal types, store-and-dispatch
5. Emit signals from existing API routes
6. `rhythm-engine.ts`: baseline computation (unchanged algorithm)
7. Insert default `rie_momentum_config` row on workspace creation

**Phase 2 — Knowledge Engine + Memory [REV-1][REV-2] (Week 2)**
8. `knowledge-engine.ts`: relevance filter → extract → classify → deduplicate → commit
9. `memory-engine.ts`: episodic/semantic/strategic write paths + validation scheduler
10. `context-assembler.ts`: class-aware priority assembly
11. New AI service functions: `extractKnowledge`, `validateStrategicMemory`

**Phase 3 — Narratives + Momentum [REV-3][REV-4] (Week 3)**
12. `narrative-engine.ts`: generalized for client/deal/conversation entity types
13. AI service: `generateRelationshipNarrative` (dispatches by entity type)
14. `momentum-engine.ts`: configurable pipeline with registered calculators
15. `winloss-engine.ts`: autopsy on deal close + pattern matching (extended with evidence)

**Phase 4 — Proactive + Pre-Call (Week 4)**
16. `proactive-engine.ts`: trigger queue + evidence-backed evaluation
17. `precall-engine.ts`: call brief assembly with linked client narrative
18. Morning brief generation
19. All RIE API routes

**Phase 5 — Frontend (Week 5)**
20. `RIEContext` with extended interface
21. `AmbientBar`, `MorningBrief`, `MomentumWidget`, `MomentumConfigPanel`
22. `RelationshipNarrativeCard` (replaces DealNarrativeCard, works for client + deal)
23. `RecordSidebar` with class-tabbed memory panel
24. `EvidencePanel` + `ConfidenceIndicator` components
25. `CallBriefDrawer` with linked narrative
26. Command Palette RIE commands
27. Full QA: TypeScript + ESLint + end-to-end

---

## 9. Approval Checklist

All 9 items from v1 carry forward. Six additional items from the revisions:

**From v1 (unchanged):**
- [ ] Data model approved — base table schemas and relationships
- [ ] Signal taxonomy approved — 14 signal types
- [ ] Rhythm algorithm approved — personalized threshold, 0–100 score
- [ ] AI memory lifecycle approved — immutable entries, supersede pattern
- [ ] Processing model approved — sync rhythm, async AI calls
- [ ] Scheduler approach approved — in-process intervals
- [ ] Frontend component list approved
- [ ] Implementation sequence approved

**New from v2 revisions:**
- [ ] **[REV-1]** Knowledge Engine staging table and 6-step pipeline approved
- [ ] **[REV-2]** Three-class memory taxonomy (episodic/semantic/strategic) and lifecycle rules approved
- [ ] **[REV-2]** Strategic memory expiry windows approved (3–30 days by type)
- [ ] **[REV-3]** Default Momentum Config (4 factors, weights, `weighted_average` aggregation) approved
- [ ] **[REV-4]** Relationship Narrative entity types (client/deal/conversation) and context inputs approved
- [ ] **[REV-5]** Evidence item structure and evidence strength labels approved

---

*Architecture document v2 complete.*
*Awaiting final approval before Phase 1 implementation begins.*
