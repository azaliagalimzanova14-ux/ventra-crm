/**
 * src/lib/mtproto-business-filter.ts
 *
 * Heuristic AI filter for classifying Telegram dialogs as business vs personal.
 * Scores 0–100; threshold ≥ 45 → is_business = true.
 *
 * Inputs are plain objects (no GramJS types) so this module is safe to test
 * without a Telegram connection.
 */

import type { BusinessScore, PersonalPeerType } from "./mtproto-types";

// ── Pattern databases ─────────────────────────────────────────────────────────

const BUSINESS_TITLE_PATTERNS: RegExp[] = [
  /\b(LLC|Ltd|Corp|Inc|Co\.|GmbH|SAS|BV|AS|AB|Pty|PLC|OÜ)\b/i,
  /\b(Agency|Studio|Group|Team|Network|Community|Hub|Lab|Labs|Ventures|Solutions)\b/i,
  /\b(Support|Sales|Marketing|Finance|Legal|HR|Dev|Tech|Design|Creative)\b/i,
  /\b(Store|Shop|Market|Boutique|Brand|Media|PR|Consulting|Services)\b/i,
];

const PERSONAL_TITLE_PATTERNS: RegExp[] = [
  /\b(family|Familie|семья|familia)\b/i,
  /\b(friends|Freunde|друзья|amigos)\b/i,
  /\b(birthday|Geburtstag|день рождения)\b/i,
  /\b(home|haus|дом)\b/i,
  /^(Mom|Dad|Mum|Mama|Papa|Sis|Bro|Aunt|Uncle|Granny|Grandpa)/i,
];

const BUSINESS_USERNAME_SUFFIXES = [
  "_biz", "_co", "_team", "_official", "_support", "_sales",
  "_help", "_info", "_store", "_shop", "_media", "_agency",
];

const BUSINESS_KEYWORDS: string[] = [
  "invoice", "payment", "contract", "proposal", "meeting", "deadline",
  "project", "budget", "quote", "delivery", "agreement", "partnership",
  "collaboration", "services", "pricing", "offer", "deal", "client",
  "customer", "vendor", "supplier", "order", "shipment", "report",
  "presentation", "schedule", "appointment", "invoice", "receipt",
  "счёт", "оплата", "договор", "предложение", "встреча", "проект",
  "бюджет", "цена", "клиент", "заказ", "доставка", "отчёт",
];

const PERSONAL_KEYWORDS: string[] = [
  "haha", "lol", "lmao", "omg", "wtf", "btw", "imo", "fyi", "tbh",
  "ngl", "irl", "smh", "ikr", "idk", "afaik", "brb", "asap",
  "привет", "пока", "хахаха", "вечеринка", "вечер", "кафе",
];

// ── Input type (GramJS-agnostic) ──────────────────────────────────────────────

export interface DialogInput {
  title:          string;
  peerType:       PersonalPeerType;
  username?:      string;
  phone?:         boolean;  // true if has phone number
  recentMessages: string[]; // last N message texts (empty string for media)
  unreadCount:    number;
  lastActivityDaysAgo: number;
}

// ── Scorer ─────────────────────────────────────────────────────────────────────

export function scoreDialog(input: DialogInput): BusinessScore {
  let score = 0;
  const reasons: string[] = [];
  const title = input.title.trim();

  // ── Base by type ────────────────────────────────────────────────────────────
  if (input.peerType === "channel") score += 10;
  if (input.peerType === "chat" || input.peerType === "channel") score += 15;

  // ── Title patterns ──────────────────────────────────────────────────────────
  let titleHit = false;
  for (const pattern of BUSINESS_TITLE_PATTERNS) {
    if (pattern.test(title)) {
      score += 25;
      reasons.push(`Title matches business pattern`);
      titleHit = true;
      break;
    }
  }

  for (const pattern of PERSONAL_TITLE_PATTERNS) {
    if (pattern.test(title)) {
      score -= 40;
      reasons.push(`Title suggests personal chat`);
      break;
    }
  }

  // Emoji-heavy title → personal
  const emojiCount = (title.match(/\p{Emoji}/gu) ?? []).length;
  if (emojiCount >= 2) {
    score -= 10;
    reasons.push("Emoji-heavy title");
  }

  // ── Username ─────────────────────────────────────────────────────────────────
  if (input.username) {
    const lower = input.username.toLowerCase();
    const hasBizSuffix = BUSINESS_USERNAME_SUFFIXES.some((s) => lower.endsWith(s));
    if (hasBizSuffix) {
      score += 20;
      reasons.push(`Username @${input.username} matches business pattern`);
    }
  }

  // ── Phone number in profile ───────────────────────────────────────────────
  if (input.phone) {
    score += 8;
    reasons.push("Phone number visible in profile");
  }

  // ── Message analysis ───────────────────────────────────────────────────────
  const allText = input.recentMessages.join(" ").toLowerCase();

  if (allText.length > 0) {
    let bizHits = 0;
    for (const kw of BUSINESS_KEYWORDS) {
      if (allText.includes(kw)) bizHits++;
    }
    if (bizHits >= 4) {
      score += 30;
      reasons.push(`${bizHits} business keywords in recent messages`);
    } else if (bizHits >= 2) {
      score += 18;
      reasons.push(`Business keywords detected in messages`);
    } else if (bizHits >= 1) {
      score += 8;
      reasons.push(`Business keyword detected`);
    }

    let personalHits = 0;
    for (const kw of PERSONAL_KEYWORDS) {
      if (allText.includes(kw)) personalHits++;
    }
    if (personalHits >= 3) {
      score -= 20;
      reasons.push("Casual language in messages");
    }
  }

  // ── Activity recency ────────────────────────────────────────────────────────
  if (input.lastActivityDaysAgo <= 3) {
    score += 5;
  } else if (input.lastActivityDaysAgo > 60) {
    score -= 5;
  }

  // ── Private chat: single first name (no org indicators) → personal ──────────
  if (input.peerType === "user" && !titleHit) {
    const words = title.split(/\s+/).filter(Boolean);
    if (words.length === 1 && title.length < 12) {
      score -= 8;
    }
  }

  // ── Clamp and classify ─────────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, score));

  const confidence =
    score >= 65 ? "high"     :
    score >= 45 ? "medium"   :
    score >= 25 ? "low"      :
    "personal";

  return { score, confidence, reasons };
}

/** Returns true when the score meets the import threshold. */
export function isBusinessLikely(bs: BusinessScore): boolean {
  return bs.score >= 45;
}

/** Derive avatar initials from a chat title. */
export function toAvatarInitials(title: string): string {
  return title
    .replace(/[^\w\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "TG";
}
