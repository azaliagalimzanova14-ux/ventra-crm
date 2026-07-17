/**
 * AI Suggestions — types, heuristic engine, localStorage layer.
 *
 * ── Architecture notes ────────────────────────────────────────────────────────
 *
 * Suggestions are generated client-side using regex heuristics. Every
 * suggestion carries a confidence score (0–99) and one or more reason strings
 * so the user can understand why it appeared.
 *
 * The module NEVER writes to the CRM directly. The Inbox page owns the
 * accept/reject flow and creates Client/Task/Deal records itself before calling
 * acceptSuggestion(id) here to mark the status.
 *
 * Channel-agnostic: AnalysisInput carries a sourceChannel discriminator so
 * WhatsApp, Email, and other future channels can be added without changing
 * the engine.
 *
 * ── WhatsApp / Email integration roadmap ─────────────────────────────────────
 *   - Add "whatsapp" | "email" to SourceChannel
 *   - Pass messages in the same AnalysisInput shape
 *   - The heuristic patterns apply unchanged; only sourceChannel changes
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Core enums & types ─────────────────────────────────────────────────────────

export type SuggestionType   = "client" | "task" | "deal" | "followup";
export type SuggestionStatus = "pending" | "accepted" | "rejected";
export type SourceChannel    = "telegram" | "whatsapp" | "email";

/** Shared base for all suggestion variants. */
interface BaseSuggestion {
  id:            string;
  status:        SuggestionStatus;
  confidence:    number;       // 0–99
  reasons:       string[];     // human-readable explanations
  sourceChannel: SourceChannel;
  sourceChatId:  string;       // chat/thread identifier
  sourceText:    string;       // the message excerpt that triggered it
  createdAt:     string;       // ISO 8601
}

export interface ClientSuggestion extends BaseSuggestion {
  type:      "client";
  name:      string;
  company?:  string;
  industry?: string;
  notes?:    string;
}

export interface TaskSuggestion extends BaseSuggestion {
  type:        "task";
  title:       string;
  description: string;
  dueDate?:    string;   // ISO 8601 if detected
  clientName?: string;
}

export interface DealSuggestion extends BaseSuggestion {
  type:        "deal";
  title:       string;
  clientName?: string;
  value?:      number;   // USD, if a figure was detected
  stage:       "lead" | "qualified" | "proposal";
}

export interface FollowupSuggestion extends BaseSuggestion {
  type:        "followup";
  title:       string;
  dueDate?:    string;   // ISO 8601 if detected
  clientName?: string;
}

export type AISuggestion =
  | ClientSuggestion
  | TaskSuggestion
  | DealSuggestion
  | FollowupSuggestion;

// ── Analysis input ─────────────────────────────────────────────────────────────

export interface AnalysisMessage {
  id:       string;
  content:  string;
  senderName: string;
  receivedAt: string;   // ISO 8601
}

export interface AnalysisInput {
  chatId:        string;
  chatName:      string;
  sourceChannel: SourceChannel;
  messages:      AnalysisMessage[];
}

// ── Heuristic patterns ─────────────────────────────────────────────────────────

interface Pattern {
  pattern: RegExp;
  score:   number;
  desc:    string;
}

