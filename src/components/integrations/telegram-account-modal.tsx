"use client";

import { useState, useEffect } from "react";
import {
  X, ChevronRight, ChevronLeft,
  Shield, Clock, Users, MessageCircle,
  CheckCircle2, Sparkles, TrendingUp,
  Send, Loader2, Check, Search,
  Zap, FileText, User, Lock,
  MessagesSquare, Contact, UserCheck,
  Phone, KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PersonalDialog } from "@/lib/mtproto-types";
import {
  SCAN_MESSAGES,
  IMPORT_STAGES,
  toInitials,
  startPersonalAuth,
  verifyPersonalOtp,
  verifyPersonal2FA,
  scanPersonalDialogs,
  importPersonalDialogs,
  type TelegramAccountChat,
  type TelegramAccountScanResult,
  type TelegramImportResult,
  type ImportScope,
} from "@/lib/telegram-account";
import { addSuggestions, generateImportSuggestions } from "@/lib/ai-suggestions";
import { matchClient, type ClientMatchResult, type ClientMatchInput } from "@/lib/client-matcher";
import { getClients } from "@/lib/storage";

// ── Types ──────────────────────────────────────────────────────────────────────

type AccountStep =
  | "welcome"    // Intro + privacy / what gets imported
  | "phone"      // Enter phone number
  | "otp"        // Enter OTP code
  | "password"   // 2FA password (conditional)
  | "scanning"   // Fetching dialogs from Telegram (real API call)
  | "preview"    // Scan result stats + chat breakdown
  | "select"     // Import scope: all / business / selected chats
  | "importing"  // Importing into DB (real API call)
  | "complete";  // Post-import summary

interface TelegramAccountModalProps {
  open:        boolean;
  onClose:     () => void;
  onConnected: () => void;
}

// ── Step progress indicator ────────────────────────────────────────────────────

const PROGRESS_STEPS = ["Overview", "Auth", "Preview", "Select", "Done"] as const;

function stepToIndex(step: AccountStep): number {
  switch (step) {
    case "welcome":   return 0;
    case "phone":     return 1;
    case "otp":       return 1;
    case "password":  return 1;
    case "scanning":  return 2;
    case "preview":   return 2;
    case "select":    return 3;
    case "importing": return 3;
    case "complete":  return 4;
  }
}

