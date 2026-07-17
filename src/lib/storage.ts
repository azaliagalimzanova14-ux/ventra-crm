import type { Client, Project, Task, Deal, CustomModule, Activity, ClientStatus } from "./types";
import { matchClient, type ClientMatchResult } from "./client-matcher";
import { clients as defaultClients, projects as defaultProjects, tasks as defaultTasks, deals as defaultDeals } from "./mock-data";

const CLIENTS_KEY   = "nexus_crm_clients";
const PROJECTS_KEY  = "nexus_crm_projects";
const TASKS_KEY     = "nexus_crm_tasks";

export function getClients(): Client[] {
  if (typeof window === "undefined") return defaultClients;
  const raw = localStorage.getItem(CLIENTS_KEY);
  if (!raw) {
    localStorage.setItem(CLIENTS_KEY, JSON.stringify(defaultClients));
    return defaultClients;
  }
  return JSON.parse(raw) as Client[];
}

export function saveClients(clients: Client[]) {
  localStorage.setItem(CLIENTS_KEY, JSON.stringify(clients));
}

export function getProjects(): Project[] {
  if (typeof window === "undefined") return defaultProjects;
  const raw = localStorage.getItem(PROJECTS_KEY);
  if (!raw) {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(defaultProjects));
    return defaultProjects;
  }
  return JSON.parse(raw) as Project[];
}

export function saveProjects(projects: Project[]) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

export function getTasks(): Task[] {
  if (typeof window === "undefined") return defaultTasks;
  const raw = localStorage.getItem(TASKS_KEY);
  if (!raw) {
    localStorage.setItem(TASKS_KEY, JSON.stringify(defaultTasks));
    return defaultTasks;
  }
  return JSON.parse(raw) as Task[];
}

