/**
 * Client Matcher — channel-agnostic engine for linking incoming conversations
 * to existing CRM clients.
 *
 * ── Priority order ────────────────────────────────────────────────────────────
 *  1. Channel username / ID  (Telegram @username, exact — 99)
 *  2. Phone number           (normalised comparison   — 95)
 *  3. Email address          (case-insensitive exact  — 95)
 *  4. Name + company         (word-overlap similarity — 60–88)
 *
 * ── WhatsApp / Email readiness ────────────────────────────────────────────────
 *  MatchInput.channel controls which identifier fields are trusted.
 *  For WhatsApp: pass username = phone number (WhatsApp uses phone as ID).
 *  For Email:    pass email = sender address.
 *  The scoring tiers and `matchClient()` entry-point are unchanged.
 *
 * ── Confidence tiers ──────────────────────────────────────────────────────────
 *  exact  (90–99): auto-link silently
 *  strong (75–89): auto-link, show green badge
 *  likely (60–74): auto-link, show amber badge + invite confirmation
 *  none   (<60):   no match found
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Client } from "./types";

// ── Public types ───────────────────────────────────────────────────────────────

export type MatchChannel = "telegram" | "whatsapp" | "email";

export type MatchMethod =
  | "telegram_username"   // @username exact
  | "whatsapp_phone"      // WhatsApp phone == CRM phone
  | "email_address"       // email exact (case-insensitive)
  | "phone_number"        // CRM phone field normalised match
  | "name_and_company"    // both name + company similar
  | "name_only";          // name similar, company absent/unknown

export type MatchTier = "exact" | "strong" | "likely" | "none";

export interface ClientMatchResult {
  client:     Client;
  confidence: number;    // 0–99
  method:     MatchMethod;
  tier:       MatchTier;
  reasons:    string[];
}

/**
 * Contact info extracted from an incoming conversation.
 * Populate as many fields as the channel provides.
 *
 * WhatsApp: set username = phone number (WhatsApp uses phone as primary ID)
 * Email:    set email = sender address
 * Telegram: set username = @handle (without @), optionally phone if known
 */
export interface ClientMatchInput {
  channel:   MatchChannel;
  name:      string;       // Display name from the channel
  username?: string;       // Channel-specific handle (no leading @)
  phone?:    string;       // E.164 or any format — will be normalised
  email?:    string;       // Sender email address
  company?:  string;       // Company name if available
}

// ── Internal utilities ─────────────────────────────────────────────────────────

/**
 * Strip all non-digit characters, then normalise the country code.
 * "+1 (415) 555-0192" → "14155550192"
 * "0415 555 0192"     → "04155550192"
 */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Lowercase, trim, remove punctuation for comparison.
 */
function normalizeStr(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, "").trim();
}

/**
 * Split a normalised string into meaningful words, filtering stop-words.
 */
function words(s: string): string[] {
  const STOP = new Set(["the", "a", "an", "and", "or", "of", "at", "in", "for", "co", "llc", "ltd", "inc", "corp", "gmbh"]);
  return normalizeStr(s).split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
}

/**
 * Jaccard similarity over word sets: |A ∩ B| / |A ∪ B|.
 * Returns 0–1.
 */
function wordJaccard(a: string, b: string): number {
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  if (wa.size === 0 && wb.size === 0) return 1;
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  for (const w of wa) { if (wb.has(w)) inter++; }
  return inter / (wa.size + wb.size - inter);
}

/**
 * Bigram character similarity.
 * More forgiving of minor spelling differences than exact word match.
 */
function bigramSim(a: string, b: string): number {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return na === nb ? 1 : 0;
  const bigrams = (s: string) => {
    const bg = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const key = s[i] + s[i + 1];
      bg.set(key, (bg.get(key) ?? 0) + 1);
    }
    return bg;
  };
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let inter = 0;
  for (const [bg, cnt] of ba) { inter += Math.min(cnt, bb.get(bg) ?? 0); }
  return (2 * inter) / (na.length - 1 + (nb.length - 1));
}

/**
 * Combined name similarity: average of Jaccard + bigram, boosted for exact match.
 * Returns 0–1.
 */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (normalizeStr(a) === normalizeStr(b)) return 1;
  return (wordJaccard(a, b) + bigramSim(a, b)) / 2;
}

// ── Tier classifier ────────────────────────────────────────────────────────────

export function getTier(confidence: number): MatchTier {
  if (confidence >= 90) return "exact";
  if (confidence >= 75) return "strong";
  if (confidence >= 60) return "likely";
  return "none";
}

/** Human-readable label for a MatchMethod. */
export function getMethodLabel(method: MatchMethod): string {
  switch (method) {
    case "telegram_username": return "Telegram username";
    case "whatsapp_phone":    return "WhatsApp phone";
    case "email_address":     return "Email address";
    case "phone_number":      return "Phone number";
    case "name_and_company":  return "Name & company";
    case "name_only":         return "Name match";
  }
}

// ── Core matching logic ────────────────────────────────────────────────────────

/**
 * Match an incoming conversation contact against the CRM client list.
 *
 * Returns the best match found, or null if confidence < 60.
 * Caller is responsible for deciding whether to auto-link or show a prompt.
 */