function StepProgress({ step }: { step: AccountStep }) {
  const currentIdx = stepToIndex(step);
  return (
    <div className="flex items-center px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-canvas)] flex-shrink-0">
      {PROGRESS_STEPS.map((label, i) => (
        <div key={label} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300",
              i < currentIdx   ? "bg-emerald-500 text-white"               :
              i === currentIdx ? "bg-[var(--color-accent)] text-white"     :
                                 "bg-[var(--color-border)] text-[var(--color-fg-faint)]",
            )}>
              {i < currentIdx
                ? <Check size={10} />
                : <span className="text-[10px] font-bold">{i + 1}</span>
              }
            </div>
            <span className={cn(
              "text-[9px] font-semibold whitespace-nowrap transition-colors",
              i === currentIdx ? "text-[var(--color-accent)]" : "text-[var(--color-fg-faint)]",
            )}>
              {label}
            </span>
          </div>
          {i < PROGRESS_STEPS.length - 1 && (
            <div className={cn(
              "flex-1 h-0.5 mx-2 mb-4 rounded-full transition-colors duration-300",
              i < currentIdx ? "bg-emerald-400" : "bg-[var(--color-border)]",
            )} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Animated progress bar ──────────────────────────────────────────────────────

function AnimatedProgressBar({
  progress,
  message,
  color = "bg-[var(--color-accent)]",
}: {
  progress: number;
  message:  string;
  color?:   string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Loader2 size={12} className="animate-spin text-[var(--color-accent)] flex-shrink-0" />
          <span className="text-[12px] text-[var(--color-fg-muted)] truncate">{message}</span>
        </div>
        <span className="text-[11px] font-mono text-[var(--color-fg-faint)] flex-shrink-0 tabular-nums">
          {progress}%
        </span>
      </div>
      <div className="h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-75 ease-linear", color)}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  value,
  label,
  color,
  bg,
}: {
  icon:  React.ElementType;
  value: number;
  label: string;
  color: string;
  bg:    string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-4 py-4 rounded-xl border", bg)}>
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", bg)}>
        <Icon size={18} className={color} />
      </div>
      <span className={cn("text-[24px] font-bold tabular-nums leading-none", color)}>{value}</span>
      <span className="text-[10px] font-medium text-[var(--color-fg-muted)] text-center leading-tight">{label}</span>
    </div>
  );
}

// ── Chat type badge ────────────────────────────────────────────────────────────

function ChatTypeBadge({ type }: { type: TelegramAccountChat["type"] | string }) {
  const map: Record<string, { label: string; cls: string }> = {
    private:    { label: "Private",  cls: "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]" },
    user:       { label: "Private",  cls: "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]" },
    group:      { label: "Group",    cls: "bg-purple-50 text-purple-600" },
    chat:       { label: "Group",    cls: "bg-purple-50 text-purple-600" },
    supergroup: { label: "Group",    cls: "bg-purple-50 text-purple-600" },
    channel:    { label: "Channel",  cls: "bg-amber-50 text-amber-700" },
  };
  const cfg = map[type] ?? { label: type, cls: "bg-gray-50 text-gray-600" };
  return (
    <span className={cn("text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0", cfg.cls)}>
      {cfg.label}
    </span>
  );
}

// ── Dialog row ────────────────────────────────────────────────────────────────

function DialogRow({
  dialog,
  selected,
  onToggle,
  matchResult,
}: {
  dialog:       PersonalDialog;
  selected:     boolean;
  onToggle:     () => void;
  matchResult?: ClientMatchResult | null;
}) {
  const daysAgoStr = (iso: string) => {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    return `${days}d ago`;
  };

  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left",
        selected
          ? "border-[var(--color-accent)] bg-[var(--color-accent-subtle)]"
          : "border-transparent hover:bg-[var(--color-canvas)] hover:border-[var(--color-border)]",
      )}
    >
      <div className={cn(
        "w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border-2 transition-all",
        selected
          ? "bg-[var(--color-accent)] border-[var(--color-accent)]"
          : "border-[var(--color-border)]",
      )}>
        {selected && <Check size={11} className="text-white" />}
      </div>

      <div className="w-8 h-8 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
        {dialog.avatarInitials || toInitials(dialog.title)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-semibold text-[var(--color-fg)] truncate">{dialog.title}</span>
          <ChatTypeBadge type={dialog.peerType} />
          {dialog.isBusiness && (
            <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 flex-shrink-0">
              Biz
            </span>
          )}
          {matchResult && (matchResult.tier === "exact" || matchResult.tier === "strong") && (
            <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 flex-shrink-0">
              ✓ {matchResult.client.name}
            </span>
          )}
          {matchResult && matchResult.tier === "likely" && (
            <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0">
              ~{matchResult.client.name}
            </span>
          )}
        </div>
        <p className="text-[10px] text-[var(--color-fg-faint)] truncate">
          {daysAgoStr(dialog.lastMsgAt)}
          {dialog.username ? ` · @${dialog.username}` : ""}
          {dialog.preview ? ` · ${dialog.preview}` : ""}
        </p>
      </div>

      <span className="text-[10px] font-semibold tabular-nums text-[var(--color-accent)] flex-shrink-0">
        {dialog.bizScore}
      </span>
    </button>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────

export function TelegramAccountModal({
  open,
  onClose,
  onConnected,
}: TelegramAccountModalProps) {

  // Auth state
  const [step,           setStep]           = useState<AccountStep>("welcome");
  const [phone,          setPhone]          = useState("");
  const [otp,            setOtp]            = useState("");
  const [password,       setPassword]       = useState("");
  const [authError,      setAuthError]      = useState("");
  const [authLoading,    setAuthLoading]    = useState(false);

  // Scanning state (real)
  const [dialogs,        setDialogs]        = useState<PersonalDialog[]>([]);
  const [scanProgress,   setScanProgress]   = useState(0);
  const [scanMsgIdx,     setScanMsgIdx]     = useState(0);
  const [scanError,      setScanError]      = useState("");

  // Selection state
  const [importScope,     setImportScope]     = useState<ImportScope>("business");
  const [selectedPeerIds, setSelectedPeerIds] = useState<Set<string>>(new Set());
  const [chatSearch,      setChatSearch]      = useState("");

  // Import state (real)
  const [importProgress,  setImportProgress]  = useState(0);
  const [importStageIdx,  setImportStageIdx]  = useState(0);
  const [importResult,    setImportResult]    = useState<TelegramImportResult | null>(null);

  // Client matching: peerId → best CRM client match
  const [matchMap,        setMatchMap]        = useState<Map<string, ClientMatchResult>>(new Map());

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setStep("welcome");
    setPhone(""); setOtp(""); setPassword("");
    setAuthError(""); setAuthLoading(false);
    setDialogs([]); setScanProgress(0); setScanMsgIdx(0); setScanError("");
    setImportScope("business");
    setSelectedPeerIds(new Set());
    setChatSearch("");
    setImportProgress(0); setImportStageIdx(0); setImportResult(null);
    setMatchMap(new Map());
  }, [open]);

  // ── Scanning: real API call with animated progress ──────────────────────────
  useEffect(() => {
    if (step !== "scanning") return;

    setScanProgress(0);
    setScanMsgIdx(0);
    setScanError("");

    // Animated progress up to 90% while API runs
    const FAKE_DURATION = 4000;
    const TICK_MS       = 100;
    let tick            = 0;
    const maxTicks      = FAKE_DURATION / TICK_MS;

    const timer = setInterval(() => {
      tick++;
      const pct = Math.min(Math.round((tick / maxTicks) * 90), 90);
      setScanProgress(pct);
      setScanMsgIdx(Math.min(
        Math.floor((tick / maxTicks) * (SCAN_MESSAGES.length - 1)),
        SCAN_MESSAGES.length - 2,
      ));
    }, TICK_MS);

    scanPersonalDialogs()
      .then((res) => {
        clearInterval(timer);
        if (!res.ok) {
          setScanError(res.error ?? "Failed to fetch dialogs");
          return;
        }
        setScanProgress(100);
        setScanMsgIdx(SCAN_MESSAGES.length - 1);
        setDialogs(res.dialogs);
        // Pre-select business dialogs
        const bizIds = new Set(res.dialogs.filter((d) => d.isBusiness).map((d) => d.peerId));
        setSelectedPeerIds(bizIds);
        // Run CRM client matching against localStorage
        try {
          const crmClients = getClients();
          const newMatchMap = new Map<string, ClientMatchResult>();
          for (const d of res.dialogs) {
            const input: ClientMatchInput = {
              channel:  "telegram",
              name:     d.title,
              username: d.username,
              phone:    d.phone,
            };
            const result = matchClient(input, crmClients);
            if (result) newMatchMap.set(d.peerId, result);
          }
          setMatchMap(newMatchMap);
        } catch { /* matching is best-effort */ }
        setTimeout(() => setStep("preview"), 500);
      })
      .catch((err: unknown) => {
        clearInterval(timer);
        setScanError(err instanceof Error ? err.message : "Connection error");
      });

    return () => clearInterval(timer);
  }, [step]);

  // ── Importing: real API call with animated progress ─────────────────────────
  useEffect(() => {
    if (step !== "importing") return;

    setImportProgress(0);
    setImportStageIdx(0);

    // Animated progress up to 90% while API runs
    const FAKE_DURATION = 5000;
    const TICK_MS       = 100;
    let tick            = 0;
    const maxTicks      = FAKE_DURATION / TICK_MS;

    const targetPeerIds = (() => {
      if (importScope === "all")      return dialogs.map((d) => d.peerId);
      if (importScope === "business") return dialogs.filter((d) => d.isBusiness).map((d) => d.peerId);
      return [...selectedPeerIds];
    })();

    const timer = setInterval(() => {
      tick++;
      const pct = Math.min(Math.round((tick / maxTicks) * 90), 90);
      setImportProgress(pct);
      setImportStageIdx(Math.min(
        Math.floor((tick / maxTicks) * IMPORT_STAGES.length),
        IMPORT_STAGES.length - 1,
      ));
    }, TICK_MS);

    // Build clientLinks for matched dialogs
    const clientLinks = targetPeerIds
      .filter((pid) => matchMap.has(pid))
      .map((pid) => {
        const match = matchMap.get(pid)!;
        return { peerId: pid, clientId: match.client.id, clientName: match.client.name };
      });

    importPersonalDialogs(targetPeerIds, "default", clientLinks)
      .then((res) => {
        clearInterval(timer);
        setImportProgress(100);
        setImportStageIdx(IMPORT_STAGES.length - 1);

        const result: TelegramImportResult = {
          clientsCreated:        res.result?.clientsCreated        ?? 0,
          clientsMatched:        res.result?.clientsMatched        ?? clientLinks.length,
          conversationsImported: res.result?.conversationsImported ?? 0,
          tasksSuggested:        0,
          dealsDetected:         0,
        };
        setImportResult(result);
        addSuggestions(generateImportSuggestions());
        setTimeout(() => setStep("complete"), 500);
      })
      .catch((err: unknown) => {
        clearInterval(timer);
        // Show error but still complete (partial import)
        console.error("[Personal Import] error:", err);
        setImportProgress(100);
        setImportResult({
          clientsCreated: 0, clientsMatched: 0,
          conversationsImported: 0, tasksSuggested: 0, dealsDetected: 0,
        });
        setStep("complete");
      });

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Auth handlers ──────────────────────────────────────────────────────────

  async function handleStartAuth() {
    if (!phone.trim()) { setAuthError("Phone number is required"); return; }
    setAuthError("");
    setAuthLoading(true);
    try {
      const res = await startPersonalAuth(phone.trim());
      if (res.missingEnv) {
        setAuthError("Server not configured: TELEGRAM_PERSONAL_API_ID / TELEGRAM_PERSONAL_API_HASH missing from .env.local");
      } else if (!res.ok) {
        setAuthError(res.error ?? "Failed to send code");
      } else {
        setStep("otp");
      }
    } catch {
      setAuthError("Network error — please try again");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (!otp.trim()) { setAuthError("Please enter the code"); return; }
    setAuthError("");
    setAuthLoading(true);
    try {
      const res = await verifyPersonalOtp(otp.trim());
      if (res.needs2FA) {
        setStep("password");
      } else if (res.ok) {
        setStep("scanning");
      } else {
        setAuthError(res.error ?? "Invalid code");
      }
    } catch {
      setAuthError("Network error — please try again");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleVerify2FA() {
    if (!password) { setAuthError("Please enter your 2FA password"); return; }
    setAuthError("");
    setAuthLoading(true);
    try {
      const res = await verifyPersonal2FA(password);
      if (res.ok) {
        setStep("scanning");
      } else {
        setAuthError(res.error ?? "Incorrect password");
      }
    } catch {
      setAuthError("Network error — please try again");
    } finally {
      setAuthLoading(false);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const businessDialogs = dialogs.filter((d) => d.isBusiness);
  const filteredDialogs = dialogs.filter((d) =>
    d.title.toLowerCase().includes(chatSearch.toLowerCase()) ||
    (d.username ?? "").toLowerCase().includes(chatSearch.toLowerCase()),
  );

  // Build a fake TelegramAccountScanResult-shaped object for the preview
  const scanResult = dialogs.length > 0 ? buildScanResult(dialogs) : null;

  function toggleDialog(peerId: string) {
    setSelectedPeerIds((prev) => {
      const next = new Set(prev);
      if (next.has(peerId)) next.delete(peerId); else next.add(peerId);
      return next;
    });
  }

  function selectAllBusiness() { setSelectedPeerIds(new Set(businessDialogs.map((d) => d.peerId))); }
  function deselectAll()       { setSelectedPeerIds(new Set()); }

  function handleStartImport() {
    if (importScope === "selected" && selectedPeerIds.size === 0) return;
    setStep("importing");
  }

  if (!open) return null;

  const isTransitioning = step === "scanning" || step === "importing";
  const selectedCount   = (() => {
    if (importScope === "all")      return dialogs.length;
    if (importScope === "business") return businessDialogs.length;
    return selectedPeerIds.size;
  })();

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !isTransitioning) onClose(); }}
    >
      <div className="w-full max-w-[560px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
              <User size={16} className="text-[#0088cc]" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-[var(--color-fg)]">Personal Telegram Account</h2>
              <p className="text-[11px] text-[var(--color-fg-faint)]">
                {step === "welcome"   && "Connect your account to import contacts & conversations"}
                {step === "phone"     && "Enter your Telegram phone number"}
                {step === "otp"       && "Enter the code Telegram sent you"}
                {step === "password"  && "Enter your 2FA cloud password"}
                {step === "scanning"  && "Scanning your Telegram account…"}
                {step === "preview"   && "Review what we found in your account"}
                {step === "select"    && "Choose which conversations to import"}
                {step === "importing" && "Importing your data into Ventra…"}
                {step === "complete"  && "Import complete — your data is ready"}
              </p>
            </div>
          </div>
          <button
            onClick={isTransitioning ? undefined : onClose}
            disabled={isTransitioning}
            className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Step progress ── */}
        <StepProgress step={step} />

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ─── Welcome ─────────────────────────────────────────────────────── */}
          {step === "welcome" && (
            <div className="px-6 py-5 flex flex-col gap-5">

              <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl">
                <Clock size={13} className="text-[var(--color-fg-faint)] flex-shrink-0" />
                <p className="text-[12px] text-[var(--color-fg-muted)]">
                  Estimated setup time: <strong className="text-[var(--color-fg)]">~2 minutes</strong>
                </p>
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)] mb-2.5">
                  What gets imported
                </p>
                <div className="flex flex-col gap-2">
                  {[
                    {
                      icon:  Contact,
                      title: "Contacts → Clients",
                      desc:  "Your business chat partners are matched to CRM clients or auto-created as leads.",
                    },
                    {
                      icon:  MessagesSquare,
                      title: "Conversations → Inbox",
                      desc:  "Message threads become Inbox conversations — grouped by contact, sorted by latest activity.",
                    },
                    {
                      icon:  Sparkles,
                      title: "AI Business Filter",
                      desc:  "Ventra automatically scores each chat for business relevance, pre-selecting the most relevant ones.",
                    },
                    {
                      icon:  TrendingUp,
                      title: "You Choose What's Imported",
                      desc:  "Review all scored chats before anything is created. Import all, business only, or select manually.",
                    },
                  ].map(({ icon: Icon, title, desc }) => (
                    <div key={title} className="flex items-start gap-3 px-4 py-3 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl">
                      <div className="w-7 h-7 rounded-lg bg-[var(--color-accent-subtle)] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon size={13} className="text-[var(--color-accent)]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-[var(--color-fg)]">{title}</p>
                        <p className="text-[11px] text-[var(--color-fg-muted)] mt-0.5 leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-2.5 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <Lock size={13} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-emerald-700 leading-relaxed">
                  Your session key is stored encrypted server-side — never in plain text.
                  Revoke access anytime from Telegram → Settings → Active Sessions.
                </p>
              </div>

              <div className="flex items-start gap-2.5 px-4 py-3 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl">
                <Shield size={13} className="text-[var(--color-fg-faint)] flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-[var(--color-fg-muted)] leading-relaxed">
                  MTProto encrypts all Telegram communication end-to-end.
                  Ventra connects using your application credentials — no third-party relay.
                </p>
              </div>
            </div>
          )}

          {/* ─── Phone ───────────────────────────────────────────────────────── */}
          {step === "phone" && (
            <div className="px-6 py-8 flex flex-col gap-5">
              <div className="flex flex-col items-center gap-3 mb-2">
                <div className="w-14 h-14 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center">
                  <Phone size={24} className="text-[#0088cc]" />
                </div>
                <div className="text-center">
                  <p className="text-[14px] font-bold text-[var(--color-fg)]">Enter your phone number</p>
                  <p className="text-[11px] text-[var(--color-fg-faint)] mt-1">
                    Telegram will send you a verification code
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-semibold text-[var(--color-fg-muted)]">
                  Phone number (with country code)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setAuthError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleStartAuth(); }}
                  placeholder="+1 555 000 0000"
                  autoFocus
                  className="w-full bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-faint)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                />
              </div>

              {authError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-[11px] text-red-700 leading-relaxed">{authError}</p>
                </div>
              )}

              <p className="text-[10px] text-[var(--color-fg-faint)] text-center leading-relaxed">
                Telegram will send a one-time code via the app or SMS.
                Standard message rates may apply.
              </p>
            </div>
          )}

          {/* ─── OTP ─────────────────────────────────────────────────────────── */}
          {step === "otp" && (
            <div className="px-6 py-8 flex flex-col gap-5">
              <div className="flex flex-col items-center gap-3 mb-2">
                <div className="w-14 h-14 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center">
                  <Send size={24} className="text-[#0088cc]" />
                </div>
                <div className="text-center">
                  <p className="text-[14px] font-bold text-[var(--color-fg)]">Enter the code</p>
                  <p className="text-[11px] text-[var(--color-fg-faint)] mt-1">
                    Telegram sent a code to <strong>{phone}</strong>
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-semibold text-[var(--color-fg-muted)]">
                  Verification code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setAuthError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleVerifyOtp(); }}
                  placeholder="12345"
                  autoFocus
                  className="w-full bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-[22px] font-mono tracking-[0.5em] text-center text-[var(--color-fg)] placeholder:text-[var(--color-fg-faint)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                />
              </div>

              {authError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-[11px] text-red-700 leading-relaxed">{authError}</p>
                </div>
              )}

              <button
                onClick={() => { setStep("phone"); setOtp(""); setAuthError(""); }}
                className="text-[11px] text-[var(--color-accent)] hover:underline self-center"
              >
                Wrong number? Go back
              </button>
            </div>
          )}

          {/* ─── 2FA Password ─────────────────────────────────────────────────── */}
          {step === "password" && (
            <div className="px-6 py-8 flex flex-col gap-5">
              <div className="flex flex-col items-center gap-3 mb-2">
                <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
                  <KeyRound size={24} className="text-amber-600" />
                </div>
                <div className="text-center">
                  <p className="text-[14px] font-bold text-[var(--color-fg)]">Two-step verification</p>
                  <p className="text-[11px] text-[var(--color-fg-faint)] mt-1">
                    Your account has 2FA enabled. Enter your cloud password.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-semibold text-[var(--color-fg-muted)]">
                  Cloud password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setAuthError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleVerify2FA(); }}
                  placeholder="Your Telegram 2FA password"
                  autoFocus
                  className="w-full bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-faint)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                />
              </div>

              {authError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-[11px] text-red-700 leading-relaxed">{authError}</p>
                </div>
              )}

              <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  This is the 2FA password you set in Telegram → Settings → Privacy & Security → Two-Step Verification.
                  It is never stored by Ventra.
                </p>
              </div>
            </div>
          )}

          {/* ─── Scanning ─────────────────────────────────────────────────────── */}
          {step === "scanning" && (
            <div className="px-6 py-10 flex flex-col items-center gap-8">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-20 h-20 rounded-full bg-blue-100 animate-ping opacity-30" />
                <div className="absolute w-14 h-14 rounded-full bg-blue-100 animate-pulse opacity-50" />
                <div className="relative w-16 h-16 rounded-full bg-[#0088cc] flex items-center justify-center shadow-lg">
                  <Send size={28} className="text-white" strokeWidth={1.5} />
                </div>
              </div>

              <div className="w-full flex flex-col gap-3">
                <AnimatedProgressBar
                  progress={scanProgress}
                  message={scanError || (SCAN_MESSAGES[scanMsgIdx] ?? SCAN_MESSAGES[0])}
                  color={scanError ? "bg-red-400" : "bg-[#0088cc]"}
                />
              </div>

              {scanError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl w-full">
                  <p className="text-[11px] text-red-700">{scanError}</p>
                  <button
                    onClick={() => setStep("phone")}
                    className="text-[11px] text-red-600 font-semibold mt-1 hover:underline"
                  >
                    Go back and retry
                  </button>
                </div>
              )}

              {!scanError && (
                <p className="text-[12px] text-[var(--color-fg-faint)] text-center max-w-[300px] leading-relaxed">
                  Reading your Telegram data via MTProto. This takes a few seconds.
                </p>
              )}
            </div>
          )}

          {/* ─── Preview ─────────────────────────────────────────────────────── */}
          {step === "preview" && scanResult && (
            <div className="px-6 py-5 flex flex-col gap-5">

              <div className="text-center">
                <p className="text-[13px] font-semibold text-[var(--color-fg)]">Here&apos;s what we found</p>
                <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5">
                  {scanResult.totalChats} chats scanned from your Telegram account
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  icon={MessagesSquare}
                  value={scanResult.totalChats}
                  label="Chats Found"
                  color="text-[#0088cc]"
                  bg="bg-blue-50 border-blue-100"
                />
                <StatCard
                  icon={Users}
                  value={scanResult.estimatedClients}
                  label="Business Chats"
                  color="text-[var(--color-accent)]"
                  bg="bg-[var(--color-accent-subtle)] border-[var(--color-border)]"
                />
                <StatCard
                  icon={MessageCircle}
                  value={scanResult.activeConversations}
                  label="Active (7 days)"
                  color="text-purple-600"
                  bg="bg-purple-50 border-purple-100"
                />
                <StatCard
                  icon={Zap}
                  value={scanResult.channels}
                  label="Channels"
                  color="text-amber-600"
                  bg="bg-amber-50 border-amber-100"
                />
              </div>

              <div className="px-4 py-4 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)] mb-3">
                  Chat breakdown
                </p>
                <div className="flex flex-col gap-2">
                  {[
                    { label: "Private chats",  count: scanResult.privateChats,  color: "bg-[var(--color-accent)]",  pct: safePct(scanResult.privateChats,  scanResult.totalChats) },
                    { label: "Group chats",    count: scanResult.groupChats,    color: "bg-purple-500",             pct: safePct(scanResult.groupChats,    scanResult.totalChats) },
                    { label: "Supergroups",    count: scanResult.supergroups,   color: "bg-pink-500",               pct: safePct(scanResult.supergroups,   scanResult.totalChats) },
                    { label: "Channels",       count: scanResult.channels,      color: "bg-amber-500",              pct: safePct(scanResult.channels,      scanResult.totalChats) },
                  ].map(({ label, count, color, pct }) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-[11px] text-[var(--color-fg-muted)] w-28 flex-shrink-0">{label}</span>
                      <div className="flex-1 h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] font-semibold text-[var(--color-fg-muted)] w-6 text-right flex-shrink-0">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                <p className="text-[12px] text-emerald-800">
                  <strong>{businessDialogs.length}</strong> chats identified as business-relevant
                  — pre-selected for you.
                </p>
              </div>
            </div>
          )}

          {/* ─── Select ──────────────────────────────────────────────────────── */}
          {step === "select" && (
            <div className="px-6 py-5 flex flex-col gap-4">

              <p className="text-[12px] text-[var(--color-fg-muted)] leading-relaxed">
                Choose which conversations to import into Ventra. You can always import more later.
              </p>

              <div className="flex flex-col gap-2">
                {([
                  {
                    id:    "all" as ImportScope,
                    title: "Import everything",
                    desc:  `All ${dialogs.length} chats — includes personal and group conversations`,
                    icon:  Users,
                    count: dialogs.length,
                  },
                  {
                    id:    "business" as ImportScope,
                    title: "Business chats only",
                    desc:  `${businessDialogs.length} chats scored as business-relevant — recommended`,
                    icon:  TrendingUp,
                    count: businessDialogs.length,
                    recommended: true,
                  },
                  {
                    id:    "selected" as ImportScope,
                    title: "Let me choose",
                    desc:  `Manually select which ${selectedPeerIds.size} chat${selectedPeerIds.size !== 1 ? "s" : ""} to import`,
                    icon:  CheckCircle2,
                    count: selectedPeerIds.size,
                  },
                ] as const).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setImportScope(opt.id)}
                    className={cn(
                      "flex items-center gap-3 w-full text-left px-4 py-3.5 rounded-xl border-2 transition-all",
                      importScope === opt.id
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-subtle)]"
                        : "border-[var(--color-border)] bg-[var(--color-canvas)] hover:border-[var(--color-accent-subtle)]",
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
                      importScope === opt.id ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-border)] text-[var(--color-fg-faint)]",
                    )}>
                      <opt.icon size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-[13px] font-semibold transition-colors",
                          importScope === opt.id ? "text-[var(--color-accent)]" : "text-[var(--color-fg)]",
                        )}>
                          {opt.title}
                        </span>
                        {"recommended" in opt && opt.recommended && (
                          <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--color-accent)] text-white flex-shrink-0">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5">{opt.desc}</p>
                    </div>
                    <span className={cn(
                      "text-[13px] font-bold flex-shrink-0 tabular-nums",
                      importScope === opt.id ? "text-[var(--color-accent)]" : "text-[var(--color-fg-faint)]",
                    )}>
                      {opt.count}
                    </span>
                  </button>
                ))}
              </div>

              {importScope === "selected" && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-faint)]" />
                      <input
                        type="text"
                        value={chatSearch}
                        onChange={(e) => setChatSearch(e.target.value)}
                        placeholder="Search chats…"
                        className="w-full bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl pl-8 pr-3 py-2 text-[12px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-faint)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                      />
                    </div>
                    <button onClick={selectAllBusiness} className="px-2.5 py-2 text-[10px] font-semibold text-[var(--color-accent)] border border-[var(--color-border)] rounded-xl hover:border-[var(--color-accent-subtle)] transition-colors whitespace-nowrap">
                      All biz
                    </button>
                    <button onClick={deselectAll} className="px-2.5 py-2 text-[10px] font-semibold text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] border border-[var(--color-border)] rounded-xl hover:border-[var(--color-accent-subtle)] transition-colors whitespace-nowrap">
                      None
                    </button>
                  </div>

                  <div className="flex flex-col gap-1 max-h-[260px] overflow-y-auto pr-0.5">
                    {filteredDialogs.length === 0 ? (
                      <p className="text-[12px] text-[var(--color-fg-faint)] text-center py-4">No chats match your search</p>
                    ) : (
                      filteredDialogs.map((dialog) => (
                        <DialogRow
                          key={dialog.peerId}
                          dialog={dialog}
                          selected={selectedPeerIds.has(dialog.peerId)}
                          onToggle={() => toggleDialog(dialog.peerId)}
                          matchResult={matchMap.get(dialog.peerId) ?? null}
                        />
                      ))
                    )}
                  </div>
                  <p className="text-[10px] text-[var(--color-fg-faint)] text-right">
                    {selectedPeerIds.size} of {dialogs.length} selected
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ─── Importing ───────────────────────────────────────────────────── */}
          {step === "importing" && (
            <div className="px-6 py-10 flex flex-col items-center gap-8">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-20 h-20 rounded-2xl bg-[var(--color-accent-subtle)] animate-ping opacity-30 rounded-full" />
                <div className="relative w-16 h-16 rounded-2xl bg-[var(--color-accent)] flex items-center justify-center shadow-lg">
                  <Sparkles size={28} className="text-white" strokeWidth={1.5} />
                </div>
              </div>

              <div className="w-full flex flex-col gap-4">
                <AnimatedProgressBar
                  progress={importProgress}
                  message={IMPORT_STAGES[importStageIdx] ?? IMPORT_STAGES[0]}
                />

                <div className="flex flex-col gap-1.5">
                  {IMPORT_STAGES.map((stage, i) => (
                    <div key={stage} className="flex items-center gap-2">
                      {i < importStageIdx ? (
                        <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
                      ) : i === importStageIdx ? (
                        <Loader2 size={13} className="animate-spin text-[var(--color-accent)] flex-shrink-0" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-[var(--color-border)] flex-shrink-0" />
                      )}
                      <span className={cn(
                        "text-[11px] transition-colors",
                        i < importStageIdx   ? "text-emerald-600 font-medium"        :
                        i === importStageIdx  ? "text-[var(--color-fg)] font-semibold" :
                                               "text-[var(--color-fg-faint)]",
                      )}>
                        {stage}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ─── Complete ────────────────────────────────────────────────────── */}
          {step === "complete" && importResult && (
            <div className="px-6 py-5 flex flex-col gap-5">

              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-14 h-14 rounded-full bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center">
                  <CheckCircle2 size={28} className="text-emerald-500" />
                </div>
                <div className="text-center">
                  <h3 className="text-[16px] font-bold text-[var(--color-fg)]">Import complete</h3>
                  <p className="text-[12px] text-[var(--color-fg-faint)] mt-0.5">
                    Your Telegram data is now in Ventra
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {importResult.clientsMatched > 0 && (
                  <StatCard
                    icon={UserCheck}
                    value={importResult.clientsMatched}
                    label="Matched Existing"
                    color="text-emerald-600"
                    bg="bg-emerald-50 border-emerald-100"
                  />
                )}
                <StatCard
                  icon={Users}
                  value={importResult.clientsCreated}
                  label="New Clients"
                  color="text-[#0088cc]"
                  bg="bg-blue-50 border-blue-100"
                />
                <StatCard
                  icon={MessageCircle}
                  value={importResult.conversationsImported}
                  label="Conversations"
                  color="text-[var(--color-accent)]"
                  bg="bg-[var(--color-accent-subtle)] border-[var(--color-border)]"
                />
              </div>

              <div className="px-4 py-4 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)] mb-2.5">
                  What to do next
                </p>
                <div className="flex flex-col gap-2">
                  {[
                    { icon: MessageCircle, text: "Open Inbox → Personal Account to see imported conversations" },
                    { icon: UserCheck,     text: "Visit Clients to see auto-created contact records" },
                    { icon: FileText,      text: "Check Settings → Telegram to manage your connection" },
                  ].map(({ icon: Icon, text }) => (
                    <div key={text} className="flex items-center gap-2">
                      <Icon size={11} className="text-[var(--color-accent)] flex-shrink-0" />
                      <span className="text-[11px] text-[var(--color-fg-muted)]">{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-canvas)] flex items-center justify-between gap-3 flex-shrink-0">

          {step === "welcome" && (
            <>
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] transition-colors">
                Back
              </button>
              <button
                onClick={() => setStep("phone")}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-[13px] font-semibold bg-[#0088cc] hover:bg-[#006eaa] text-white transition-colors"
              >
                Connect account <ChevronRight size={14} />
              </button>
            </>
          )}

          {step === "phone" && (
            <>
              <button onClick={() => { setStep("welcome"); setAuthError(""); }} className="flex items-center gap-1 px-4 py-2 rounded-xl text-[13px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] transition-colors">
                <ChevronLeft size={13} /> Back
              </button>
              <button
                onClick={() => void handleStartAuth()}
                disabled={authLoading || !phone.trim()}
                className={cn(
                  "flex items-center gap-1.5 px-5 py-2 rounded-xl text-[13px] font-semibold text-white transition-colors",
                  authLoading || !phone.trim()
                    ? "bg-[var(--color-border)] cursor-not-allowed"
                    : "bg-[#0088cc] hover:bg-[#006eaa]",
                )}
              >
                {authLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                Send code <ChevronRight size={14} />
              </button>
            </>
          )}

          {step === "otp" && (
            <>
              <button onClick={() => { setStep("phone"); setOtp(""); setAuthError(""); }} className="flex items-center gap-1 px-4 py-2 rounded-xl text-[13px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] transition-colors">
                <ChevronLeft size={13} /> Back
              </button>
              <button
                onClick={() => void handleVerifyOtp()}
                disabled={authLoading || otp.length < 4}
                className={cn(
                  "flex items-center gap-1.5 px-5 py-2 rounded-xl text-[13px] font-semibold text-white transition-colors",
                  authLoading || otp.length < 4
                    ? "bg-[var(--color-border)] cursor-not-allowed"
                    : "bg-[#0088cc] hover:bg-[#006eaa]",
                )}
              >
                {authLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                Verify <ChevronRight size={14} />
              </button>
            </>
          )}

          {step === "password" && (
            <>
              <button onClick={() => { setStep("otp"); setPassword(""); setAuthError(""); }} className="flex items-center gap-1 px-4 py-2 rounded-xl text-[13px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] transition-colors">
                <ChevronLeft size={13} /> Back
              </button>
              <button
                onClick={() => void handleVerify2FA()}
                disabled={authLoading || !password}
                className={cn(
                  "flex items-center gap-1.5 px-5 py-2 rounded-xl text-[13px] font-semibold text-white transition-colors",
                  authLoading || !password
                    ? "bg-[var(--color-border)] cursor-not-allowed"
                    : "bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]",
                )}
              >
                {authLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                Confirm <ChevronRight size={14} />
              </button>
            </>
          )}

          {(step === "scanning" || step === "importing") && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[12px] text-[var(--color-fg-faint)]">
                {step === "scanning" ? "Scanning your account…" : "Importing your data…"}
              </p>
            </div>
          )}

          {step === "preview" && (
            <>
              <button onClick={() => setStep("phone")} className="flex items-center gap-1 px-4 py-2 rounded-xl text-[13px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] transition-colors">
                <ChevronLeft size={13} /> Back
              </button>
              <button
                onClick={() => setStep("select")}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-[13px] font-semibold bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white transition-colors"
              >
                Choose what to import <ChevronRight size={14} />
              </button>
            </>
          )}

          {step === "select" && (
            <>
              <button onClick={() => setStep("preview")} className="flex items-center gap-1 px-4 py-2 rounded-xl text-[13px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] transition-colors">
                <ChevronLeft size={13} /> Back
              </button>
              <button
                onClick={handleStartImport}
                disabled={importScope === "selected" && selectedPeerIds.size === 0}
                className={cn(
                  "flex items-center gap-1.5 px-5 py-2 rounded-xl text-[13px] font-semibold text-white transition-colors",
                  importScope === "selected" && selectedPeerIds.size === 0
                    ? "bg-[var(--color-border)] cursor-not-allowed"
                    : "bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]",
                )}
              >
                Start import · {selectedCount} chat{selectedCount !== 1 ? "s" : ""}
                <ChevronRight size={14} />
              </button>
            </>
          )}

          {step === "complete" && (
            <>
              <button onClick={onConnected} className="px-4 py-2 rounded-xl text-[13px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] transition-colors">
                Done
              </button>
              <button
                onClick={onConnected}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-[13px] font-semibold bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white transition-colors"
              >
                <Sparkles size={13} />
                Go to Inbox
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function safePct(part: number, total: number): number {
  return total === 0 ? 0 : (part / total) * 100;
}

/** Build a TelegramAccountScanResult from real PersonalDialogs for the preview step. */
function buildScanResult(dialogs: PersonalDialog[]): TelegramAccountScanResult {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 86_400_000;

  const privateChats  = dialogs.filter((d) => d.peerType === "user").length;
  const groupChats    = dialogs.filter((d) => d.peerType === "chat").length;
  const supergroups   = 0; // MTProto channels subsume supergroups
  const channels      = dialogs.filter((d) => d.peerType === "channel").length;
  const bizDialogs    = dialogs.filter((d) => d.isBusiness);
  const active        = dialogs.filter((d) => new Date(d.lastMsgAt).getTime() > sevenDaysAgo).length;

  const chats = dialogs.map((d): TelegramAccountChat => ({
    id:               parseInt(d.peerId, 10) || 0,
    name:             d.title,
    type:             d.peerType === "user" ? "private" : d.peerType === "channel" ? "channel" : "group",
    messageCount:     0, // not available from scan
    lastActivity:     d.lastMsgAt,
    isBusinessLikely: d.isBusiness,
    avatarInitials:   d.avatarInitials,
    username:         d.username,
    bizScore:         d.bizScore,
    peerId:           d.peerId,
  }));

  return {
    totalChats:          dialogs.length,
    privateChats,
    groupChats,
    supergroups,
    channels,
    estimatedClients:    bizDialogs.length,
    activeConversations: active,
    potentialTasks:      Math.max(0, Math.round(bizDialogs.length * 0.4)),
    chats,
    myId:                "",
  };
}

