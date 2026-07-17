// ── Auth (kept for existing auth system) ─────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string;
}

// ── CRM core types ────────────────────────────────────────────────────────────

export type ClientStatus = "active" | "inactive" | "lead" | "churned";
export type ProjectStatus = "planning" | "in_progress" | "review" | "completed" | "on_hold";
export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type DealStage = "lead" | "qualified" | "proposal" | "negotiation" | "closed_won" | "closed_lost";

export interface Client {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  avatar: string;
  status: ClientStatus;
  totalValue: number;
  projectCount: number;
  location: string;
  industry: string;
  joinedAt: string;
  lastContact: string;
  tags: string[];
  // Optional Telegram integration fields (Phase 4)
  telegramChatId?:   string;   // Telegram chat ID as string (avoids JS integer precision issues)
  telegramUsername?: string;   // Telegram @username without leading @

  /**
   * Channel-specific identifiers for future integrations.
   * Key = channel name ("telegram" | "whatsapp" | "email"),
   * Value = primary identifier for that channel.
   *
   * Examples:
   *   telegram → chatId string
   *   whatsapp → phone number (E.164)
   *   email    → email address
   *
   * Populated automatically when a conversation is matched/linked.
   */
  channelLinks?: Record<string, string>;

  // ── Ownership & assignment (Phase: Client Ownership) ──────────────────────
  /** Team member ID of the client owner */
  ownerId?:        string;
  /** Display name of the owner */
  ownerName?:      string;
  /** 2-letter initials of the owner */
  ownerAvatar?:    string;
  /** Team member ID of the assigned account manager */
  assignedId?:     string;
  /** Display name of the assigned account manager */
  assignedName?:   string;
  /** 2-letter initials of the assigned account manager */
  assignedAvatar?: string;
  /** Optional team label (free-form, e.g. "APAC Team") */
  teamLabel?:      string;
}

export interface Project {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  status: ProjectStatus;
  priority?: TaskPriority;
  progress: number;
  budget: number;
  spent: number;
  dueDate: string;
  startDate: string;
  description: string;
  taskCount: number;
  completedTasks: number;
  team: string[];
  tags: string[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string;
  projectName: string;
  clientName: string;
  assignee: string;
  assigneeAvatar: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  createdAt: string;
  tags: string[];
}

export interface Deal {
  id: string;
  title: string;
  clientName: string;
  clientAvatar: string;
  stage: DealStage;
  value: number;
  probability: number;
  expectedClose: string;
  owner: string;
}

export interface Activity {
  id: string;
  type: "client_added" | "client_updated" | "project_created" | "task_created" | "task_done" | "deal_won" | "deal_lost" | "deal_moved" | "message" | "invoice" | "telegram_message";
  title: string;
  description: string;
  timestamp: string;
  avatar?: string;
  meta?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// ── Custom modules ────────────────────────────────────────────────────────────

export type CustomModuleIconKey =
  | "bookmark" | "star" | "heart" | "flag"
  | "package" | "globe" | "layers" | "database"
  | "file-text" | "link" | "target" | "wrench"
  | "calendar" | "code" | "credit-card" | "hash"
  | "inbox" | "map" | "tag" | "zap";

export interface CustomModule {
  id: string;
  name: string;
  description: string;
  icon: CustomModuleIconKey;
  enabled: boolean;
  createdAt: string;
}

export interface AnalyticsData {
  revenue: { month: string; value: number; prev: number }[];
  clientGrowth: { month: string; value: number }[];
  projectsByStatus: { name: string; value: number; color: string }[];
  taskCompletion: { week: string; completed: number; total: number }[];
  topClients: { name: string; value: number; change: number }[];
}
