"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Sunrise, BarChart2, CalendarDays, Users, FolderKanban, CheckSquare,
  BarChart3, Sparkles, Settings, Bell,
  Zap, LogOut, GraduationCap, DollarSign, Phone, X,
  TrendingUp, CheckCircle2, ChevronRight, Inbox, Users2, PieChart, Activity,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { useModules } from "@/context/modules-context";
import { useSidebar } from "@/context/sidebar-context";
import { useTheme } from "@/context/theme-context";
import type { ModuleId } from "@/lib/modules";
import { getCustomModuleIcon } from "@/lib/custom-module-icons";
import { getSetupProgress } from "@/lib/storage";
import { getStoredUnreadCount } from "@/lib/notifications";
import { useWorkspace }    from "@/context/workspace-context";
import { usePermissions }   from "@/context/permission-context";
import { WorkspaceSwitcher } from "@/components/workspace/workspace-switcher";

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
  const { sw } = useTheme();
  // workspaceMode still used for the sidebar badge (demo/empty indicator)
  const { mode: workspaceMode } = useWorkspace();
  const { can } = usePermissions();

  const [pipelineValue, setPipelineValue] = useState(0);
  const [openDeals,     setOpenDeals]     = useState(0);
  const [setupDone,     setSetupDone]     = useState(5);
  const [notifCount,    setNotifCount]    = useState(0);

  useEffect(() => {
    setSetupDone(getSetupProgress().length);
    setNotifCount(getStoredUnreadCount());
    // Fetch live deal summary from server
    void fetch("/api/deals/summary", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { open_count?: number; pipeline_value?: number }) => {
        setPipelineValue(d.pipeline_value ?? 0);
        setOpenDeals(d.open_count ?? 0);
      })
      .catch(() => { /* silent — sidebar still works */ });
  }, []);

  const allNavItems: NavItem[] = [
    { moduleId: "dashboard", href: "/dashboard", label: t("nav_dashboard"),      icon: LayoutDashboard },
    { moduleId: "morning",    href: "/morning",    label: "Morning Brief",         icon: Sunrise    },
    { moduleId: "portfolio",  href: "/portfolio",  label: "Portfolio",             icon: BarChart2     },
    { moduleId: "weekly",     href: "/weekly",     label: "Weekly Review",         icon: CalendarDays },
    { moduleId: "clients",   href: "/clients",   label: t("nav_clients"),        icon: Users },
    { moduleId: "projects",  href: "/projects",  label: t("nav_projects"),       icon: FolderKanban },
    { moduleId: "tasks",    href: "/tasks",    label: t("nav_tasks"),    icon: CheckSquare },
    { moduleId: "timeline", href: "/timeline", label: "Timeline",         icon: GitBranch  },
    {
      moduleId: "inbox", href: "/inbox", label: "Inbox", icon: Inbox,
      badge: (
        <span className="ml-auto text-[10px] bg-[var(--color-accent-subtle)] text-[var(--color-accent-fg)] px-1.5 py-0.5 rounded-md font-semibold">
          NEW
        </span>
      ),
    },
    { moduleId: "pipeline",  href: "/deals",     label: t("nav_pipeline_page"),  icon: TrendingUp },
    { moduleId: "analytics", href: "/analytics", label: t("nav_analytics"),      icon: BarChart3 },
    {
      moduleId: "assistant", href: "/assistant", label: t("nav_assistant"),      icon: Sparkles,
      badge: (
        <span className="ml-auto text-[10px] bg-[var(--color-accent-subtle)] text-[var(--color-accent-fg)] px-1.5 py-0.5 rounded-md font-semibold">
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
    <aside className="flex h-screen w-60 bg-[var(--color-sidebar)] border-r border-[var(--color-border)] flex-col z-50">

      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-[var(--color-border-subtle)]">
        <div className="w-7 h-7 rounded-lg bg-[var(--color-accent)] flex items-center justify-center shadow-sm flex-shrink-0">
          <Zap size={14} className="text-white" strokeWidth={2.5} />
        </div>
        <span className="font-semibold text-[15px] text-[var(--color-fg)] tracking-tight">Ventra</span>
        <span className="ml-auto text-[10px] font-semibold bg-[var(--color-accent-subtle)] text-[var(--color-accent-fg)] px-1.5 py-0.5 rounded-md">
          {t("nav_beta")}
        </span>
        <button
          onClick={close}
          className="md:hidden ml-0.5 p-1 rounded-lg text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {/* Workspace switcher */}
      <WorkspaceSwitcher />

      {/* Workspace data mode badge (demo / empty indicator) */}
      {workspaceMode !== "custom" && (
        <div className="flex items-center gap-1.5 px-5 pt-1.5 pb-1">
          <div className={cn(
            "w-1.5 h-1.5 rounded-full flex-shrink-0",
            workspaceMode === "demo" ? "bg-amber-400" : "bg-[var(--color-fg-faint)]",
          )} />
          <span className={cn(
            "text-[10px] font-semibold uppercase tracking-wider",
            workspaceMode === "demo" ? "text-amber-600" : "text-[var(--color-fg-faint)]",
          )}>
            {workspaceMode === "demo" ? t("ws_mode_demo") : t("ws_mode_empty")}
          </span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-px overflow-y-auto">
        <p className="text-[10px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-widest px-2.5 mb-2 mt-1">
          {t("nav_section")}
        </p>

        {visibleItems.map(({ href, label, icon: Icon, badge, soon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const inner = (
            <span className={cn(
              "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium w-full select-none transition-colors",
              active
                ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)] border-l-2 border-[var(--color-accent)] pl-[9px]"
                : soon
                ? "text-[var(--color-fg-faint)] cursor-default"
                : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] cursor-pointer"
            )}>
              <Icon
                size={15}
                strokeWidth={active ? 2 : sw}
                className={active ? "text-[var(--color-accent)]" : "text-[var(--color-fg-faint)]"}
              />
              {label}
              {soon ? (
                <span className="ml-auto text-[10px] bg-[var(--color-border)] text-[var(--color-fg-faint)] px-1.5 py-0.5 rounded-md">
                  {t("settings_modules_soon")}
                </span>
              ) : (badge ?? null)}
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
            <p className="text-[10px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-widest px-2.5 mt-4 mb-2">
              {t("custom_modules_title")}
            </p>
            {customModules.filter((m) => m.enabled).map((mod) => {
              const href   = `/m/${mod.id}`;
              const active = pathname === href;
              const Icon   = getCustomModuleIcon(mod.icon);
              return (
                <Link key={mod.id} href={href} onClick={close}>
                  <span className={cn(
                    "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium w-full select-none transition-colors",
                    active
                      ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)] border-l-2 border-[var(--color-accent)] pl-[9px]"
                      : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] cursor-pointer"
                  )}>
                    <Icon size={15} strokeWidth={active ? 2 : sw} className={active ? "text-[var(--color-accent)]" : "text-[var(--color-fg-faint)]"} />
                    <span className="truncate">{mod.name}</span>
                  </span>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Setup progress card */}
      {setupDone < 5 && (
        <Link href="/dashboard" onClick={close}>
          <div className="mx-3 mb-2 p-3 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] transition-colors">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] font-semibold text-[var(--color-fg-muted)]">{t("nav_getting_started")}</p>
              <span className="text-[10px] text-[var(--color-accent)] font-semibold">{setupDone}/5</span>
            </div>
            <div className="h-1 bg-[var(--color-border)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 bg-[var(--color-accent)]"
                style={{ width: `${(setupDone / 5) * 100}%` }}
              />
            </div>
          </div>
        </Link>
      )}

      {/* Live pipeline widget */}
      <Link href="/deals" onClick={close}>
        <div className="mx-3 mb-3 p-3 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] transition-colors">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-semibold text-[var(--color-fg-muted)]">{t("nav_pipeline")}</p>
            {setupDone >= 5 && <CheckCircle2 size={11} className="text-[var(--color-success)]" />}
          </div>
          <p className="text-[17px] font-bold text-[var(--color-fg)]">
            {pipelineValue >= 1000 ? `$${(pipelineValue / 1000).toFixed(0)}K` : `$${pipelineValue}`}
          </p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px] text-[var(--color-fg-faint)]">{openDeals} {t("nav_open_deals")}</span>
            <ChevronRight size={11} className="text-[var(--color-fg-faint)]" />
          </div>
          <div className="mt-1.5 h-1 bg-[var(--color-border)] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-[var(--color-accent)] opacity-60" style={{ width: openDeals > 0 ? "60%" : "0%" }} />
          </div>
        </div>
      </Link>

      {/* Bottom */}
      <div className="px-3 pb-3 border-t border-[var(--color-border-subtle)] pt-2.5 space-y-px">
        <Link href="/team" onClick={close}>
          <span className={cn(
            "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer",
            pathname === "/team"
              ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)] border-l-2 border-[var(--color-accent)] pl-[9px]"
              : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)]",
          )}>
            <Users2
              size={15}
              strokeWidth={pathname === "/team" ? 2 : sw}
              className={pathname === "/team" ? "text-[var(--color-accent)]" : "text-[var(--color-fg-faint)]"}
            />
            {t("nav_team")}
          </span>
        </Link>
        <Link href="/team/dashboard" onClick={close}>
          <span className={cn(
            "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer",
            pathname === "/team/dashboard"
              ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)] border-l-2 border-[var(--color-accent)] pl-[9px]"
              : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)]",
          )}>
            <PieChart
              size={15}
              strokeWidth={pathname === "/team/dashboard" ? 2 : sw}
              className={pathname === "/team/dashboard" ? "text-[var(--color-accent)]" : "text-[var(--color-fg-faint)]"}
            />
            {t("nav_team_dashboard")}
          </span>
        </Link>
        {/* Activity Log — visible to owners, admins, and managers */}
        {can("activity.view") && (
          <Link href="/settings/activity" onClick={close}>
            <span className={cn(
              "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer",
              pathname === "/settings/activity"
                ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)] border-l-2 border-[var(--color-accent)] pl-[9px]"
                : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)]",
            )}>
              <Activity
                size={15}
                strokeWidth={pathname === "/settings/activity" ? 2 : sw}
                className={pathname === "/settings/activity" ? "text-[var(--color-accent)]" : "text-[var(--color-fg-faint)]"}
              />
              Activity
            </span>
          </Link>
        )}

        {/* Manage Team — visible to anyone who can invite/remove/manage roles */}
        {(can("members.invite") || can("members.remove") || can("members.manage_roles")) && (
          <Link href="/settings/team" onClick={close}>
            <span className={cn(
              "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer",
              pathname === "/settings/team"
                ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)] border-l-2 border-[var(--color-accent)] pl-[9px]"
                : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)]",
            )}>
              <Users2
                size={15}
                strokeWidth={pathname === "/settings/team" ? 2 : sw}
                className={pathname === "/settings/team" ? "text-[var(--color-accent)]" : "text-[var(--color-fg-faint)]"}
              />
              Manage Team
            </span>
          </Link>
        )}
        <Link href="/notifications" onClick={close}>
          <span className={cn(
            "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer",
            pathname === "/notifications"
              ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)] border-l-2 border-[var(--color-accent)] pl-[9px]"
              : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)]",
          )}>
            <Bell
              size={15}
              strokeWidth={pathname === "/notifications" ? 2 : sw}
              className={pathname === "/notifications" ? "text-[var(--color-accent)]" : "text-[var(--color-fg-faint)]"}
            />
            {t("nav_notifications")}
            {notifCount > 0 && (
              <span className="ml-auto w-4 h-4 bg-[var(--color-accent)] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {notifCount > 9 ? "9+" : notifCount}
              </span>
            )}
          </span>
        </Link>
        <Link href="/settings" onClick={close}>
          <span className={cn(
            "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer",
            pathname === "/settings"
              ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)] border-l-2 border-[var(--color-accent)] pl-[9px]"
              : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)]"
          )}>
            <Settings size={15} strokeWidth={pathname === "/settings" ? 2 : sw}
              className={pathname === "/settings" ? "text-[var(--color-accent)]" : "text-[var(--color-fg-faint)]"} />
            {t("nav_settings")}
          </span>
        </Link>

        {/* User */}
        <div className="flex items-center gap-2.5 px-2.5 py-2 mt-0.5 rounded-lg hover:bg-[var(--color-canvas)] cursor-pointer transition-colors">
          <div className="w-7 h-7 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
            {user?.name?.slice(0, 2).toUpperCase() ?? "VA"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-[var(--color-fg)] truncate">{user?.name ?? t("nav_admin")}</p>
            <p className="text-[10px] text-[var(--color-fg-faint)] truncate">{user?.email ?? ""}</p>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded-md text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] hover:bg-[var(--color-border)] transition-colors"
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
      <div className="hidden md:block fixed left-0 top-0 h-screen w-60 z-50">
        {sidebar}
      </div>
      {isOpen && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/30 z-40" onClick={close} />
          <div className="md:hidden fixed left-0 top-0 h-screen w-60 z-50">{sidebar}</div>
        </>
      )}
    </>
  );
}
