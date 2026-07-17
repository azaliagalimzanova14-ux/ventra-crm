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
import { resetOnboarding } from "@/lib/storage";
import {
  getFeedbackList, updateFeedbackStatus, deleteFeedbackItem,
  type FeedbackItem, type FeedbackStatus, type FeedbackType,
} from "@/lib/feedback";
import {
  User, Bell, Puzzle, Shield, Settings2, Palette,
  LayoutDashboard, Users, FolderKanban, CheckSquare,
  BarChart3, Sparkles, GraduationCap, DollarSign, Phone, TrendingUp, Inbox, GitBranch,
  Mail, Check, Plus, Pencil, Trash2,
  Package, ChevronUp, ChevronDown, RotateCcw,
  MessageSquare, Bug, Lightbulb, CheckCheck, Trash, Filter,
  Database, Layers, FlaskConical, Plug,
  Send, MessageCircle, Globe, CheckCircle2, AlertCircle, Loader2, X,
} from "lucide-react";
import { useTheme } from "@/context/theme-context";
import { ACCENT_PALETTES, WIDGET_LABELS } from "@/lib/theme";
import {
  getTelegramConnection,
  buildRealTelegramConnection,
  getWebhookUrl,
  getWebhookStatus,
  saveWebhookStatus,
  CHANNEL_META,
  type IntegrationConnection,
  type WebhookStatus,
  type GmailConnection,
} from "@/lib/integrations";
import { TelegramConnectModal }  from "@/components/integrations/telegram-connect-modal";
import { GmailConnectModal }     from "@/components/integrations/gmail-connect-modal";
import { TelegramAccountModal }  from "@/components/integrations/telegram-account-modal";
import type { AuthStatusResponse } from "@/lib/mtproto-types";
import { usePermissions }         from "@/context/permission-context";
import type { AccentColor, IconStyle } from "@/lib/theme";
import { cn }        from "@/lib/utils";
import { AppToast }     from "@/components/ui/toast";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useWorkspace }      from "@/context/workspace-context";
import { RequirePermission } from "@/components/auth/require-permission";
import { Building2, Lock }   from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Tab = "general" | "appearance" | "modules" | "notifications" | "security" | "feedback" | "integrations";

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
  timeline:  GitBranch,
  inbox:     Inbox,
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
    <div className="bg-[var(--color-canvas)] border border-[var(--color-border)]/80 rounded-2xl overflow-hidden">
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
    <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[var(--color-border)]/60">
      <div className="w-7 h-7 rounded-lg bg-[var(--color-accent-subtle)] flex items-center justify-center flex-shrink-0">
        <Icon size={14} className="text-[var(--color-accent)]/80" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[var(--color-fg)]">{title}</p>
        {sub && <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

function FieldRow({ label, children, sub }: { label: string; children: React.ReactNode; sub?: string }) {
  return (
    <div className="px-5 py-3.5 flex items-center gap-4 border-b border-[var(--color-border)]/60 last:border-0 hover:bg-[var(--color-canvas)] transition-colors">
      <div className="w-40 flex-shrink-0">
        <label className="text-[12px] font-medium text-[var(--color-fg-muted)] block">{label}</label>
        {sub && <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5">{sub}</p>}
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
        "flex-1 bg-[var(--color-canvas)] border rounded-lg px-3 py-2 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-placeholder)] focus:outline-none transition-all duration-150",
        disabled
          ? "border-[var(--color-border)]/50 opacity-40 cursor-not-allowed"
          : "border-[var(--color-border)]/80 focus:border-[var(--color-accent)] hover:border-[var(--color-border)]"
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
        "relative rounded-full transition-all duration-200 ease-in-out flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
        enabled ? "bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]" : "bg-[var(--color-border)] hover:bg-[var(--color-border)] border border-[var(--color-border)]"
      )}
      style={{ height: "18px", width: "32px" }}
    >
      <span
        className={cn(
          "absolute top-[2px] w-[14px] h-[14px] rounded-full shadow-sm transition-all duration-200 ease-in-out",
          enabled ? "translate-x-[16px] bg-white" : "translate-x-[2px] bg-[var(--color-fg-faint)]"
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
    <div className="border-t border-[var(--color-border)]/60 bg-[var(--color-canvas)]/40 px-5 py-4 space-y-3.5">
      <p className="text-[12px] font-semibold text-[var(--color-fg-muted)] uppercase tracking-wider">
        {mode === "create" ? t("custom_module_new_title") : t("custom_module_edit_title")}
      </p>

      {/* Name + Description side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-[var(--color-fg-muted)]">{t("custom_module_name")}</label>
          <input
            ref={nameRef}
            value={form.name}
            onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(""); }}
            placeholder={t("custom_module_ph_name")}
            className={cn(
              "w-full bg-[var(--color-canvas)] border rounded-lg px-3 py-2 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-placeholder)] focus:outline-none transition-all duration-150",
              error ? "border-red-500/40 focus:border-red-500/60" : "border-[var(--color-border)]/80 focus:border-[var(--color-accent)]"
            )}
          />
          {error && <p className="text-[10px] text-red-400/80">{error}</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-[var(--color-fg-muted)]">{t("custom_module_desc")}</label>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={t("custom_module_ph_desc")}
            className="w-full bg-[var(--color-canvas)] border border-[var(--color-border)]/80 rounded-lg px-3 py-2 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-placeholder)] focus:outline-none focus:border-[var(--color-accent)] transition-all duration-150"
          />
        </div>
      </div>

      {/* Icon picker */}
      <div className="space-y-2">
        <label className="text-[11px] font-medium text-[var(--color-fg-muted)]">{t("custom_module_icon_label")}</label>
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
                    ? "bg-[var(--color-accent)]/90 text-[var(--color-fg)]"
                    : "bg-[var(--color-canvas)] border border-[var(--color-border)]/80 text-[var(--color-fg-faint)] hover:text-[var(--color-fg-muted)] hover:border-[var(--color-border)]"
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
          <span className="text-[12px] text-[var(--color-fg-muted)]">{t("settings_tab_modules")}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)]/80 hover:border-[var(--color-border)] transition-all duration-150"
          >
            {t("btn_cancel")}
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--color-accent)]/90 hover:bg-[var(--color-accent-hover)] text-[var(--color-fg)] transition-all duration-150"
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
  const { mode: workspaceMode, loadDemo, clearAll, currentWorkspace, refreshWorkspace } = useWorkspace();

  const [tab, setTab]   = useState<Tab>("general");


  const { prefs, setAccent, setIconStyle, setDashWidgets } = useTheme();
  const [profile, setProfile] = useState({ name: "", email: "", company: "", timezone: "" });
  const [wsSettings, setWsSettings] = useState({
    name:        "",
    logoUrl:     "",
    timezone:    "",
    locale:      "",
    currency:    "",
    description: "",
    website:     "",
    industry:    "",
  });
  const [wsSaving, setWsSaving] = useState(false);
  const [notifications, setNotifications] = useState({ email: true, tasks: true, pipeline: false });
  const [customForm, setCustomForm]       = useState<CustomFormMode>({ open: false });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [toast, setToast]              = useState<string | null>(null);

  // Integrations
  const [telegramConn,         setTelegramConn]         = useState<IntegrationConnection | null>(null);
  const [telegramModal,        setTelegramModal]        = useState(false);
  const [sendingTestMsg,       setSendingTestMsg]       = useState(false);
  const [webhookStatus,        setWebhookStatus]        = useState<WebhookStatus | null>(null);
  const [fetchingWebhookStatus,setFetchingWebhookStatus]= useState(false);
  const [gmailConn,            setGmailConn]            = useState<GmailConnection | null>(null);
  const [gmailModal,           setGmailModal]           = useState(false);

  // Personal Telegram account
  const [personalStatus,       setPersonalStatus]       = useState<AuthStatusResponse | null>(null);
  const [personalLoading,      setPersonalLoading]      = useState(false);
  const [personalModal,        setPersonalModal]        = useState(false);
  const [disconnectingPersonal,setDisconnectingPersonal]= useState(false);
  const { can: canDo }                                  = usePermissions();

  async function refreshPersonalStatus() {
    setPersonalLoading(true);
    try {
      const res  = await fetch("/api/integrations/telegram-personal/status", { credentials: "include" });
      if (res.ok) {
        const data = await res.json() as AuthStatusResponse;
        setPersonalStatus(data);
      }
    } catch { /* silent */ }
    finally { setPersonalLoading(false); }
  }

  async function handlePersonalDisconnect() {
    setDisconnectingPersonal(true);
    try {
      const res = await fetch("/api/integrations/telegram-personal/disconnect", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({ keepData: false }),
      });
      if (res.ok) {
        setPersonalStatus({ ok: true, connected: false });
        showToast("Personal Telegram account disconnected");
      } else {
        const err = await res.json() as { error?: string };
        showToast(err.error ?? "Failed to disconnect");
      }
    } catch {
      showToast("Network error");
    } finally {
      setDisconnectingPersonal(false);
    }
  }

  // Fetch real Gmail connection status from the server
  async function fetchEmailStatus() {
    try {
      const res = await fetch("/api/integrations/email/status", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json() as {
        connected: boolean;
        email?: string;
        displayName?: string;
        provider?: string;
        connectedAt?: string;
        lastSyncAt?: string;
      };
      if (data.connected && data.email) {
        setGmailConn({
          channel:     "email",
          provider:    (data.provider ?? "gmail") as import("@/lib/gmail").EmailProviderType,
          displayName: data.email,
          connectedAt: data.connectedAt ?? new Date().toISOString(),
          isMock:      false,
          metadata:    { profileName: data.displayName ?? data.email },
        });
      } else {
        setGmailConn(null);
      }
    } catch { /* silent */ }
  }

  useEffect(() => {
    void fetchEmailStatus();
    void refreshPersonalStatus();

    // Handle OAuth callback return params
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const emailConnected = params.get("email_connected");
      const emailError     = params.get("email_error");
      if (emailConnected === "1") {
        showToast("Gmail connected successfully");
        // Clean up URL
        params.delete("email_connected");
        const newSearch = params.toString();
        history.replaceState(null, "", newSearch ? `?${newSearch}` : window.location.pathname);
      } else if (emailError) {
        showToast(`Gmail error: ${decodeURIComponent(emailError)}`);
        params.delete("email_error");
        const newSearch = params.toString();
        history.replaceState(null, "", newSearch ? `?${newSearch}` : window.location.pathname);
      }
    }

    // Hydrate Telegram connection from server (real bots live in SQLite;
    // simulated/mock connections remain in localStorage by design).
    void (async () => {
      let conn: IntegrationConnection | null = null;
      try {
        const res  = await fetch("/api/integrations/telegram/connect?ws=default");
        const data = await res.json() as {
          ok: boolean; connected: boolean;
          bot: { botUsername: string; botName: string; botId: string; tokenMasked: string } | null;
        };
        if (data.ok && data.connected && data.bot) {
          conn = buildRealTelegramConnection({
            botUsername: data.bot.botUsername,
            botName:     data.bot.botName,
            botId:       data.bot.botId,
            tokenMasked: data.bot.tokenMasked,
          });
        }
      } catch { /* silent */ }
      // Fall back to localStorage (simulated connections stored locally)
      if (!conn) conn = getTelegramConnection();
      setTelegramConn(conn);
      if (conn && !conn.isMock) {
        const cached = getWebhookStatus();
        if (cached) setWebhookStatus(cached);
        void refreshWebhookStatus();
      }
    })();
  }, []); // refreshWebhookStatus is defined below — stable within the component scope

  async function refreshWebhookStatus() {
    setFetchingWebhookStatus(true);
    try {
      const res  = await fetch("/api/integrations/telegram/webhook-info?ws=default");
      const data = await res.json() as { ok: boolean; webhookInfo?: { url: string; pending_update_count: number; last_error_date?: number; last_error_message?: string; max_connections?: number; ip_address?: string }; error?: string };
      if (data.ok && data.webhookInfo) {
        const status: WebhookStatus = {
          url:               data.webhookInfo.url,
          pendingUpdateCount: data.webhookInfo.pending_update_count,
          lastErrorDate:     data.webhookInfo.last_error_date,
          lastErrorMessage:  data.webhookInfo.last_error_message,
          maxConnections:    data.webhookInfo.max_connections,
          ipAddress:         data.webhookInfo.ip_address,
          fetchedAt:         new Date().toISOString(),
        };
        saveWebhookStatus(status);
        setWebhookStatus(status);
      }
    } catch { /* silent */ }
    finally { setFetchingWebhookStatus(false); }
  }

  // ── Dev test utility: simulate an incoming Telegram message ───────────────
  async function sendTestTelegramMessage() {
    if (sendingTestMsg) return;
    setSendingTestMsg(true);

    const SAMPLE_MESSAGES = [
      "Hi, I just saw your latest update — looks great! When can we schedule a follow-up call?",
      "Quick question about the proposal you sent — can you break down the pricing for the enterprise tier?",
      "Hey, just checking in on the project status. Any blockers I should know about?",
      "Thanks for the update! Our team reviewed it and we're ready to move forward.",
      "Can you send me the contract for the Q3 engagement? We want to sign by end of week.",
    ];
    const text = SAMPLE_MESSAGES[Math.floor(Math.random() * SAMPLE_MESSAGES.length)];

    // Build a realistic mock Telegram Update
    const updateId = Math.floor(Math.random() * 900_000_000) + 100_000_000;
    const msgId    = Math.floor(Math.random() * 9_000) + 1_000;
    const chatId   = Math.floor(Math.random() * 900_000_000) + 100_000_000;

    const payload = {
      update_id: updateId,
      message: {
        message_id: msgId,
        from: {
          id:         chatId,
          is_bot:     false,
          first_name: "Test",
          last_name:  "User",
          username:   "ventra_test_user",
        },
        chat: {
          id:         chatId,
          type:       "private",
          first_name: "Test",
          last_name:  "User",
          username:   "ventra_test_user",
        },
        date: Math.floor(Date.now() / 1000),
        text,
      },
    };

    try {
      const res = await fetch("/api/integrations/telegram/webhook", {
        method:  "POST",
        headers: {
          "Content-Type":       "application/json",
          "x-ventra-simulated": "1",
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast(t("toast_test_sent"));
      } else {
        const err = await res.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
        showToast(`Failed: ${err.error ?? "Unknown error"}`);
      }
    } catch {
      showToast("Network error — could not send test message");
    } finally {
      setSendingTestMsg(false);
    }
  }

  // Workspace confirm dialogs
  type WsAction = "load_demo" | "clear_all" | "reset_demo";
  const [wsConfirm, setWsConfirm] = useState<WsAction | null>(null);

  // Feedback admin state
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [fbTypeFilter,  setFbTypeFilter]  = useState<FeedbackType | "all">("all");
  const [fbStatusFilter,setFbStatusFilter]= useState<FeedbackStatus | "all">("all");

  useEffect(() => {
    if (user) setProfile({ name: user.name, email: user.email, company: user.company, timezone: "" });
  }, [user]);

  useEffect(() => {
    if (currentWorkspace) {
      const s = (currentWorkspace.settings ?? {}) as Record<string, string>;
      setWsSettings({
        name:        currentWorkspace.name,
        logoUrl:     currentWorkspace.logoUrl ?? "",
        timezone:    s.timezone    ?? "",
        locale:      s.locale      ?? "",
        currency:    s.currency    ?? "",
        description: s.description ?? "",
        website:     s.website     ?? "",
        industry:    s.industry    ?? "",
      });
    }
  }, [currentWorkspace]);

  // Load feedback items when switching to the feedback tab
  useEffect(() => {
    if (tab === "feedback") setFeedbackItems(getFeedbackList());
  }, [tab]);

  function showToast(msg: string) { setToast(msg); }

  function handleSave() {
    showToast(t("settings_saved"));
  }

  async function handleWsSave() {
    setWsSaving(true);
    try {
      const body: Record<string, unknown> = {
        name:     wsSettings.name.trim() || undefined,
        logoUrl:  wsSettings.logoUrl.trim() || undefined,
        settings: {
          timezone:    wsSettings.timezone.trim()    || undefined,
          locale:      wsSettings.locale.trim()      || undefined,
          currency:    wsSettings.currency.trim()    || undefined,
          description: wsSettings.description.trim() || undefined,
          website:     wsSettings.website.trim()     || undefined,
          industry:    wsSettings.industry.trim()    || undefined,
        },
      };
      const res = await fetch("/api/workspaces/current", {
        method:      "PATCH",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify(body),
      });
      if (res.ok) {
        await refreshWorkspace();
        showToast(t("settings_saved"));
      } else {
        const err = await res.json() as { error?: string };
        showToast(err.error ?? "Failed to save workspace settings");
      }
    } catch {
      showToast("Network error");
    } finally {
      setWsSaving(false);
    }
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

  const tabs: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "general",       label: t("settings_tab_general"),    icon: Settings2 },
    { id: "appearance",    label: t("settings_tab_appearance"), icon: Palette   },
    { id: "modules",       label: t("settings_tab_modules"),    icon: Puzzle    },
    { id: "notifications", label: t("settings_tab_notifs"),     icon: Bell      },
    { id: "security",      label: t("settings_tab_security"),   icon: Shield    },
    { id: "feedback",      label: t("settings_tab_feedback"),     icon: MessageSquare,
      badge: feedbackItems.filter((f) => f.status === "new").length || undefined },
    { id: "integrations",  label: t("settings_tab_integrations"), icon: Plug,
      badge: telegramConn ? 1 : undefined },
  ];

  return (
    <>
      <AppToast msg={toast} onDone={() => setToast(null)} />

      <div className="flex flex-col flex-1">
        <TopBar title={t("settings_title")} subtitle={t("settings_subtitle")} />

        <div className="flex-1 p-6">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-6">

              {/* Left sidebar nav */}
              <div className="w-44 flex-shrink-0">
                <nav className="space-y-0.5">
                  {tabs.map(({ id, label, icon: Icon, badge }) => (
                    <button
                      key={id}
                      onClick={() => setTab(id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 text-left",
                        tab === id
                          ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
                          : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)]"
                      )}
                    >
                      <Icon size={13} className={tab === id ? "text-[var(--color-accent)]" : "text-[var(--color-fg-faint)]"} strokeWidth={tab === id ? 2 : 1.75} />
                      {label}
                      {badge ? (
                        <span className="ml-auto text-[9px] font-bold bg-[var(--color-accent)] text-white px-1.5 py-0.5 rounded-full min-w-[16px] text-center">
                          {badge}
                        </span>
                      ) : null}
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

                    {/* ── Workspace Settings ── */}
                    <RequirePermission
                      permission="workspace.manage"
                      fallback={
                        <SectionCard>
                          <div className="flex items-center gap-3 px-5 py-4 opacity-60">
                            <Lock size={14} className="text-[var(--color-fg-faint)]" />
                            <p className="text-[13px] text-[var(--color-fg-muted)]">
                              Workspace settings are managed by owners and admins.
                            </p>
                          </div>
                        </SectionCard>
                      }
                    >
                    <SectionCard>
                      <SectionHeader
                        icon={Building2}
                        title="Workspace Settings"
                        sub="Name, logo, and regional preferences for this workspace"
                      />
                      <FieldRow label="Workspace name">
                        <TextInput
                          value={wsSettings.name}
                          onChange={(v) => setWsSettings({ ...wsSettings, name: v })}
                          placeholder="My Company"
                        />
                      </FieldRow>
                      <FieldRow label="Logo URL" sub="Link to a square PNG or SVG">
                        <TextInput
                          value={wsSettings.logoUrl}
                          onChange={(v) => setWsSettings({ ...wsSettings, logoUrl: v })}
                          placeholder="https://example.com/logo.png"
                        />
                      </FieldRow>
                      <FieldRow label="Timezone">
                        <TextInput
                          value={wsSettings.timezone}
                          onChange={(v) => setWsSettings({ ...wsSettings, timezone: v })}
                          placeholder="Europe/Moscow"
                        />
                      </FieldRow>
                      <FieldRow label="Language" sub="Workspace default locale">
                        <div className="flex items-center bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg p-1 gap-0.5 w-fit">
                          {(["en", "ru"] as const).map((l) => (
                            <button
                              key={l}
                              onClick={() => setWsSettings({ ...wsSettings, locale: l })}
                              className={cn(
                                "px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors uppercase",
                                wsSettings.locale === l
                                  ? "bg-[var(--color-accent)] text-[var(--color-fg)]"
                                  : "text-[var(--color-fg-faint)] hover:text-[var(--color-fg)]",
                              )}
                            >
                              {l === "ru" ? "Русский" : "English"}
                            </button>
                          ))}
                        </div>
                      </FieldRow>
                      <FieldRow label="Currency">
                        <div className="flex items-center bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg p-1 gap-0.5 w-fit">
                          {(["USD", "EUR", "RUB"] as const).map((c) => (
                            <button
                              key={c}
                              onClick={() => setWsSettings({ ...wsSettings, currency: c })}
                              className={cn(
                                "px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors",
                                wsSettings.currency === c
                                  ? "bg-[var(--color-accent)] text-[var(--color-fg)]"
                                  : "text-[var(--color-fg-faint)] hover:text-[var(--color-fg)]",
                              )}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                      </FieldRow>

                      {/* ── Company Branding ───────────────────────────── */}
                      <div className="pt-2 border-t border-[var(--color-border)] mt-2">
                        <p className="text-[11px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider mb-3">Company information</p>
                      </div>
                      <FieldRow label="Description" sub="Short bio shown to team members">
                        <textarea
                          value={wsSettings.description}
                          onChange={(e) => setWsSettings({ ...wsSettings, description: e.target.value })}
                          placeholder="We help businesses grow with AI-powered client management."
                          rows={2}
                          className="w-full bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-faint)] focus:outline-none focus:border-[var(--color-accent)] transition-colors resize-none"
                        />
                      </FieldRow>
                      <FieldRow label="Website">
                        <TextInput
                          value={wsSettings.website}
                          onChange={(v) => setWsSettings({ ...wsSettings, website: v })}
                          placeholder="https://yourcompany.com"
                        />
                      </FieldRow>
                      <FieldRow label="Industry">
                        <div className="flex flex-wrap gap-1.5">
                          {["SaaS", "Agency", "E-commerce", "Consulting", "Real Estate", "Healthcare", "Finance", "Other"].map((ind) => (
                            <button
                              key={ind}
                              onClick={() => setWsSettings({ ...wsSettings, industry: ind })}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all",
                                wsSettings.industry === ind
                                  ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-white"
                                  : "bg-[var(--color-canvas)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-accent-subtle)]",
                              )}
                            >
                              {ind}
                            </button>
                          ))}
                        </div>
                      </FieldRow>

                      {/* ── Plan badge ─────────────────────────────────── */}
                      <div className="pt-2 border-t border-[var(--color-border)] mt-2">
                        <p className="text-[11px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider mb-3">Subscription</p>
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200">
                          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-[11px] font-bold">β</span>
                          </div>
                          <div className="flex-1">
                            <p className="text-[13px] font-semibold text-violet-900">Beta — Free</p>
                            <p className="text-[11px] text-violet-700">All features included during beta. Paid plans coming soon.</p>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-violet-100 border border-violet-300 text-[10px] font-bold text-violet-700 uppercase">Beta</span>
                        </div>
                      </div>
                    </SectionCard>

                    <div className="flex items-center justify-end pt-0">
                      <button
                        onClick={() => { void handleWsSave(); }}
                        disabled={wsSaving}
                        className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-fg)] text-[13px] font-medium rounded-lg transition-colors shadow-lg disabled:opacity-60"
                      >
                        {wsSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Save workspace settings
                      </button>
                    </div>
                    </RequirePermission>

                    <SectionCard>
                      <SectionHeader icon={Settings2} title={t("settings_general_title")} sub={t("settings_general_sub")} />
                      <FieldRow label={t("settings_lang_label")} sub={t("settings_lang_sub")}>
                        <div className="flex items-center bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg p-1 gap-0.5 w-fit">
                          {(["ru", "en"] as const).map((l) => (
                            <button
                              key={l}
                              onClick={() => setLang(l)}
                              className={cn(
                                "px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors uppercase",
                                lang === l ? "bg-[var(--color-accent)] text-[var(--color-fg)]" : "text-[var(--color-fg-faint)] hover:text-[var(--color-fg)]"
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

                    {/* ── Workspace & Data ── */}
                    <SectionCard>
                      <SectionHeader
                        icon={Database}
                        title={t("settings_ws_title")}
                        sub={t("settings_ws_sub")}
                      />

                      {/* Current mode indicator */}
                      <div className="px-5 py-3 border-b border-[var(--color-border)]/60 flex items-center gap-3">
                        <div className={cn(
                          "px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border flex items-center gap-1.5",
                          workspaceMode === "demo"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : workspaceMode === "empty"
                            ? "bg-[var(--color-canvas)] text-[var(--color-fg-faint)] border-[var(--color-border)]"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200",
                        )}>
                          <div className={cn("w-1.5 h-1.5 rounded-full",
                            workspaceMode === "demo"   ? "bg-amber-400" :
                            workspaceMode === "empty"  ? "bg-[var(--color-fg-faint)]" :
                                                         "bg-emerald-500")} />
                          {workspaceMode === "demo"   ? t("ws_mode_demo") :
                           workspaceMode === "empty"  ? t("ws_mode_empty") :
                                                        t("ws_mode_custom")}
                        </div>
                        <p className="text-[11px] text-[var(--color-fg-faint)]">
                          {workspaceMode === "demo"
                            ? t("ws_hint_demo")
                            : workspaceMode === "empty"
                            ? t("ws_hint_empty")
                            : t("ws_hint_custom")}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="divide-y divide-[var(--color-border)]/60">
                        {/* Load demo data */}
                        <div className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-[var(--color-canvas)] transition-colors">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                              <FlaskConical size={13} className="text-amber-600" />
                            </div>
                            <div>
                              <p className="text-[13px] font-medium text-[var(--color-fg)]">{t("ws_load_title")}</p>
                              <p className="text-[11px] text-[var(--color-fg-faint)]">{t("ws_load_sub")}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setWsConfirm("load_demo")}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors flex-shrink-0"
                          >
                            <Database size={11} /> {t("ws_load_btn")}
                          </button>
                        </div>

                        {/* Clear all data */}
                        <div className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-[var(--color-canvas)] transition-colors">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-[var(--color-canvas)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0">
                              <Layers size={13} className="text-[var(--color-fg-muted)]" />
                            </div>
                            <div>
                              <p className="text-[13px] font-medium text-[var(--color-fg)]">{t("ws_empty_title")}</p>
                              <p className="text-[11px] text-[var(--color-fg-faint)]">{t("ws_empty_sub")}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setWsConfirm("clear_all")}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-red-500 border border-red-200 hover:bg-red-50 transition-colors flex-shrink-0"
                          >
                            {t("ws_clear_btn")}
                          </button>
                        </div>

                        {/* Reset to demo */}
                        <div className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-[var(--color-canvas)] transition-colors">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-[var(--color-canvas)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0">
                              <RotateCcw size={13} className="text-[var(--color-fg-muted)]" />
                            </div>
                            <div>
                              <p className="text-[13px] font-medium text-[var(--color-fg)]">{t("ws_reset_title")}</p>
                              <p className="text-[11px] text-[var(--color-fg-faint)]">{t("ws_reset_sub")}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setWsConfirm("reset_demo")}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--color-fg-muted)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] transition-colors flex-shrink-0"
                          >
                            <RotateCcw size={11} /> {t("ws_reset_btn")}
                          </button>
                        </div>
                      </div>
                    </SectionCard>

                    {/* Workspace confirm modals */}
                    {wsConfirm === "load_demo" && (
                      <ConfirmModal
                        title={t("ws_confirm_load_title")}
                        description={t("ws_confirm_load_desc")}
                        items={[t("ws_confirm_load_item1"), t("ws_confirm_load_item2"), t("ws_confirm_load_item3"), t("ws_confirm_load_item4")]}
                        confirmLabel={t("ws_confirm_load_label")}
                        confirmColor="bg-amber-500 hover:bg-amber-400"
                        onConfirm={() => {
                          loadDemo();
                          setWsConfirm(null);
                          showToast(t("ws_toast_loaded"));
                        }}
                        onCancel={() => setWsConfirm(null)}
                      />
                    )}
                    {wsConfirm === "clear_all" && (
                      <ConfirmModal
                        title={t("ws_confirm_clear_title")}
                        description={t("ws_confirm_clear_desc")}
                        items={[t("ws_confirm_clear_item1"), t("ws_confirm_clear_item2"), t("ws_confirm_clear_item3"), t("ws_confirm_clear_item4"), t("ws_confirm_clear_item5")]}
                        confirmLabel={t("ws_confirm_clear_label")}
                        onConfirm={() => {
                          clearAll();
                          setWsConfirm(null);
                          showToast(t("ws_toast_cleared"));
                        }}
                        onCancel={() => setWsConfirm(null)}
                      />
                    )}
                    {wsConfirm === "reset_demo" && (
                      <ConfirmModal
                        title={t("ws_confirm_reset_title")}
                        description={t("ws_confirm_reset_desc")}
                        items={[t("ws_confirm_reset_item1"), t("ws_confirm_reset_item2"), t("ws_confirm_reset_item3")]}
                        confirmLabel={t("ws_confirm_reset_label")}
                        onConfirm={() => {
                          loadDemo();
                          setWsConfirm(null);
                          showToast(t("ws_toast_restored"));
                        }}
                        onCancel={() => setWsConfirm(null)}
                      />
                    )}

                    {/* Reset onboarding */}
                    <SectionCard>
                      <SectionHeader
                        icon={RotateCcw}
                        title={t("ws_onb_title")}
                        sub={t("ws_onb_sub")}
                      />
                      <div className="px-5 py-4 flex items-center justify-between gap-4">
                        <p className="text-[12px] text-[var(--color-fg-faint)] leading-relaxed max-w-[300px]">
                          {t("ws_onb_desc")}
                        </p>
                        {confirmReset ? (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[11px] text-red-500 font-medium">{t("ws_onb_prompt")}</span>
                            <button
                              onClick={() => {
                                resetOnboarding();
                                setConfirmReset(false);
                                showToast(t("ws_toast_onb_reset"));
                              }}
                              className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-red-500 hover:bg-red-400 text-white transition-colors"
                            >
                              {t("ws_onb_yes")}
                            </button>
                            <button
                              onClick={() => setConfirmReset(false)}
                              className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--color-fg-muted)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] transition-colors"
                            >
                              {t("btn_cancel")}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmReset(true)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-medium text-red-500 border border-red-200 hover:bg-red-50 transition-colors flex-shrink-0"
                          >
                            <RotateCcw size={12} />
                            {t("ws_onb_btn")}
                          </button>
                        )}
                      </div>
                    </SectionCard>

                    <div className="flex items-center justify-between pt-1">
                      <p className="text-[12px] text-[var(--color-fg-faint)]">{t("settings_demo_note")}</p>
                      <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-fg)] text-[13px] font-medium rounded-lg transition-colors shadow-lg "
                      >
                        {t("settings_save")}
                      </button>
                    </div>
                  </>
                )}

                {/* ── Appearance ───────────────────────────────────────────── */}
                {tab === "appearance" && (
                  <div className="space-y-4">

                    {/* Accent color */}
                    <SectionCard>
                      <SectionHeader icon={Palette} title={t("settings_accent_title")} sub={t("settings_accent_sub")} />
                      <div className="px-5 py-5">
                        <div className="flex gap-3 flex-wrap">
                          {(Object.keys(ACCENT_PALETTES) as AccentColor[]).map((accent) => {
                            const pal = ACCENT_PALETTES[accent];
                            const active = prefs.accent === accent;
                            return (
                              <button key={accent} onClick={() => setAccent(accent)}
                                className={cn(
                                  "flex flex-col items-center gap-2 group transition-all",
                                )}>
                                <div className={cn(
                                  "w-10 h-10 rounded-xl shadow-sm border-2 transition-all duration-200",
                                  active ? "border-[var(--color-fg)] scale-110 shadow-md" : "border-transparent hover:scale-105"
                                )}
                                  style={{ background: pal.color }} />
                                <div className={cn(
                                  "flex items-center gap-1 text-[11px] font-medium capitalize",
                                  active ? "text-[var(--color-fg)]" : "text-[var(--color-fg-faint)]"
                                )}>
                                  {active && <Check size={10} className="text-[var(--color-fg)]" />}
                                  {accent}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </SectionCard>

                    {/* Icon style */}
                    <SectionCard>
                      <SectionHeader icon={Settings2} title={t("settings_icon_title")} sub={t("settings_icon_sub")} />
                      <div className="px-5 py-5">
                        <div className="flex gap-3">
                          {(["outline", "solid"] as IconStyle[]).map((style) => {
                            const active = prefs.iconStyle === style;
                            return (
                              <button key={style} onClick={() => setIconStyle(style)}
                                className={cn(
                                  "flex items-center gap-2 px-4 py-2 rounded-xl border text-[13px] font-medium transition-all",
                                  active
                                    ? "border-[var(--color-accent)] bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
                                    : "border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-accent-subtle)] hover:text-[var(--color-fg)]"
                                )}>
                                {active && <Check size={13} />}
                                <span className="capitalize">{style}</span>
                                <span className="text-[11px] opacity-60">({style === "outline" ? t("style_thin") : t("style_bold")})</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </SectionCard>

                    {/* Dashboard widgets */}
                    <SectionCard>
                      <SectionHeader icon={LayoutDashboard} title={t("settings_widgets_title")} sub={t("settings_widgets_sub")} />
                      <div className="px-5 py-4 space-y-2">
                        {(Object.keys(WIDGET_LABELS) as string[]).map((id) => {
                          const isOn = prefs.dashWidgets.includes(id);
                          const idx  = prefs.dashWidgets.indexOf(id);
                          return (
                            <div key={id} className="flex items-center gap-3 px-3 py-2.5 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl hover:border-[var(--color-accent-subtle)] transition-colors">
                              <button onClick={() => {
                                if (isOn) setDashWidgets(prefs.dashWidgets.filter((w) => w !== id));
                                else setDashWidgets([...prefs.dashWidgets, id]);
                              }}
                                className={cn(
                                  "w-9 h-5 rounded-full transition-colors flex-shrink-0 relative",
                                  isOn ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"
                                )}>
                                <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform", isOn && "translate-x-4")} />
                              </button>
                              <span className={cn("text-[13px] font-medium flex-1", isOn ? "text-[var(--color-fg)]" : "text-[var(--color-fg-faint)]")}>
                                {WIDGET_LABELS[id]}
                              </span>
                              {isOn && (
                                <div className="flex gap-0.5">
                                  <button onClick={() => {
                                    const arr = [...prefs.dashWidgets];
                                    if (idx <= 0) return;
                                    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                                    setDashWidgets(arr);
                                  }} disabled={idx <= 0}
                                    className="p-1 rounded hover:bg-[var(--color-border)] disabled:opacity-30 transition-colors">
                                    <ChevronUp size={13} className="text-[var(--color-fg-muted)]" />
                                  </button>
                                  <button onClick={() => {
                                    const arr = [...prefs.dashWidgets];
                                    if (idx >= arr.length - 1) return;
                                    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                                    setDashWidgets(arr);
                                  }} disabled={idx >= prefs.dashWidgets.length - 1}
                                    className="p-1 rounded hover:bg-[var(--color-border)] disabled:opacity-30 transition-colors">
                                    <ChevronDown size={13} className="text-[var(--color-fg-muted)]" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </SectionCard>
                  </div>
                )}

                {/* ── Modules ──────────────────────────────────────────────── */}
                {tab === "modules" && (
                  <div className="space-y-4">
                    <div className="bg-[var(--color-accent-subtle)] border border-[var(--color-accent-subtle)] rounded-xl px-4 py-3 text-[12px] text-[var(--color-accent-fg)] leading-relaxed">
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
                            className="group flex items-center gap-3 px-4 py-2.5 border-b border-[var(--color-border)]/50 last:border-0 hover:bg-[var(--color-canvas)] transition-colors"
                          >
                            <div className={cn(
                              "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200",
                              enabled
                                ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
                                : "bg-[var(--color-canvas)] text-[var(--color-fg-faint)]"
                            )}>
                              <Icon size={13} strokeWidth={1.75} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                "text-[13px] font-medium transition-colors",
                                enabled ? "text-[var(--color-fg)]" : "text-[var(--color-fg-faint)]"
                              )}>
                                {t(`mod_${mod.id}` as Parameters<typeof t>[0])}
                              </p>
                              <p className="text-[11px] text-[var(--color-fg-faint)] mt-px leading-tight">
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
                            className="group flex items-center gap-3 px-4 py-2.5 border-b border-[var(--color-border)]/50 last:border-0 hover:bg-[var(--color-canvas)] transition-colors"
                          >
                            <div className={cn(
                              "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200",
                              enabled
                                ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
                                : "bg-[var(--color-canvas)] text-[var(--color-fg-faint)]"
                            )}>
                              <Icon size={13} strokeWidth={1.75} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className={cn(
                                  "text-[13px] font-medium transition-colors",
                                  enabled ? "text-[var(--color-fg)]" : "text-[var(--color-fg-faint)]"
                                )}>
                                  {t(`mod_${mod.id}` as Parameters<typeof t>[0])}
                                </p>
                                <span className="inline-flex items-center text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-px rounded-full leading-none">
                                  {t("settings_modules_soon")}
                                </span>
                              </div>
                              <p className="text-[11px] text-[var(--color-fg-faint)] mt-px leading-tight">
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
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--color-accent)]/90 hover:bg-[var(--color-accent-hover)] text-[var(--color-fg)] transition-all duration-150 flex-shrink-0"
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
                          <div className="w-8 h-8 rounded-xl bg-[var(--color-canvas)] flex items-center justify-center">
                            <Package size={14} className="text-[var(--color-fg-faint)]" />
                          </div>
                          <div className="text-center">
                            <p className="text-[12px] font-medium text-[var(--color-fg-faint)]">{t("custom_module_empty")}</p>
                            <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5 max-w-[200px] leading-relaxed">{t("custom_module_empty_sub")}</p>
                          </div>
                        </div>
                      )}

                      {customModules.map((mod) => {
                        const Icon    = getCustomModuleIcon(mod.icon);
                        const isEditing = customForm.open && customForm.mode === "edit" && customForm.module.id === mod.id;
                        const isDeleting = confirmDeleteId === mod.id;

                        return (
                          <div key={mod.id} className="border-b border-[var(--color-border)]/50 last:border-0">
                            <div className="group flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--color-canvas)] transition-colors">
                              <div className={cn(
                                "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200",
                                mod.enabled ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]" : "bg-[var(--color-canvas)] text-[var(--color-fg-faint)]"
                              )}>
                                <Icon size={13} strokeWidth={1.75} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={cn("text-[13px] font-medium transition-colors", mod.enabled ? "text-[var(--color-fg)]" : "text-[var(--color-fg-faint)]")}>
                                  {mod.name}
                                </p>
                                {mod.description && (
                                  <p className="text-[11px] text-[var(--color-fg-faint)] mt-px truncate leading-tight">{mod.description}</p>
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
                                        ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
                                        : "opacity-0 group-hover:opacity-100 text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] hover:bg-[var(--color-canvas)]"
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
                                      className="px-2 py-1 rounded-md text-[11px] font-medium bg-red-500/90 hover:bg-red-400 text-[var(--color-fg)] transition-colors"
                                    >
                                      {t("btn_delete")}
                                    </button>
                                    <button
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="px-2 py-1 rounded-md text-[11px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)] transition-colors"
                                    >
                                      {t("btn_cancel")}
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { setCustomForm({ open: false }); setConfirmDeleteId(mod.id); }}
                                    className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 text-[var(--color-fg-faint)] hover:text-red-400 hover:bg-[var(--color-canvas)] transition-all duration-150"
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
                        <div key={key} className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]/60 last:border-0 hover:bg-[var(--color-canvas)] transition-colors">
                          <div>
                            <p className="text-[13px] font-medium text-[var(--color-fg)]">{label}</p>
                            <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5">{sub}</p>
                          </div>
                          <Toggle
                            enabled={notifications[key]}
                            onChange={(v) => setNotifications({ ...notifications, [key]: v })}
                          />
                        </div>
                      ))}
                    </SectionCard>

                    <div className="flex items-center justify-between pt-1">
                      <p className="text-[12px] text-[var(--color-fg-faint)]">{t("settings_demo_note")}</p>
                      <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-fg)] text-[13px] font-medium rounded-lg transition-colors shadow-lg ">
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
                      <div className="px-5 py-3 flex items-center gap-2 text-[12px] text-[var(--color-fg-faint)]">
                        <Mail size={13} />
                        {t("settings_demo_note")}
                      </div>
                    </SectionCard>

                    <div className="flex items-center justify-between pt-1">
                      <p className="text-[12px] text-[var(--color-fg-faint)]">{t("settings_demo_note")}</p>
                      <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-fg)] text-[13px] font-medium rounded-lg transition-colors shadow-lg ">
                        {t("settings_save")}
                      </button>
                    </div>
                  </>
                )}

                {/* ── Feedback admin ────────────────────────────────────────── */}
                {tab === "feedback" && (() => {
                  const TYPE_OPTS: { id: FeedbackType | "all"; label: string; icon: React.ElementType }[] = [
                    { id: "all",     label: t("fb_type_all"),      icon: Filter      },
                    { id: "general", label: t("fb_type_general"),  icon: MessageSquare },
                    { id: "bug",     label: t("fb_type_bugs"),     icon: Bug         },
                    { id: "feature", label: t("fb_type_features"), icon: Lightbulb   },
                  ];
                  const STATUS_OPTS: { id: FeedbackStatus | "all"; label: string }[] = [
                    { id: "all",      label: t("fb_status_all")      },
                    { id: "new",      label: t("fb_status_new")      },
                    { id: "reviewed", label: t("fb_status_reviewed") },
                    { id: "resolved", label: t("fb_status_resolved") },
                  ];
                  const visible = feedbackItems.filter((f) =>
                    (fbTypeFilter   === "all" || f.type   === fbTypeFilter) &&
                    (fbStatusFilter === "all" || f.status === fbStatusFilter)
                  );

                  function handleStatus(id: string, status: FeedbackStatus) {
                    updateFeedbackStatus(id, status);
                    setFeedbackItems(getFeedbackList());
                  }
                  function handleDelete(id: string) {
                    deleteFeedbackItem(id);
                    setFeedbackItems(getFeedbackList());
                  }

                  const TYPE_ICON: Record<FeedbackType, React.ElementType> = {
                    general: MessageSquare, bug: Bug, feature: Lightbulb,
                  };
                  const TYPE_COLOR: Record<FeedbackType, string> = {
                    general: "text-violet-600 bg-violet-50 border-violet-200",
                    bug:     "text-red-600 bg-red-50 border-red-200",
                    feature: "text-amber-600 bg-amber-50 border-amber-200",
                  };
                  const STATUS_COLOR: Record<FeedbackStatus, string> = {
                    new:      "bg-blue-50 text-blue-700 border-blue-200",
                    reviewed: "bg-amber-50 text-amber-700 border-amber-200",
                    resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
                  };

                  return (
                    <div className="space-y-4">
                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: t("fb_stat_total"),    value: feedbackItems.length,                                    color: "text-[var(--color-fg)]" },
                          { label: t("fb_stat_new"),      value: feedbackItems.filter((f) => f.status === "new").length,  color: "text-blue-600" },
                          { label: t("fb_stat_resolved"), value: feedbackItems.filter((f) => f.status === "resolved").length, color: "text-emerald-600" },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-center">
                            <p className={cn("text-[22px] font-bold", color)}>{value}</p>
                            <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5">{label}</p>
                          </div>
                        ))}
                      </div>

                      {/* Filters */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex gap-1">
                          {TYPE_OPTS.map(({ id, label, icon: Icon }) => (
                            <button
                              key={id}
                              onClick={() => setFbTypeFilter(id)}
                              className={cn(
                                "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors",
                                fbTypeFilter === id
                                  ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-white"
                                  : "bg-[var(--color-canvas)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-accent-subtle)]",
                              )}
                            >
                              <Icon size={10} />
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="w-px h-5 bg-[var(--color-border)]" />
                        <select
                          value={fbStatusFilter}
                          onChange={(e) => setFbStatusFilter(e.target.value as FeedbackStatus | "all")}
                          className="bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-fg-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                        >
                          {STATUS_OPTS.map(({ id, label }) => (
                            <option key={id} value={id}>{label}</option>
                          ))}
                        </select>
                      </div>

                      {/* List */}
                      {visible.length === 0 ? (
                        <div className="bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-2xl py-12 flex flex-col items-center gap-2">
                          <MessageSquare size={24} className="text-[var(--color-border)]" />
                          <p className="text-[13px] font-medium text-[var(--color-fg-faint)]">
                            {feedbackItems.length === 0 ? t("fb_empty_title") : t("fb_no_match")}
                          </p>
                          <p className="text-[11px] text-[var(--color-fg-faint)]">
                            {feedbackItems.length === 0
                              ? t("fb_empty_sub")
                              : t("fb_no_match_sub")}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {visible.map((item) => {
                            const TypeIcon = TYPE_ICON[item.type];
                            const isGeneral = item.type === "general";
                            const isBug     = item.type === "bug";
                            const isFeat    = item.type === "feature";
                            const gc = isGeneral ? item.content as import("@/lib/feedback").GeneralContent : null;
                            const bc = isBug     ? item.content as import("@/lib/feedback").BugContent    : null;
                            const fc = isFeat    ? item.content as import("@/lib/feedback").FeatureContent : null;

                            return (
                              <div key={item.id} className="bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl overflow-hidden">
                                {/* Header */}
                                <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]/60">
                                  <div className={cn("w-6 h-6 rounded-lg border flex items-center justify-center flex-shrink-0", TYPE_COLOR[item.type])}>
                                    <TypeIcon size={11} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={cn("text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border", TYPE_COLOR[item.type])}>
                                        {item.type}
                                      </span>
                                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize", STATUS_COLOR[item.status])}>
                                        {item.status}
                                      </span>
                                      <span className="text-[10px] text-[var(--color-fg-faint)]">{item.page}</span>
                                      <span className="text-[10px] text-[var(--color-fg-faint)] ml-auto">
                                        {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Content */}
                                <div className="px-4 py-3 space-y-1.5 text-[12px]">
                                  {gc && (
                                    <>
                                      <p><span className="text-[var(--color-fg-faint)]">Rating:</span> {"★".repeat(gc.rating)}{"☆".repeat(5 - gc.rating)} <span className="text-[var(--color-fg-faint)]">({gc.rating}/5)</span></p>
                                      {gc.liked     && <p><span className="text-[var(--color-fg-faint)]">Liked:</span> {gc.liked}</p>}
                                      {gc.confusing && <p><span className="text-[var(--color-fg-faint)]">Confusing:</span> {gc.confusing}</p>}
                                      {gc.wouldUse  && <p><span className="text-[var(--color-fg-faint)]">Would use:</span> <span className="capitalize font-medium">{gc.wouldUse}</span></p>}
                                    </>
                                  )}
                                  {bc && (
                                    <>
                                      <p><span className="text-[var(--color-fg-faint)]">Page:</span> {bc.page || "—"}</p>
                                      <p><span className="text-[var(--color-fg-faint)]">Happened:</span> {bc.happened}</p>
                                      {bc.expected && <p><span className="text-[var(--color-fg-faint)]">Expected:</span> {bc.expected}</p>}
                                      <p><span className="text-[var(--color-fg-faint)]">Severity:</span> <span className="capitalize font-semibold">{bc.severity}</span></p>
                                      {bc.screenshotNote && <p><span className="text-[var(--color-fg-faint)]">Screenshot note:</span> {bc.screenshotNote}</p>}
                                    </>
                                  )}
                                  {fc && (
                                    <>
                                      <p><span className="text-[var(--color-fg-faint)]">Idea:</span> {fc.idea}</p>
                                      {fc.problem && <p><span className="text-[var(--color-fg-faint)]">Problem:</span> {fc.problem}</p>}
                                      <p><span className="text-[var(--color-fg-faint)]">Priority:</span> <span className="capitalize font-semibold">{fc.priority.replace("_", " ")}</span></p>
                                    </>
                                  )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1.5 px-4 py-2.5 border-t border-[var(--color-border)]/60 bg-[var(--color-surface)]">
                                  {item.status !== "reviewed" && (
                                    <button
                                      onClick={() => handleStatus(item.id, "reviewed")}
                                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-amber-600 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
                                    >
                                      <Check size={10} /> {t("fb_mark_reviewed")}
                                    </button>
                                  )}
                                  {item.status !== "resolved" && (
                                    <button
                                      onClick={() => handleStatus(item.id, "resolved")}
                                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                                    >
                                      <CheckCheck size={10} /> {t("fb_resolve")}
                                    </button>
                                  )}
                                  {item.status === "resolved" && (
                                    <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                                      <CheckCheck size={10} /> {t("fb_resolved")}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => handleDelete(item.id)}
                                    className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-[var(--color-fg-faint)] hover:text-red-500 hover:bg-red-50 transition-colors"
                                  >
                                    <Trash size={10} /> {t("fb_delete")}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── Integrations ─────────────────────────────────────────── */}
                {tab === "integrations" && (
                  <div className="space-y-4">

                    <div className="px-4 py-3 bg-[var(--color-accent-subtle)] border border-[var(--color-accent-subtle)] rounded-xl text-[12px] text-[var(--color-accent-fg)] leading-relaxed">
                      {t("integrations_sub")}
                    </div>

                    {/* ── Personal Telegram Account card ── */}
                    {(() => {
                      const isPersonalConnected = personalStatus?.connected === true;
                      const session             = personalStatus?.session;
                      const canManage           = canDo("integrations.manage");

                      return (
                        <SectionCard>
                          <div className="px-5 py-4 flex items-start gap-4">
                            {/* Icon */}
                            <div className="w-11 h-11 rounded-xl border border-blue-200 bg-blue-50 flex items-center justify-center flex-shrink-0">
                              <User size={18} className="text-[#0088cc]" />
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-[14px] font-bold text-[var(--color-fg)]">
                                  Telegram Personal Account
                                </h3>
                                {personalLoading ? (
                                  <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--color-canvas)] border border-[var(--color-border)] text-[var(--color-fg-faint)]">
                                    <Loader2 size={8} className="animate-spin" /> Checking…
                                  </span>
                                ) : isPersonalConnected ? (
                                  <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                                    Connected
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--color-canvas)] border border-[var(--color-border)] text-[var(--color-fg-faint)]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-border)] inline-block" />
                                    Not connected
                                  </span>
                                )}
                              </div>
                              <p className="text-[12px] text-[var(--color-fg-muted)] leading-relaxed">
                                Connect your personal Telegram account via MTProto to import chats and send messages directly from the inbox.
                              </p>
                              {isPersonalConnected && session && (
                                <div className="mt-2 space-y-1">
                                  {session.phoneNumber && (
                                    <p className="text-[11px] text-[var(--color-fg-faint)] font-medium">
                                      Phone: {session.phoneNumber}
                                    </p>
                                  )}
                                  <p className="text-[11px] text-[var(--color-fg-faint)]">
                                    Connected {new Date(session.connectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                  </p>
                                </div>
                              )}
                              {!canManage && (
                                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-[var(--color-fg-faint)]">
                                  <Lock size={10} />
                                  Only owners and admins can connect or disconnect accounts.
                                </p>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              {isPersonalConnected ? (
                                <>
                                  {canManage && (
                                    <button
                                      onClick={() => { void handlePersonalDisconnect(); }}
                                      disabled={disconnectingPersonal}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                                    >
                                      {disconnectingPersonal
                                        ? <Loader2 size={11} className="animate-spin" />
                                        : <X size={11} />}
                                      Disconnect
                                    </button>
                                  )}
                                </>
                              ) : (
                                canManage ? (
                                  <button
                                    onClick={() => setPersonalModal(true)}
                                    className="px-4 py-2 rounded-xl text-[12px] font-semibold text-white bg-[#0088cc] hover:bg-[#006eaa] transition-colors"
                                  >
                                    Connect
                                  </button>
                                ) : (
                                  <button
                                    disabled
                                    className="px-4 py-2 rounded-xl text-[12px] font-semibold text-[var(--color-fg-faint)] bg-[var(--color-canvas)] border border-[var(--color-border)] cursor-not-allowed opacity-50"
                                  >
                                    Connect
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        </SectionCard>
                      );
                    })()}

                    {/* Integration cards */}
                    {(["telegram", "whatsapp", "email", "calls"] as const).map((channel) => {
                      const meta       = CHANNEL_META[channel];
                      const isTelegram = channel === "telegram";
                      const isEmail    = channel === "email";
                      const conn       = isTelegram ? telegramConn : isEmail ? gmailConn : null;
                      const connected  = !!conn;

                      // Per-channel icon
                      const ChanIcon =
                        channel === "telegram" ? Send :
                        channel === "whatsapp" ? MessageCircle :
                        channel === "email"    ? Mail :
                                                 Phone;

                      return (
                        <SectionCard key={channel}>
                          <div className="px-5 py-4 flex items-start gap-4">
                            {/* Icon */}
                            <div className={cn(
                              "w-11 h-11 rounded-xl border flex items-center justify-center flex-shrink-0",
                              meta.bgColor, meta.borderColor,
                            )}>
                              <ChanIcon size={18} className={meta.color} />
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-[14px] font-bold text-[var(--color-fg)]">
                                  {meta.label}
                                </h3>
                                {/* Status badge */}
                                {!meta.available ? (
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--color-canvas)] border border-[var(--color-border)] text-[var(--color-fg-faint)]">
                                    {t("badge_coming_soon")}
                                  </span>
                                ) : connected ? (
                                  <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                                    {t("badge_connected")}
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--color-canvas)] border border-[var(--color-border)] text-[var(--color-fg-faint)]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-border)] inline-block" />
                                    {t("badge_not_connected")}
                                  </span>
                                )}
                              </div>
                              <p className="text-[12px] text-[var(--color-fg-muted)] leading-relaxed">
                                {meta.description}
                              </p>
                              {connected && conn?.displayName && (
                                <div className="mt-1 space-y-1.5">
                                  <p className="text-[11px] text-[var(--color-fg-faint)] font-medium flex items-center gap-1.5">
                                    {conn.displayName}
                                    {conn.isMock ? (
                                      <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded">
                                        {t("badge_simulated")}
                                      </span>
                                    ) : (
                                      <span className="text-[9px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 px-1 py-0.5 rounded">
                                        {t("badge_real_bot")}
                                      </span>
                                    )}
                                  </p>
                                  {!conn.isMock && (
                                    <p className="text-[10px] text-[var(--color-fg-faint)] font-mono truncate">
                                      /api/integrations/telegram/webhook
                                    </p>
                                  )}
                                  {/* Webhook status row (real bot only) */}
                                  {isTelegram && !conn.isMock && (
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {fetchingWebhookStatus ? (
                                        <div className="flex items-center gap-1 text-[10px] text-[var(--color-fg-faint)]">
                                          <Loader2 size={10} className="animate-spin" />
                                          {t("tg_webhook_checking")}
                                        </div>
                                      ) : webhookStatus ? (
                                        <>
                                          {webhookStatus.url ? (
                                            <div className="flex items-center gap-1 text-[10px] text-emerald-700">
                                              <CheckCircle2 size={10} />
                                              {t("tg_webhook_ok")}
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-1 text-[10px] text-amber-600">
                                              <AlertCircle size={10} />
                                              {t("tg_webhook_none")}
                                            </div>
                                          )}
                                          {webhookStatus.pendingUpdateCount > 0 && (
                                            <span className="text-[9px] bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">
                                              {webhookStatus.pendingUpdateCount} pending
                                            </span>
                                          )}
                                          {webhookStatus.lastErrorMessage && (
                                            <div className="flex items-center gap-1 text-[10px] text-red-500 max-w-[200px] truncate" title={webhookStatus.lastErrorMessage}>
                                              <AlertCircle size={10} className="flex-shrink-0" />
                                              <span className="truncate">{webhookStatus.lastErrorMessage}</span>
                                            </div>
                                          )}
                                          <button
                                            onClick={() => { void refreshWebhookStatus(); }}
                                            disabled={fetchingWebhookStatus}
                                            className="flex items-center gap-0.5 text-[9px] text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] transition-colors disabled:opacity-40"
                                          >
                                            <RotateCcw size={9} />
                                            {t("btn_refresh")}
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          onClick={() => { void refreshWebhookStatus(); }}
                                          className="flex items-center gap-1 text-[10px] text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] transition-colors"
                                        >
                                          <RotateCcw size={9} />
                                          {t("tg_check_webhook")}
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Action button(s) */}
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              {!meta.available ? (
                                <button
                                  disabled
                                  className="px-4 py-2 rounded-xl text-[12px] font-semibold text-[var(--color-fg-faint)] bg-[var(--color-canvas)] border border-[var(--color-border)] cursor-not-allowed opacity-50"
                                >
                                  {t("badge_coming_soon")}
                                </button>
                              ) : connected ? (
                                <>
                                  <button
                                    onClick={() => {
                                      if (isTelegram) setTelegramModal(true);
                                      else if (isEmail) setGmailModal(true);
                                    }}
                                    className="px-4 py-2 rounded-xl text-[12px] font-semibold text-[var(--color-fg-muted)] bg-[var(--color-canvas)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] hover:text-[var(--color-fg)] transition-colors"
                                  >
                                    {t("btn_manage")}
                                  </button>
                                  {isEmail && (
                                    <button
                                      onClick={() => {
                                        void fetch("/api/integrations/email/disconnect", {
                                          method:      "POST",
                                          credentials: "include",
                                          headers:     { "Content-Type": "application/json" },
                                          body:        JSON.stringify({}),
                                        }).then(() => {
                                          setGmailConn(null);
                                          showToast(t("toast_gmail_disconnected"));
                                        });
                                      }}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                                    >
                                      <X size={11} />
                                      {t("btn_disconnect")}
                                    </button>
                                  )}
                                  {isTelegram && (
                                    <>
                                      <button
                                        onClick={() => { void sendTestTelegramMessage(); }}
                                        disabled={sendingTestMsg}
                                        className={cn(
                                          "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-colors",
                                          sendingTestMsg
                                            ? "text-[var(--color-fg-faint)] bg-[var(--color-canvas)] border-[var(--color-border)] cursor-not-allowed opacity-50"
                                            : "text-[#0066aa] bg-blue-50 border-blue-200 hover:bg-blue-100",
                                        )}
                                      >
                                        <Send size={11} />
                                        {sendingTestMsg ? t("tg_sending") : t("tg_send_test")}
                                      </button>
                                      {conn && !conn.isMock && (
                                        <button
                                          onClick={() => {
                                            navigator.clipboard.writeText(getWebhookUrl()).catch(() => {});
                                            showToast(t("toast_webhook_copied"));
                                          }}
                                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent-subtle)] transition-colors"
                                        >
                                          <Globe size={11} />
                                          {t("tg_copy_webhook")}
                                        </button>
                                      )}
                                    </>
                                  )}
                                </>
                              ) : (
                                <button
                                  onClick={() => {
                                    if (isTelegram) setTelegramModal(true);
                                    else if (isEmail) setGmailModal(true);
                                  }}
                                  className={cn(
                                    "px-4 py-2 rounded-xl text-[12px] font-semibold text-white transition-colors",
                                    isEmail
                                      ? "bg-violet-600 hover:bg-violet-500"
                                      : "bg-[#0088cc] hover:bg-[#006eaa]",
                                  )}
                                >
                                  {t("btn_connect")}
                                </button>
                              )}
                            </div>
                          </div>
                        </SectionCard>
                      );
                    })}
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Telegram Personal Account Modal ───────────────────────────── */}
      <TelegramAccountModal
        open={personalModal}
        onClose={() => setPersonalModal(false)}
        onConnected={() => {
          setPersonalModal(false);
          void refreshPersonalStatus();
          showToast("Personal Telegram account connected");
        }}
      />

      {/* ── Telegram Connect Modal ─────────────────────────────────────── */}
      <TelegramConnectModal
        open={telegramModal}
        existing={telegramConn}
        onClose={() => setTelegramModal(false)}
        onConnected={(conn) => {
          setTelegramConn(conn);
          showToast(t("toast_tg_connected"));
        }}
        onDisconnected={() => {
          setTelegramConn(null);
          showToast(t("toast_tg_disconnected"));
        }}
      />

      {/* ── Gmail Connect Modal ─────────────────────────────────────────── */}
      <GmailConnectModal
        open={gmailModal}
        existing={gmailConn}
        onClose={() => setGmailModal(false)}
        onConnected={(conn) => {
          setGmailConn(conn);
          showToast(t("toast_gmail_connected"));
        }}
      />
    </>
  );
}
