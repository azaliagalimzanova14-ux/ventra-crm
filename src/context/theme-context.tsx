"use client";

import {
  createContext, useContext, useEffect, useState, useCallback,
  type ReactNode,
} from "react";
import {
  getThemePrefs, saveThemePrefs, applyAccent,
  DEFAULT_WIDGETS,
  type ThemePrefs, type AccentColor, type IconStyle,
} from "@/lib/theme";

// ─── Context shape ────────────────────────────────────────────────────────────

interface ThemeContextValue {
  prefs:         ThemePrefs;
  setAccent:     (a: AccentColor)  => void;
  setIconStyle:  (s: IconStyle)    => void;
  setDashWidgets:(w: string[])     => void;
  /** strokeWidth to pass to all Lucide icons */
  sw: number;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<ThemePrefs>({
    accent: "blue", iconStyle: "outline", dashWidgets: [...DEFAULT_WIDGETS],
  });

  // Load + apply on mount
  useEffect(() => {
    const p = getThemePrefs();
    setPrefs(p);
    applyAccent(p.accent);
  }, []);

  const update = useCallback((patch: Partial<ThemePrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveThemePrefs(next);
      if (patch.accent) applyAccent(patch.accent);
      return next;
    });
  }, []);

  const setAccent     = useCallback((a: AccentColor) => update({ accent: a }),     [update]);
  const setIconStyle  = useCallback((s: IconStyle)   => update({ iconStyle: s }),  [update]);
  const setDashWidgets= useCallback((w: string[])    => update({ dashWidgets: w }), [update]);

  const sw = prefs.iconStyle === "solid" ? 2.5 : 1.75;

  return (
    <ThemeContext.Provider value={{ prefs, setAccent, setIconStyle, setDashWidgets, sw }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be inside ThemeProvider");
  return ctx;
}