export function saveTasks(tasks: Task[]) {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

const DEALS_KEY = "ventra_deals";

export function getDeals(): Deal[] {
  if (typeof window === "undefined") return defaultDeals;
  const raw = localStorage.getItem(DEALS_KEY);
  if (!raw) {
    localStorage.setItem(DEALS_KEY, JSON.stringify(defaultDeals));
    return defaultDeals;
  }
  return JSON.parse(raw) as Deal[];
}

export function saveDeals(deals: Deal[]): void {
  localStorage.setItem(DEALS_KEY, JSON.stringify(deals));
}

// ── First-run onboarding ───────────────────────────────────────────────────────

const FIRST_RUN_KEY     = "ventra_first_run_done";
const BUSINESS_TYPE_KEY = "ventra_business_type";

export function isFirstRunDone(): boolean {
  if (typeof window === "undefined") return true;
  // Accept either the new key or the old onboarding key (for existing users)
  return (
    localStorage.getItem(FIRST_RUN_KEY) === "1" ||
    localStorage.getItem("ventra_onboarding_done") === "1"
  );
}

export function markFirstRunDone(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(FIRST_RUN_KEY, "1");
  localStorage.setItem("ventra_onboarding_done", "1"); // keep compat with old system
}

export function getBusinessType(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(BUSINESS_TYPE_KEY);
}

export function saveBusinessType(type: string): void {
  if (typeof window !== "undefined")
    localStorage.setItem(BUSINESS_TYPE_KEY, type);
}

export function resetOnboarding(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(FIRST_RUN_KEY);
  localStorage.removeItem("ventra_onboarding_done");
  localStorage.removeItem(BUSINESS_TYPE_KEY);
  localStorage.removeItem("ventra_setup_progress");
}

export function clearAllCRMData(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("nexus_crm_clients",  JSON.stringify([]));
  localStorage.setItem("nexus_crm_projects", JSON.stringify([]));
  localStorage.setItem("nexus_crm_tasks",    JSON.stringify([]));
  localStorage.setItem("ventra_deals",        JSON.stringify([]));
}

// Onboarding / setup progress
const ONBOARDING_KEY  = "ventra_onboarding_done";
const SETUP_KEY       = "ventra_setup_progress";

export function isOnboardingDone(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(ONBOARDING_KEY) === "1";
}

export function markOnboardingDone(): void {
  localStorage.setItem(ONBOARDING_KEY, "1");
}

export type SetupStep = "profile" | "client" | "project" | "task" | "pipeline";

export function getSetupProgress(): SetupStep[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(SETUP_KEY);
  return raw ? (JSON.parse(raw) as SetupStep[]) : [];
}

export function markSetupStep(step: SetupStep): void {
  const done = getSetupProgress();
  if (!done.includes(step)) {
    localStorage.setItem(SETUP_KEY, JSON.stringify([...done, step]));
  }
}

const CUSTOM_MODULES_KEY = "ventra_custom_modules";

export function getCustomModules(): CustomModule[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(CUSTOM_MODULES_KEY);
  return raw ? (JSON.parse(raw) as CustomModule[]) : [];
}

export function saveCustomModules(modules: CustomModule[]): void {
  localStorage.setItem(CUSTOM_MODULES_KEY, JSON.stringify(modules));
}

// ── Activity Event Log ─────────────────────────────────────────────────────────
// Stores real user actions as they happen. Capped at 50 events.

const ACTIVITY_LOG_KEY = "ventra_activity_log";

export function getActivityLog(): Activity[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(ACTIVITY_LOG_KEY);
  return raw ? (JSON.parse(raw) as Activity[]) : [];
}

export function logActivity(event: Omit<Activity, "id" | "timestamp">): void {
  if (typeof window === "undefined") return;
  const existing = getActivityLog();
  const entry: Activity = {
    ...event,
    id:        `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  };
  // Prepend newest, keep at most 50
  const updated = [entry, ...existing].slice(0, 50);
  localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(updated));
}

// ── Telegram client helpers ────────────────────────────────────────────────────

/**
 * Look up an existing CRM client by Telegram chat ID.
 * Checks both the deterministic ID and the telegramChatId field.
 */
export function findClientByTelegramChatId(chatId: number): Client | null {
  const chatIdStr = String(chatId);
  return (
    getClients().find(
      (c) =>
        c.id === `tg_client_${chatId}` ||
        c.telegramChatId === chatIdStr,
    ) ?? null
  );
}

/**
 * Find or auto-create a CRM Client from a Telegram conversation.
 *
 * Matching priority (runs when no existing Telegram link is found):
 *  1. @username match against telegramUsername / channelLinks.telegram
 *  2. Phone number (normalised)
 *  3. Email
 *  4. Name + company similarity
 *
 * Returns `{ client, isNew, wasMatched, matchResult }`:
 *   isNew=true,  wasMatched=false → new client created (no CRM match)
 *   isNew=false, wasMatched=false → already linked by chatId
 *   isNew=false, wasMatched=true  → linked to existing client via matching
 *
 * Note: The chatId → clientId mapping is persisted server-side in SQLite
 * (tg_client_links) by the Inbox SSE effect after this function resolves.
 * The Client object itself is stored in localStorage (the broader CRM data
 * layer). Migrate storage.ts to a server-side API when upgrading the CRM core.
 */
export function autoCreateTelegramClient(params: {
  chatId:          number;
  senderName:      string;
  senderUsername?: string;
  chatType:        string;
  firstMessageAt:  string;   // ISO 8601
  lastMessageAt:   string;   // ISO 8601
}): { client: Client; isNew: boolean; wasMatched: boolean; matchResult: ClientMatchResult | null } {
  const { chatId, senderName, senderUsername, chatType, firstMessageAt, lastMessageAt } = params;

  const all       = getClients();
  const chatIdStr = String(chatId);

  // ── Fast path: already linked by Telegram chatId ──────────────────────────
  const existing = all.find(
    (c) => c.id === `tg_client_${chatId}` || c.telegramChatId === chatIdStr,
  );

  if (existing) {
    if (lastMessageAt > (existing.lastContact ?? "")) {
      const updated = all.map((c) =>
        c.id === existing.id ? { ...c, lastContact: lastMessageAt } : c,
      );
      saveClients(updated);
      return { client: { ...existing, lastContact: lastMessageAt }, isNew: false, wasMatched: false, matchResult: null };
    }
    return { client: existing, isNew: false, wasMatched: false, matchResult: null };
  }

  // ── Run content-based matching ─────────────────────────────────────────────
  const matchResult = matchClient(
    { channel: "telegram", name: senderName, username: senderUsername },
    all,
  );

  if (matchResult) {
    // Link the matched client by writing its Telegram identifiers
    const linked: Client = {
      ...matchResult.client,
      telegramChatId:   chatIdStr,
      telegramUsername: senderUsername ?? matchResult.client.telegramUsername,
      lastContact:      lastMessageAt > (matchResult.client.lastContact ?? "")
        ? lastMessageAt
        : matchResult.client.lastContact,
      channelLinks: {
        ...matchResult.client.channelLinks,
        telegram: chatIdStr,
      },
    };
    saveClients(all.map((c) => c.id === linked.id ? linked : c));
    return { client: linked, isNew: false, wasMatched: true, matchResult };
  }

  // ── No match: create a new placeholder client ──────────────────────────────
  const nameParts = senderName.trim().split(/\s+/).filter(Boolean);
  const avatar    = nameParts
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "TG";

  const newClient: Client = {
    id:               `tg_client_${chatId}`,
    name:             senderName,
    company:          senderUsername ? `@${senderUsername}` : `Telegram · ${chatType}`,
    email:            "",
    phone:            "",
    avatar,
    status:           "lead" as ClientStatus,
    totalValue:       0,
    projectCount:     0,
    location:         "",
    industry:         "Telegram",
    joinedAt:         firstMessageAt,
    lastContact:      lastMessageAt,
    tags:             ["telegram"],
    telegramChatId:   chatIdStr,
    telegramUsername: senderUsername,
    channelLinks:     { telegram: chatIdStr },
  };

  saveClients([newClient, ...all]);
  return { client: newClient, isNew: true, wasMatched: false, matchResult: null };
}
