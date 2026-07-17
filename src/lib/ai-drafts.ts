/**
 * AI Reply Drafts — heuristic generation engine, style system, localStorage persistence.
 *
 * ── Real AI Integration Roadmap ──────────────────────────────────────────────
 *
 * Replace generateAIDraft() with a call to /api/ai/draft:
 *   POST { convId, channel, clientName, subject, messages, style }
 *   → { content, confidence, reasoning }
 * The style parameter maps to a Claude system prompt modifier.
 * Confidence and reasoning come from the model response metadata.
 *
 * ── Sending Roadmap ───────────────────────────────────────────────────────────
 *
 * sendDraft() stubs — implement per channel:
 *   Telegram : POST /api/integrations/telegram/send   { chatId, text }
 *   Email    : POST /api/integrations/gmail/send      { threadId, to, subject, body }
 *   WhatsApp : POST /api/integrations/whatsapp/send   { to, text }
 *
 * ── Channel scope ─────────────────────────────────────────────────────────────
 * Channel-agnostic: telegram, email, whatsapp (+ future channels).
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type DraftStyle   = "professional" | "friendly" | "short" | "detailed";
export type DraftChannel = "telegram" | "email" | "whatsapp";

export interface DraftMessage {
  id:        string;
  role:      "client" | "you";
  content:   string;
  timestamp: string;
}

export interface DraftGenerationInput {
  convId:        string;
  channel:       DraftChannel;
  clientName:    string;
  clientCompany?: string;
  subject?:      string;  // email subject
  messages:      DraftMessage[];
  style:         DraftStyle;
}

export interface AIDraft {
  id:             string;
  convId:         string;
  style:          DraftStyle;
  channel:        DraftChannel;
  content:        string;
  editedContent?: string;   // user-edited version (overrides content)
  confidence:     number;   // 0–99
  reasoning:      string[]; // bullets explaining the draft choices
  generatedAt:    string;   // ISO 8601
  isDirty:        boolean;  // user has modified content from generated
}

// ── Style metadata ────────────────────────────────────────────────────────────

export const DRAFT_STYLE_META: Record<DraftStyle, {
  label:       string;
  description: string;
}> = {
  professional: { label: "Professional", description: "Formal and business-appropriate" },
  friendly:     { label: "Friendly",     description: "Warm and approachable"           },
  short:        { label: "Short",        description: "Concise — 2 to 3 sentences"      },
  detailed:     { label: "Detailed",     description: "Thorough with full context"      },
};

// ── Intent detection ──────────────────────────────────────────────────────────

export type MessageIntent =
  | "question"
  | "request"
  | "concern"
  | "followup"
  | "positive"
  | "meeting"
  | "deadline"
  | "pricing"
  | "technical"
  | "general";

export function detectIntent(text: string): MessageIntent {
  const t = text.toLowerCase();

  if (/\b(schedule|meeting|call|zoom|sync|catch up|hop on|available|availability|book)\b/.test(t)) return "meeting";
  if (/\b(by (friday|monday|tuesday|wednesday|thursday|end of week|eow|eod|today|tomorrow)|urgent|asap|immediately|hard deadline|deadline)\b/.test(t)) return "deadline";
  if (/\b(price|pricing|cost|budget|quote|proposal|estimate|invoice|payment|fee|billing)\b/.test(t)) return "pricing";
  if (/\b(bug|error|not working|broken|crash|fails|issue|problem|integration|api error)\b/.test(t) && /\b(technical|code|deploy|stack|server|api)\b/.test(t)) return "technical";
  if (/\b(concern|worried|confused|unclear|missing|wrong|incorrect|doesn.t|doesn't|not what)\b/.test(t)) return "concern";
  if (/\b(check.?in|follow.?up|any update|status|progress|circling back|touching base|just wanted to)\b/.test(t)) return "followup";
  if (/\b(great|perfect|excellent|looks good|amazing|thank|thanks|appreciate|happy|love it|well done)\b/.test(t) && !/\?/.test(t)) return "positive";
  if (/\b(please|can you send|need you to|requesting|provide|forward|attach|share)\b/.test(t)) return "request";
  if (/\?/.test(t)) return "question";

  return "general";
}

// ── Content generation ────────────────────────────────────────────────────────

function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

function getGreeting(style: DraftStyle, name: string): string {
  const fn = firstName(name);
  switch (style) {
    case "professional": return `Hi ${fn},\n\n`;
    case "friendly":     return `Hey ${fn}! 👋\n\n`;
    case "short":        return `Hi ${fn},\n\n`;
    case "detailed":     return `Dear ${fn},\n\n`;
  }
}

function getClosing(style: DraftStyle): string {
  switch (style) {
    case "professional": return "\n\nBest regards,";
    case "friendly":     return "\n\nLooking forward to hearing from you! 😊";
    case "short":        return "\n\nBest,";
    case "detailed":     return "\n\nPlease don't hesitate to reach out if you have any further questions.\n\nBest regards,";
  }
}

type StyleVariants = Record<DraftStyle, string>;
type IntentContent = Record<MessageIntent, StyleVariants>;

const INTENT_CONTENT: IntentContent = {
  question: {
    professional: "Thank you for reaching out with your question. I've reviewed it carefully and would like to provide you with a clear and complete answer. I want to make sure we're fully aligned before we proceed.",
    friendly:     "Great question! Happy to help clear this up. Let me walk you through it — feel free to ask anything else if you need more detail.",
    short:        "Good question — let me get back to you with a clear answer shortly.",
    detailed:     "Thank you for your question — I want to make sure I give you a complete and accurate response that addresses all aspects of what you've raised. Let me walk you through this in detail so we're fully aligned going forward. I'll also flag any related points worth keeping in mind.",
  },
  request: {
    professional: "Thank you for your request. I've received all the details and will ensure everything is handled promptly and prepared to your exact specifications.",
    friendly:     "Got it! I'll take care of that right away and keep you posted. Let me know if anything changes in the meantime.",
    short:        "On it — I'll have this ready and sent over to you shortly.",
    detailed:     "Thank you for sending this over — I've reviewed your request in full detail. I'll make sure everything is prepared according to your requirements and will update you at each step. If I need any clarification along the way, I'll flag it immediately so there are no delays.",
  },
  concern: {
    professional: "Thank you for flagging this. I take your concern seriously and want to address it as a matter of priority. I'm looking into it now and will provide a full update shortly.",
    friendly:     "Thanks for letting me know — I want to get this sorted out for you quickly! I'm on it now and will update you as soon as I have more information.",
    short:        "Thanks for flagging this — I'm looking into it right now and will update you shortly.",
    detailed:     "Thank you for bringing this to my attention — I understand this is important and I want to make sure it's resolved properly. I'm investigating now and will provide a comprehensive update including a clear resolution path as soon as possible. Your feedback helps us improve and I genuinely appreciate you raising this.",
  },
  followup: {
    professional: "Thank you for following up — I appreciate you staying on top of this. Here's a current status update on where things stand and what's coming next.",
    friendly:     "Hey, thanks for checking in! Happy to share an update. Things are moving along well — let me fill you in on where we're at.",
    short:        "Thanks for the check-in! Happy to share a quick status update.",
    detailed:     "Thank you for reaching out — I want to make sure you have complete visibility on the current status. Here's a comprehensive update: I'll cover what's been completed, what's currently in progress, any open blockers, and upcoming milestones so you have the full picture.",
  },
  positive: {
    professional: "Thank you so much for your kind feedback — it's greatly appreciated. I'm very pleased we've been able to deliver value for you and your team.",
    friendly:     "Aw, that's so great to hear — thank you! 😊 It's been a real pleasure working on this. Looking forward to what's next!",
    short:        "Thank you! Really glad to hear that — means a lot.",
    detailed:     "Thank you so much for the positive feedback — it truly means a great deal to us. I'm really glad everything has come together well and that you're happy with the results. It's been a genuine pleasure working with you and your team, and I'm looking forward to continuing our collaboration.",
  },
  meeting: {
    professional: "I'd be happy to schedule time to connect — I think it would be very valuable. I'll send over a few available time slots shortly for you to choose from.",
    friendly:     "Sounds great! Let's find a time to catch up. I'll send over some options that work on my end — feel free to suggest your preference too!",
    short:        "Happy to connect — I'll send over some available times shortly.",
    detailed:     "I'd love to schedule time to connect — there's a lot worth discussing in person. I'll send over several availability options shortly, and please feel free to suggest what works best on your end. I'll also prepare a brief agenda in advance so we can make the most of our time together and leave with clear next steps.",
  },
  deadline: {
    professional: "Understood — I've noted the deadline and am adjusting priorities accordingly to ensure we deliver on time. I'll proactively communicate if anything arises that might affect our timeline.",
    friendly:     "Absolutely noted! I'll make sure we hit that deadline — no worries. I'll keep you posted as we get closer.",
    short:        "Noted — on it. I'll make sure we hit that deadline.",
    detailed:     "Thank you for the clarity on timing — I've noted the deadline and want to make sure we're fully aligned on what needs to be delivered by then. I'm reprioritising my schedule accordingly and will proactively communicate if anything might affect our ability to deliver on time. I'll send a brief delivery plan so you have full visibility.",
  },
  pricing: {
    professional: "Thank you for your interest in our pricing. I'll prepare a detailed and tailored breakdown that accurately reflects your specific requirements and scale.",
    friendly:     "Of course — happy to put together a pricing breakdown for you! I'll make sure it covers everything you need so there are no surprises.",
    short:        "Happy to send over pricing — I'll put together a breakdown for you shortly.",
    detailed:     "I appreciate you asking about pricing — I want to make sure the proposal I send accurately reflects your exact requirements. I'll prepare a detailed breakdown covering all components, including any applicable volume discounts, along with clear payment terms and timelines. I'll also include a comparison of plan options so you can choose what works best for your team.",
  },
  technical: {
    professional: "Thank you for reporting this — I'm escalating it immediately and will provide you with a resolution timeline as soon as possible.",
    friendly:     "Oh no, sorry about that! I'm jumping on this right now and will get it sorted out ASAP. I'll keep you updated throughout.",
    short:        "On it — looking into this right now and will update you shortly.",
    detailed:     "Thank you for the detailed report — technical issues like this are our top priority. I'm escalating this immediately and will investigate the root cause thoroughly. I'll provide a full update including a resolution timeline and root cause analysis. In the meantime, please let me know if there's a workaround that would help your team continue without interruption.",
  },
  general: {
    professional: "Thank you for your message. I've reviewed it carefully and will follow up with a comprehensive response to make sure all your points are addressed.",
    friendly:     "Thanks for reaching out! I'll get back to you with everything you need — appreciate you getting in touch.",
    short:        "Thanks for your message — I'll follow up shortly with more detail.",
    detailed:     "Thank you for reaching out — I've reviewed your message in full detail and want to make sure I provide you with a thorough and accurate response. I'll follow up shortly with everything you need and will make sure to address all the points you've raised.",
  },
};

function buildDraftContent(
  style:      DraftStyle,
  intent:     MessageIntent,
  clientName: string,
): string {
  const greeting = getGreeting(style, clientName);
  const body     = INTENT_CONTENT[intent][style];
  const closing  = getClosing(style);
  return `${greeting}${body}${closing}`;
}

// ── Confidence scoring ────────────────────────────────────────────────────────

function computeConfidence(
  input:  DraftGenerationInput,
  intent: MessageIntent,
): { score: number; reasoning: string[] } {
  let score = 52;
  const reasoning: string[] = [];

  const { messages, channel, clientName, subject, style } = input;
  const lastClientMsg = [...messages].reverse().find((m) => m.role === "client");
  const msgCount      = messages.length;
  const msgLen        = lastClientMsg?.content.length ?? 0;

  // Context richness
  if (msgCount >= 6) {
    score += 14;
    reasoning.push(`Rich context: ${msgCount} messages in this conversation`);
  } else if (msgCount >= 3) {
    score += 8;
    reasoning.push(`Moderate context: ${msgCount} messages available`);
  } else {
    reasoning.push("Limited context: early conversation");
  }

  // Last message length
  if (msgLen > 200) {
    score += 8;
    reasoning.push("Detailed message — enough content for a thorough draft");
  } else if (msgLen > 80) {
    score += 4;
    reasoning.push("Message has clear content to respond to");
  }

  // Clear intent
  if (intent !== "general") {
    score += 9;
    reasoning.push(`Clear intent detected: ${intent}`);
  } else {
    reasoning.push("General intent — using contextual defaults");
  }

  // Client name
  if (clientName && !clientName.startsWith("tg_client_") && !clientName.startsWith("Unknown")) {
    score += 5;
    reasoning.push(`Personalised for ${firstName(clientName)}`);
  }

  // Channel modifiers
  if (channel === "email") {
    score += 4;
    if (subject) {
      score += 4;
      reasoning.push(`Email thread context: "${subject}"`);
    } else {
      reasoning.push("Email channel: formal structure applied");
    }
  } else if (channel === "telegram") {
    score += 1;
    reasoning.push("Telegram channel: conversational format applied");
  } else if (channel === "whatsapp") {
    reasoning.push("WhatsApp channel: casual format applied");
  }

  // Style modifiers
  if (style === "short") {
    score += 5;
    reasoning.push("Short style: higher confidence — less to get wrong");
  } else if (style === "detailed") {
    score -= 3;
    reasoning.push("Detailed style: complex — verify all points are covered");
  } else {
    reasoning.push(`Reply style: ${style} — tone and length adjusted`);
  }

  // Floor / cap
  score = Math.min(99, Math.max(38, score));

  return { score, reasoning };
}

// ── Main generation function ──────────────────────────────────────────────────

/**
 * Generate an AI reply draft heuristically from conversation context.
 *
 * Production swap: replace the body with a call to /api/ai/draft
 * and unpack { content, confidence, reasoning } from the response.
 */
