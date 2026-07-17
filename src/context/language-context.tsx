"use client";

/**
 * Language context — next-intl bridge.
 *
 * Architecture
 * ────────────
 * All components keep calling `const { t, lang, setLang } = useLanguage()` —
 * zero import changes needed in 16+ existing components.
 *
 * Internally:
 *   LanguageProvider
 *     └─ NextIntlClientProvider (locale + messages from JSON files)
 *         └─ IntlBridge  ← calls useTranslations() inside the provider
 *             └─ LanguageContext.Provider (exposes t / lang / setLang)
 *                 └─ {children}
 *
 * Per-workspace language: stored in localStorage as "ventra_lang_<workspaceId>".
 * Falls back to the global "ventra_lang" key for backwards compatibility.
 *
 * To add a new language:
 *   1. Create /locales/<code>.json with all TKey values.
 *   2. Add the code to the Lang union in src/lib/i18n.ts.
 *   3. Import the JSON below and add it to ALL_MESSAGES.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import type { Lang, TKey } from "@/lib/i18n";

import enMessages from "../../locales/en.json";
import ruMessages from "../../locales/ru.json";

// ── Message registry ──────────────────────────────────────────────────────────

const ALL_MESSAGES: Record<Lang, Record<string, string>> = {
  en: enMessages,
  ru: ruMessages,
};

// ── Context type ──────────────────────────────────────────────────────────────

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TKey) => string;
}

// Stable default (used before hydration / outside provider)
const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  setLang: () => {},
  t: (key) => enMessages[key] ?? key,
});

// ── Inner bridge — must live *inside* NextIntlClientProvider ──────────────────

function IntlBridge({
  lang,
  setLang,
  children,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  children: ReactNode;
}) {
  // useTranslations() is called here, inside NextIntlClientProvider
  const tIntl = useTranslations();
  const t = useCallback((key: TKey): string => tIntl(key), [tIntl]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

// ── Public provider ───────────────────────────────────────────────────────────

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Default is English — the application is international-first.
  const [lang, setLangState] = useState<Lang>("en");

  // Hydrate from localStorage (per-workspace key first, then global fallback)
  useEffect(() => {
    const workspaceId =
      typeof window !== "undefined"
        ? (localStorage.getItem("ventra_workspace_id") ?? "default")
        : "default";

    const perWorkspace = localStorage.getItem(
      `ventra_lang_${workspaceId}`,
    ) as Lang | null;
    const global = localStorage.getItem("ventra_lang") as Lang | null;
    const saved = perWorkspace ?? global;

    if (saved === "ru" || saved === "en") {
      setLangState(saved);
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    // Persist globally
    localStorage.setItem("ventra_lang", l);
    // Also persist per workspace
    const workspaceId =
      localStorage.getItem("ventra_workspace_id") ?? "default";
    localStorage.setItem(`ventra_lang_${workspaceId}`, l);
  }, []);

  return (
    <NextIntlClientProvider locale={lang} messages={ALL_MESSAGES[lang]}>
      <IntlBridge lang={lang} setLang={setLang}>
        {children}
      </IntlBridge>
    </NextIntlClientProvider>
  );
}

// ── Public hook ───────────────────────────────────────────────────────────────

export function useLanguage() {
  return useContext(LanguageContext);
}
