"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X, Send, CheckCircle2, AlertCircle, ChevronRight,
  ExternalLink, Key, Webhook, Bot, Loader2, Unplug,
  Shield, Eye, EyeOff, Copy, CheckCheck, Globe, Terminal,
  RotateCcw, Clock, User, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildMockTelegramConnection,
  buildRealTelegramConnection,
  saveTelegramConnection,
  disconnectTelegram,
  validateTokenFormat,
  maskToken,
  getWebhookUrl,
  saveWebhookStatus,
  getWebhookStatus,
  clearWebhookStatus,
  type IntegrationConnection,
  type WebhookStatus,
} from "@/lib/integrations";
import type { TelegramWebhookInfo } from "@/lib/telegram-types";
import { TelegramAccountModal } from "./telegram-account-modal";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TelegramConnectModalProps {
  open:           boolean;
  existing:       IntegrationConnection | null;
  onClose:        () => void;
  onConnected:    (conn: IntegrationConnection) => void;
  onDisconnected: () => void;
}

type Step     = "mode" | "intro" | "configure" | "success";
type ConnMode = "simulated" | "real";

type TokenResult =
  | null
  | { ok: true;  botName: string; botUsername: string; botId: number }
  | { ok: false; error: string };

type WebhookRegState =
  | null
  | { stage: "registering" }
  | { stage: "done"; ok: boolean; message: string };

/** Workspace ID — in a real multi-tenant app this comes from auth context. */
const WORKSPACE_ID = "default";

// ── Telegram getMe (client-side token validation only) ─────────────────────────

interface TgBotInfo { id: number; is_bot: boolean; first_name: string; username: string }

async function fetchGetMe(token: string): Promise<TgBotInfo> {
  const res  = await fetch(`https://api.telegram.org/bot${token}/getMe`, { cache: "no-store" });
  const data = await res.json() as { ok: boolean; result?: TgBotInfo; description?: string };
  if (!data.ok || !data.result) throw new Error(data.description ?? `HTTP ${res.status}`);
  return data.result;
}

// ── Server API helpers ─────────────────────────────────────────────────────────

interface ConnectApiResponse {
  ok:           boolean;
  connected?:   boolean;
  bot?:         {
    botUsername:  string;
    botName:      string;
    botId:        string;
    tokenMasked:  string;
    workspaceId:  string;
    webhookUrl:   string;
    connectedAt:  string;
  };
  error?:       string;
  botUsername?: string;
  botName?:     string;
  botId?:       string;
  tokenMasked?: string;
  webhookUrl?:  string;
}

/** POST /api/integrations/telegram/connect — save token server-side */
async function apiSaveBot(params: {
  token:        string;
  botUsername:  string;
  botName?:     string;
  botId?:       string;
  workspaceId?: string;
}): Promise<ConnectApiResponse> {
  const res  = await fetch("/api/integrations/telegram/connect", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ ...params, workspaceId: WORKSPACE_ID }),
  });
  return res.json() as Promise<ConnectApiResponse>;
}

/** DELETE /api/integrations/telegram/connect?ws= — remove bot config */
async function apiDisconnectBot(): Promise<void> {
  await fetch(`/api/integrations/telegram/connect?ws=${WORKSPACE_ID}`, { method: "DELETE" });
}

// ── Requirement card ───────────────────────────────────────────────────────────

