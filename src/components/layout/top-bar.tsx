"use client";

import { Search, Plus, Command, Menu } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { useSidebar } from "@/context/sidebar-context";
import { cn } from "@/lib/utils";

interface TopBarProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onClick?: () => void;
  };
}

export function TopBar({ title, subtitle, action }: TopBarProps) {
  const { lang, setLang, t } = useLanguage();
  const { toggle } = useSidebar();

  return (
    <header className="h-14 border-b border-[#1c1c35] bg-[#07070f]/80 backdrop-blur-sm flex items-center justify-between px-4 md:px-6 sticky top-0 z-40 flex-shrink-0">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          onClick={toggle}
          className="md:hidden p-1.5 rounded-lg text-[#5a5a8a] hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
          aria-label="Toggle menu"
        >
          <Menu size={18} />
        </button>

        <div>
          <h1 className="text-[15px] font-semibold text-white leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-[12px] text-[#5a5a8a] leading-tight">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Language toggle */}
        <div className="flex items-center bg-[#111128] border border-[#1c1c35] rounded-lg p-1 gap-0.5">
          {(["ru", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors uppercase",
                lang === l
                  ? "bg-indigo-600 text-white"
                  : "text-[#5a5a8a] hover:text-[#e0e0f0]"
              )}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Search — hidden on small mobile */}
        <button className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#111128] border border-[#1c1c35] rounded-lg text-[12px] text-[#5a5a8a] hover:border-[#252545] hover:text-[#8080a8] transition-colors w-52 group">
          <Search size={13} />
          <span className="flex-1 text-left">{t("search_placeholder")}</span>
          <span className="flex items-center gap-0.5 bg-[#1c1c35] px-1 py-0.5 rounded text-[10px] font-mono text-[#5a5a8a]">
            <Command size={9} />K
          </span>
        </button>

        {action && (
          <button
            onClick={action.onClick}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
          >
            <Plus size={15} strokeWidth={2.5} />
            <span className="hidden sm:inline">{action.label}</span>
          </button>
        )}
      </div>
    </header>
  );
}
