/**
 * Gmail Integration — types, mock OAuth flow, thread storage, import helpers.
 *
 * ── Gmail OAuth Roadmap ──────────────────────────────────────────────────────
 *
 * Every async function is currently a STUB that simulates the OAuth dance.
 * When integrating real Gmail OAuth:
 *
 *   1. initiateGmailOAuth()  →  redirect to https://accounts.google.com/o/oauth2/v2/auth
 *      with scopes: gmail.readonly + gmail.metadata
 *
 *   2. handleGmailOAuthCallback(code) → exchange code for tokens via
 *      POST https://oauth2.googleapis.com/token (server-side only!)
 *
 *   3. fetchEmailThreads(accessToken) → GET https://gmail.googleapis.com/gmail/v1/users/me/threads
 *      with ?labelIds=INBOX&maxResults=50
 *
 *   4. fetchThreadMessages(threadId, accessToken) → GET
 *      https://gmail.googleapis.com/gmail/v1/users/me/threads/{threadId}?format=full
 *
 * Outlook-ready: EmailProviderType discriminates provider-specific logic.
 * Outlook swap: replace Google endpoints with MS Graph API equivalents.
 * All types/storage helpers are provider-agnostic.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { bulkMatchClients } from "./client-matcher";
import { getClients } from "./storage";

// ── Provider type ─────────────────────────────────────────────────────────────

/** Discriminates Gmail vs future Outlook integration. */
export type EmailProviderType = "gmail" | "outlook";

// ── Core types ─────────────────────────────────────────────────────────────────

/** A single email message within a thread. */
export interface GmailMessage {
  id:          string;      // Gmail message ID
  threadId:    string;      // Parent thread ID
  from:        string;      // Sender name + email: "Name <email@example.com>"
  fromEmail:   string;      // Parsed sender email address
  fromName:    string;      // Parsed sender display name
  to:          string;      // Recipient(s)
  subject:     string;
  snippet:     string;      // Gmail-style snippet (first ~100 chars)
  body:        string;      // Plain text body (trimmed)
  date:        string;      // ISO 8601
  isRead:      boolean;
  labels:      string[];    // Gmail label IDs
}

/** A Gmail thread = grouped conversation. Maps to a Ventra Inbox conversation. */
export interface GmailThread {
  id:            string;      // Gmail thread ID
  subject:       string;
  snippet:       string;      // Last message snippet
  messageCount:  number;
  messages:      GmailMessage[];
  participants:  string[];    // All unique sender emails
  lastDate:      string;      // ISO 8601 of most recent message
  firstDate:     string;      // ISO 8601 of oldest message
  isRead:        boolean;
  labels:        string[];    // Union of all message labels
  // ── CRM link (set after client matching) ──────────────────────────────────
  clientId?:     string;
  wasMatched?:   boolean;
}

/** User's Gmail profile, fetched after OAuth. */
export interface GmailProfile {
  email:       string;
  name:        string;
  picture?:    string;
  provider:    EmailProviderType;
}

/** Config passed to the import function. */
export interface GmailImportConfig {
  provider:         EmailProviderType;
  maxThreads:       number;      // How many threads to import
  includeLabels:    string[];    // e.g. ["INBOX", "SENT"] — empty = all
  excludeLabels:    string[];    // e.g. ["SPAM", "TRASH"]
  sinceDate?:       string;      // ISO 8601 — only threads newer than this
}

/** Post-import summary. */
export interface GmailImportResult {
  provider:              EmailProviderType;
  threadsImported:       number;
  clientsMatched:        number;
  clientsCreated:        number;
  tasksSuggested:        number;
  dealsDetected:         number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

/** Parse "Name <email>" or bare "email" into { name, email }. */
export function parseEmailAddress(raw: string): { name: string; email: string } {
  const m = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: raw.trim().split("@")[0], email: raw.trim() };
}

// ── Mock email thread data ────────────────────────────────────────────────────
//
// Represents a realistic Gmail inbox for a small business owner.
// OAuth swap: replace with real thread objects from Gmail API.

