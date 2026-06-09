import type { Client, Project, Task, CustomModule } from "./types";
import { clients as defaultClients, projects as defaultProjects, tasks as defaultTasks } from "./mock-data";

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

const CUSTOM_MODULES_KEY = "ventra_custom_modules";

export function getCustomModules(): CustomModule[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(CUSTOM_MODULES_KEY);
  return raw ? (JSON.parse(raw) as CustomModule[]) : [];
}

export function saveCustomModules(modules: CustomModule[]): void {
  localStorage.setItem(CUSTOM_MODULES_KEY, JSON.stringify(modules));
}
