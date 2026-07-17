/**
 * src/lib/ai/service.ts
 *
 * Centralized AI service layer.
 *
 * All AI features flow through this module:
 *   - analyzeConversation    → intent, sentiment, action items, confidence
 *   - generateReplyOptions   → 3 reply styles (professional, friendly, short)
 *   - detectTasksFromText    → extract actionable tasks from message text
 *   - generateClientSummary  → relationship summary for a client
 *   - analyzeDeal            → deal health, risks, next actions
 *   - generateDashboardInsights → workspace-level sales coaching insights
 *
 * The service uses the provider interface — swap providers via env vars,
 * not by changing this file.
 *
 * When AI is not configured (no API key), every function returns a graceful
 * fallback so the UI degrades cleanly.
 *
 * Server-only — do NOT import in client components.
 */

import { OpenAIProvider }     from "./openai";
import { getProviderConfig }  from "./provider";
import type { AIProvider }    from "./provider";

// ── Singleton provider ────────────────────────────────────────────────────────

let _provider: AIProvider | null = null;

function getProvider(): AIProvider {
  if (!_provider) {
    _provider = new OpenAIProvider(getProviderConfig());
  }
  return _provider;
}

// ── Result types ──────────────────────────────────────────────────────────────

export interface ConversationAnalysis {
  intent:      string;           // e.g. "purchase_inquiry", "support_request"
  sentiment:   "positive" | "neutral" | "negative";
  confidence:  number;           // 0–100
  summary:     string;           // 1-sentence summary
  actionItems: string[];         // up to 3 suggested actions
  buyingSignal: boolean;         // true if purchase intent detected
  urgency:     "low" | "medium" | "high";
  provider:    string;
  model:       string;
}

export interface ReplyOption {
  style:   "professional" | "friendly" | "short";
  content: string;
  label:   string;
}

export interface ReplyOptions {
  options:  ReplyOption[];
  context:  string;    // detected intent/topic summary
  provider: string;
  model:    string;
}

export interface DetectedTask {
  title:       string;
  description: string;
  dueDate?:    string;   // YYYY-MM-DD if extractable
  priority:    "low" | "medium" | "high";
}

export interface TaskDetectionResult {
  tasks:    DetectedTask[];
  provider: string;
  model:    string;
}

export interface ClientSummary {
  summary:        string;   // 2-3 sentence overview
  relationship:   "new" | "active" | "at_risk" | "inactive";
  keyTopics:      string[];
  nextAction:     string;
  provider:       string;
  model:          string;
}

export interface DealAnalysis {
  healthScore:  number;     // 0–100
  status:       "on_track" | "at_risk" | "stalled" | "strong";
  risks:        string[];
  opportunities: string[];
  nextActions:  string[];
  summary:      string;
  provider:     string;
  model:        string;
}

export interface DashboardInsight {
  type:    "deal_alert" | "client_alert" | "opportunity" | "coaching";
  title:   string;
  body:    string;
  action?: string;   // suggested action text
  priority: "low" | "medium" | "high";
}

export interface DashboardInsights {
  insights:  DashboardInsight[];
  provider:  string;
  model:     string;
}

// ── JSON parse helper ─────────────────────────────────────────────────────────