export const MOCK_EMAIL_THREADS: GmailThread[] = [
  {
    id:           "thread_001",
    subject:      "Re: Project proposal — Q3 design sprint",
    snippet:      "Looks great! Let me review the timeline and get back to you by Friday.",
    messageCount: 4,
    lastDate:     hoursAgo(2),
    firstDate:    daysAgo(5),
    isRead:       false,
    labels:       ["INBOX"],
    participants: ["sarah.chen@bloomcreative.co"],
    messages: [
      {
        id:        "msg_001a",
        threadId:  "thread_001",
        from:      "Sarah Chen <sarah.chen@bloomcreative.co>",
        fromEmail: "sarah.chen@bloomcreative.co",
        fromName:  "Sarah Chen",
        to:        "me@ventra.app",
        subject:   "Re: Project proposal — Q3 design sprint",
        snippet:   "Looks great! Let me review the timeline and get back to you by Friday.",
        body:      "Hi,\n\nLooks great! Let me review the timeline and get back to you by Friday. One thing — can you break down the deliverables for Phase 2? We want to make sure the dev team is aligned before we sign off.\n\nThanks,\nSarah",
        date:      hoursAgo(2),
        isRead:    false,
        labels:    ["INBOX"],
      },
    ],
  },
  {
    id:           "thread_002",
    subject:      "Invoice #1042 — payment confirmation",
    snippet:      "Payment of $4,200 received. Thank you for your business!",
    messageCount: 2,
    lastDate:     hoursAgo(5),
    firstDate:    daysAgo(2),
    isRead:       true,
    labels:       ["INBOX"],
    participants: ["billing@acmecorp.io"],
    messages: [
      {
        id:        "msg_002a",
        threadId:  "thread_002",
        from:      "Acme Corp Billing <billing@acmecorp.io>",
        fromEmail: "billing@acmecorp.io",
        fromName:  "Acme Corp Billing",
        to:        "me@ventra.app",
        subject:   "Invoice #1042 — payment confirmation",
        snippet:   "Payment of $4,200 received. Thank you for your business!",
        body:      "Hi,\n\nThis email confirms that payment of $4,200 has been received for Invoice #1042 dated June 28, 2026. Please keep this for your records.\n\nBest,\nAcme Corp Finance",
        date:      hoursAgo(5),
        isRead:    true,
        labels:    ["INBOX"],
      },
    ],
  },
  {
    id:           "thread_003",
    subject:      "Following up — enterprise pricing",
    snippet:      "Hi, just wanted to check in on the enterprise tier pricing we discussed last week.",
    messageCount: 3,
    lastDate:     daysAgo(1),
    firstDate:    daysAgo(7),
    isRead:       false,
    labels:       ["INBOX"],
    participants: ["marcus.rivera@techventures.io"],
    messages: [
      {
        id:        "msg_003a",
        threadId:  "thread_003",
        from:      "Marcus Rivera <marcus.rivera@techventures.io>",
        fromEmail: "marcus.rivera@techventures.io",
        fromName:  "Marcus Rivera",
        to:        "me@ventra.app",
        subject:   "Following up — enterprise pricing",
        snippet:   "Hi, just wanted to check in on the enterprise tier pricing we discussed last week.",
        body:      "Hi,\n\nJust wanted to circle back on the enterprise pricing conversation we had last Tuesday. Our team is ready to move forward with the 50-seat plan if we can agree on terms. Can we schedule a call this week to finalize?\n\nBest,\nMarcus",
        date:      daysAgo(1),
        isRead:    false,
        labels:    ["INBOX"],
      },
    ],
  },
  {
    id:           "thread_004",
    subject:      "Contract review — NDA for new partnership",
    snippet:      "Please find the attached NDA for your review. Let us know if any changes are needed.",
    messageCount: 1,
    lastDate:     daysAgo(2),
    firstDate:    daysAgo(2),
    isRead:       true,
    labels:       ["INBOX"],
    participants: ["legal@priyaconsulting.in"],
    messages: [
      {
        id:        "msg_004a",
        threadId:  "thread_004",
        from:      "Priya Nair <legal@priyaconsulting.in>",
        fromEmail: "legal@priyaconsulting.in",
        fromName:  "Priya Nair",
        to:        "me@ventra.app",
        subject:   "Contract review — NDA for new partnership",
        snippet:   "Please find the attached NDA for your review. Let us know if any changes are needed.",
        body:      "Hi,\n\nPlease find the attached NDA for the proposed partnership. We'd like to proceed quickly — can you review and sign by end of next week?\n\nLet me know if any clauses need adjustment.\n\nRegards,\nPriya",
        date:      daysAgo(2),
        isRead:    true,
        labels:    ["INBOX"],
      },
    ],
  },
  {
    id:           "thread_005",
    subject:      "Q3 onboarding — new team member starting Monday",
    snippet:      "James will be joining the project as lead developer. Can you prep access for him?",
    messageCount: 2,
    lastDate:     daysAgo(3),
    firstDate:    daysAgo(5),
    isRead:       true,
    labels:       ["INBOX"],
    participants: ["james.okafor@devforce.co"],
    messages: [
      {
        id:        "msg_005a",
        threadId:  "thread_005",
        from:      "James Okafor <james.okafor@devforce.co>",
        fromEmail: "james.okafor@devforce.co",
        fromName:  "James Okafor",
        to:        "me@ventra.app",
        subject:   "Q3 onboarding — new team member starting Monday",
        snippet:   "James will be joining the project as lead developer. Can you prep access for him?",
        body:      "Hi,\n\nI will be starting as lead developer on the project this Monday. Could you set up repository access and send over the project documentation before then? Also, can we schedule a kickoff call for Monday afternoon?\n\nThanks,\nJames",
        date:      daysAgo(3),
        isRead:    true,
        labels:    ["INBOX"],
      },
    ],
  },
  {
    id:           "thread_006",
    subject:      "Product feedback — beta test round 2",
    snippet:      "The new dashboard is much cleaner. A few UX notes attached.",
    messageCount: 5,
    lastDate:     daysAgo(4),
    firstDate:    daysAgo(10),
    isRead:       true,
    labels:       ["INBOX"],
    participants: ["elena.volkova@uxlab.eu"],
    messages: [
      {
        id:        "msg_006a",
        threadId:  "thread_006",
        from:      "Elena Volkova <elena.volkova@uxlab.eu>",
        fromEmail: "elena.volkova@uxlab.eu",
        fromName:  "Elena Volkova",
        to:        "me@ventra.app",
        subject:   "Product feedback — beta test round 2",
        snippet:   "The new dashboard is much cleaner. A few UX notes attached.",
        body:      "Hi,\n\nCompleted the second round of beta testing. Overall the improvements are significant. The dashboard navigation is much cleaner. I have attached a notes doc with 8 specific UX items — most are minor, but item 4 (modal accessibility) should be addressed before launch.\n\nHappy to jump on a call to walk through them.\n\nElena",
        date:      daysAgo(4),
        isRead:    true,
        labels:    ["INBOX"],
      },
    ],
  },
  {
    id:           "thread_007",
    subject:      "Partnership proposal — co-marketing opportunity",
    snippet:      "We think there's a strong fit between our audiences. Would love to explore a joint webinar.",
    messageCount: 2,
    lastDate:     daysAgo(5),
    firstDate:    daysAgo(8),
    isRead:       false,
    labels:       ["INBOX"],
    participants: ["amara.diallo@growthlab.africa"],
    messages: [
      {
        id:        "msg_007a",
        threadId:  "thread_007",
        from:      "Amara Diallo <amara.diallo@growthlab.africa>",
        fromEmail: "amara.diallo@growthlab.africa",
        fromName:  "Amara Diallo",
        to:        "me@ventra.app",
        subject:   "Partnership proposal — co-marketing opportunity",
        snippet:   "We think there's a strong fit between our audiences. Would love to explore a joint webinar.",
        body:      "Hi,\n\nI came across your work and think there's a compelling overlap between our communities. We're proposing a joint webinar series targeting early-stage B2B founders. Our list is ~8k subscribers. Would you be open to a quick call to explore the fit?\n\nBest,\nAmara",
        date:      daysAgo(5),
        isRead:    false,
        labels:    ["INBOX"],
      },
    ],
  },
  {
    id:           "thread_008",
    subject:      "Re: Annual subscription renewal",
    snippet:      "We'd like to renew for another year. Can you send over the updated pricing?",
    messageCount: 3,
    lastDate:     daysAgo(6),
    firstDate:    daysAgo(14),
    isRead:       true,
    labels:       ["INBOX"],
    participants: ["alex.morgan@startupstudio.io"],
    messages: [
      {
        id:        "msg_008a",
        threadId:  "thread_008",
        from:      "Alex Morgan <alex.morgan@startupstudio.io>",
        fromEmail: "alex.morgan@startupstudio.io",
        fromName:  "Alex Morgan",
        to:        "me@ventra.app",
        subject:   "Re: Annual subscription renewal",
        snippet:   "We'd like to renew for another year. Can you send over the updated pricing?",
        body:      "Hi,\n\nOur annual subscription is coming up for renewal next month. We're happy with the service and would like to renew. Could you send over updated pricing for the team plan (we've grown from 4 to 9 users)?\n\nThanks,\nAlex",
        date:      daysAgo(6),
        isRead:    true,
        labels:    ["INBOX"],
      },
    ],
  },
];

