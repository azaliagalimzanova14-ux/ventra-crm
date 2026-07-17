/**
 * src/lib/server/db-deals.ts
 *
 * CRUD helpers for `deals` and `deal_stages`.
 *
 * ── Invariants ────────────────────────────────────────────────────────────────
 *  - Every query filters by workspace_id for multi-tenant isolation.
 *  - All IDs are UUIDs (randomUUID).
 *  - Timestamps are ISO 8601 strings.
 *  - SQLite results cast via `as unknown as T` (node:sqlite limitation).
 *  - ensureDefaultStages() is idempotent — safe to call on every request.
 */

import { getDb }      from "../db";
import { randomUUID } from "node:crypto";
import type {
  DbDeal,
  DbDealStage,
  DbDealFull,
  DealStatus,
} from "./models";

function now(): string {
  return new Date().toISOString();
}

// ── Default stage definitions ─────────────────────────────────────────────────

const DEFAULT_STAGES = [
  { name: "Lead",        order: 0, color: "#9ca3af", isDefault: 1, isWon: 0, isLost: 0 },
  { name: "Qualified",   order: 1, color: "#3b82f6", isDefault: 0, isWon: 0, isLost: 0 },
  { name: "Proposal",    order: 2, color: "#8b5cf6", isDefault: 0, isWon: 0, isLost: 0 },
  { name: "Negotiation", order: 3, color: "#f59e0b", isDefault: 0, isWon: 0, isLost: 0 },
  { name: "Won",         order: 4, color: "#10b981", isDefault: 0, isWon: 1, isLost: 0 },
  { name: "Lost",        order: 5, color: "#ef4444", isDefault: 0, isWon: 0, isLost: 1 },
  { name: "On Hold",     order: 6, color: "#eab308", isDefault: 0, isWon: 0, isLost: 0 },
];

/**
 * Seeds the 7 default deal stages for a workspace if none exist.
 * Idempotent: uses INSERT OR IGNORE so re-runs are safe.
 */
export function ensureDefaultStages(workspaceId: string): void {
  const db  = getDb();
  const ts  = now();
  const existing = (db.prepare(
    "SELECT COUNT(*) AS n FROM deal_stages WHERE workspace_id = ?",
  ).get(workspaceId) as { n: number }).n;

  if (existing > 0) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO deal_stages
      (id, workspace_id, name, order_index, color, is_default, is_won, is_lost, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of DEFAULT_STAGES) {
    insert.run(randomUUID(), workspaceId, s.name, s.order, s.color, s.isDefault, s.isWon, s.isLost, ts);
  }
}

// ── Deal Stages CRUD ──────────────────────────────────────────────────────────

export function listDealStages(workspaceId: string): DbDealStage[] {
  ensureDefaultStages(workspaceId);
  return getDb()
    .prepare("SELECT * FROM deal_stages WHERE workspace_id = ? ORDER BY order_index ASC")
    .all(workspaceId) as unknown as DbDealStage[];
}

export function getDealStage(id: string, workspaceId: string): DbDealStage | null {
  return getDb()
    .prepare("SELECT * FROM deal_stages WHERE id = ? AND workspace_id = ?")
    .get(id, workspaceId) as unknown as DbDealStage | null;
}

/** Returns the default stage for a workspace (used when creating a deal without a stage). */
export function getDefaultStage(workspaceId: string): DbDealStage | null {
  ensureDefaultStages(workspaceId);
  return getDb()
    .prepare(
      "SELECT * FROM deal_stages WHERE workspace_id = ? AND is_default = 1 ORDER BY order_index ASC LIMIT 1",
    )
    .get(workspaceId) as unknown as DbDealStage | null;
}

// ── Param types ───────────────────────────────────────────────────────────────

export interface CreateDealParams {
  workspace_id:     string;
  title:            string;
  client_id?:       string;
  stage_id?:        string;  // defaults to workspace's default stage
  value?:           number;
  currency?:        string;
  probability?:     number;
  expected_close?:  string;
  assigned_user_id?: string;
  conversation_id?: string;
  description?:     string;
  created_by:       string;
}

export interface UpdateDealParams {
  title?:            string;
  client_id?:        string | null;
  value?:            number;
  currency?:         string;
  probability?:      number;
  expected_close?:   string | null;
  assigned_user_id?: string | null;
  conversation_id?:  string | null;
  description?:      string | null;
}

export interface ListDealsParams {
  workspace_id:     string;
  status?:          DealStatus;
  stage_id?:        string;
  client_id?:       string;
  assigned_user_id?: string;
  conversation_id?: string;
  search?:          string;
  limit?:           number;  // default 50, max 200
  offset?:          number;
}

export interface ListDealsResult {
  deals: DbDealFull[];
  total: number;
}

// ── Deal CRUD ─────────────────────────────────────────────────────────────────

