export type ModuleId =
  | "dashboard"
  | "clients"
  | "projects"
  | "tasks"
  | "pipeline"
  | "analytics"
  | "assistant"
  | "learning"
  | "finance"
  | "calls";

export interface ModuleDef {
  id: ModuleId;
  href: string;
  defaultEnabled: boolean;
  soon: boolean; // no page yet
}

export const ALL_MODULES: ModuleDef[] = [
  { id: "dashboard", href: "/dashboard", defaultEnabled: true,  soon: false },
  { id: "clients",   href: "/clients",   defaultEnabled: true,  soon: false },
  { id: "projects",  href: "/projects",  defaultEnabled: true,  soon: false },
  { id: "tasks",     href: "/tasks",     defaultEnabled: true,  soon: false },
  { id: "pipeline",  href: "/pipeline",  defaultEnabled: true,  soon: false },
  { id: "analytics", href: "/analytics", defaultEnabled: true,  soon: false },
  { id: "assistant", href: "/assistant", defaultEnabled: true,  soon: false },
  { id: "learning",  href: "/learning",  defaultEnabled: false, soon: true  },
  { id: "finance",   href: "/finance",   defaultEnabled: false, soon: true  },
  { id: "calls",     href: "/calls",     defaultEnabled: false, soon: true  },
];

export type ModuleVisibility = Record<ModuleId, boolean>;

const STORAGE_KEY = "ventra_modules";

function defaults(): ModuleVisibility {
  return Object.fromEntries(
    ALL_MODULES.map((m) => [m.id, m.defaultEnabled])
  ) as ModuleVisibility;
}

export function getModuleVisibility(): ModuleVisibility {
  if (typeof window === "undefined") return defaults();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaults();
  try {
    return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    return defaults();
  }
}

export function saveModuleVisibility(v: ModuleVisibility): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
}