function parseJSON<T>(raw: string, fallback: T): T {
  try {
    // Strip markdown code fences if the model wraps JSON
    const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

// ── analyzeConversation ───────────────────────────────────────────────────────

export async function analyzeConversation(params: {
  messages:    Array<{ role: "client" | "agent"; content: string }>;
  clientName:  string;
  channel:     string;
}): Promise<ConversationAnalysis> {
  const provider = getProvider();

  const FALLBACK: ConversationAnalysis = {
    intent:      "general",
    sentiment:   "neutral",
    confidence:  0,
    summary:     "AI analysis unavailable — configure OPENAI_API_KEY.",
    actionItems: [],
    buyingSignal: false,
    urgency:     "low",
    provider:    "none",
    model:       "none",
  };

  if (!provider.isAvailable()) return FALLBACK;

  const transcript = params.messages
    .slice(-20)
    .map((m) => `${m.role === "client" ? params.clientName : "Agent"}: ${m.content}`)
    .join("\n");

  const result = await provider.complete({
    jsonMode: true,
    temperature: 0.3,
    maxTokens: 512,
    messages: [
      {
        role: "system",
        content: `You are a CRM sales assistant. Analyze this ${params.channel} conversation and return JSON with:
{
  "intent": string (e.g. "purchase_inquiry", "support_request", "follow_up", "complaint", "general"),
  "sentiment": "positive"|"neutral"|"negative",
  "confidence": number (0-100),
  "summary": string (1 sentence),
  "actionItems": string[] (up to 3 suggested actions for the sales rep),
  "buyingSignal": boolean,
  "urgency": "low"|"medium"|"high"
}
Return ONLY valid JSON.`,
      },
      { role: "user", content: `Conversation:\n${transcript}` },
    ],
  });

  const parsed = parseJSON<Partial<ConversationAnalysis>>(result.content, {});

  return {
    intent:      parsed.intent      ?? "general",
    sentiment:   parsed.sentiment   ?? "neutral",
    confidence:  parsed.confidence  ?? 50,
    summary:     parsed.summary     ?? "",
    actionItems: parsed.actionItems ?? [],
    buyingSignal: parsed.buyingSignal ?? false,
    urgency:     parsed.urgency     ?? "low",
    provider:    result.provider,
    model:       result.model,
  };
}

// ── generateReplyOptions ─────────────────────────────────────────────────────

export async function generateReplyOptions(params: {
  messages:      Array<{ role: "client" | "agent"; content: string }>;
  clientName:    string;
  channel:       string;
  agentName?:    string;
}): Promise<ReplyOptions> {
  const provider = getProvider();

  const FALLBACK: ReplyOptions = {
    options:  [],
    context:  "AI not configured.",
    provider: "none",
    model:    "none",
  };

  if (!provider.isAvailable()) return FALLBACK;

  const transcript = params.messages
    .slice(-10)
    .map((m) => `${m.role === "client" ? params.clientName : (params.agentName ?? "You")}: ${m.content}`)
    .join("\n");

  const result = await provider.complete({
    jsonMode: true,
    temperature: 0.7,
    maxTokens: 800,
    messages: [
      {
        role: "system",
        content: `You are a CRM reply assistant. Generate 3 reply options for the agent responding to a ${params.channel} message from ${params.clientName}. Return JSON:
{
  "context": string (what the client wants in 1 sentence),
  "options": [
    { "style": "professional", "label": "Professional", "content": string },
    { "style": "friendly",     "label": "Friendly",     "content": string },
    { "style": "short",        "label": "Short",        "content": string }
  ]
}
Each reply should be complete and ready to send. Return ONLY valid JSON.`,
      },
      { role: "user", content: `Conversation:\n${transcript}` },
    ],
  });

  interface RawOptions {
    context?: string;
    options?: ReplyOption[];
  }
  const parsed = parseJSON<RawOptions>(result.content, {});

  return {
    options:  parsed.options  ?? [],
    context:  parsed.context  ?? "",
    provider: result.provider,
    model:    result.model,
  };
}

// ── detectTasksFromText ──────────────────────────────────────────────────────

export async function detectTasksFromText(params: {
  text:       string;
  clientName: string;
}): Promise<TaskDetectionResult> {
  const provider = getProvider();

  if (!provider.isAvailable()) {
    return { tasks: [], provider: "none", model: "none" };
  }

  const result = await provider.complete({
    jsonMode: true,
    temperature: 0.2,
    maxTokens: 400,
    messages: [
      {
        role: "system",
        content: `Extract actionable tasks from a conversation with ${params.clientName}. Return JSON:
{
  "tasks": [
    {
      "title": string,
      "description": string,
      "dueDate": string|null (YYYY-MM-DD, null if not mentioned),
      "priority": "low"|"medium"|"high"
    }
  ]
}
Only include real action items, not generic observations. Return ONLY valid JSON.`,
      },
      { role: "user", content: params.text.slice(0, 2000) },
    ],
  });

  interface RawTasks { tasks?: DetectedTask[] }
  const parsed = parseJSON<RawTasks>(result.content, {});

  return {
    tasks:    parsed.tasks ?? [],
    provider: result.provider,
    model:    result.model,
  };
}

// ── generateClientSummary ────────────────────────────────────────────────────

export async function generateClientSummary(params: {
  clientName:    string;
  company?:      string;
  recentMessages: string[];
  dealCount:     number;
  taskCount:     number;
  daysSinceContact: number;
}): Promise<ClientSummary> {
  const provider = getProvider();

  const FALLBACK: ClientSummary = {
    summary:     "AI summary unavailable — configure OPENAI_API_KEY.",
    relationship: "active",
    keyTopics:   [],
    nextAction:  "",
    provider:    "none",
    model:       "none",
  };

  if (!provider.isAvailable()) return FALLBACK;

  const context = [
    `Client: ${params.clientName}${params.company ? ` (${params.company})` : ""}`,
    `Open deals: ${params.dealCount}`,
    `Open tasks: ${params.taskCount}`,
    `Days since last contact: ${params.daysSinceContact}`,
    `Recent messages:\n${params.recentMessages.slice(0, 5).join("\n")}`,
  ].join("\n");

  const result = await provider.complete({
    jsonMode: true,
    temperature: 0.4,
    maxTokens: 400,
    messages: [
      {
        role: "system",
        content: `You are a CRM assistant. Generate a client relationship summary. Return JSON:
{
  "summary": string (2-3 sentences about the relationship and recent activity),
  "relationship": "new"|"active"|"at_risk"|"inactive",
  "keyTopics": string[] (up to 3 main topics discussed),
  "nextAction": string (1 specific recommended action)
}
Return ONLY valid JSON.`,
      },
      { role: "user", content: context },
    ],
  });

  interface RawSummary {
    summary?: string;
    relationship?: ClientSummary["relationship"];
    keyTopics?: string[];
    nextAction?: string;
  }
  const parsed = parseJSON<RawSummary>(result.content, {});

  return {
    summary:      parsed.summary      ?? "",
    relationship: parsed.relationship ?? "active",
    keyTopics:    parsed.keyTopics    ?? [],
    nextAction:   parsed.nextAction   ?? "",
    provider:     result.provider,
    model:        result.model,
  };
}

// ── analyzeDeal ──────────────────────────────────────────────────────────────

export async function analyzeDeal(params: {
  title:         string;
  stage:         string;
  value:         number;
  currency:      string;
  probability:   number;
  expectedClose: string | null;
  daysSinceUpdate: number;
  clientName:    string | null;
  description:   string | null;
}): Promise<DealAnalysis> {
  const provider = getProvider();

  const FALLBACK: DealAnalysis = {
    healthScore:   50,
    status:        "on_track",
    risks:         [],
    opportunities: [],
    nextActions:   [],
    summary:       "AI analysis unavailable — configure OPENAI_API_KEY.",
    provider:      "none",
    model:         "none",
  };

  if (!provider.isAvailable()) return FALLBACK;

  const daysToClose = params.expectedClose
    ? Math.ceil((new Date(params.expectedClose).getTime() - Date.now()) / 86_400_000)
    : null;

  const context = [
    `Deal: ${params.title}`,
    `Client: ${params.clientName ?? "Unknown"}`,
    `Stage: ${params.stage}`,
    `Value: ${params.currency} ${params.value.toLocaleString()}`,
    `Win probability: ${params.probability}%`,
    daysToClose !== null ? `Days to expected close: ${daysToClose}` : "No close date set",
    `Days since last update: ${params.daysSinceUpdate}`,
    params.description ? `Description: ${params.description}` : "",
  ].filter(Boolean).join("\n");

  const result = await provider.complete({
    jsonMode: true,
    temperature: 0.3,
    maxTokens: 500,
    messages: [
      {
        role: "system",
        content: `You are a sales coach. Analyze this deal and return JSON:
{
  "healthScore": number (0-100),
  "status": "on_track"|"at_risk"|"stalled"|"strong",
  "risks": string[] (up to 3 risks),
  "opportunities": string[] (up to 3 opportunities),
  "nextActions": string[] (up to 3 specific recommended actions),
  "summary": string (1-2 sentences)
}
Return ONLY valid JSON.`,
      },
      { role: "user", content: context },
    ],
  });

  interface RawDeal {
    healthScore?: number;
    status?: DealAnalysis["status"];
    risks?: string[];
    opportunities?: string[];
    nextActions?: string[];
    summary?: string;
  }
  const parsed = parseJSON<RawDeal>(result.content, {});

  return {
    healthScore:   parsed.healthScore   ?? 50,
    status:        parsed.status        ?? "on_track",
    risks:         parsed.risks         ?? [],
    opportunities: parsed.opportunities ?? [],
    nextActions:   parsed.nextActions   ?? [],
    summary:       parsed.summary       ?? "",
    provider:      result.provider,
    model:         result.model,
  };
}

// ── generateDashboardInsights ────────────────────────────────────────────────

export async function generateDashboardInsights(params: {
  openDeals:       number;
  pipelineValue:   number;
  wonRevenue:      number;
  currency:        string;
  inactiveClients: number;
  overdueTaskCount: number;
  staleDeals:      Array<{ title: string; daysSinceUpdate: number; value: number }>;
}): Promise<DashboardInsights> {
  const provider = getProvider();

  if (!provider.isAvailable()) {
    return {
      insights: [{
        type:     "coaching",
        title:    "AI insights not configured",
        body:     "Add OPENAI_API_KEY to enable AI-powered sales insights.",
        priority: "low",
      }],
      provider: "none",
      model:    "none",
    };
  }

  const context = [
    `Open deals: ${params.openDeals}`,
    `Pipeline value: ${params.currency} ${params.pipelineValue.toLocaleString()}`,
    `Won revenue: ${params.currency} ${params.wonRevenue.toLocaleString()}`,
    `Inactive clients (30+ days): ${params.inactiveClients}`,
    `Overdue tasks: ${params.overdueTaskCount}`,
    `Stale deals: ${JSON.stringify(params.staleDeals)}`,
  ].join("\n");

  const result = await provider.complete({
    jsonMode: true,
    temperature: 0.5,
    maxTokens: 600,
    messages: [
      {
        role: "system",
        content: `You are a sales coach analyzing a CRM workspace. Generate actionable insights. Return JSON:
{
  "insights": [
    {
      "type": "deal_alert"|"client_alert"|"opportunity"|"coaching",
      "title": string (short, max 8 words),
      "body": string (1-2 sentences),
      "action": string|null (specific action to take),
      "priority": "low"|"medium"|"high"
    }
  ]
}
Generate 3-5 insights. Prioritize urgent items. Return ONLY valid JSON.`,
      },
      { role: "user", content: context },
    ],
  });

  interface RawInsights { insights?: DashboardInsight[] }
  const parsed = parseJSON<RawInsights>(result.content, {});

  return {
    insights:  parsed.insights ?? [],
    provider:  result.provider,
    model:     result.model,
  };
}
