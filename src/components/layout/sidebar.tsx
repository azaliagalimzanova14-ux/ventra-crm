"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, FolderKanban, CheckSquare,
  BarChart3, Sparkles, Settings, Bell, ChevronDown,
  Zap, LogOut, GraduationCap, DollarSign, Phone, X, TrendingUp,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { useModules } from "@/context/modules-context";
import { useSidebar } from "@/context/sidebar-context";
import type { ModuleId } from "@/lib/modules";
import { getCustomModuleIcon } from "@/lib/custom-module-icons";
import { getDeals, getSetupProgress } from "@/lib/storage";

interface NavItem {
  moduleId: ModuleId;
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: React.ReactNode;
  soon?: boolean;
}

export function Sidebar() {
  const pathname  = usePathname();
  const { user, logout } = useAuth();
  const { t }     = useLanguage();
  const { isEnabled } = useModules();
  const { isOpen, close } = useSidebar();
  const { customModules } = useModules();

  // Live pipeline stats
  const [pipelineValue, setPipelineValue] = useState(0);
  const [openDeals,     setOpenDeals]     = useState(0);
  const [setupDone,     setSetupDone]     = useState(5); // assume complete until loaded

  useEffect(() => {
    const deals  = getDeals();
    const active = deals.filter((d) => d.stage !== "closed_lost" && d.stage !== "closed_won");
    setPipelineValue(active.reduce((s, d) => s + d.value, 0));
    setOpenDeals(active.length);
    setSetupDone(getSetupProgress().length);
  }, []);

  const allNavItems: NavItem[] = [
    { moduleId: "dashboard", href: "/dashboard", label: t("nav_dashboard"), icon: LayoutDashboard },
    { moduleId: "clients",   href: "/clients",   label: t("nav_clients"),   icon: Users },
    { moduleId: "projects",  href: "/projects",  label: t("nav_projects"),  icon: FolderKanban },
    {
      moduleId: "tasks", href: "/tasks", label: t("nav_tasks"), icon: CheckSquare,
      badge: <span className="ml-auto text-[11px] bg-[#1c1c35] text-[#8080a8] px-1.5 py-0.5 rounded-md">10</span>,
    },
    { moduleId: "pipeline",  href: "/pipeline",  label: t("nav_pipeline_page"), icon: TrendingUp },
    { moduleId: "analytics", href: "/analytics", label: t("nav_analytics"), icon: BarChart3 },
    {
      moduleId: "assistant", href: "/assistant", label: t("nav_assistant"), icon: Sparkles,
      badge: (
        <span className="ml-auto text-[10px] bg-violet-500/20 text-violet-400 border border-violet-500/30 px-1.5 py-0.5 rounded-md">
          {t("nav_new")}
        </span>
      ),
    },
    { moduleId: "learning", href: "/learning", label: t("mod_learning"), icon: GraduationCap, soon: true },
    { moduleId: "finance",  href: "/finance",  label: t("mod_finance"),  icon: DollarSign,    soon: true },
    { moduleId: "calls",    href: "/calls",    label: t("mod_calls"),    icon: Phone,          soon: true },
  ];

  const visibleItems = allNavItems.filter((item) => isEnabled(item.moduleId));

  const sidebar = (
    <aside className="flex h-screen w-60 bg-[#0d0d1c] border-r border-[#1c1c35] flex-col z-50">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-[#1c1c35]">
        <div className="w-8 h-8 rounded-lg bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg">
          <Zap size={16} className="text-white" strokeWidth={2.5} />
        </div>
        <span className="font-semibold text-[15px] text-white tracking-tight">Ventra</span>
        <span className="ml-auto text-[10px] font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-1.5 py-0.5 rounded-md">
          {t("nav_beta")}
        </span>
        {/* Close button — mobile only */}
        <button
          onClick={close}
          className="md:hidden ml-1 p-1 rounded-lg text-[#5a5a8a] hover:text-white hover:bg-white/5 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Workspace */}
      <div className="px-3 py-3 border-b border-[#1c1c35]">
        <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/5 group transition-colors">
          <div className="w-6 h-6 rounded-md bg-linear-to-br from-amber-400 to-orange-500 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
            {user?.company?.[0] ?? "V"}
          </div>
          <div className="flex flex-col items-start min-w-0">
            <span className="text-[13px] font-medium text-[#e0e0f0] truncate">
              {user?.company ?? "Ventra CRM"}
            </span>
            <span className="text-[11px] text-[#5a5a8a]">{t("nav_free_plan")}</span>
          </div>
          <ChevronDown size={14} className="ml-auto text-[#5a5a8a] group-hover:text-[#8080a8]" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-[11px] font-medium text-[#5a5a8a] uppercase tracking-wider px-2.5 mb-2">
          {t("nav_section")}
        </p>

        {visibleItems.map(({ href, label, icon: Icon, badge, soon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const inner = (
            <span
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium w-full select-none",
                active
                  ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20"
                  : soon
                  ? "text-[#5a5a8a] cursor-default"
                  : "text-[#8080a8] hover:text-[#e0e0f0] hover:bg-white/5 cursor-pointer"
              )}
            >
              <Icon
                size={16}
                strokeWidth={active ? 2 : 1.75}
                className={active ? "text-indigo-400" : "text-[#5a5a8a]"}
              />
              {label}
              {soon ? (
                <span className="ml-auto text-[10px] bg-[#1c1c35] text-[#5a5a8a] border border-[#252545] px-1.5 py-0.5 rounded-md">
                  {t("settings_modules_soon")}
                </span>
              ) : (
                badge ?? null
              )}
            </span>
          );

          return soon ? (
            <div key={href}>{inner}</div>
          ) : (
            <Link key={href} href={href} onClick={close}>{inner}</Link>
          );
        })}

        {/* Custom modules */}
        {customModules.filter((m) => m.enabled).length > 0 && (
          <>
            <p className="text-[11px] font-medium text-[#5a5a8a] uppercase tracking-wider px-2.5 mt-4 mb-2">
              {t("custom_modules_title")}
            </p>
            {customModules
              .filter((m) => m.enabled)
              .map((mod) => {
                const href   = `/m/${mod.id}`;
                const active = pathname === href;
                const Icon   = getCustomModuleIcon(mod.icon);
                return (
                  <Link key={mod.id} href={href} onClick={close}>
                    <span className={cn(
                      "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium w-full select-none",
                      active
                        ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20"
                        : "text-[#8080a8] hover:text-[#e0e0f0] hover:bg-white/5 cursor-pointer"
                    )}>
                      <Icon
                        size={16}
                        strokeWidth={active ? 2 : 1.75}
                        className={active ? "text-indigo-400" : "text-[#5a5a8a]"}
                      />
                      <span className="truncate">{mod.name}</span>
                    </span>
                  </Link>
                );
              })}
          </>
        )}
      </nav>

      {/* Setup progress — shown when not all 5 steps done */}
      {setupDone < 5 && (
        <Link href="/dashboard" onClick={close}>
          <div className="mx-3 mb-2 p-3 rounded-xl bg-[#0d0d1c] border border-[#1c1c35] hover:border-[#252545] transition-colors">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] font-medium text-[#8080a8]">Getting started</p>
              <span className="text-[10px] text-indigo-400 font-medium">{setupDone}/5</span>
            </div>
            <div className="h-1 bg-[#1c1c35] rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-linear-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
                style={{ width: `${(setupDone / 5) * 100}%` }}
              />
            </div>
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex-1 h-1 rounded-full",
                    i < setupDone ? "bg-indigo-500" : "bg-[#1c1c35]"
                  )}
                />
              ))}
            </div>
          </div>
        </Link>
      )}

      {/* Pipeline widget — live data */}
      <Link href="/pipeline" onClick={close}>
        <div className="mx-3 mb-3 p-3 rounded-xl bg-[#111128] border border-[#1c1c35] hover:border-[#252545] transition-colors">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-medium text-[#5a5a8a]">{t("nav_pipeline")}</p>
            {setupDone >= 5 && (
              <CheckCircle2 size={11} className="text-emerald-400" />
            )}
          </div>
          <p className="text-[18px] font-semibold text-white">
            {pipelineValue >= 1000
              ? `$${(pipelineValue / 1000).toFixed(0)}K`
              : `$${pipelineValue}`}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[11px] text-emerald-400">↑ active</span>
          </div>
          <div className="mt-2.5 h-1.5 bg-[#1c1c35] rounded-full overflow-hidden">
            <div className="h-full bg-linear-to-r from-indigo-500 to-violet-500 rounded-full"
              style={{ width: openDeals > 0 ? "62%" : "0%" }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-[#5a5a8a]">{openDeals} {t("nav_open_deals")}</span>
          </div>
        </div>
      </Link>

      {/* Bottom */}
      <div className="px-3 pb-4 border-t border-[#1c1c35] pt-3 space-y-0.5">
        <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-[#8080a8] hover:text-[#e0e0f0] hover:bg-white/5">
          <Bell size={16} strokeWidth={1.75} className="text-[#5a5a8a]" />
          {t("nav_notifications")}
          <span className="ml-auto w-4 h-4 bg-indigo-500 text-white text-[10px] rounded-full flex items-center justify-center">
            3
          </span>
        </button>
        <Link href="/settings" onClick={close}>
          <span className={cn(
            "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer",
            pathname === "/settings"
              ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20"
              : "text-[#8080a8] hover:text-[#e0e0f0] hover:bg-white/5"
          )}>
            <Settings
              size={16} strokeWidth={pathname === "/settings" ? 2 : 1.75}
              className={pathname === "/settings" ? "text-indigo-400" : "text-[#5a5a8a]"}
            />
            {t("nav_settings")}
          </span>
        </Link>

        {/* User */}
        <div className="flex items-center gap-2.5 px-2.5 py-2 mt-1 rounded-lg hover:bg-white/5 cursor-pointer">
          <div className="w-7 h-7 rounded-full bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
            {user?.name?.slice(0, 2).toUpperCase() ?? "VA"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-[#e0e0f0] truncate">{user?.name ?? t("nav_admin")}</p>
            <p className="text-[10px] text-[#5a5a8a] truncate">{user?.email ?? ""}</p>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded-md text-[#5a5a8a] hover:text-[#e0e0f0] hover:bg-white/5 transition-colors"
            title={t("nav_signout")}
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop: always visible, fixed */}
      <div className="hidden md:block fixed left-0 top-0 h-screen w-60 z-50">
        {sidebar}
      </div>

      {/* Mobile: slide-in drawer */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 bg-black/60 z-40"
            onClick={close}
          />
          {/* Drawer */}
          <div className="md:hidden fixed left-0 top-0 h-screen w-60 z-50">
            {sidebar}
          </div>
        </>
      )}
    </>
  );
}
