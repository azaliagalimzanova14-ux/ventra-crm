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

// ── generateRelationshipNarrative ────────────────────────────────────────────

/**
 * Result type for the Relationship Narrative.
 * Natural language fields only — health score, confidence, and evidence
 * are computed deterministically by narrative-engine.ts before this call.
 */
export interface RelationshipNarrative {
  narrative:           string;
  recommended_action:  string;
  risk_level:          "high" | "medium" | "low";
  momentum:            "accelerating" | "stable" | "declining" | "dormant";
  provider:            string;
  model:               string;
}

/**
 * Calls the AI to produce natural language for a relationship status update.
 *
 * Ventra Voice rules (agreed by PM + AI Designer + Behavioral Scientist + RIS):
 *   - Chief of Staff register: direct, numbers-first, present-tense
 *   - Narrative: 2–3 sentences; brief a CEO who has 30 seconds
 *   - Action: 1 sentence; specific next step, not a vibe
 *   - Banned phrases: "Based on the data", "According to the analysis",
 *     "It appears", "the relationship shows"
 *   - Banned adjectives: strong, robust, meaningful, fruitful, valuable
 *
 * Graceful fallback: returns empty strings with provider="none" when AI is
 * not configured. narrative-engine.ts fills in deterministic fallback text.
 */
