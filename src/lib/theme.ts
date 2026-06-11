// ─── Theme types ──────────────────────────────────────────────────────────────

export type AccentColor = "blue" | "violet" | "emerald" | "orange" | "rose";
export type IconStyle   = "outline" | "solid";

export interface ThemePrefs {
  accent:       AccentColor;
  iconStyle:    IconStyle;
  /** Ordered list of visible dashboard widget IDs */
  dashWidgets:  string[];
}

// ─── Accent palettes ──────────────────────────────────────────────────────────

export const ACCENT_PALETTES: Record<AccentColor, { color: string; hover: string; subtle: string; fg: string }> = {
  blue:    { color: "#2563eb", hover: "#1d4ed8", subtle: "#dbeafe", fg: "#1e40af" },
  violet:  { color: "#7c3aed", hover: "#6d28d9", subtle: "#ede9fe", fg: "#5b21b6" },
  emerald: { color: "#059669", hover: "#047857", subtle: "#d1fae5", fg: "#065f46" },
  orange:  { color: "#ea580c", hover: "#c2410c", subtle: "#ffedd5", fg: "#9a3412" },
  rose:    { color: "#e11d48", hover: "#be123c", subtle: "#ffe4e6", fg: "#9f1239" },
};

// ─── Default widget order ─────────────────────────────────────────────────────

export const DEFAULT_WIDGETS: string[] = [
  "kpi",
  "revenue",
  "insights_activity",
  "pipeline_tasks",
  "deals_table",
];

export const WIDGET_LABELS: Record<string, string> = {
  kpi:              "KPI Cards",
  revenue:          "Revenue + Top Clients",
  insights_activity:"AI Insights + Activity",
  pipeline_tasks:   "Pipeline + Tasks",
  deals_table:      "All Deals Table",
};

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = "ventra_theme";

export function getThemePrefs(): ThemePrefs {
  if (typeof window === "undefined") return defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...(JSON.parse(raw) as Partial<ThemePrefs>) };
  } catch {
    return defaults();
  }
}

export function saveThemePrefs(prefs: ThemePrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

function defaults(): ThemePrefs {
  return { accent: "blue", iconStyle: "outline", dashWidgets: [...DEFAULT_WIDGETS] };
}

// ─── CSS injection ────────────────────────────────────────────────────────────

export function applyAccent(accent: AccentColor): void {
  if (typeof document === "undefined") return;
  const p = ACCENT_PALETTES[accent];
  const r = document.documentElement.style;
  r.setProperty("--color-accent",        p.color);
  r.setProperty("--color-accent-hover",  p.hover);
  r.setProperty("--color-accent-subtle", p.subtle);
  r.setProperty("--color-accent-fg",     p.fg);
}