export function generateAIDraft(input: DraftGenerationInput): AIDraft {
  const { convId, channel, clientName, style, messages } = input;

  const lastClientMsg = [...messages].reverse().find((m) => m.role === "client");
  const intent        = detectIntent(lastClientMsg?.content ?? "");
  const content       = buildDraftContent(style, intent, clientName);
  const { score, reasoning } = computeConfidence(input, intent);

  return {
    id:          `draft_${convId}_${style}_${Date.now()}`,
    convId,
    style,
    channel: channel as DraftChannel,
    content,
    confidence:  score,
    reasoning,
    generatedAt: new Date().toISOString(),
    isDirty:     false,
  };
}

// ── localStorage persistence ──────────────────────────────────────────────────

const DRAFTS_KEY = "ventra_reply_drafts";

// Structure: { [convId]: { [style]: AIDraft } }
type DraftsStore = Record<string, Partial<Record<DraftStyle, AIDraft>>>;

function loadStore(): DraftsStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    return raw ? (JSON.parse(raw) as DraftsStore) : {};
  } catch { return {}; }
}

function persistStore(store: DraftsStore): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(store));
}

export function saveDraft(draft: AIDraft): void {
  const store = loadStore();
  if (!store[draft.convId]) store[draft.convId] = {};
  store[draft.convId]![draft.style] = draft;
  persistStore(store);
}