export async function generateRelationshipNarrative(params: {
  clientName:           string;
  healthScore:          number | null;
  healthLabel:          "strong" | "healthy" | "at_risk" | "critical" | null;
  daysSinceContact:     number | null;
  silenceThresholdDays: number | null;
  isOverdue:            boolean;
  clientInitiationPct:  number | null;
  avgContactGapDays:    number | null;
  sampleSize:           number;
  evidence:             Array<{ label: string; value: string }>;
  // Context-Aware Narrative additions (Sprint 3.2 Feature 1)
  recentMessages?:      Array<{ role: "client" | "agent"; content: string; createdAt: string; channel: string }>;
  openTasks?:           Array<{ title: string; dueDate: string | null; status: string }>;
  notes?:               string | null;
}): Promise<RelationshipNarrative> {
  const provider = getProvider();

  const FALLBACK: RelationshipNarrative = {
    narrative:           "",
    recommended_action:  "",
    risk_level:
      params.healthLabel === "critical" || params.healthLabel === "at_risk" ? "high" : "low",
    momentum: params.isOverdue ? "declining" : "stable",
    provider: "none",
    model:    "none",
  };

  if (!provider.isAvailable()) return FALLBACK;

  const overdueNote =
    params.isOverdue &&
    params.daysSinceContact !== null &&
    params.silenceThresholdDays !== null
      ? ` (${(params.daysSinceContact / Math.max(1, params.silenceThresholdDays)).toFixed(1)}× past normal cadence)`
      : "";

  // Build conversation context lines (newest first, max 5)
  const msgLines = (params.recentMessages ?? []).slice(0, 5).map((m) => {
    const daysAgo = Math.round(
      (Date.now() - new Date(m.createdAt).getTime()) / 86_400_000,
    );
    const when = daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo}d ago`;
    return `  [${m.role}] ${when} (${m.channel}): "${m.content.slice(0, 120)}"`;
  });

  const taskLines = (params.openTasks ?? []).map((t) => {
    const due = t.dueDate ? ` (due ${t.dueDate})` : "";
    return `  - ${t.title}${due}`;
  });

  const context = [
    `Client: ${params.clientName}`,
    `Health Score: ${params.healthScore ?? "N/A"}/100 (${params.healthLabel ?? "insufficient data"})`,
    `Days since last contact: ${params.daysSinceContact !== null ? Math.round(params.daysSinceContact) : "unknown"}`,
    `Contact overdue: ${params.isOverdue ? `YES${overdueNote}` : "no"}`,
    `Client initiates: ${params.clientInitiationPct !== null ? Math.round(params.clientInitiationPct * 100) + "%" : "unknown"}`,
    `Average contact gap: ${params.avgContactGapDays !== null ? `every ${Math.round(params.avgContactGapDays * 10) / 10} days` : "unknown"}`,
    `Messages analyzed: ${params.sampleSize}`,
    `Key signals: ${params.evidence.map((e) => `${e.label}: ${e.value}`).join(" | ")}`,
    ...(msgLines.length > 0 ? [
      `Recent messages (newest first):`,
      ...msgLines,
    ] : []),
    ...(taskLines.length > 0 ? [
      `Open tasks:`,
      ...taskLines,
    ] : []),
    ...(params.notes ? [`Notes: ${params.notes.slice(0, 200)}`] : []),
  ].join("\n");

  const result = await provider.complete({
    jsonMode:    true,
    temperature: 0.4,
    maxTokens:   300,
    messages: [
      {
        role: "system",
        content: `You are the Chief of Staff at a founder-led business. Write a relationship status update for one client.

Rules:
- "narrative": 2–3 sentences. Brief a CEO with 30 seconds. Use the client's name. Be specific — use numbers and facts.
- "recommended_action": 1 sentence. One specific next step the founder should take today or this week. Name the action, not the feeling.
- "risk_level": "high" | "medium" | "low" — how much risk does this relationship carry right now.
- "momentum": "accelerating" | "stable" | "declining" | "dormant".
- Never say: "Based on the data", "According to the analysis", "It appears", "the relationship shows", "It seems".
- Never use these adjectives without a number: strong, robust, meaningful, fruitful, valuable, significant, noteworthy.
- If recent messages are provided: reference the ACTUAL topic discussed (e.g. "Follow up on the proposal you discussed last week" not "Reach out today").
- If open tasks are provided: incorporate the most relevant task into the recommended_action.
- If notes are provided: factor them into your assessment.
- If contact is overdue: open with the gap ("${params.clientName} hasn't been contacted in X days...").
- If healthy: open with what's working.
- Never say "we" — the user is one founder, one person.
Return ONLY valid JSON with these four keys.`,
      },
      {
        role:    "user",
        content: context,
      },
    ],
  });

  interface RawNarrative {
    narrative?:           string;
    recommended_action?:  string;
    risk_level?:          RelationshipNarrative["risk_level"];
    momentum?:            RelationshipNarrative["momentum"];
  }
  const parsed = parseJSON<RawNarrative>(result.content, {});

  return {
    narrative:           parsed.narrative          ?? "",
    recommended_action:  parsed.recommended_action ?? "",
    risk_level:          parsed.risk_level         ?? FALLBACK.risk_level,
    momentum:            parsed.momentum           ?? FALLBACK.momentum,
    provider:            result.provider,
    model:               result.model,
  };
}

// ── generateMorningBriefPriorities ──────────────────────────────────────────

/**
 * Result type for the Morning Brief AI call.
 * One call per brief — greeting + 3 named priorities for the whole workspace.
 */
export interface MorningBriefResult {
  greeting:   string;    // ≤15 words, sets the tone
  priorities: string[];  // exactly 3 action strings naming specific clients
  provider:   string;
  model:      string;
}

/**
 * Calls the AI to produce the Morning Brief's greeting and 3 top priorities.
 *
 * Ventra Voice rules (same register as relationship narratives):
 *   - Chief of Staff, not ChatGPT
 *   - Greeting: ≤15 words, sets the day's tone based on portfolio state
 *   - Each priority: name the client + specific action + at least one number
 *   - Banned phrases: "Based on the data", "According to the analysis",
 *     "It appears", "the relationship shows", "It seems"
 *   - No motivational language ("great opportunity", "exciting", "amazing")
 *
 * Graceful fallback: returns provider="none" with empty priorities so
 * morning-brief-engine.ts can substitute its deterministic fallback.
 */
export async function generateMorningBriefPriorities(params: {
  clientCount:   number;
  trackedCount:  number;
  needsAttention: Array<{
    name:      string;
    label:     string;
    daysSince: number | null;
    ratio:     number | null;
  }>;
  overdueRelationships: Array<{
    name:      string;
    daysSince: number | null;
    ratio:     number | null;
  }>;
  recentPositive: Array<{ name: string }>;
}): Promise<MorningBriefResult> {
  const provider = getProvider();

  const FALLBACK: MorningBriefResult = {
    greeting:   "",
    priorities: [],
    provider:   "none",
    model:      "none",
  };

  if (!provider.isAvailable()) return FALLBACK;

  // Build a concise context block for the AI
  const attentionLines = params.needsAttention.map((c) =>
    `  - ${c.name} (${c.label}, ${c.daysSince !== null ? `${c.daysSince}d` : "unknown"}${c.ratio !== null ? `, ${c.ratio}× overdue` : ""})`,
  ).join("\n") || "  (none)";

  const overdueLines = params.overdueRelationships.map((c) =>
    `  - ${c.name} (${c.daysSince !== null ? `${c.daysSince}d` : "unknown"}${c.ratio !== null ? `, ${c.ratio}× overdue` : ""})`,
  ).join("\n") || "  (none)";

  const positiveLines = params.recentPositive.map((c) =>
    `  - ${c.name}`,
  ).join("\n") || "  (none)";

  const context = [
    `Total active clients: ${params.clientCount}`,
    `Clients with relationship data: ${params.trackedCount}`,
    `Needs immediate attention (critical or at-risk):`,
    attentionLines,
    `Overdue but otherwise healthy:`,
    overdueLines,
    `Recent positive contacts (last 3 days):`,
    positiveLines,
  ].join("\n");

  const result = await provider.complete({
    jsonMode:    true,
    temperature: 0.4,
    maxTokens:   350,
    messages: [
      {
        role: "system",
        content: `You are the Chief of Staff for a founder-led business. Write the morning relationship brief.

Return JSON with exactly these keys:
{
  "greeting": string,
  "priorities": [string, string, string]
}

Rules:
- "greeting": ≤15 words. One sentence. Set the tone for the day based on what you see. No "Good morning", no "Today".
- "priorities": exactly 3 strings. Each must name a specific client, say what to do, and include at least one number (days, ratio, or count). Order by urgency. If no specific clients exist, give 3 general but concrete actions.
- Never say: "Based on the data", "According to the analysis", "It appears", "the relationship shows", "It seems".
- No motivational language: "great opportunity", "exciting", "amazing", "fantastic".
- Be direct. A CEO reads this in 20 seconds.
Return ONLY valid JSON.`,
      },
      {
        role:    "user",
        content: context,
      },
    ],
  });

  interface RawBrief {
    greeting?:   string;
    priorities?: string[];
  }
  const parsed = parseJSON<RawBrief>(result.content, {});

  // Validate: must have greeting + 3 priorities
  if (
    !parsed.greeting ||
    !Array.isArray(parsed.priorities) ||
    parsed.priorities.length === 0
  ) {
    return FALLBACK;
  }

  return {
    greeting:   parsed.greeting.trim(),
    priorities: parsed.priorities.slice(0, 3).map((p) => String(p).trim()),
    provider:   result.provider,
    model:      result.model,
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

// ── generateOpportunityInsights ──────────────────────────────────────────────

/**
 * Calls AI once to produce a one-sentence insight for each detected opportunity.
 * Returns a map of clientId → insight string.
 * AI never calculates business metrics — it explains deterministic signals.
 */
export interface OpportunityInsightsResult {
  insights: Record<string, string>;  // clientId → insight sentence
  provider: string;
  model:    string;
}

export async function generateOpportunityInsights(
  opportunities: Array<{
    id:               string;
    clientName:       string;
    type:             string;
    healthLabel:      string | null;
    daysSinceContact: number | null;
    overdueRatio:     number | null;
    momentum:         string | null;
  }>,
): Promise<OpportunityInsightsResult> {
  const provider = getProvider();

  const FALLBACK: OpportunityInsightsResult = {
    insights: {},
    provider: "none",
    model:    "none",
  };

  if (!provider.isAvailable() || opportunities.length === 0) return FALLBACK;

  // Build a compact list for the AI — no metrics, only signals
  const lines = opportunities.map((o, i) =>
    `${i + 1}. id=${o.id} name="${o.clientName}" type=${o.type}` +
    (o.healthLabel      ? ` health=${o.healthLabel}`                        : "") +
    (o.daysSinceContact !== null ? ` days_silent=${o.daysSinceContact}`     : "") +
    (o.overdueRatio     !== null ? ` overdue_ratio=${o.overdueRatio}x`      : "") +
    (o.momentum         ? ` momentum=${o.momentum}`                         : ""),
  ).join("\n");

  const result = await provider.complete({
    jsonMode:    true,
    temperature: 0.35,
    maxTokens:   600,
    messages: [
      {
        role: "system",
        content: `You are the Chief of Staff for a founder. Explain each relationship signal in ONE sentence.

Return JSON:
{ "insights": { "<id>": "<one sentence>", ... } }

Rules:
- Use the client's name in every sentence.
- Name the specific signal (days silent, health label, momentum) — include at least one number.
- End with a single implied next action (no bullet, no colon).
- Max 20 words per sentence.
- Never say: "Based on the data", "It appears", "the relationship shows", "According to", "It seems".
- type meanings: re_engagement=health declining; approaching=proactive check-in window; momentum_up=positive streak; waiting_reply=client spoke last, you haven't responded.
Return ONLY valid JSON.`,
      },
      {
        role:    "user",
        content: lines,
      },
    ],
  });

  interface RawOpInsights { insights?: Record<string, string> }
  const parsed = parseJSON<RawOpInsights>(result.content, {});

  return {
    insights: parsed.insights ?? {},
    provider: result.provider,
    model:    result.model,
  };
}

// ── generateWeeklyNarrative ───────────────────────────────────────────────────

/**
 * Produces a 2–3 sentence narrative of the week and a one-sentence next-week focus.
 * AI explains patterns — it never calculates the metrics (those come from the engine).
 */
export interface WeeklyNarrativeResult {
  narrative:     string;
  nextWeekFocus: string;
  provider:      string;
  model:         string;
}

export async function generateWeeklyNarrative(params: {
  totalContacts:  number;
  totalMessages:  number;
  newClients:     number;
  tasksCompleted: number;
  healthImproved: number;
  healthDeclined: number;
  topActivity:    Array<{ clientName: string; msgCount: number }>;
  improved:       Array<{ clientName: string; current: string | null }>;
  declined:       Array<{ clientName: string; current: string | null }>;
  totalActive:    number;
  strongCount:    number;
  healthyCount:   number;
  atRiskCount:    number;
  criticalCount:  number;
}): Promise<WeeklyNarrativeResult> {
  const provider = getProvider();

  const FALLBACK: WeeklyNarrativeResult = {
    narrative:     "",
    nextWeekFocus: "",
    provider:      "none",
    model:         "none",
  };

  if (!provider.isAvailable()) return FALLBACK;

  const topNames = params.topActivity.slice(0, 3).map((a) => `${a.clientName} (${a.msgCount} msgs)`).join(", ") || "none";
  const improvedNames = params.improved.slice(0, 3).map((c) => c.clientName).join(", ") || "none";
  const declinedNames = params.declined.slice(0, 3).map((c) => c.clientName).join(", ") || "none";

  const context = [
    `Week summary:`,
    `  Clients contacted: ${params.totalContacts}`,
    `  Messages: ${params.totalMessages}`,
    `  New clients: ${params.newClients}`,
    `  Tasks completed: ${params.tasksCompleted}`,
    `  Health improved: ${params.healthImproved} | declined: ${params.healthDeclined}`,
    `  Portfolio: ${params.totalActive} active (${params.strongCount} strong, ${params.healthyCount} healthy, ${params.atRiskCount} at-risk, ${params.criticalCount} critical)`,
    `  Most active clients: ${topNames}`,
    `  Improved: ${improvedNames}`,
    `  Declined: ${declinedNames}`,
  ].join("\n");

  const result = await provider.complete({
    jsonMode:    true,
    temperature: 0.4,
    maxTokens:   300,
    messages: [
      {
        role: "system",
        content: `You are the Chief of Staff for a founder. Write the weekly review.

Return JSON:
{
  "narrative": string,
  "nextWeekFocus": string
}

Rules:
- "narrative": 2–3 sentences. Name at least one specific client. Include at least 2 numbers. Describe what the week meant for the business, not just what happened.
- "nextWeekFocus": exactly 1 sentence. Name a specific client or segment. Include a number. End with one concrete action.
- Never say: "Based on the data", "It appears", "According to the analysis", "It seems", "the relationship shows".
- No motivational filler ("great week", "exciting progress"). Be direct.
- Never say "we" — one founder, one person.
Return ONLY valid JSON.`,
      },
      {
        role:    "user",
        content: context,
      },
    ],
  });

  interface RawWeekly { narrative?: string; nextWeekFocus?: string }
  const parsed = parseJSON<RawWeekly>(result.content, {});

  return {
    narrative:     parsed.narrative     ?? "",
    nextWeekFocus: parsed.nextWeekFocus ?? "",
    provider:      result.provider,
    model:         result.model,
  };
}

// ── generateAssistantResponse ─────────────────────────────────────────────────

/**
 * Real AI response for the AI Workspace chat.
 * Injects founder memory and portfolio context as system-level grounding.
 * Replaces the rule-based generateResponse() in assistant/page.tsx when AI is available.
 */
export interface AssistantResponseResult {
  response: string;
  provider: string;
  model:    string;
}

export async function generateAssistantResponse(params: {
  message:          string;
  memoryContext:    string;   // from buildMemoryContext()
  portfolioSummary: string;  // brief text summary of portfolio state
}): Promise<AssistantResponseResult> {
  const provider = getProvider();

  const FALLBACK: AssistantResponseResult = {
    response: "",
    provider: "none",
    model:    "none",
  };

  if (!provider.isAvailable()) return FALLBACK;

  const systemParts: string[] = [
    `You are Ventra, a Chief of Staff AI for a founder-led business. You have full context of their client relationships, tasks, and deals.`,
    ``,
    `Communication style:`,
    `- Direct, concise, no filler. Max 3 sentences unless a list is explicitly needed.`,
    `- Never say: "Based on the data", "According to the analysis", "It appears", "the relationship shows".`,
    `- Never say "we" — the user is one founder.`,
    `- If action is needed, name the specific client and the specific step.`,
    `- If you don't know something, say so in one sentence.`,
  ];

  if (params.memoryContext) {
    systemParts.push(``, params.memoryContext);
  }

  if (params.portfolioSummary) {
    systemParts.push(``, `Current portfolio state:`, params.portfolioSummary);
  }

  const result = await provider.complete({
    jsonMode:    false,
    temperature: 0.5,
    maxTokens:   400,
    messages: [
      {
        role:    "system",
        content: systemParts.join("\n"),
      },
      {
        role:    "user",
        content: params.message,
      },
    ],
  });

  if (!result.content?.trim()) return FALLBACK;

  return {
    response: result.content.trim(),
    provider: result.provider,
    model:    result.model,
  };
}
