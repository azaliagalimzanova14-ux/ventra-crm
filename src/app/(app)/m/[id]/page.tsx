"use client";

import { use } from "react";
import Link from "next/link";
import { TopBar } from "@/components/layout/top-bar";
import { useModules } from "@/context/modules-context";
import { useLanguage } from "@/context/language-context";
import { getCustomModuleIcon } from "@/lib/custom-module-icons";
import { Settings, Sparkles } from "lucide-react";

export default function CustomModulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { customModules } = useModules();
  const { t } = useLanguage();

  const mod = customModules.find((m) => m.id === id);

  if (!mod) {
    return (
      <div className="flex flex-col flex-1">
        <TopBar title={t("custom_module_not_found")} />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center max-w-xs">
            <div className="w-14 h-14 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center">
              <Sparkles size={24} className="text-[var(--color-fg-faint)]" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-[var(--color-fg-muted)]">{t("custom_module_not_found")}</p>
              <p className="text-[12px] text-[var(--color-fg-faint)] mt-1">{t("custom_module_coming_sub")}</p>
            </div>
            <Link
              href="/settings"
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] text-[#8080a8] hover:text-white text-[13px] font-medium rounded-lg transition-colors"
            >
              <Settings size={14} />
              {t("nav_settings")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const Icon = getCustomModuleIcon(mod.icon);

  return (
    <div className="flex flex-col flex-1">
      <TopBar title={mod.name} subtitle={mod.description || undefined} />

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-6 text-center max-w-sm">
          {/* Icon */}
          <div className="w-20 h-20 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-xl shadow-indigo-500/10">
            <Icon size={36} className="text-indigo-400" />
          </div>

          {/* Title */}
          <div>
            <h2 className="text-[20px] font-semibold text-white">{mod.name}</h2>
            {mod.description && (
              <p className="text-[13px] text-[var(--color-fg-muted)] mt-1">{mod.description}</p>
            )}
          </div>

          {/* Coming soon card */}
          <div className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-2 justify-center">
              <span className="text-[10px] font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-md uppercase tracking-wide">
                {t("settings_modules_soon")}
              </span>
            </div>
            <p className="text-[15px] font-semibold text-white">{t("custom_module_coming")}</p>
            <p className="text-[13px] text-[var(--color-fg-muted)] leading-relaxed">{t("custom_module_coming_sub")}</p>
          </div>

          {/* Settings link */}
          <Link
            href="/settings"
            className="flex items-center gap-1.5 text-[13px] text-[var(--color-fg-muted)] hover:text-indigo-400 transition-colors"
          >
            <Settings size={13} />
            {t("nav_settings")} → {t("settings_tab_modules")}
          </Link>
        </div>
      </div>
    </div>
  );
}