function RequirementCard({ icon: Icon, title, description, tag }: {
  icon: React.ElementType; title: string; description: string; tag: string;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl">
      <div className="w-8 h-8 rounded-lg bg-[var(--color-accent-subtle)] flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={14} className="text-[var(--color-accent)]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[12px] font-semibold text-[var(--color-fg)]">{title}</span>
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
            {tag}
          </span>
        </div>
        <p className="text-[11px] text-[var(--color-fg-muted)] leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// ── Webhook setup section (configure step) ─────────────────────────────────────

function WebhookSetupSection() {
  const url     = getWebhookUrl(WORKSPACE_ID);
  const curlCmd = `curl "https://api.telegram.org/botTOKEN/setWebhook?url=${url}"`;
  const [copied, setCopied] = useState<"url" | "curl" | null>(null);

  function copy(text: string, key: "url" | "curl") {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="flex flex-col gap-3 pt-4 border-t border-[var(--color-border)]">
      <div className="flex items-center gap-1.5">
        <Webhook size={12} className="text-[var(--color-fg-faint)]" />
        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)]">
          Webhook setup
        </p>
      </div>

      <div>
        <p className="text-[11px] text-[var(--color-fg-muted)] mb-1.5">Your Ventra webhook URL:</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-[10px] font-mono bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[var(--color-fg)] truncate">
            {url}
          </code>
          <button
            onClick={() => copy(url, "url")}
            className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-medium border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent-subtle)] transition-colors flex-shrink-0"
          >
            {copied === "url" ? <CheckCheck size={11} className="text-emerald-500" /> : <Copy size={11} />}
            {copied === "url" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div>
        <p className="text-[11px] text-[var(--color-fg-muted)] mb-1.5">
          Register manually (replace <code className="font-mono text-[10px]">TOKEN</code>):
        </p>
        <div className="flex items-start gap-2">
          <div className="flex-1 flex items-start gap-1.5 bg-[#1e1e2e] border border-[#313244] rounded-lg px-3 py-2.5 min-w-0 overflow-hidden">
            <Terminal size={11} className="text-[#6c7086] mt-0.5 flex-shrink-0" />
            <code className="text-[10px] font-mono text-[#cdd6f4] break-all leading-relaxed">
              {"curl \"https://api.telegram.org/bot"}
              <span className="text-amber-300">TOKEN</span>
              {"/setWebhook?url="}
              <span className="text-emerald-300">{url}</span>
              {"\""}
            </code>
          </div>
          <button
            onClick={() => copy(curlCmd, "curl")}
            className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-medium border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent-subtle)] transition-colors flex-shrink-0 mt-0.5"
          >
            {copied === "curl" ? <CheckCheck size={11} className="text-emerald-500" /> : <Copy size={11} />}
            {copied === "curl" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200 flex-shrink-0 mt-0.5">
            Local dev
          </span>
          <p className="text-[11px] text-[var(--color-fg-faint)] leading-relaxed">
            Use{" "}
            <a href="https://ngrok.com" target="_blank" rel="noopener noreferrer"
              className="text-[var(--color-accent)] hover:underline">ngrok</a>
            {" "}for local testing:{" "}
            <code className="font-mono text-[10px] bg-[var(--color-canvas)] px-1 rounded">ngrok http 3000</code>
            {" "}then use the https URL as your webhook.
          </p>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 flex-shrink-0 mt-0.5">
            Production
          </span>
          <p className="text-[11px] text-[var(--color-fg-faint)] leading-relaxed">
            Deploy Ventra to a public HTTPS domain. Telegram requires a valid SSL
            certificate on port 443, 80, 88, or 8443.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────

export function TelegramConnectModal({
  open,
  existing,
  onClose,
  onConnected,
  onDisconnected,
}: TelegramConnectModalProps) {
  const isConnected = !!existing;

  const [step,              setStep]              = useState<Step>(isConnected ? "success" : "mode");
  const [showAccountModal,  setShowAccountModal]  = useState(false);
  const [connMode,          setConnMode]          = useState<ConnMode>(
    isConnected && !existing.isMock ? "real" : "simulated",
  );
  const [botUsername,       setBotUsername]       = useState(existing?.handle ?? "");
  const [botToken,          setBotToken]          = useState("");
  const [tokenVisible,      setTokenVisible]      = useState(false);
  const [tokenValidating,   setTokenValidating]   = useState(false);
  const [tokenResult,       setTokenResult]       = useState<TokenResult>(null);
  const [error,             setError]             = useState<string | null>(null);
  const [connecting,        setConnecting]        = useState(false);
  const [confirmDisc,       setConfirmDisc]       = useState(false);
  // Phase 3: webhook registration + status
  const [webhookReg,        setWebhookReg]        = useState<WebhookRegState>(null);
  const [webhookStatus,     setWebhookStatus]     = useState<WebhookStatus | null>(null);
  const [fetchingStatus,    setFetchingStatus]    = useState(false);
  // Server-side bot config (masked)
  const [serverBotMasked,   setServerBotMasked]   = useState<string | null>(
    existing?.metadata?.tokenMasked ?? null,
  );

  // ── Fetch webhook status (uses server-side token) ─────────────────────────
  const fetchWebhookStatus = useCallback(async () => {
    setFetchingStatus(true);
    try {
      const res  = await fetch(`/api/integrations/telegram/webhook-info?ws=${WORKSPACE_ID}`, {
        cache: "no-store",
      });
      const data = await res.json() as { ok: boolean; webhookInfo?: TelegramWebhookInfo; error?: string };
      if (data.ok && data.webhookInfo) {
        const status: WebhookStatus = {
          url:                data.webhookInfo.url,
          pendingUpdateCount: data.webhookInfo.pending_update_count,
          lastErrorDate:      data.webhookInfo.last_error_date,
          lastErrorMessage:   data.webhookInfo.last_error_message,
          maxConnections:     data.webhookInfo.max_connections,
          ipAddress:          data.webhookInfo.ip_address,
          fetchedAt:          new Date().toISOString(),
        };
        saveWebhookStatus(status);
        setWebhookStatus(status);
      }
    } catch { /* silent */ }
    finally { setFetchingStatus(false); }
  }, []);

  // Auto-load webhook status when success step opens for a real bot
  useEffect(() => {
    if (!open || step !== "success" || connMode !== "real") return;
    const cached = getWebhookStatus();
    if (cached) setWebhookStatus(cached);
    void fetchWebhookStatus();
  }, [open, step, connMode, fetchWebhookStatus]);

  function resetState() {
    const wasReal = existing ? !existing.isMock : false;
    setStep(isConnected ? "success" : "mode");
    setShowAccountModal(false);
    setConnMode(wasReal ? "real" : "simulated");
    setBotUsername(existing?.handle ?? "");
    setBotToken("");
    setTokenVisible(false);
    setTokenValidating(false);
    setTokenResult(null);
    setError(null);
    setConnecting(false);
    setConfirmDisc(false);
    setWebhookReg(null);
    setWebhookStatus(isConnected ? (getWebhookStatus() ?? null) : null);
    setFetchingStatus(false);
    setServerBotMasked(existing?.metadata?.tokenMasked ?? null);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  // ── Token validation ───────────────────────────────────────────────────────
  async function handleValidateToken() {
    const trimmed = botToken.trim();
    if (!trimmed) return;
    if (!validateTokenFormat(trimmed)) {
      setTokenResult({
        ok:    false,
        error: "Invalid format — expected: {8–12 digits}:{35+ chars}, e.g. 123456789:ABCdef…",
      });
      return;
    }
    setTokenValidating(true);
    setTokenResult(null);
    try {
      const bot = await fetchGetMe(trimmed);
      setTokenResult({ ok: true, botName: bot.first_name, botUsername: bot.username, botId: bot.id });
      if (!botUsername.trim()) setBotUsername(bot.username);
    } catch (err) {
      setTokenResult({
        ok:    false,
        error: err instanceof Error ? err.message : "Could not reach Telegram API",
      });
    } finally {
      setTokenValidating(false);
    }
  }

  // ── Webhook registration (uses server-side token) ──────────────────────────
  async function handleRegisterWebhook() {
    setWebhookReg({ stage: "registering" });
    try {
      const res  = await fetch("/api/integrations/telegram/set-webhook", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ workspaceId: WORKSPACE_ID }),
      });
      const data = await res.json() as { ok: boolean; description?: string; error?: string };

      if (data.ok) {
        setWebhookReg({ stage: "done", ok: true, message: data.description ?? "Webhook registered" });
        void fetchWebhookStatus();
      } else {
        setWebhookReg({ stage: "done", ok: false, message: data.error ?? "Registration failed" });
      }
    } catch {
      setWebhookReg({ stage: "done", ok: false, message: "Network error — could not reach API" });
    }
  }

  // ── Connect / save ─────────────────────────────────────────────────────────
  async function handleConnect() {
    setError(null);

    if (connMode === "simulated") {
      const cleaned = botUsername.trim().replace(/^@/, "");
      if (!cleaned) { setError("Please enter a bot username to continue."); return; }
      setConnecting(true);
      setTimeout(() => {
        const conn = buildMockTelegramConnection(cleaned);
        saveTelegramConnection(conn);
        setConnecting(false);
        setStep("success");
        onConnected(conn);
      }, 800);
      return;
    }

    // Real bot — save token server-side
    const trimmedToken = botToken.trim();
    if (!trimmedToken) { setError("Please enter your bot token."); return; }
    if (!validateTokenFormat(trimmedToken)) {
      setError("Invalid token format — expected {digits}:{35+ chars}");
      return;
    }
    let finalUsername = botUsername.trim().replace(/^@/, "");
    if (!finalUsername && tokenResult?.ok) finalUsername = tokenResult.botUsername;
    if (!finalUsername) {
      setError("Please test the token to auto-fill the username, or enter it manually.");
      return;
    }

    const botName = tokenResult?.ok ? tokenResult.botName     : undefined;
    const botId   = tokenResult?.ok ? String(tokenResult.botId) : undefined;

    setConnecting(true);
    try {
      // Save token encrypted in SQLite — raw token never goes to localStorage
      const saved = await apiSaveBot({
        token:       trimmedToken,
        botUsername: finalUsername,
        botName,
        botId,
      });

      if (!saved.ok) {
        setError(saved.error ?? "Failed to save bot configuration");
        setConnecting(false);
        return;
      }

      const tokenMasked = saved.tokenMasked ?? maskToken(trimmedToken);
      setServerBotMasked(tokenMasked);

      const conn = buildRealTelegramConnection({
        botUsername: finalUsername,
        botName,
        botId,
        tokenMasked,
      });
      saveTelegramConnection(conn);
      setConnMode("real");
      setConnecting(false);
      setStep("success");
      onConnected(conn);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setConnecting(false);
    }
  }

  // ── Disconnect ─────────────────────────────────────────────────────────────
  async function handleDisconnect() {
    // Remove from server DB
    await apiDisconnectBot();
    // Clear client-side state
    disconnectTelegram();
    clearWebhookStatus();
    setConfirmDisc(false);
    setBotUsername("");
    setBotToken("");
    setTokenResult(null);
    setWebhookReg(null);
    setWebhookStatus(null);
    setServerBotMasked(null);
    setError(null);
    setStep("intro");
    setConnMode("simulated");
    onDisconnected();
  }

  if (!open) return null;

  const isSuccessReal = connMode === "real";
  const hasServerBot  = !!serverBotMasked;

  return (
    <>
    <div
      className="fixed inset-0 z-[190] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-[520px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
              <Send size={16} className="text-[#0088cc]" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-[var(--color-fg)]">Telegram Integration</h2>
              <p className="text-[11px] text-[var(--color-fg-faint)]">
                {step === "success"
                  ? (isSuccessReal ? "Real bot configured" : "Simulated mode")
                  : step === "mode"
                    ? "Choose how to connect Telegram"
                    : "Bot token + webhook setup"}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Mode selection ── */}
          {step === "mode" && (
            <div className="px-6 py-5 flex flex-col gap-4">
              <p className="text-[13px] text-[var(--color-fg)] leading-relaxed">
                Connect Telegram to bring client conversations into Ventra Inbox.
                Choose the connection method that fits your workflow.
              </p>

              {/* Telegram Bot card */}
              <button
                onClick={() => setStep("intro")}
                className="flex items-start gap-4 w-full text-left px-5 py-4 bg-[var(--color-canvas)] border-2 border-[var(--color-border)] rounded-xl hover:border-[var(--color-accent-subtle)] hover:bg-[var(--color-accent-subtle)] transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--color-accent-subtle)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-white transition-colors">
                  <Bot size={18} className="text-[var(--color-accent)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[14px] font-bold text-[var(--color-fg)]">Telegram Bot</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                      Available
                    </span>
                  </div>
                  <p className="text-[12px] text-[var(--color-fg-muted)] leading-relaxed">
                    Create a dedicated bot via @BotFather. Clients message the bot — conversations
                    appear automatically in your Inbox with AI analysis.
                  </p>
                  <div className="flex items-center gap-3 mt-2.5">
                    {[
                      { icon: Key,     label: "Requires bot token" },
                      { icon: Webhook, label: "Webhook setup"      },
                      { icon: Shield,  label: "Production-ready"   },
                    ].map(({ icon: Icon, label }) => (
                      <span key={label} className="flex items-center gap-1 text-[10px] text-[var(--color-fg-faint)]">
                        <Icon size={9} /> {label}
                      </span>
                    ))}
                  </div>
                </div>
                <ChevronRight size={16} className="text-[var(--color-fg-faint)] flex-shrink-0 mt-2 group-hover:text-[var(--color-accent)] transition-colors" />
              </button>

              {/* Personal Account card */}
              <button
                onClick={() => setShowAccountModal(true)}
                className="flex items-start gap-4 w-full text-left px-5 py-4 bg-[var(--color-canvas)] border-2 border-[var(--color-border)] rounded-xl hover:border-blue-200 hover:bg-blue-50 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-white transition-colors">
                  <User size={18} className="text-[#0088cc]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[14px] font-bold text-[var(--color-fg)]">Personal Telegram Account</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                      MTProto
                    </span>
                  </div>
                  <p className="text-[12px] text-[var(--color-fg-muted)] leading-relaxed">
                    Import your existing conversations and contacts directly. No bot setup required.
                    Ventra scans your chats and creates client records automatically.
                  </p>
                  <div className="flex items-center gap-3 mt-2.5">
                    {[
                      { icon: Send,     label: "No bot needed"       },
                      { icon: Sparkles, label: "AI contact matching" },
                      { icon: User,     label: "Bulk import"         },
                    ].map(({ icon: Icon, label }) => (
                      <span key={label} className="flex items-center gap-1 text-[10px] text-[var(--color-fg-faint)]">
                        <Icon size={9} /> {label}
                      </span>
                    ))}
                  </div>
                </div>
                <ChevronRight size={16} className="text-[var(--color-fg-faint)] flex-shrink-0 mt-2 group-hover:text-[#0088cc] transition-colors" />
              </button>

              {/* MTProto note */}
              <p className="text-[10px] text-[var(--color-fg-faint)] text-center leading-relaxed">
                Personal account integration uses the MTProto protocol (GramJS).
                Requires <code className="font-mono text-[9px]">TELEGRAM_PERSONAL_API_ID</code> and{" "}
                <code className="font-mono text-[9px]">TELEGRAM_PERSONAL_API_HASH</code> in your environment.
              </p>
            </div>
          )}

          {/* ── Intro ── */}
          {step === "intro" && (
            <div className="px-6 py-5 flex flex-col gap-5">
              <p className="text-[13px] text-[var(--color-fg)] leading-relaxed">
                Connect a Telegram bot to receive client messages directly in Ventra Inbox.
                The AI will analyze conversations and suggest tasks, replies, and client updates.
              </p>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)] mb-2.5">
                  What you&apos;ll need
                </p>
                <div className="flex flex-col gap-2">
                  <RequirementCard icon={Bot} title="Telegram Bot" description="Create via @BotFather on Telegram. You'll receive a username and a secret token." tag="Required" />
                  <RequirementCard icon={Key} title="Bot Token" description="A secret like 123456:ABCdef… — authorizes Ventra to receive your bot's messages. Stored encrypted server-side." tag="Required" />
                  <RequirementCard icon={Globe} title="Public HTTPS URL" description="For live messages, Ventra must be deployed with a valid SSL certificate. Use ngrok for local dev." tag="Production" />
                </div>
              </div>
              <div className="flex items-start gap-2.5 px-4 py-3 bg-[var(--color-accent-subtle)] border border-[var(--color-accent-subtle)] rounded-xl">
                <AlertCircle size={13} className="text-[var(--color-accent)] flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-[var(--color-fg-muted)] leading-relaxed">
                  Don&apos;t have a bot yet? Use <strong>simulated mode</strong> to preview the Inbox
                  experience with no real API call.
                </p>
              </div>
              <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-[12px] text-[var(--color-accent)] hover:underline font-medium">
                <ExternalLink size={12} />
                Open @BotFather to create your bot
              </a>
            </div>
          )}

          {/* ── Configure ── */}
          {step === "configure" && (
            <div className="px-6 py-5 flex flex-col gap-5">

              {/* Mode toggle */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)] mb-2">
                  Connection mode
                </p>
                <div className="flex items-center gap-1 p-1 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl">
                  {(["simulated", "real"] as ConnMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => { setConnMode(m); setError(null); setWebhookReg(null); }}
                      className={cn(
                        "flex-1 px-3 py-2 rounded-lg text-[12px] font-semibold transition-colors",
                        connMode === m
                          ? "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-fg)] shadow-sm"
                          : "text-[var(--color-fg-faint)] hover:text-[var(--color-fg)]",
                      )}
                    >
                      {m === "simulated" ? "Simulated" : "Real bot token"}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Simulated ── */}
              {connMode === "simulated" && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertCircle size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      Simulated mode saves your bot username locally with no real API call.
                      Use <strong>Send test message</strong> in Settings to simulate incoming messages.
                    </p>
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-[var(--color-fg-muted)] mb-1.5">
                      Bot username
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-[var(--color-fg-faint)] font-medium">@</span>
                      <input
                        type="text"
                        value={botUsername.replace(/^@/, "")}
                        onChange={(e) => { setBotUsername(e.target.value); setError(null); }}
                        placeholder="your_ventra_bot"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") void handleConnect(); }}
                        className={cn(
                          "flex-1 bg-[var(--color-canvas)] border rounded-xl px-3 py-2.5 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-faint)] focus:outline-none transition-colors",
                          error ? "border-red-400 focus:border-red-500" : "border-[var(--color-border)] focus:border-[var(--color-accent)]",
                        )}
                      />
                    </div>
                    {error && (
                      <p className="text-[11px] text-red-500 mt-1.5 flex items-center gap-1">
                        <AlertCircle size={11} /> {error}
                      </p>
                    )}
                    <p className="text-[11px] text-[var(--color-fg-faint)] mt-1.5">
                      e.g.{" "}
                      <code className="font-mono bg-[var(--color-canvas)] px-1 rounded text-[10px]">
                        ventra_crm_bot
                      </code>
                    </p>
                  </div>
                </div>
              )}

              {/* ── Real bot ── */}
              {connMode === "real" && (
                <div className="flex flex-col gap-4">

                  {/* Secure storage note */}
                  <div className="flex items-start gap-2.5 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <Shield size={13} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-semibold text-emerald-700">
                        Token stored encrypted server-side
                      </p>
                      <p className="text-[11px] text-emerald-600 mt-0.5 leading-relaxed">
                        Your bot token is encrypted with AES-256-GCM and stored in the server
                        database. It is <strong>never sent back to the browser</strong>. Set
                        <code className="font-mono text-[10px] mx-1">VENTRA_ENCRYPTION_KEY</code>
                        in your environment for production.
                      </p>
                    </div>
                  </div>

                  {/* Token field */}
                  <div>
                    <label className="block text-[12px] font-semibold text-[var(--color-fg-muted)] mb-1.5">
                      Bot token <span className="text-red-400 ml-0.5">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 relative min-w-0">
                        <input
                          type={tokenVisible ? "text" : "password"}
                          value={botToken}
                          onChange={(e) => { setBotToken(e.target.value); setTokenResult(null); setWebhookReg(null); setError(null); }}
                          placeholder="123456789:ABCdefGhIjKlMnOpQrStUvWxYz…"
                          className={cn(
                            "w-full bg-[var(--color-canvas)] border rounded-xl pl-3 pr-9 py-2.5 text-[12px] font-mono text-[var(--color-fg)] placeholder:text-[var(--color-fg-faint)] placeholder:font-sans placeholder:text-[12px] focus:outline-none transition-colors",
                            (error && !tokenResult)
                              ? "border-red-400 focus:border-red-500"
                              : tokenResult?.ok === true
                                ? "border-emerald-400"
                                : tokenResult?.ok === false
                                  ? "border-red-300"
                                  : "border-[var(--color-border)] focus:border-[var(--color-accent)]",
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => setTokenVisible((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] transition-colors"
                        >
                          {tokenVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => { void handleValidateToken(); }}
                        disabled={!botToken.trim() || tokenValidating}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[11px] font-semibold border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent-subtle)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 whitespace-nowrap"
                      >
                        {tokenValidating
                          ? <><Loader2 size={11} className="animate-spin" /> Testing…</>
                          : <><CheckCircle2 size={11} /> Test token</>
                        }
                      </button>
                    </div>

                    {/* Validation result */}
                    {tokenResult?.ok === true && (
                      <div className="mt-2 flex items-center gap-1.5 min-w-0">
                        <CheckCircle2 size={11} className="text-emerald-500 flex-shrink-0" />
                        <span className="text-[11px] text-emerald-700 truncate">
                          Valid · <strong>{tokenResult.botName}</strong> · @{tokenResult.botUsername}
                        </span>
                      </div>
                    )}
                    {tokenResult?.ok === false && (
                      <div className="mt-2 flex items-start gap-1.5">
                        <AlertCircle size={11} className="text-red-500 flex-shrink-0 mt-0.5" />
                        <span className="text-[11px] text-red-600">{tokenResult.error}</span>
                      </div>
                    )}
                    {error && !tokenResult && (
                      <p className="text-[11px] text-red-500 mt-1.5 flex items-center gap-1">
                        <AlertCircle size={11} /> {error}
                      </p>
                    )}
                    <p className="text-[11px] text-[var(--color-fg-faint)] mt-1.5">
                      Get your token from{" "}
                      <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer"
                        className="text-[var(--color-accent)] hover:underline font-medium">
                        @BotFather
                      </a>
                      {" "}— never share it publicly.
                    </p>
                  </div>

                  {/* Bot username */}
                  <div>
                    <label className="block text-[12px] font-semibold text-[var(--color-fg-muted)] mb-1.5">
                      Bot username
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-[var(--color-fg-faint)] font-medium">@</span>
                      <input
                        type="text"
                        value={botUsername.replace(/^@/, "")}
                        onChange={(e) => setBotUsername(e.target.value)}
                        placeholder="auto-filled when token is tested"
                        className="flex-1 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-faint)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                      />
                    </div>
                    <p className="text-[11px] text-[var(--color-fg-faint)] mt-1.5">
                      Auto-filled when you test the token, or enter manually.
                    </p>
                  </div>

                  {/* Webhook setup info */}
                  <WebhookSetupSection />
                </div>
              )}
            </div>
          )}

          {/* ── Success ── */}
          {step === "success" && (
            <div className="px-6 py-5 flex flex-col gap-5">

              {/* Connected card */}
              <div className="flex items-center gap-3 px-4 py-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="w-10 h-10 rounded-xl bg-white border border-emerald-200 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 size={20} className="text-emerald-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-emerald-800">
                    {isSuccessReal ? "Bot configured" : "Connected (Simulated)"}
                  </p>
                  <p className="text-[12px] text-emerald-700 mt-0.5 font-medium truncate">
                    {existing?.displayName ?? (botUsername ? `@${botUsername}` : "—")}
                  </p>
                  {existing?.connectedAt && (
                    <p className="text-[10px] text-emerald-600 mt-0.5">
                      Since{" "}
                      {new Date(existing.connectedAt).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </p>
                  )}
                </div>
                {isSuccessReal ? (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 flex-shrink-0">
                    Real bot
                  </span>
                ) : (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 flex-shrink-0">
                    Simulated
                  </span>
                )}
              </div>

              {/* Real bot: token info + webhook registration ── */}
              {isSuccessReal && (
                <>
                  {/* Token + storage info */}
                  <div className="flex flex-col gap-2 px-4 py-3 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl">
                    <div className="flex items-center gap-2">
                      <Key size={11} className="text-[var(--color-fg-faint)] flex-shrink-0" />
                      <span className="text-[11px] font-semibold text-[var(--color-fg-muted)] flex-shrink-0 w-14">Token</span>
                      <code className="flex-1 text-[11px] font-mono text-[var(--color-fg-faint)] truncate">
                        {hasServerBot
                          ? serverBotMasked
                          : (existing?.metadata?.tokenMasked ?? "••••••••••••••••")}
                      </code>
                      <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-600 flex-shrink-0">
                        Encrypted
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield size={11} className="text-[var(--color-fg-faint)] flex-shrink-0" />
                      <span className="text-[11px] font-semibold text-[var(--color-fg-muted)] flex-shrink-0 w-14">Storage</span>
                      <span className="text-[11px] text-[var(--color-fg-faint)]">
                        AES-256-GCM · server-side SQLite
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Globe size={11} className="text-[var(--color-fg-faint)] flex-shrink-0" />
                      <span className="text-[11px] font-semibold text-[var(--color-fg-muted)] flex-shrink-0 w-14">Webhook</span>
                      <code className="flex-1 text-[10px] font-mono text-[var(--color-fg-faint)] truncate">
                        /api/integrations/telegram/webhook/{WORKSPACE_ID}
                      </code>
                    </div>
                    {existing?.metadata?.botName && (
                      <div className="flex items-center gap-2">
                        <Bot size={11} className="text-[var(--color-fg-faint)] flex-shrink-0" />
                        <span className="text-[11px] font-semibold text-[var(--color-fg-muted)] flex-shrink-0 w-14">Bot name</span>
                        <span className="text-[11px] text-[var(--color-fg-faint)]">{existing.metadata.botName}</span>
                      </div>
                    )}
                  </div>

                  {/* Webhook status + registration ── */}
                  <div className="flex flex-col gap-3 px-4 py-3 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Webhook size={11} className="text-[var(--color-fg-faint)]" />
                        <span className="text-[11px] font-semibold text-[var(--color-fg-muted)]">
                          Webhook status
                        </span>
                      </div>
                      <button
                        onClick={() => void fetchWebhookStatus()}
                        disabled={fetchingStatus}
                        className="flex items-center gap-1 text-[10px] text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] transition-colors disabled:opacity-40"
                      >
                        {fetchingStatus
                          ? <Loader2 size={10} className="animate-spin" />
                          : <RotateCcw size={10} />
                        }
                        Refresh
                      </button>
                    </div>

                    {/* Status display */}
                    {webhookStatus ? (
                      <div className="flex flex-col gap-1.5">
                        {webhookStatus.url ? (
                          <div className="flex items-start gap-1.5">
                            <CheckCircle2 size={11} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold text-emerald-700">Registered</p>
                              <code className="text-[10px] font-mono text-[var(--color-fg-faint)] break-all">
                                {webhookStatus.url}
                              </code>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <AlertCircle size={11} className="text-amber-500 flex-shrink-0" />
                            <p className="text-[11px] text-amber-700">Not registered — no webhook URL set in Telegram</p>
                          </div>
                        )}
                        {webhookStatus.pendingUpdateCount > 0 && (
                          <div className="flex items-center gap-1.5">
                            <Clock size={11} className="text-[var(--color-fg-faint)] flex-shrink-0" />
                            <p className="text-[11px] text-[var(--color-fg-muted)]">
                              {webhookStatus.pendingUpdateCount} pending update
                              {webhookStatus.pendingUpdateCount !== 1 ? "s" : ""}
                            </p>
                          </div>
                        )}
                        {webhookStatus.lastErrorMessage && (
                          <div className="flex items-start gap-1.5 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                            <AlertCircle size={11} className="text-red-500 flex-shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold text-red-700">Last error</p>
                              <p className="text-[10px] text-red-600 break-words">{webhookStatus.lastErrorMessage}</p>
                            </div>
                          </div>
                        )}
                        <p className="text-[9px] text-[var(--color-fg-faint)]">
                          Refreshed {new Date(webhookStatus.fetchedAt).toLocaleTimeString()}
                        </p>
                      </div>
                    ) : fetchingStatus ? (
                      <div className="flex items-center gap-1.5">
                        <Loader2 size={11} className="animate-spin text-[var(--color-fg-faint)]" />
                        <p className="text-[11px] text-[var(--color-fg-faint)]">Fetching webhook status…</p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-[var(--color-fg-faint)]">
                        Click Refresh to check webhook status.
                      </p>
                    )}

                    {/* Register / update webhook button */}
                    <div className="flex flex-col gap-2 pt-1 border-t border-[var(--color-border)]">
                      <button
                        onClick={() => { setWebhookReg(null); void handleRegisterWebhook(); }}
                        disabled={webhookReg?.stage === "registering"}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold border transition-colors",
                          webhookReg?.stage === "registering"
                            ? "opacity-50 cursor-not-allowed text-[var(--color-fg-faint)] bg-[var(--color-canvas)] border-[var(--color-border)]"
                            : "text-[#0066aa] bg-blue-50 border-blue-200 hover:bg-blue-100",
                        )}
                      >
                        {webhookReg?.stage === "registering" ? (
                          <><Loader2 size={12} className="animate-spin" /> Registering…</>
                        ) : (
                          <><Webhook size={12} />
                          {webhookStatus?.url ? "Update webhook registration" : "Register webhook with Telegram"}</>
                        )}
                      </button>
                      {webhookReg?.stage === "done" && (
                        <div className={cn(
                          "flex items-start gap-1.5 text-[11px] px-3 py-2 rounded-lg",
                          webhookReg.ok
                            ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                            : "bg-red-50 border border-red-200 text-red-600",
                        )}>
                          {webhookReg.ok
                            ? <CheckCircle2 size={11} className="flex-shrink-0 mt-0.5" />
                            : <AlertCircle   size={11} className="flex-shrink-0 mt-0.5" />
                          }
                          <span>{webhookReg.message}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Active now */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)] mb-2">
                  Active now
                </p>
                <div className="flex flex-col gap-1.5">
                  {(isSuccessReal
                    ? [
                        "Bot token stored AES-256-GCM encrypted in server database",
                        "Webhook validated via X-Telegram-Bot-Api-Secret-Token on every request",
                        `Webhook route: /api/integrations/telegram/webhook/${WORKSPACE_ID}`,
                        "Token never sent to browser — all Bot API calls are server-side",
                      ]
                    : [
                        "Bot username saved locally",
                        "Inbox shows Telegram connection status",
                        "Send test message simulates incoming messages",
                      ]
                  ).map((item) => (
                    <div key={item} className="flex items-start gap-2">
                      <CheckCircle2 size={11} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                      <span className="text-[12px] text-[var(--color-fg-muted)]">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Disconnect */}
              <div className="pt-2 border-t border-[var(--color-border)]">
                {confirmDisc ? (
                  <div className="flex items-center gap-2">
                    <p className="text-[12px] text-[var(--color-fg-muted)] flex-1">
                      {isSuccessReal
                        ? "Remove encrypted token from database and disconnect?"
                        : "Remove this connection?"}
                    </p>
                    <button
                      onClick={() => { void handleDisconnect(); }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-red-500 hover:bg-red-400 text-white transition-colors"
                    >
                      Yes, disconnect
                    </button>
                    <button onClick={() => setConfirmDisc(false)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--color-fg-muted)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] transition-colors">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDisc(true)}
                    className="flex items-center gap-1.5 text-[12px] text-red-500 hover:text-red-600 font-medium transition-colors">
                    <Unplug size={12} />
                    Disconnect Telegram
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-canvas)] flex items-center justify-between gap-3 flex-shrink-0">
          {step === "mode" && (
            <button onClick={handleClose}
              className="px-4 py-2 rounded-xl text-[13px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] transition-colors">
              Cancel
            </button>
          )}

          {step === "intro" && (
            <>
              <button onClick={() => setStep("mode")}
                className="px-4 py-2 rounded-xl text-[13px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] transition-colors">
                Back
              </button>
              <button onClick={() => setStep("configure")}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-[13px] font-semibold bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white transition-colors">
                Set up connection <ChevronRight size={14} />
              </button>
            </>
          )}

          {step === "configure" && (
            <>
              <button onClick={() => { setStep("intro"); setError(null); setWebhookReg(null); }}
                className="px-4 py-2 rounded-xl text-[13px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] transition-colors">
                Back
              </button>
              <button
                onClick={() => { void handleConnect(); }}
                disabled={connecting}
                className={cn(
                  "flex items-center gap-1.5 px-5 py-2 rounded-xl text-[13px] font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                  connMode === "real"
                    ? "bg-[#0088cc] hover:bg-[#006eaa]"
                    : "bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]",
                )}
              >
                {connecting ? (
                  <><Loader2 size={14} className="animate-spin" /> Saving…</>
                ) : connMode === "real" ? (
                  <><Shield size={14} /> Save bot (Encrypted)</>
                ) : (
                  <><Send size={14} /> Connect (Simulated)</>
                )}
              </button>
            </>
          )}

          {step === "success" && (
            <button onClick={handleClose}
              className="ml-auto px-5 py-2 rounded-xl text-[13px] font-semibold bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white transition-colors">
              Done
            </button>
          )}
        </div>
      </div>
    </div>

    {/* Personal account modal — renders above this modal on z-[200] */}
    <TelegramAccountModal
      open={showAccountModal}
      onClose={() => setShowAccountModal(false)}
      onConnected={() => { setShowAccountModal(false); handleClose(); }}
    />
  </>
  );
}
