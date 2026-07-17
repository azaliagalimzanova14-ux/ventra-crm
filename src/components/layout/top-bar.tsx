"use client";

import { Search, Plus, Command, Menu } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { useSidebar } from "@/context/sidebar-context";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";

interface TopBarProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    label:   string;
    icon?:   React.ElementType;
    onClick: () => void;
  };
}

export function TopBar({ title, subtitle, action, secondaryAction }: TopBarProps) {
  const { lang, setLang, t } = useLanguage();
  const { toggle } = useSidebar();
  const { sw } = useTheme();

  return (
    <header className="h-14 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between px-4 md:px-6 sticky top-0 z-40 flex-shrink-0">

      {/* Left: hamburger + title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={toggle}
          className="md:hidden p-1.5 rounded-lg text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] transition-colors flex-shrink-0"
          aria-label="Toggle menu"
        >
          <Menu size={17} strokeWidth={sw} />
        </button>

        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold text-[var(--color-fg)] leading-tight truncate">{title}</h1>
          {subtitle && (
            <p className="text-[11px] text-[var(--color-fg-faint)] leading-tight truncate">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Right: search + lang + action */}
      <div className="flex items-center gap-2 flex-shrink-0">

        {/* Search */}
        <button className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg text-[12px] text-[var(--color-fg-muted)] hover:border-[var(--color-accent-subtle)] hover:text-[var(--color-fg)] transition-colors w-48 group">
          <Search size={12} className="text-[var(--color-fg-faint)]" />
          <span className="flex-1 text-left">{t("search_placeholder")}</span>
          <span className="flex items-center gap-0.5 bg-[var(--color-border)] px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--color-fg-faint)]">
            <Command size={8} />K
          </span>
        </button>

        {/* Language toggle */}
        <div className="flex items-center bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg p-0.5 gap-px">
          {(["ru", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={cn(
                "px-2 py-1 rounded-md text-[11px] font-semibold transition-colors uppercase",
                lang === l
                  ? "bg-[var(--color-accent)] text-white shadow-sm"
                  : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
              )}
            >
              {l}
            </button>
          ))}
        </div>

        {secondaryAction && (() => {
          const SecIcon = secondaryAction.icon;
          return (
            <button
              onClick={secondaryAction.onClick}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] bg-[var(--color-canvas)] hover:bg-[var(--color-accent-subtle)] text-[var(--color-fg-muted)] hover:text-[var(--color-accent)] text-[13px] font-medium rounded-lg transition-colors"
            >
              {SecIcon && <SecIcon size={14} strokeWidth={2} />}
              <span className="hidden sm:inline">{secondaryAction.label}</span>
            </button>
          );
        })()}

        {action && (
          <button
            onClick={action.onClick}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[13px] font-medium rounded-lg transition-colors shadow-sm"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span className="hidden sm:inline">{action.label}</span>
          </button>
        )}
      </div>
    </header>
  );
}
