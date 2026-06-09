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
  type: "client_added" | "project_created" | "task_done" | "deal_won" | "deal_lost" | "message" | "invoice";
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