// ── Import stages (for animated progress) ────────────────────────────────────

export const EMAIL_IMPORT_STAGES: string[] = [
  "Connecting to Gmail…",
  "Fetching email threads…",
  "Matching existing contacts…",
  "Running AI analysis…",
  "Detecting tasks and deals…",
];

// ── Mock import result ─────────────────────────────────────────────────────────
//
// Runs real client matching against localStorage clients so the "matched" count
// reflects the current CRM state.

export function getMockEmailImportResult(
  config:  GmailImportConfig,
  threads: GmailThread[],
): GmailImportResult {
  // Extract one input per thread (use the first external sender)
  const crmClients = getClients();
  const inputs = threads.map((t) => {
    const { name, email } = parseEmailAddress(t.participants[0] ?? "");
    return { channel: "email" as const, name, email };
  });

  const { matched, unmatched } = bulkMatchClients(inputs, crmClients);

  const threadsImported = Math.min(threads.length, config.maxThreads);
  const ratio = Math.min(threadsImported / Math.max(threads.length, 1), 1);

  return {
    provider:        config.provider,
    threadsImported,
    clientsMatched:  matched.length,
    clientsCreated:  unmatched.length,
    tasksSuggested:  Math.max(0, Math.round(6 * ratio)),
    dealsDetected:   Math.max(0, Math.round(3 * ratio)),
  };
}

