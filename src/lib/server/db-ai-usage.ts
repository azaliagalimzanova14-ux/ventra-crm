/**
 * src/lib/server/db-ai-usage.ts
 *
 * DB helpers for the `ai_usage` table.
 * Call recordAiUsage() from every AI API route after a successful LLM response.
 *
 * Server-only — do NOT import in client components.
 */

import { getDb }      from "../db";
import { randomUUID } from "node:crypto";
import type { DbAiUsage } from "./models";

/**
 * Rough cost estimate table (USD per 1M tokens).
 * Update as provider pricing changes.
 */
const COST_PER_M: Record<string, { input: number; output: number }> = {
  "gpt-4o":        { input: 5.00,  output: 15.00 },
  "gpt-4o-mini":   { input: 0.15,  output: 0.60  },
  "gpt-4-turbo":   { input: 10.00, output: 30.00 },
  "gpt-3.5-turbo": { input: 0.50,  output: 1.50  },
  "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
  "claude-3-5-sonnet-20241022": { input: 3.00, output: 15.00 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_PER_M[model] ?? { input: 1.00, output: 3.00 };
  return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
}

export interface RecordAiUsageParams {
  workspaceId:  string;
  userId?:      string | null;
  feature:      string;   // e.g. "conversation_analysis", "reply_suggestions"
  provider:     string;
  model:        string;
  inputTokens:  number;
  outputTokens: number;
}

export function recordAiUsage(params: RecordAiUsageParams): DbAiUsage {
  const db      = getDb();
  const id      = randomUUID();
  const now     = new Date().toISOString();
  const costUsd = estimateCost(params.model, params.inputTokens, params.outputTokens);

  db.prepare(
    `INSERT INTO ai_usage
       (id, workspace_id, user_id, feature, provider, model, input_tokens, output_tokens, cost_usd, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.workspaceId,
    params.userId ?? null,
    params.feature,
    params.provider,
    params.model,
    params.inputTokens,
    params.outputTokens,
    costUsd,
    now,
  );

  return {
    id,
    workspace_id:  params.workspaceId,
    user_id:       params.userId ?? null,
    feature:       params.feature,
    provider:      params.provider,
    model:         params.model,
    input_tokens:  params.inputTokens,
    output_tokens: params.outputTokens,
    cost_usd:      costUsd,
    created_at:    now,
  };
}

export interface AiUsageSummary {
  total_requests:     number;
  total_input_tokens: number;
  total_output_tokens:number;
  total_cost_usd:     number;
  by_feature:         Array<{ feature: string; requests: number; cost_usd: number }>;
}

export function getAiUsageSummary(
  workspaceId: string,
  days = 30,
): AiUsageSummary {
  const db    = getDb();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const totals = db
    .prepare(
      `SELECT
         COUNT(*)            AS total_requests,
         SUM(input_tokens)   AS total_input_tokens,
         SUM(output_tokens)  AS total_output_tokens,
         SUM(cost_usd)       AS total_cost_usd
       FROM ai_usage
       WHERE workspace_id = ? AND created_at >= ?`,
    )
    .get(workspaceId, since) as {
      total_requests: number;
      total_input_tokens: number;
      total_output_tokens: number;
      total_cost_usd: number;
    };

  const byFeature = db
    .prepare(
      `SELECT feature, COUNT(*) AS requests, SUM(cost_usd) AS cost_usd
       FROM ai_usage
       WHERE workspace_id = ? AND created_at >= ?
       GROUP BY feature
       ORDER BY requests DESC`,
    )
    .all(workspaceId, since) as unknown as Array<{ feature: string; requests: number; cost_usd: number }>;

  return {
    total_requests:      totals.total_requests      ?? 0,
    total_input_tokens:  totals.total_input_tokens   ?? 0,
    total_output_tokens: totals.total_output_tokens  ?? 0,
    total_cost_usd:      totals.total_cost_usd       ?? 0,
    by_feature:          byFeature,
  };
}
