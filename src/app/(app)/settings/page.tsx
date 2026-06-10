"use client";

import { useEffect, useRef, useState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { useModules } from "@/context/modules-context";
import { ALL_MODULES } from "@/lib/modules";
import type { ModuleId } from "@/lib/modules";
import type { CustomModule, CustomModuleIconKey } from "@/lib/types";
import {
  CUSTOM_MODULE_ICON_MAP,
  CUSTOM_MODULE_ICON_KEYS,
  getCustomModuleIcon,
} from "@/lib/custom-module-icons";
import {
  User, Bell, Puzzle, Shield, Settings2, Palette,
  LayoutDashboard, Users, FolderKanban, CheckSquare,
  BarChart3, Sparkles, GraduationCap, DollarSign, Phone, TrendingUp,
  Mail, Check, Sun, Plus, Pencil, Trash2,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Tab = "general" | "appearance" | "modules" | "notifications" | "security";

type CustomFormState = {
  name: string;
  description: string;
  icon: CustomModuleIconKey;
  enabled: boolean;
};

type CustomFormMode =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "edit"; module: CustomModule };

// ─────────────────────────────────────────────────────────────────────────────
// Module icon map
// ─────────────────────────────────────────────────────────────────────────────

const BUILTIN_MODULE_ICONS: Record<ModuleId, React.ElementType> = {
  dashboard: LayoutDashboard,
  clients:   Users,
  projects:  FolderKanban,
  tasks:     CheckSquare,
  pipeline:  TrendingUp,
  analytics: BarChart3,
  assistant: Sparkles,
  learning:  GraduationCap,
  finance:   DollarSign,
  calls:     Phone,
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#0d0d1c] border border-[#1c1c35]/80 rounded-2xl overflow-hidden">
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, sub, action }: {
  icon: React.ElementType;
  title: string;
  sub: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#1c1c35]/60">
      <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
        <Icon size={14} className="text-indigo-400/80" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[#c0c0d8]">{title}</p>
        {sub && <p className="text-[11px] text-[#5a5a8a] mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

function FieldRow({ label, children, sub }: { label: string; children: React.ReactNode; sub?: string }) {
  return (
    <div className="px-5 py-3.5 flex items-center gap-4 border-b border-[#1c1c35]/60 last:border-0 hover:bg-white/[0.015] transition-colors">
      <div className="w-40 flex-shrink-0">
        <label className="text-[12px] font-medium text-[#7070a0] block">{label}</label>
        {sub && <p className="text-[11px] text-[#4a4a6a] mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, type = "text", placeholder, disabled }: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "flex-1 bg-[#080818] border rounded-lg px-3 py-2 text-[13px] text-[#d0d0e8] placeholder-[#4a4a6a] focus:outline-none transition-all duration-150",
        disabled
          ? "border-[#1c1c35]/50 opacity-40 cursor-not-allowed"
          : "border-[#1c1c35]/80 focus:border-indigo-500/40 hover:border-[#252545]"
      )}
    />
  );
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      aria-checked={enabled}
      role="switch"
      className={cn(
        "relative rounded-full transition-all duration-200 ease-in-out flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50",
        enabled ? "bg-indigo-600 hover:bg-indigo-500" : "bg-[#1e1e38] hover:bg-[#252548] border border-[#2a2a48]"
      )}
      style={{ height: "18px", width: "32px" }}
    >
      <span
        className={cn(
          "absolute top-[2px] w-[14px] h-[14px] rounded-full shadow-sm transition-all duration-200 ease-in-out",
          enabled ? "translate-x-[16px] bg-white" : "translate-x-[2px] bg-[#5a5a8a]"
        )}
      />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom Module Form (inline, appears at bottom of card)
// ─────────────────────────────────────────────────────────────────────────────

function CustomModuleForm({
  mode,
  initial,
  onSave,
  onCancel,
  t,
}: {
  mode: "create" | "edit";
  initial?: CustomModule;
  onSave: (data: CustomFormState) => void;
  onCancel: () => void;
  t: (key: Parameters<ReturnType<typeof useLanguage>["t"]>[0]) => string;
}) {
  const [form, setForm] = useState<CustomFormState>({
    name:        initial?.name        ?? "",
    description: initial?.description ?? "",
    icon:        initial?.icon        ?? "bookmark",
    enabled:     initial?.enabled     ?? true,
  });
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  function handleSave() {
    if (!form.name.trim()) { setError(t("required_field")); return; }
    onSave(form);
  }

  return (
    <div className="border-t border-[#1c1c35]/60 bg-[#080818]/40 px-5 py-4 space-y-3.5">
      <p className="text-[12px] font-semibold text-[#9090c0] uppercase tracking-wider">
        {mode === "create" ? t("custom_module_new_title") : t("custom_module_edit_title")}
      </p>

      {/* Name + Description side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-[#6060a0]">{t("custom_module_name")}</label>
          <input
            ref={nameRef}
            value={form.name}
            onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(""); }}
            placeholder={t("custom_module_ph_name")}
            className={cn(
              "w-full bg-[#0d0d1c] border rounded-lg px-3 py-2 text-[13px] text-[#d0d0e8] placeholder-[#4a4a6a] focus:outline-none transition-all duration-150",
              error ? "border-red-500/40 focus:border-red-500/60" : "border-[#1c1c35]/80 focus:border-indigo-500/40"
            )}
          />
          {error && <p className="text-[10px] text-red-400/80">{error}</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-[#6060a0]">{t("custom_module_desc")}</label>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={t("custom_module_ph_desc")}
            className="w-full bg-[#0d0d1c] border border-[#1c1c35]/80 rounded-lg px-3 py-2 text-[13px] text-[#d0d0e8] placeholder-[#4a4a6a] focus:outline-none focus:border-indigo-500/40 transition-all duration-150"
          />
        </div>
      </div>

      {/* Icon picker */}
      <div className="space-y-2">
        <label className="text-[11px] font-medium text-[#6060a0]">{t("custom_module_icon_label")}</label>
        <div className="flex flex-wrap gap-1.5">
          {CUSTOM_MODULE_ICON_KEYS.map((key) => {
            const Icon = CUSTOM_MODULE_ICON_MAP[key];
            const selected = form.icon === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setForm({ ...form, icon: key })}
                title={key}
                className={cn(
                  "w-7 h-7 rounded-md flex items-center justify-center transition-all duration-150",
                  selected
                    ? "bg-indigo-600/90 text-white"
                    : "bg-[#0d0d1c] border border-[#1c1c35]/80 text-[#4a4a6a] hover:text-[#9090c0] hover:border-[#252545]"
                )}
              >
                <Icon size={13} strokeWidth={1.75} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Visibility + Actions row */}
      <div className="flex items-center justify-between pt-0.5">
        <div className="flex items-center gap-2">
          <Toggle enabled={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} />
          <span className="text-[12px] text-[#6060a0]">{t("settings_tab_modules")}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-[#6060a0] hover:text-[#c0c0e0] border border-[#1c1c35]/80 hover:border-[#252545] transition-all duration-150"
          >
            {t("btn_cancel")}
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-indigo-600/90 hover:bg-indigo-500 text-white transition-all duration-150"
          >
            {mode === "create" ? t("btn_create") : t("btn_save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user }  = useAuth();
  const { t, lang, setLang } = useLanguage();
  const { visibility, toggle, customModules, addCustomModule, updateCustomModule, deleteCustomModule, toggleCustomModule } = useModules();

  const [tab, setTab]   = useState<Tab>("general");


  const [profile, setProfile] = useState({ name: "", email: "", company: "", timezone: "" });
  const [notifications, setNotifications] = useState({ email: true, tasks: true, pipeline: false });
  const [customForm, setCustomForm]       = useState<CustomFormMode>({ open: false });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (user) setProfile({ name: user.name, email: user.email, company: user.company, timezone: "" });
  }, [user]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function handleSave() {
    showToast(t("settings_saved"));
  }

  function handleCustomSave(data: CustomFormState) {
    if (customForm.open && customForm.mode === "create") {
      addCustomModule(data);
      showToast(t("custom_module_created"));
    } else if (customForm.open && customForm.mode === "edit") {
      updateCustomModule({ ...customForm.module, ...data });
      showToast(t("custom_module_saved"));
    }
    setCustomForm({ open: false });
  }

  function handleCustomDelete(id: string) {
    deleteCustomModule(id);
    setConfirmDeleteId(null);
    showToast(t("custom_module_deleted"));
    if (customForm.open && customForm.mode === "edit" && customForm.module.id === id) {
      setCustomForm({ open: false });
    }
  }

  const ALL_MODULES_LIST = ALL_MODULES;
  const coreModules  = ALL_MODULES_LIST.filter((m) => !m.soon);
  const extraModules = ALL_MODULES_LIST.filter((m) =>  m.soon);

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "general",       label: t("settings_tab_general"),    icon: Settings2 },
    { id: "appearance",    label: t("settings_tab_appearance"), icon: Palette   },
    { id: "modules",       label: t("settings_tab_modules"),    icon: Puzzle    },
    { id: "notifications", label: t("settings_tab_notifs"),     icon: Bell      },
    { id: "security",      label: t("settings_tab_security"),   icon: Shield    },
  ];

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[200] bg-[#1c1c35] border border-indigo-500/30 text-white text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
          {toast}
        </div>
      )}

      <div className="flex flex-col flex-1">
        <TopBar title={t("settings_title")} subtitle={t("settings_subtitle")} />

        <div className="flex-1 p-6">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-6">

              {/* Left sidebar nav */}
              <div className="w-44 flex-shrink-0">
                <nav className="space-y-0.5">
                  {tabs.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setTab(id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 text-left",
                        tab === id
                          ? "bg-indigo-500/12 text-indigo-300"
                          : "text-[#6060a0] hover:text-[#c0c0e0] hover:bg-white/[0.04]"
                      )}
                    >
                      <Icon size={13} className={tab === id ? "text-indigo-400" : "text-[#4a4a7a]"} strokeWidth={tab === id ? 2 : 1.75} />
                      {label}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Right content */}
              <div className="flex-1 min-w-0 space-y-4">

                {/* ── General ─────────────────────────────────────────────── */}
                {tab === "general" && (
                  <>
                    <SectionCard>
                      <SectionHeader icon={User} title={t("settings_profile_title")} sub={t("settings_profile_sub")} />
                      <FieldRow label={t("settings_field_name")}>
                        <TextInput value={profile.name}    onChange={(v) => setProfile({ ...profile, name: v })} />
                      </FieldRow>
                      <FieldRow label={t("settings_field_email")}>
                        <TextInput value={profile.email}   onChange={(v) => setProfile({ ...profile, email: v })} type="email" />
                      </FieldRow>
                      <FieldRow label={t("settings_field_company")}>
                        <TextInput value={profile.company} onChange={(v) => setProfile({ ...profile, company: v })} />
                      </FieldRow>
                    </SectionCard>

                    <SectionCard>
                      <SectionHeader icon={Settings2} title={t("settings_general_title")} sub={t("settings_general_sub")} />
                      <FieldRow label={t("settings_lang_label")} sub={t("settings_lang_sub")}>
                        <div className="flex items-center bg-[#0d0d1c] border border-[#1c1c35] rounded-lg p-1 gap-0.5 w-fit">
                          {(["ru", "en"] as const).map((l) => (
                            <button
                              key={l}
                              onClick={() => setLang(l)}
                              className={cn(
                                "px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors uppercase",
                                lang === l ? "bg-indigo-600 text-white" : "text-[#5a5a8a] hover:text-[#e0e0f0]"
                              )}
                            >
                              {l === "ru" ? "Русский" : "English"}
                            </button>
                          ))}
                        </div>
                      </FieldRow>
                      <FieldRow label={t("settings_tz_label")}>
                        <TextInput
                          value={profile.timezone}
                          onChange={(v) => setProfile({ ...profile, timezone: v })}
                          placeholder={t("settings_tz_placeholder")}
                          disabled
                        />
                      </FieldRow>
                    </SectionCard>

                    <div className="flex items-center justify-between pt-1">
                      <p className="text-[12px] text-[#5a5a8a]">{t("settings_demo_note")}</p>
                      <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
                      >
                        {t("settings_save")}
                      </button>
                    </div>
                  </>
                )}

                {/* ── Appearance ───────────────────────────────────────────── */}
                {tab === "appearance" && (
                  <SectionCard>
                    <SectionHeader icon={Palette} title={t("settings_appearance_title")} sub={t("settings_appearance_sub")} />

                    <div className="px-5 py-5 border-b border-[#1c1c35]">
                      <p className="text-[12px] font-medium text-[#8080a8] mb-3">{t("settings_theme_label")}</p>
                      <div className="flex gap-3">
                        {/* Dark — active */}
                        <div className="flex flex-col items-center gap-2 cursor-default">
                          <div className="w-28 rounded-xl border-2 border-indigo-500 bg-[#07070f] overflow-hidden relative shadow-lg shadow-indigo-500/20" style={{ height: "72px" }}>
                            <div className="absolute left-0 top-0 h-full w-8 bg-[#0d0d1c] border-r border-[#1c1c35]" />
                            <div className="absolute top-2 left-10 right-2 h-2 bg-[#1c1c35] rounded" />
                            <div className="absolute top-6 left-10 right-2 h-8 bg-[#111128] rounded border border-[#1c1c35]" />
                            <div className="absolute bottom-1 right-1 w-3 h-3 rounded-full bg-indigo-500/40 flex items-center justify-center">
                              <Check size={6} className="text-indigo-400" />
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                            <span className="text-[12px] font-medium text-indigo-400">{t("settings_theme_dark")}</span>
                          </div>
                        </div>
                        {/* Light — coming soon */}
                        <div className="flex flex-col items-center gap-2 cursor-not-allowed opacity-40">
                          <div className="w-28 rounded-xl border border-[#1c1c35] bg-[#f8f8ff] overflow-hidden" style={{ height: "72px" }}>
                            <div className="h-full w-8 float-left bg-[#f0f0fa] border-r border-[#ddd]" />
                          </div>
                          <div className="flex items-center gap-1">
                            <Sun size={12} className="text-[#5a5a8a]" />
                            <span className="text-[12px] text-[#5a5a8a]">{t("settings_theme_coming")}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <FieldRow label={t("settings_density_label")} sub={t("settings_density_sub")}>
                      <span className="text-[12px] text-[#5a5a8a] bg-[#1c1c35] border border-[#252545] px-2 py-1 rounded-md">
                        {t("settings_modules_soon")}
                      </span>
                    </FieldRow>
                  </SectionCard>
                )}

                {/* ── Modules ──────────────────────────────────────────────── */}
                {tab === "modules" && (
                  <div className="space-y-4">
                    <div className="bg-indigo-500/[0.06] border border-indigo-500/15 rounded-xl px-4 py-3 text-[12px] text-indigo-300/70 leading-relaxed">
                      {t("settings_modules_sub")}
                    </div>

                    {/* Core modules */}
                    <SectionCard>
                      <SectionHeader icon={Puzzle} title={t("settings_modules_core")} sub="" />
                      {coreModules.map((mod) => {
                        const Icon    = BUILTIN_MODULE_ICONS[mod.id];
                        const enabled = visibility[mod.id] ?? mod.defaultEnabled;
                        return (
                          <div
                            key={mod.id}
                            className="group flex items-center gap-3 px-4 py-2.5 border-b border-[#1c1c35]/50 last:border-0 hover:bg-white/[0.02] transition-colors"
                          >
                            <div className={cn(
                              "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200",
                              enabled
                                ? "bg-indigo-500/10 text-indigo-400"
                                : "bg-[#161626] text-[#3a3a5a]"
                            )}>
                              <Icon size={13} strokeWidth={1.75} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                "text-[13px] font-medium transition-colors",
                                enabled ? "text-[#d0d0e8]" : "text-[#4a4a6a]"
                              )}>
                                {t(`mod_${mod.id}` as Parameters<typeof t>[0])}
                              </p>
                              <p className="text-[11px] text-[#4a4a6a] mt-px leading-tight">
                                {t(`mod_${mod.id}_sub` as Parameters<typeof t>[0])}
                              </p>
                            </div>
                            <Toggle enabled={enabled} onChange={(v) => toggle(mod.id, v)} />
                          </div>
                        );
                      })}
                    </SectionCard>

                    {/* Extra (soon) modules */}
                    <SectionCard>
                      <SectionHeader icon={Sparkles} title={t("settings_modules_extra")} sub="" />
                      {extraModules.map((mod) => {
                        const Icon    = BUILTIN_MODULE_ICONS[mod.id];
                        const enabled = visibility[mod.id] ?? mod.defaultEnabled;
                        return (
                          <div
                            key={mod.id}
                            className="group flex items-center gap-3 px-4 py-2.5 border-b border-[#1c1c35]/50 last:border-0 hover:bg-white/[0.02] transition-colors"
                          >
                            <div className={cn(
                              "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200",
                              enabled
                                ? "bg-indigo-500/10 text-indigo-400"
                                : "bg-[#161626] text-[#3a3a5a]"
                            )}>
                              <Icon size={13} strokeWidth={1.75} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className={cn(
                                  "text-[13px] font-medium transition-colors",
                                  enabled ? "text-[#d0d0e8]" : "text-[#4a4a6a]"
                                )}>
                                  {t(`mod_${mod.id}` as Parameters<typeof t>[0])}
                                </p>
                                <span className="inline-flex items-center text-[10px] font-medium bg-amber-500/8 text-amber-500/60 border border-amber-500/15 px-1.5 py-px rounded-full leading-none">
                                  {t("settings_modules_soon")}
                                </span>
                              </div>
                              <p className="text-[11px] text-[#4a4a6a] mt-px leading-tight">
                                {t(`mod_${mod.id}_sub` as Parameters<typeof t>[0])}
                              </p>
                            </div>
                            <Toggle enabled={enabled} onChange={(v) => toggle(mod.id, v)} />
                          </div>
                        );
                      })}
                    </SectionCard>

                    {/* ── Custom modules ──────────────────────────────────── */}
                    <SectionCard>
                      <SectionHeader
                        icon={Package}
                        title={t("custom_modules_title")}
                        sub={t("custom_modules_sub")}
                        action={
                          !customForm.open ? (
                            <button
                              onClick={() => { setConfirmDeleteId(null); setCustomForm({ open: true, mode: "create" }); }}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium bg-indigo-600/90 hover:bg-indigo-500 text-white transition-all duration-150 flex-shrink-0"
                            >
                              <Plus size={12} strokeWidth={2.5} />
                              {t("custom_module_add")}
                            </button>
                          ) : null
                        }
                      />

                      {/* Empty state */}
                      {customModules.length === 0 && !customForm.open && (
                        <div className="flex flex-col items-center gap-2.5 py-8">
                          <div className="w-8 h-8 rounded-xl bg-[#161626] flex items-center justify-center">
                            <Package size={14} className="text-[#3a3a5a]" />
                          </div>
                          <div className="text-center">
                            <p className="text-[12px] font-medium text-[#4a4a6a]">{t("custom_module_empty")}</p>
                            <p className="text-[11px] text-[#3a3a5a] mt-0.5 max-w-[200px] leading-relaxed">{t("custom_module_empty_sub")}</p>
                          </div>
                        </div>
                      )}

                      {customModules.map((mod) => {
                        const Icon    = getCustomModuleIcon(mod.icon);
                        const isEditing = customForm.open && customForm.mode === "edit" && customForm.module.id === mod.id;
                        const isDeleting = confirmDeleteId === mod.id;

                        return (
                          <div key={mod.id} className="border-b border-[#1c1c35]/50 last:border-0">
                            <div className="group flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
                              <div className={cn(
                                "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200",
                                mod.enabled ? "bg-indigo-500/10 text-indigo-400" : "bg-[#161626] text-[#3a3a5a]"
                              )}>
                                <Icon size={13} strokeWidth={1.75} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={cn("text-[13px] font-medium transition-colors", mod.enabled ? "text-[#d0d0e8]" : "text-[#4a4a6a]")}>
                                  {mod.name}
                                </p>
                                {mod.description && (
                                  <p className="text-[11px] text-[#4a4a6a] mt-px truncate leading-tight">{mod.description}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {/* Edit */}
                                {!isDeleting && (
                                  <button
                                    onClick={() => {
                                      setConfirmDeleteId(null);
                                      setCustomForm(isEditing ? { open: false } : { open: true, mode: "edit", module: mod });
                                    }}
                                    className={cn(
                                      "p-1.5 rounded-md transition-all duration-150",
                                      isEditing
                                        ? "bg-indigo-500/15 text-indigo-400"
                                        : "opacity-0 group-hover:opacity-100 text-[#5a5a8a] hover:text-indigo-400 hover:bg-white/5"
                                    )}
                                    title={t("btn_edit")}
                                  >
                                    <Pencil size={12} />
                                  </button>
                                )}

                                {/* Delete / confirm */}
                                {isDeleting ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-red-400/80 font-medium">{t("custom_module_del_confirm")}</span>
                                    <button
                                      onClick={() => handleCustomDelete(mod.id)}
                                      className="px-2 py-1 rounded-md text-[11px] font-medium bg-red-500/90 hover:bg-red-400 text-white transition-colors"
                                    >
                                      {t("btn_delete")}
                                    </button>
                                    <button
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="px-2 py-1 rounded-md text-[11px] font-medium text-[#6060a0] hover:text-white border border-[#1c1c35] transition-colors"
                                    >
                                      {t("btn_cancel")}
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { setCustomForm({ open: false }); setConfirmDeleteId(mod.id); }}
                                    className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 text-[#5a5a8a] hover:text-red-400 hover:bg-white/5 transition-all duration-150"
                                    title={t("btn_delete")}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}

                                <Toggle enabled={mod.enabled} onChange={(v) => toggleCustomModule(mod.id, v)} />
                              </div>
                            </div>

                            {/* Inline edit form */}
                            {isEditing && (
                              <CustomModuleForm
                                mode="edit"
                                initial={mod}
                                onSave={handleCustomSave}
                                onCancel={() => setCustomForm({ open: false })}
                                t={t}
                              />
                            )}
                          </div>
                        );
                      })}

                      {/* Inline create form */}
                      {customForm.open && customForm.mode === "create" && (
                        <CustomModuleForm
                          mode="create"
                          onSave={handleCustomSave}
                          onCancel={() => setCustomForm({ open: false })}
                          t={t}
                        />
                      )}
                    </SectionCard>
                  </div>
                )}

                {/* ── Notifications ────────────────────────────────────────── */}
                {tab === "notifications" && (
                  <>
                    <SectionCard>
                      <SectionHeader icon={Bell} title={t("settings_notifs_title")} sub={t("settings_notifs_sub")} />
                      {[
                        { key: "email"    as const, label: t("settings_notif_email"),    sub: t("settings_notif_email_sub") },
                        { key: "tasks"    as const, label: t("settings_notif_tasks"),    sub: t("settings_notif_tasks_sub") },
                        { key: "pipeline" as const, label: t("settings_notif_pipeline"), sub: t("settings_notif_pipeline_sub") },
                      ].map(({ key, label, sub }) => (
                        <div key={key} className="flex items-center justify-between px-5 py-3 border-b border-[#1c1c35]/60 last:border-0 hover:bg-white/[0.015] transition-colors">
                          <div>
                            <p className="text-[13px] font-medium text-[#c0c0d8]">{label}</p>
                            <p className="text-[11px] text-[#5a5a8a] mt-0.5">{sub}</p>
                          </div>
                          <Toggle
                            enabled={notifications[key]}
                            onChange={(v) => setNotifications({ ...notifications, [key]: v })}
                          />
                        </div>
                      ))}
                    </SectionCard>

                    <div className="flex items-center justify-between pt-1">
                      <p className="text-[12px] text-[#5a5a8a]">{t("settings_demo_note")}</p>
                      <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20">
                        {t("settings_save")}
                      </button>
                    </div>
                  </>
                )}

                {/* ── Security ──────────────────────────────────────────────── */}
                {tab === "security" && (
                  <>
                    <SectionCard>
                      <SectionHeader icon={Shield} title={t("settings_security_title")} sub={t("settings_security_sub")} />
                      <FieldRow label={t("settings_field_cur_pass")}>
                        <TextInput value="" onChange={() => {}} type="password" placeholder="••••••••" />
                      </FieldRow>
                      <FieldRow label={t("settings_field_new_pass")}>
                        <TextInput value="" onChange={() => {}} type="password" placeholder="••••••••" />
                      </FieldRow>
                      <div className="px-5 py-3 flex items-center gap-2 text-[12px] text-[#5a5a8a]">
                        <Mail size={13} />
                        {t("settings_demo_note")}
                      </div>
                    </SectionCard>

                    <div className="flex items-center justify-between pt-1">
                      <p className="text-[12px] text-[#5a5a8a]">{t("settings_demo_note")}</p>
                      <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20">
                        {t("settings_save")}
                      </button>
                    </div>
                  </>
                )}

              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