export function getDraft(convId: string, style: DraftStyle): AIDraft | null {
  return loadStore()[convId]?.[style] ?? null;
}

export function getDraftsForConv(convId: string): Partial<Record<DraftStyle, AIDraft>> {
  return loadStore()[convId] ?? {};
}

export function updateDraftContent(
  convId:        string,
  style:         DraftStyle,
  editedContent: string,
): void {
  const store    = loadStore();
  const existing = store[convId]?.[style];
  if (!existing) return;
  store[convId]![style] = { ...existing, editedContent, isDirty: true };
  persistStore(store);
}

export function clearDraftsForConv(convId: string): void {
  const store = loadStore();
  delete store[convId];
  persistStore(store);
}

// ── Send stubs (future real-message-sending integration) ──────────────────────

export type SendResult =
  | { success: true;  messageId: string }
  | { success: false; error: string };

/**
 * ⚠ STUB — not yet implemented.
 *
 * When wiring real sending:
 *   - Telegram  : POST /api/integrations/telegram/send  { chatId, text }
 *   - Email     : POST /api/integrations/gmail/send     { threadId, to, subject, body }
 *   - WhatsApp  : POST /api/integrations/whatsapp/send  { to, text }
 *
 * The `draft.channel` field discriminates which endpoint to call.
 * The `draft.editedContent ?? draft.content` is the final text to send.
 */
export async function sendDraft(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _draft:  AIDraft,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _convId: string,
): Promise<SendResult> {
  return { success: false, error: "Sending not yet implemented in this preview" };
}

// ── Channel label helpers ─────────────────────────────────────────────────────

export function sendButtonLabel(channel: DraftChannel): string {
  switch (channel) {
    case "telegram": return "Send to Telegram";
    case "email":    return "Send via Gmail";
    case "whatsapp": return "Send to WhatsApp";
  }
}

export function channelLabel(channel: DraftChannel): string {
  switch (channel) {
    case "telegram": return "Telegram";
    case "email":    return "Email";
    case "whatsapp": return "WhatsApp";
  }
}