export function createDeal(params: CreateDealParams): DbDealFull {
  const db = getDb();

  // Resolve stage
  let stageId = params.stage_id;
  if (!stageId) {
    const def = getDefaultStage(params.workspace_id);
    if (!def) throw new Error("No deal stages found. Workspace may not be initialized.");
    stageId = def.id;
  }

  // Determine status from stage
  const stage = db.prepare(
    "SELECT is_won, is_lost FROM deal_stages WHERE id = ?",
  ).get(stageId) as { is_won: number; is_lost: number } | null;
  const status: DealStatus = stage?.is_won ? "won" : stage?.is_lost ? "lost" : "open";

  const id = randomUUID();
  const ts = now();

  db.prepare(`
    INSERT INTO deals
      (id, workspace_id, title, client_id, stage_id, value, currency, probability,
       expected_close, assigned_user_id, conversation_id, description,
       created_by, status, created_at, updated_at, closed_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(
    id,
    params.workspace_id,
    params.title,
    params.client_id       ?? null,
    stageId,
    params.value           ?? 0,
    params.currency        ?? "USD",
    params.probability     ?? 0,
    params.expected_close  ?? null,
    params.assigned_user_id ?? null,
    params.conversation_id ?? null,
    params.description     ?? null,
    params.created_by,
    status,
    ts,
    ts,
  );

  return getDealFullOrThrow(id, params.workspace_id);
}

export function getDeal(id: string, workspaceId: string): DbDeal | null {
  return getDb()
    .prepare("SELECT * FROM deals WHERE id = ? AND workspace_id = ?")
    .get(id, workspaceId) as unknown as DbDeal | null;
}

export function getDealFull(id: string, workspaceId: string): DbDealFull | null {
  const row = getDb().prepare(`
    SELECT
      d.*,
      ds.id           AS "stage.id",
      ds.workspace_id AS "stage.workspace_id",
      ds.name         AS "stage.name",
      ds.order_index  AS "stage.order_index",
      ds.color        AS "stage.color",
      ds.is_default   AS "stage.is_default",
      ds.is_won       AS "stage.is_won",
      ds.is_lost      AS "stage.is_lost",
      ds.created_at   AS "stage.created_at",
      c.name          AS client_name
    FROM deals d
    LEFT JOIN deal_stages ds ON ds.id = d.stage_id
    LEFT JOIN clients c      ON c.id  = d.client_id
    WHERE d.id = ? AND d.workspace_id = ?
  `).get(id, workspaceId) as Record<string, unknown> | null;

  if (!row) return null;
  return flatToFull(row);
}

function getDealFullOrThrow(id: string, workspaceId: string): DbDealFull {
  const row = getDealFull(id, workspaceId);
  if (!row) throw new Error(`Deal not found: ${id}`);
  return row;
}

/** Converts the flat JOIN row from SQL into a nested DbDealFull. */
function flatToFull(row: Record<string, unknown>): DbDealFull {
  const stage: DbDealStage = {
    id:           row["stage.id"]           as string,
    workspace_id: row["stage.workspace_id"] as string,
    name:         row["stage.name"]         as string,
    order_index:  row["stage.order_index"]  as number,
    color:        row["stage.color"]        as string,
    is_default:   row["stage.is_default"]   as number,
    is_won:       row["stage.is_won"]       as number,
    is_lost:      row["stage.is_lost"]      as number,
    created_at:   row["stage.created_at"]   as string,
  };

  return {
    id:               row.id               as string,
    workspace_id:     row.workspace_id     as string,
    title:            row.title            as string,
    client_id:        row.client_id        as string | null,
    stage_id:         row.stage_id         as string,
    value:            row.value            as number,
    currency:         row.currency         as string,
    probability:      row.probability      as number,
    expected_close:   row.expected_close   as string | null,
    assigned_user_id: row.assigned_user_id as string | null,
    conversation_id:  row.conversation_id  as string | null,
    description:      row.description      as string | null,
    created_by:       row.created_by       as string,
    status:           row.status           as DealStatus,
    created_at:       row.created_at       as string,
    updated_at:       row.updated_at       as string,
    closed_at:        row.closed_at        as string | null,
    stage,
    client_name:      row.client_name      as string | null,
  };
}

export function updateDeal(
  id:          string,
  workspaceId: string,
  params:      UpdateDealParams,
): DbDealFull {
  const db   = getDb();
  const sets: string[]           = ["updated_at = ?"];
  const vals: (string | number | null)[] = [now()];

  if (params.title            !== undefined) { sets.push("title = ?");            vals.push(params.title); }
  if (params.client_id        !== undefined) { sets.push("client_id = ?");        vals.push(params.client_id ?? null); }
  if (params.value            !== undefined) { sets.push("value = ?");            vals.push(params.value); }
  if (params.currency         !== undefined) { sets.push("currency = ?");         vals.push(params.currency); }
  if (params.probability      !== undefined) { sets.push("probability = ?");      vals.push(params.probability); }
  if (params.expected_close   !== undefined) { sets.push("expected_close = ?");   vals.push(params.expected_close ?? null); }
  if (params.assigned_user_id !== undefined) { sets.push("assigned_user_id = ?"); vals.push(params.assigned_user_id ?? null); }
  if (params.conversation_id  !== undefined) { sets.push("conversation_id = ?");  vals.push(params.conversation_id ?? null); }
  if (params.description      !== undefined) { sets.push("description = ?");      vals.push(params.description ?? null); }

  db.prepare(
    `UPDATE deals SET ${sets.join(", ")} WHERE id = ? AND workspace_id = ?`,
  ).run(...vals, id, workspaceId);

  return getDealFullOrThrow(id, workspaceId);
}

export function moveDealStage(
  id:          string,
  workspaceId: string,
  stageId:     string,
): DbDealFull {
  const db    = getDb();
  const stage = getDealStage(stageId, workspaceId);
  if (!stage) throw new Error(`Stage not found: ${stageId}`);

  const status: DealStatus = stage.is_won ? "won" : stage.is_lost ? "lost" : "open";
  const closedAt = status !== "open" ? now() : null;

  db.prepare(`
    UPDATE deals
    SET stage_id = ?, status = ?, closed_at = ?, updated_at = ?
    WHERE id = ? AND workspace_id = ?
  `).run(stageId, status, closedAt, now(), id, workspaceId);

  return getDealFullOrThrow(id, workspaceId);
}

export function deleteDeal(id: string, workspaceId: string): void {
  getDb()
    .prepare("DELETE FROM deals WHERE id = ? AND workspace_id = ?")
    .run(id, workspaceId);
}

export function listDeals(params: ListDealsParams): ListDealsResult {
  const db     = getDb();
  const limit  = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  const clauses: string[]            = ["d.workspace_id = ?"];
  const vals:    (string | number)[] = [params.workspace_id];

  if (params.status) {
    clauses.push("d.status = ?");
    vals.push(params.status);
  }
  if (params.stage_id) {
    clauses.push("d.stage_id = ?");
    vals.push(params.stage_id);
  }
  if (params.client_id) {
    clauses.push("d.client_id = ?");
    vals.push(params.client_id);
  }
  if (params.assigned_user_id) {
    clauses.push("d.assigned_user_id = ?");
    vals.push(params.assigned_user_id);
  }
  if (params.conversation_id) {
    clauses.push("d.conversation_id = ?");
    vals.push(params.conversation_id);
  }
  if (params.search) {
    const q = `%${params.search}%`;
    clauses.push("(d.title LIKE ? OR d.description LIKE ?)");
    vals.push(q, q);
  }

  const where = clauses.join(" AND ");

  const total = (db.prepare(`
    SELECT COUNT(*) AS n FROM deals d WHERE ${where}
  `).get(...vals) as { n: number }).n;

  const BASE_SELECT = `
    SELECT
      d.*,
      ds.id           AS "stage.id",
      ds.workspace_id AS "stage.workspace_id",
      ds.name         AS "stage.name",
      ds.order_index  AS "stage.order_index",
      ds.color        AS "stage.color",
      ds.is_default   AS "stage.is_default",
      ds.is_won       AS "stage.is_won",
      ds.is_lost      AS "stage.is_lost",
      ds.created_at   AS "stage.created_at",
      c.name          AS client_name
    FROM deals d
    LEFT JOIN deal_stages ds ON ds.id = d.stage_id
    LEFT JOIN clients c      ON c.id  = d.client_id
    WHERE ${where}
    ORDER BY ds.order_index ASC, d.value DESC, d.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(BASE_SELECT)
    .all(...vals, limit, offset) as Array<Record<string, unknown>>;

  const deals = rows.map(flatToFull);
  return { deals, total };
}

// ── Dashboard summary ─────────────────────────────────────────────────────────

export interface DealPipelineSummary {
  open_count:     number;
  pipeline_value: number;  // total value of open deals
  won_count:      number;
  won_revenue:    number;  // total value of won deals
  forecast:       number;  // sum of (value * probability/100) for open deals
  currency:       string;  // most common currency in workspace
}

export function getDealPipelineSummary(workspaceId: string): DealPipelineSummary {
  const db = getDb();

  const open = db.prepare(`
    SELECT COUNT(*) AS n, COALESCE(SUM(value), 0) AS total,
           COALESCE(SUM(value * probability / 100.0), 0) AS forecast
    FROM deals
    WHERE workspace_id = ? AND status = 'open'
  `).get(workspaceId) as { n: number; total: number; forecast: number };

  const won = db.prepare(`
    SELECT COUNT(*) AS n, COALESCE(SUM(value), 0) AS total
    FROM deals
    WHERE workspace_id = ? AND status = 'won'
  `).get(workspaceId) as { n: number; total: number };

  // Most-used currency (fallback to USD)
  const currencyRow = db.prepare(`
    SELECT currency, COUNT(*) AS cnt FROM deals
    WHERE workspace_id = ?
    GROUP BY currency ORDER BY cnt DESC LIMIT 1
  `).get(workspaceId) as { currency: string } | null;

  return {
    open_count:     open.n,
    pipeline_value: open.total,
    won_count:      won.n,
    won_revenue:    won.total,
    forecast:       open.forecast,
    currency:       currencyRow?.currency ?? "USD",
  };
}