// ── localStorage persistence ───────────────────────────────────────────────────

const GMAIL_CONNECTION_KEY = "ventra_gmail_connection";
const GMAIL_THREADS_KEY    = "ventra_gmail_threads";

// ── Connection record (mirrors IntegrationConnection shape) ──────────────────

export interface GmailConnection {
  channel:      "email";
  provider:     EmailProviderType;
  displayName:  string;    // e.g. "ventra@gmail.com"
  connectedAt:  string;    // ISO 8601
  isMock:       boolean;
  metadata:     Record<string, string>;
}

/**
 * ⚠ DEV ONLY: Returns the stored Gmail connection or null.
 */
export function getGmailConnection(): GmailConnection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(GMAIL_CONNECTION_KEY);
    return raw ? (JSON.parse(raw) as GmailConnection) : null;
  } catch { return null; }
}

/**
 * ⚠ DEV ONLY: Save a Gmail connection record.
 */
export function saveGmailConnection(conn: GmailConnection): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(GMAIL_CONNECTION_KEY, JSON.stringify(conn));
}

/**
 * Remove the Gmail connection.
 */
export function disconnectGmail(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(GMAIL_CONNECTION_KEY);
  localStorage.removeItem(GMAIL_THREADS_KEY);
}

// ── Thread storage ────────────────────────────────────────────────────────────

/**
 * ⚠ DEV ONLY: Persist imported Gmail threads to localStorage.
 */
export function saveEmailThreads(threads: GmailThread[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(GMAIL_THREADS_KEY, JSON.stringify(threads));
}

/**
 * ⚠ DEV ONLY: Load imported Gmail threads from localStorage.
 */
export function getStoredEmailThreads(): GmailThread[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GMAIL_THREADS_KEY);
    return raw ? (JSON.parse(raw) as GmailThread[]) : [];
  } catch { return []; }
}

// ── Mock OAuth flow ───────────────────────────────────────────────────────────

/**
 * Simulate initiating the Google OAuth redirect.
 * OAuth swap: redirect to https://accounts.google.com/o/oauth2/v2/auth
 */
export function initiateGmailOAuth(): Promise<{ authUrl: string; state: string }> {
  return Promise.resolve({
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth?scope=gmail.readonly&mock=1",
    state:   `ventra_oauth_${Date.now()}`,
  });
}

/**
 * Simulate completing OAuth with a code.
 * OAuth swap: exchange code for access_token via server-side POST to token endpoint.
 * ⚠ NEVER expose the access_token in the browser; store server-side.
 */
export async function completeGmailOAuth(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _code:  string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _state: string,
): Promise<GmailProfile> {
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 800));
  return {
    email:    "ventra.crm.ai@gmail.com",
    name:     "Ventra CRM",
    provider: "gmail",
  };
}

/**
 * Full mock import: simulate fetching threads, running matching, persisting.
 * Returns the import result for displaying in the "complete" step.
 */
export async function runMockEmailImport(
  profile: GmailProfile,
  onStage?: (stage: string, index: number) => void,
): Promise<GmailImportResult> {
  const config: GmailImportConfig = {
    provider:      profile.provider,
    maxThreads:    MOCK_EMAIL_THREADS.length,
    includeLabels: ["INBOX"],
    excludeLabels: ["SPAM", "TRASH"],
  };

  // Simulate staged progress
  for (let i = 0; i < EMAIL_IMPORT_STAGES.length; i++) {
    onStage?.(EMAIL_IMPORT_STAGES[i], i);
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
  }

  const result = getMockEmailImportResult(config, MOCK_EMAIL_THREADS);

  // Persist threads and connection
  saveEmailThreads(MOCK_EMAIL_THREADS);
  saveGmailConnection({
    channel:     "email",
    provider:    profile.provider,
    displayName: profile.email,
    connectedAt: new Date().toISOString(),
    isMock:      true,
    metadata:    { profileName: profile.name },
  });

  return result;
}
