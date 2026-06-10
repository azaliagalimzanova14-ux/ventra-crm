import type { Client, Project, Task, Deal, CustomModule } from "./types";
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