const CLIENT_PATTERNS: Pattern[] = [
  { pattern: /\b(?:our company|my company|we are|we're a|i run|i own)\b/i,          score: 20, desc: "Self-introduction" },
  { pattern: /\b(?:CEO|CTO|founder|co-founder|director|manager|owner)\b/i,          score: 18, desc: "Job title mentioned" },
  { pattern: /\b(?:invoice|contract|proposal|quote|SOW|statement of work)\b/i,      score: 22, desc: "Business document mentioned" },
  { pattern: /\b(?:our team|our product|our service|our solution)\b/i,              score: 15, desc: "Business reference" },
  { pattern: /\b(?:payment|billing|subscription|pricing|cost|budget)\b/i,           score: 15, desc: "Financial discussion" },
  { pattern: /\b(?:partnership|collaboration|work together|let's work)\b/i,         score: 18, desc: "Partnership interest" },
  { pattern: /\bhttps?:\/\/[^\s]+\.(com|io|co|biz|net)\b/i,                        score: 12, desc: "Business website shared" },
];

const TASK_PATTERNS: Pattern[] = [
  { pattern: /\bcan you (?:send|prepare|create|write|review|check|update)\b/i,      score: 22, desc: "Action request" },
  { pattern: /\bplease (?:send|prepare|create|write|review|check|confirm)\b/i,      score: 20, desc: "Polite action request" },
  { pattern: /\b(?:by|before) (?:friday|monday|tuesday|wednesday|thursday|saturday|sunday|EOD|EOM|tomorrow|next week)\b/i, score: 18, desc: "Deadline mentioned" },
  { pattern: /\bsend (?:me|us) (?:a|the|your)\b/i,                                 score: 20, desc: "Document request" },
  { pattern: /\b(?:asap|as soon as possible|urgent|urgently)\b/i,                  score: 16, desc: "Urgency signal" },
  { pattern: /\b(?:need|needs) (?:to be|the|a|an)\b/i,                             score: 14, desc: "Requirement stated" },
  { pattern: /\bwhen (?:can you|will you|are you able)\b/i,                         score: 16, desc: "Timing question" },
  { pattern: /\b(?:don't forget|remember to|make sure to|please don't forget)\b/i, score: 18, desc: "Reminder requested" },
];

const DEAL_PATTERNS: Pattern[] = [
  { pattern: /\bcontract\b/i,                                                        score: 25, desc: "Contract mention" },
  { pattern: /\bproposal\b/i,                                                        score: 22, desc: "Proposal requested" },
  { pattern: /\b\$\s*\d[\d,.]*(?:k|K|m|M|thousand|million)?\b/,                    score: 25, desc: "Dollar amount mentioned" },
  { pattern: /\b\d[\d,.]*\s*(?:k|K|m|M)\s*(?:dollars?|usd|USD)\b/,                score: 22, desc: "Monetary figure" },
  { pattern: /\b(?:interested in|looking for|considering|evaluating|comparing)\b/i, score: 20, desc: "Buying signal" },
  { pattern: /\b(?:pricing|price list|rates|rate card|quote|quotation)\b/i,         score: 20, desc: "Pricing inquiry" },
  { pattern: /\b(?:sign|signing|close|closing|finalize|move forward)\b/i,           score: 18, desc: "Closing language" },
  { pattern: /\b(?:pilot|trial|POC|proof of concept|demo|demonstration)\b/i,        score: 16, desc: "Sales process signal" },
  { pattern: /\b(?:budget|ROI|return on investment|revenue|growth)\b/i,             score: 15, desc: "Business outcome focus" },
];

const FOLLOWUP_PATTERNS: Pattern[] = [
  { pattern: /\b(?:follow up|follow-up|followup|check in|check-in|ping me)\b/i,     score: 25, desc: "Explicit follow-up request" },
  { pattern: /\b(?:get back to you|get back to me|circle back|touch base)\b/i,      score: 22, desc: "Reconnect language" },
  { pattern: /\b(?:let me know|keep me posted|update me|give me an update)\b/i,     score: 20, desc: "Update requested" },
  { pattern: /\b(?:waiting for|waiting on|still waiting|any update|any news)\b/i,   score: 20, desc: "Awaiting response" },
  { pattern: /\b(?:next week|next month|in a few days|in a week|in two weeks)\b/i,  score: 16, desc: "Future timeframe" },
  { pattern: /\b(?:remind me|set a reminder|don't let me forget)\b/i,              score: 22, desc: "Reminder request" },
  { pattern: /\b(?:call|meeting|sync|catch up) (?:later|tomorrow|next|on)\b/i,     score: 18, desc: "Meeting request" },
];

// ── Score helpers ──────────────────────────────────────────────────────────────

function scoreText(text: string, patterns: Pattern[]): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  for (const p of patterns) {
    if (p.pattern.test(text)) {
      score += p.score;
      reasons.push(p.desc);
    }
  }
  return { score: Math.min(score, 99), reasons };
}

/** Extract a rough dollar value from text, or undefined. */
function extractValue(text: string): number | undefined {
  const m = text.match(/\$\s*([\d,.]+)\s*(k|K|m|M|thousand|million)?/);
  if (!m) return undefined;
  let val = parseFloat(m[1].replace(/,/g, ""));
  const unit = m[2]?.toLowerCase();
  if (unit === "k" || unit === "thousand") val *= 1000;
  if (unit === "m" || unit === "million")  val *= 1_000_000;
  return isNaN(val) ? undefined : val;
}

/** ISO date string for N days from now. */
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

// ── Core analyzer ──────────────────────────────────────────────────────────────

const BASE_CLIENT_SCORE = 35;   // minimum before pattern bonuses

/**
 * Analyze a conversation and return AI suggestions.
 *
 * For live Telegram conversations, call this with skipClientSuggestion=true
 * because autoCreateTelegramClient already handles client creation.
 */
export function analyzeConversationMessages(
  input: AnalysisInput,
  opts: { skipClientSuggestion?: boolean } = {},
): AISuggestion[] {
  const allText = input.messages.map((m) => m.content).join(" ");
  const latest  = input.messages[input.messages.length - 1];
  const now     = new Date().toISOString();
  const results: AISuggestion[] = [];

  // ── Client suggestion ──────────────────────────────────────────────────────
  if (!opts.skipClientSuggestion) {
    const { score: bonus, reasons } = scoreText(allText, CLIENT_PATTERNS);
    const confidence = Math.min(BASE_CLIENT_SCORE + bonus, 99);
    if (confidence >= 40) {
      results.push({
        id:            `client_${input.sourceChannel}_${input.chatId}`,
        type:          "client",
        status:        "pending",
        confidence,
        reasons:       reasons.length ? reasons : ["Regular business conversation"],
        sourceChannel: input.sourceChannel,
        sourceChatId:  input.chatId,
        sourceText:    latest?.content.slice(0, 160) ?? "",
        createdAt:     now,
        name:          input.chatName,
        notes:         `From ${input.sourceChannel} conversation`,
      });
    }
  }

  // ── Task suggestion ────────────────────────────────────────────────────────
  for (const msg of input.messages) {
    const { score, reasons } = scoreText(msg.content, TASK_PATTERNS);
    if (score >= 30) {
      results.push({
        id:            `task_${input.sourceChannel}_${input.chatId}_${msg.id}`,
        type:          "task",
        status:        "pending",
        confidence:    Math.min(score, 99),
        reasons,
        sourceChannel: input.sourceChannel,
        sourceChatId:  input.chatId,
        sourceText:    msg.content.slice(0, 160),
        createdAt:     now,
        title:         `Follow up on: ${msg.content.slice(0, 60).trim()}${msg.content.length > 60 ? "…" : ""}`,
        description:   msg.content.slice(0, 300),
        dueDate:       daysFromNow(3),
        clientName:    input.chatName,
      });
      break; // one task suggestion per conversation per analysis run
    }
  }

  // ── Deal suggestion ────────────────────────────────────────────────────────
  const { score: dealScore, reasons: dealReasons } = scoreText(allText, DEAL_PATTERNS);
  if (dealScore >= 35) {
    results.push({
      id:            `deal_${input.sourceChannel}_${input.chatId}`,
      type:          "deal",
      status:        "pending",
      confidence:    Math.min(dealScore, 99),
      reasons:       dealReasons,
      sourceChannel: input.sourceChannel,
      sourceChatId:  input.chatId,
      sourceText:    latest?.content.slice(0, 160) ?? "",
      createdAt:     now,
      title:         `Deal with ${input.chatName}`,
      clientName:    input.chatName,
      value:         extractValue(allText),
      stage:         "lead",
    });
  }

  // ── Follow-up suggestion ───────────────────────────────────────────────────
  const { score: fuScore, reasons: fuReasons } = scoreText(allText, FOLLOWUP_PATTERNS);
  if (fuScore >= 30) {
    results.push({
      id:            `followup_${input.sourceChannel}_${input.chatId}`,
      type:          "followup",
      status:        "pending",
      confidence:    Math.min(fuScore, 99),
      reasons:       fuReasons,
      sourceChannel: input.sourceChannel,
      sourceChatId:  input.chatId,
      sourceText:    latest?.content.slice(0, 160) ?? "",
      createdAt:     now,
      title:         `Follow up with ${input.chatName}`,
      dueDate:       daysFromNow(2),
      clientName:    input.chatName,
    });
  }

  return results;
}

// ── Mock import suggestions ────────────────────────────────────────────────────
//
// Called after Telegram personal account import completes.
// Generates a realistic mix of suggestions across all 4 types.

// Each entry is cast to AISuggestion at use-time; createdAt is added in generateImportSuggestions.
// Using `unknown` intermediate avoids structural-type issues with the discriminated union.
const MOCK_IMPORT_SUGGESTIONS = [
  {
    id: "client_tg_import_1001", type: "client", status: "pending", confidence: 88,
    reasons: ["Regular business conversation", "Invoice mentioned", "Job title mentioned"],
    sourceChannel: "telegram", sourceChatId: "1001",
    sourceText: "Hey, Alex Morgan here — CEO at Bloom Digital. Can you send me the revised proposal by Friday?",
    name: "Alex Morgan", company: "Bloom Digital", industry: "Technology",
    notes: "Mentioned proposal and Friday deadline",
  },
  {
    id: "client_tg_import_1007", type: "client", status: "pending", confidence: 82,
    reasons: ["Job title mentioned", "Partnership interest", "Business document mentioned"],
    sourceChannel: "telegram", sourceChatId: "1007",
    sourceText: "David Kim, founder at Nexus Labs. Interested in a partnership — can we set up a call?",
    name: "David Kim", company: "Nexus Labs", industry: "Technology",
    notes: "Partnership discussion, call requested",
  },
  {
    id: "client_tg_import_1012", type: "client", status: "pending", confidence: 76,
    reasons: ["Pricing inquiry", "Self-introduction"],
    sourceChannel: "telegram", sourceChatId: "1012",
    sourceText: "Hi, Marcus Rivera here. Can you share your rate card? Looking to outsource some design work.",
    name: "Marcus Rivera", notes: "Design services inquiry",
  },
  {
    id: "task_tg_import_1001_1", type: "task", status: "pending", confidence: 91,
    reasons: ["Deadline mentioned", "Document request", "Action request"],
    sourceChannel: "telegram", sourceChatId: "1001",
    sourceText: "Can you send me the revised proposal by Friday?",
    title: "Send revised proposal to Alex Morgan",
    description: "Alex Morgan (Bloom Digital) requested the revised proposal by Friday.",
    dueDate: daysFromNow(3),
    clientName: "Alex Morgan",
  },
  {
    id: "task_tg_import_1010_1", type: "task", status: "pending", confidence: 78,
    reasons: ["Action request", "Urgency signal"],
    sourceChannel: "telegram", sourceChatId: "1010",
    sourceText: "Elena: Please review the contract draft ASAP — we need to sign before end of month.",
    title: "Review contract draft for Elena Volkova",
    description: "Elena Volkova requested urgent contract review before end of month.",
    dueDate: daysFromNow(5),
    clientName: "Elena Volkova",
  },
  {
    id: "task_tg_import_1014_1", type: "task", status: "pending", confidence: 72,
    reasons: ["Reminder requested", "Action request"],
    sourceChannel: "telegram", sourceChatId: "1014",
    sourceText: "Amara: Don't forget to send the onboarding docs when you get a chance.",
    title: "Send onboarding docs to Amara Diallo",
    description: "Amara Diallo requested onboarding documentation.",
    dueDate: daysFromNow(2),
    clientName: "Amara Diallo",
  },
  {
    id: "deal_tg_import_1001", type: "deal", status: "pending", confidence: 85,
    reasons: ["Proposal requested", "Closing language", "Dollar amount mentioned"],
    sourceChannel: "telegram", sourceChatId: "1001",
    sourceText: "We're ready to move forward. Budget is around $15K for the first phase.",
    title: "Bloom Digital — Website Redesign",
    clientName: "Alex Morgan", value: 15000, stage: "proposal",
  },
  {
    id: "deal_tg_import_1007", type: "deal", status: "pending", confidence: 73,
    reasons: ["Partnership interest", "Pilot mentioned", "Buying signal"],
    sourceChannel: "telegram", sourceChatId: "1007",
    sourceText: "We'd love to do a pilot project together — thinking $8K scope.",
    title: "Nexus Labs — Partnership Pilot",
    clientName: "David Kim", value: 8000, stage: "qualified",
  },
  {
    id: "followup_tg_import_1002", type: "followup", status: "pending", confidence: 80,
    reasons: ["Explicit follow-up request", "Awaiting response"],
    sourceChannel: "telegram", sourceChatId: "1002",
    sourceText: "Sarah: Still waiting on that scope doc. Can you follow up with your team?",
    title: "Follow up with Sarah Chen on scope doc",
    dueDate: daysFromNow(1), clientName: "Sarah Chen",
  },
  {
    id: "followup_tg_import_1020", type: "followup", status: "pending", confidence: 68,
    reasons: ["Reconnect language", "Future timeframe"],
    sourceChannel: "telegram", sourceChatId: "1020",
    sourceText: "Nina: Let's circle back next week once you've had a chance to review.",
    title: "Circle back with Nina Petrov next week",
    dueDate: daysFromNow(7), clientName: "Nina Petrov",
  },
];

export function generateImportSuggestions(): AISuggestion[] {
  const now = new Date().toISOString();
  // Each entry has all required fields; adding createdAt completes the shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return MOCK_IMPORT_SUGGESTIONS.map((s: any) => ({ ...s, createdAt: now } as AISuggestion));
}

// ── localStorage persistence ───────────────────────────────────────────────────

const SUGGESTIONS_KEY = "ventra_ai_suggestions";

export function getSuggestions(): AISuggestion[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SUGGESTIONS_KEY);
    return raw ? (JSON.parse(raw) as AISuggestion[]) : [];
  } catch { return []; }
}

export function saveSuggestions(suggestions: AISuggestion[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(suggestions));
}

/**
 * Add new suggestions, skipping any whose ID already exists
 * (prevents duplicates from repeated analysis runs).
 */
export function addSuggestions(incoming: AISuggestion[]): void {
  const existing = getSuggestions();
  const existingIds = new Set(existing.map((s) => s.id));
  const fresh = incoming.filter((s) => !existingIds.has(s.id));
  if (fresh.length > 0) saveSuggestions([...existing, ...fresh]);
}

export function clearSuggestions(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SUGGESTIONS_KEY);
}

export function getPendingSuggestions(): AISuggestion[] {
  return getSuggestions().filter((s) => s.status === "pending");
}

export function acceptSuggestion(id: string): void {
  const all = getSuggestions().map((s) =>
    s.id === id ? { ...s, status: "accepted" as SuggestionStatus } : s,
  );
  saveSuggestions(all);
}

export function rejectSuggestion(id: string): void {
  const all = getSuggestions().map((s) =>
    s.id === id ? { ...s, status: "rejected" as SuggestionStatus } : s,
  );
  saveSuggestions(all);
}