export function matchClient(
  input:   ClientMatchInput,
  clients: Client[],
): ClientMatchResult | null {
  let best: ClientMatchResult | null = null;

  for (const client of clients) {
    const result = scoreClient(input, client);
    if (result && (!best || result.confidence > best.confidence)) {
      best = result;
    }
  }

  return best && best.confidence >= 60 ? best : null;
}

function scoreClient(
  input:  ClientMatchInput,
  client: Client,
): ClientMatchResult | null {
  // ── Priority 1: Telegram username ─────────────────────────────────────────
  if (input.channel === "telegram" && input.username) {
    const clientHandle = client.telegramUsername?.toLowerCase().replace(/^@/, "");
    const inputHandle  = input.username.toLowerCase().replace(/^@/, "");
    if (clientHandle && inputHandle && clientHandle === inputHandle) {
      return {
        client, confidence: 99, method: "telegram_username", tier: "exact",
        reasons: [`Telegram username @${input.username} matches CRM record`],
      };
    }
    // Also check channelLinks
    const linked = client.channelLinks?.["telegram"];
    if (linked && linked === inputHandle) {
      return {
        client, confidence: 99, method: "telegram_username", tier: "exact",
        reasons: [`Telegram handle matches channelLinks`],
      };
    }
  }

  // ── Priority 1b: WhatsApp phone as username ────────────────────────────────
  if (input.channel === "whatsapp" && input.username) {
    const norm = normalizePhone(input.username);
    const clientWa = client.channelLinks?.["whatsapp"];
    if (clientWa && normalizePhone(clientWa) === norm) {
      return {
        client, confidence: 99, method: "whatsapp_phone", tier: "exact",
        reasons: [`WhatsApp phone ${input.username} matches CRM record`],
      };
    }
  }

  // ── Priority 2: Phone number ───────────────────────────────────────────────
  if (input.phone && client.phone) {
    const normIn = normalizePhone(input.phone);
    const normCl = normalizePhone(client.phone);
    if (normIn.length >= 7 && normCl.length >= 7) {
      // Match on last 9 digits to handle country code variations
      const trailIn = normIn.slice(-9);
      const trailCl = normCl.slice(-9);
      if (trailIn === trailCl) {
        return {
          client, confidence: 95, method: "phone_number", tier: "exact",
          reasons: [`Phone number ${input.phone} matches CRM record`],
        };
      }
    }
  }

  // ── Priority 3: Email address ──────────────────────────────────────────────
  if (input.email && client.email) {
    if (input.email.toLowerCase() === client.email.toLowerCase()) {
      return {
        client, confidence: 95, method: "email_address", tier: "exact",
        reasons: [`Email ${input.email} matches CRM record`],
      };
    }
    // Also check channelLinks for email channel
    if (input.channel === "email") {
      const linked = client.channelLinks?.["email"];
      if (linked && linked.toLowerCase() === input.email.toLowerCase()) {
        return {
          client, confidence: 95, method: "email_address", tier: "exact",
          reasons: [`Email matches channelLinks`],
        };
      }
    }
  }

  // ── Priority 4: Name + company similarity ─────────────────────────────────
  const nameSim = nameSimilarity(input.name, client.name);
  if (nameSim < 0.55) return null; // fast exit — name too dissimilar

  const reasons: string[] = [];

  // Name alone
  const nameScore =
    nameSim >= 1.0 ? 78 :
    nameSim >= 0.9 ? 74 :
    nameSim >= 0.8 ? 68 :
    nameSim >= 0.7 ? 62 :
    nameSim >= 0.6 ? 56 : 0;

  if (nameScore === 0) return null;
  reasons.push(`Name similarity ${Math.round(nameSim * 100)}%`);

  // Company boost
  let companyBoost = 0;
  if (input.company && client.company) {
    const compSim = nameSimilarity(input.company, client.company);
    if (compSim >= 0.8) {
      companyBoost = 12;
      reasons.push(`Company "${client.company}" matches`);
    } else if (compSim >= 0.6) {
      companyBoost = 6;
      reasons.push(`Company "${client.company}" partially matches`);
    }
  }

  const confidence = Math.min(nameScore + companyBoost, 89);
  if (confidence < 60) return null;

  const method: MatchMethod = companyBoost > 0 ? "name_and_company" : "name_only";
  return { client, confidence, method, tier: getTier(confidence), reasons };
}

// ── Bulk matching (for import flows) ─────────────────────────────────────────

export interface BulkMatchResult {
  matched:   { input: ClientMatchInput; result: ClientMatchResult }[];
  unmatched: ClientMatchInput[];
}

/**
 * Match a list of contacts against the CRM client list in one pass.
 * Used by the import flow to show "X matched / Y new" stats.
 */
export function bulkMatchClients(
  inputs:  ClientMatchInput[],
  clients: Client[],
): BulkMatchResult {
  const matched:   BulkMatchResult["matched"]   = [];
  const unmatched: ClientMatchInput[]            = [];

  for (const input of inputs) {
    const result = matchClient(input, clients);
    if (result) {
      matched.push({ input, result });
    } else {
      unmatched.push(input);
    }
  }

  return { matched, unmatched };
}
