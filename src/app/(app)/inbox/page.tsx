"use client";

/**
 * /inbox — Unified Inbox
 *
 * 3-panel layout:
 *   Left  (280px) — conversation list with filter + search
 *   Center (flex)  — message thread for selected conversation
 *   Right (260px)  — conversation metadata & client info
 *
 * Data comes from the unified /api/inbox and
 * /api/conversations/[id]/messages endpoints.
 * Telegram messages are bridged into the unified tables by the webhook handler.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter }  from "next/navigation";
import { TopBar }     from "@/components/layout/top-bar";
import { cn }         from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import {
  Send, Mail, MessageCircle, Search, RefreshCw,
  Loader2, Inbox, User, Clock,
  CheckCircle2, XCircle, Check, AlertCircle,
  Zap, ChevronDown, Link2, UserPlus, ExternalLink, CheckSquare, TrendingUp,
  Sparkles,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Channel  = "telegram" | "email" | "whatsapp";
type Status   = "open" | "closed" | "snoozed";
type Filter   = "all" | "assigned" | Channel | Status;
type SenderT  = "client" | "agent" | "bot" | "system";

interface ConvSummary {
  id:              string;
  channel:         Channel;
  title:           string;
  status:          Status;
  clientId:        string | null;
  externalId:      string | null;
  assignedUserId:  string | null;
  lastMessageAt:   string | null;
  lastMessageText: string | null;
  createdAt:       string;
  isPersonal?:     boolean;
  /** Email-specific metadata */
  metadata?: {
    subject:  string | null;
    from:     string | null;
    provider: string | null;
  } | null;
}

interface Message {
  id:          string;
  senderType:  SenderT;
  senderId:    string | null;
  content:     string;
  attachments: unknown[];
  metadata:    Record<string, unknown>;
  createdAt:   string;
  pending?:    boolean;
  failed?:     boolean;
}

// ── Channel config ────────────────────────────────────────────────────────────

const CHANNEL_META: Record<Channel, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  telegram: { label: "Telegram", icon: Send,          color: "text-[#0088cc]",  bg: "bg-blue-50"   },
  email:    { label: "Email",    icon: Mail,           color: "text-indigo-600", bg: "bg-indigo-50" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle,  color: "text-[#25d366]",  bg: "bg-green-50"  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function relTime(iso: string | null): string {
  if (!iso) return "";
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return "just now";
  if (mins  < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days  < 7)  return `${days}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fullTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function msgDateLabel(iso: string): string {
  const d   = new Date(iso);
  const now = new Date();
  const yes = new Date(now); yes.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === yes.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function initials(title: string): string {
  return title.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ChannelBadge({ channel }: { channel: Channel }) {
  const m   = CHANNEL_META[channel];
  const Ico = m.icon;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
      m.bg, m.color,
    )}>
      <Ico size={8} /> {m.label}
    </span>
  );
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
      status === "open"    && "bg-emerald-50 text-emerald-700",
      status === "closed"  && "bg-slate-100  text-slate-500",
      status === "snoozed" && "bg-amber-50   text-amber-700",
    )}>
      {status === "open"    && <CheckCircle2 size={8} />}
      {status === "closed"  && <XCircle      size={8} />}
      {status === "snoozed" && <Clock        size={8} />}
      {status}
    </span>
  );
}

// ── Left panel: conversation row ──────────────────────────────────────────────

function ConvRow({
  conv,
  selected,
  onClick,
}: {
  conv:     ConvSummary;
  selected: boolean;
  onClick:  () => void;
}) {
  const ch    = CHANNEL_META[conv.channel];
  const ChIco = ch.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2.5 flex items-start gap-2.5 border-b border-[var(--color-border)]/60 last:border-0 transition-colors",
        selected
          ? "bg-[var(--color-accent-subtle)]"
          : "hover:bg-[var(--color-canvas)]/70",
      )}
    >
      <div className="relative flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[11px] font-bold text-white">
          {initials(conv.title || "?")}
        </div>
        <div
          className={cn("absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center", ch.bg)}
          style={{ border: "1.5px solid var(--color-canvas)" }}
        >
          <ChIco size={7} className={ch.color} />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <span className="text-[12px] font-semibold text-[var(--color-fg)] truncate">
            {conv.title || "Unknown"}
          </span>
          <span className="text-[10px] text-[var(--color-fg-faint)] flex-shrink-0">
            {relTime(conv.lastMessageAt ?? conv.createdAt)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {conv.isPersonal && conv.channel === "telegram" && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-blue-50 text-[#0066aa] border border-blue-200 flex-shrink-0">
              <Zap size={7} /> Personal
            </span>
          )}
          {conv.channel === "email" && conv.metadata?.subject && (
            <p className="text-[11px] text-[var(--color-fg-faint)] truncate italic">
              {conv.metadata.subject}
            </p>
          )}
          {(!conv.metadata?.subject) && conv.lastMessageText && (
            <p className="text-[11px] text-[var(--color-fg-faint)] truncate">
              {conv.lastMessageText}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Center panel: message bubble ──────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isAgent = msg.senderType === "agent" || msg.senderType === "bot";

  return (
    <>
      <div className={cn("flex gap-2 items-end", isAgent && "flex-row-reverse")}>
        {!isAgent && (
          <div className="w-5 h-5 rounded-full bg-[var(--color-accent)] flex items-center justify-center flex-shrink-0 mb-0.5">
            <User size={9} className="text-white" />
          </div>
        )}
        <div className={cn(
          "max-w-[72%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed",
          isAgent
            ? cn(
                "bg-[var(--color-accent)] text-white rounded-br-sm",
                msg.pending && "opacity-60",
                msg.failed  && "bg-red-500",
              )
            : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-fg)] rounded-bl-sm",
        )}>
          {msg.content}
        </div>
      </div>
      <div className={cn("flex items-center gap-2 mt-0.5 px-7", isAgent ? "justify-end" : "justify-start")}>
        <span className="text-[10px] text-[var(--color-fg-faint)]">{fullTime(msg.createdAt)}</span>
        {isAgent && msg.pending && (
          <span className="flex items-center gap-1 text-[10px] text-[var(--color-fg-faint)]">
            <Loader2 size={9} className="animate-spin" /> Sending…
          </span>
        )}
        {isAgent && !msg.pending && !msg.failed && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-600">
            <Check size={9} /> Sent
          </span>
        )}
        {isAgent && msg.failed && (
          <span className="flex items-center gap-1 text-[10px] text-red-400">
            <AlertCircle size={9} /> Failed
          </span>
        )}
      </div>
    </>
  );
}

// ── AI reply suggestions bar ──────────────────────────────────────────────────

function AIReplySuggestionsBar({
  conv,
  messages,
  onUseSuggestion,
}: {
  conv:            ConvSummary;
  messages:        Message[];
  onUseSuggestion: (text: string) => void;
}) {
  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [context,    setContext]    = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ id: string; style: string; label: string; content: string }>>([]);
  const [error,      setError]      = useState<string | null>(null);

  async function fetchSuggestions() {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    setContext(null);
    setOpen(true);
    try {
      const apiMsgs = messages.slice(-20).map((m) => ({
        role:    (m.senderType === "agent" || m.senderType === "bot" ? "agent" : "client") as "client" | "agent",
        content: m.content,
      }));
      const res = await fetch("/api/ai/suggest-reply", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({
          conversationId: conv.id,
          messages:       apiMsgs,
          clientName:     conv.title || "the client",
          channel:        conv.channel,
        }),
      });
      const data = await res.json() as {
        suggestions?: Array<{ id: string; style: string; label?: string; content: string }>;
        context?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Failed to generate suggestions.");
        return;
      }
      setSuggestions((data.suggestions ?? []).map((s) => ({
        id:      s.id,
        style:   s.style,
        label:   s.label ?? s.style,
        content: s.content,
      })));
      setContext(data.context ?? null);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-canvas)]/60 flex-shrink-0">
      {/* Trigger row */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          onClick={() => {
            if (!open) {
              void fetchSuggestions();
            } else {
              setOpen(false);
            }
          }}
          className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-accent)] hover:opacity-80 transition-opacity"
        >
          <Sparkles size={12} />
          AI Reply Suggestions
        </button>
        {open && suggestions.length > 0 && (
          <button
            onClick={() => { void fetchSuggestions(); }}
            className="ml-auto text-[10px] text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] transition-colors flex items-center gap-1"
          >
            <RefreshCw size={10} /> Refresh
          </button>
        )}
      </div>

      {/* Panel */}
      {open && (
        <div className="px-3 pb-2.5 space-y-2">
          {loading && (
            <div className="flex items-center gap-2 py-2 text-[11px] text-[var(--color-fg-faint)]">
              <Loader2 size={12} className="animate-spin" /> Generating replies…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-1.5 px-2.5 py-2 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-600">
              <AlertCircle size={12} /> {error}
            </div>
          )}
          {context && !loading && (
            <p className="text-[10px] text-[var(--color-fg-faint)] italic">Context: {context}</p>
          )}
          {!loading && suggestions.length > 0 && (
            <div className="space-y-1.5">
              {suggestions.map((s) => (
                <div key={s.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-accent)]">{s.label}</span>
                    <button
                      onClick={() => {
                        onUseSuggestion(s.content);
                        setOpen(false);
                      }}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
                    >
                      Use
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--color-fg)] leading-relaxed line-clamp-3">{s.content}</p>
                </div>
              ))}
            </div>
          )}
          {!loading && suggestions.length === 0 && !error && (
            <div className="text-center py-2 text-[11px] text-[var(--color-fg-faint)]">
              No suggestions yet — click AI Reply Suggestions to generate.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Reply bar ─────────────────────────────────────────────────────────────────

function ReplyBar({
  convId,
  channel,
  onSent,
  externalText,
  onExternalTextConsumed,
}: {
  convId:                 string;
  channel:                Channel;
  onSent:                 (msg: Message) => void;
  externalText?:          string;
  onExternalTextConsumed: () => void;
}) {
  const [text,    setText]    = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef           = useRef<HTMLTextAreaElement>(null);

  // When an AI suggestion is used, inject it into the textarea
  useEffect(() => {
    if (externalText) {
      setText(externalText);
      onExternalTextConsumed();
      textareaRef.current?.focus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalText]);

  const ch    = CHANNEL_META[channel];
  const ChIco = ch.icon;

  async function send() {
    const content = text.trim();
    if (!content || sending) return;

    setSending(true);
    setText("");

    const optimistic: Message = {
      id:          `opt_${Date.now()}`,
      senderType:  "agent",
      senderId:    null,
      content,
      attachments: [],
      metadata:    {},
      createdAt:   new Date().toISOString(),
      pending:     true,
    };
    onSent(optimistic);

    try {
      const res  = await fetch(`/api/conversations/${convId}/messages`, {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ content }),
        credentials: "include",
      });
      const data = await res.json() as { message?: Message; deliveryError?: string | null };
      if (res.ok && data.message) {
        // Mark as failed if the server stored the message but couldn't deliver it
        const deliveryFailed = Boolean(data.deliveryError);
        trackEvent("message_sent");
        onSent({ ...data.message, pending: false, failed: deliveryFailed });
      } else {
        onSent({ ...optimistic, pending: false, failed: true });
      }
    } catch {
      onSent({ ...optimistic, pending: false, failed: true });
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-canvas)] p-3 flex-shrink-0">
      <div className="flex items-end gap-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2 focus-within:border-[var(--color-accent)] transition-colors">
        <div className={cn("flex-shrink-0 mb-0.5", ch.color)}>
          <ChIco size={13} />
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Reply via ${ch.label}… (Enter to send, Shift+Enter for new line)`}
          rows={1}
          className="flex-1 resize-none bg-transparent text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-faint)] outline-none leading-relaxed max-h-28 overflow-y-auto"
          style={{ minHeight: "1.4rem" }}
        />
        <button
          onClick={() => { void send(); }}
          disabled={!text.trim() || sending}
          className="flex-shrink-0 mb-0.5 w-6 h-6 rounded-lg bg-[var(--color-accent)] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          {sending
            ? <Loader2 size={11} className="text-white animate-spin" />
            : <Send     size={11} className="text-white" />
          }
        </button>
      </div>
    </div>
  );
}

// ── Right panel: conversation metadata ────────────────────────────────────────

function ConvMetaPanel({
  conv,
  onClientLinked,
}: {
  conv: ConvSummary;
  onClientLinked: (clientId: string | null) => void;
}) {
  const router   = useRouter();
  const ch       = CHANNEL_META[conv.channel];
  const ChIco    = ch.icon;
  const [linkingClient, setLinkingClient] = useState(false);
  const [clientSearch,  setClientSearch]  = useState("");
  const [clientResults, setClientResults] = useState<{ id: string; name: string; company: string | null }[]>([]);
  const [searching,     setSearching]     = useState(false);
  const [convTasks,     setConvTasks]     = useState<{ id: string; title: string; status: string }[]>([]);
  const [aiTaskTitle,   setAiTaskTitle]   = useState<string | null>(null);
  const [showTaskForm,  setShowTaskForm]  = useState(false);
  const [newTaskTitle,  setNewTaskTitle]  = useState("");
  const [creatingTask,  setCreatingTask]  = useState(false);
  // Deals
  const [convDeals,     setConvDeals]     = useState<{ id: string; title: string; status: string; stage: { name: string; color: string } }[]>([]);
  const [aiDealTitle,   setAiDealTitle]   = useState<string | null>(null);
  const [showDealForm,  setShowDealForm]  = useState(false);
  const [newDealTitle,  setNewDealTitle]  = useState("");
  const [creatingDeal,  setCreatingDeal]  = useState(false);

  // Load tasks linked to this conversation
  useEffect(() => {
    void (async () => {
      try {
        const res  = await fetch(`/api/tasks?conversation_id=${conv.id}&limit=20`, { credentials: "include" });
        const data = await res.json() as { tasks?: { id: string; title: string; status: string }[] };
        setConvTasks(data.tasks ?? []);
      } catch { /* silent */ }
    })();
  }, [conv.id]);

  // Simple AI task detection: look for scheduling/action keywords in last message
  useEffect(() => {
    if (!conv.lastMessageText) return;
    const text = conv.lastMessageText.toLowerCase();
    const triggers = ["call", "schedule", "meeting", "send", "follow up", "remind", "check", "review", "tomorrow", "next week"];
    const matched = triggers.find((t) => text.includes(t));
    if (matched) {
      const capitalised = conv.lastMessageText.slice(0, 80).trim();
      setAiTaskTitle(capitalised.length > 60 ? capitalised.slice(0, 57) + "…" : capitalised);
    } else {
      setAiTaskTitle(null);
    }
  }, [conv.lastMessageText]);

  // Load deals linked to this conversation
  useEffect(() => {
    void (async () => {
      try {
        const res  = await fetch(`/api/deals?conversation_id=${conv.id}&limit=20`, { credentials: "include" });
        const data = await res.json() as { deals?: { id: string; title: string; status: string; stage: { name: string; color: string } }[] };
        setConvDeals(data.deals ?? []);
      } catch { /* silent */ }
    })();
  }, [conv.id]);

  // AI buying intent detection
  useEffect(() => {
    if (!conv.lastMessageText) return;
    const text = conv.lastMessageText.toLowerCase();
    const buyKws = ["buy","purchase","pricing","quote","proposal","contract","budget","subscribe","upgrade","license","demo","interested in","looking for"];
    const matched = buyKws.find((k) => text.includes(k));
    if (matched) {
      const snippet = conv.title ?? conv.lastMessageText.slice(0, 60).trim();
      setAiDealTitle(snippet.length > 50 ? snippet.slice(0, 47) + "…" : snippet);
    } else {
      setAiDealTitle(null);
    }
  }, [conv.lastMessageText, conv.title]);

  async function createDeal() {
    const title = newDealTitle.trim();
    if (!title) return;
    setCreatingDeal(true);
    try {
      await fetch("/api/deals", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({
          title,
          conversation_id: conv.id,
          client_id:       conv.clientId ?? undefined,
        }),
      });
      setNewDealTitle("");
      setShowDealForm(false);
      const res  = await fetch(`/api/deals?conversation_id=${conv.id}&limit=20`, { credentials: "include" });
      const data = await res.json() as { deals?: { id: string; title: string; status: string; stage: { name: string; color: string } }[] };
      setConvDeals(data.deals ?? []);
    } catch { /* silent */ } finally { setCreatingDeal(false); }
  }

  async function createTask() {
    const title = newTaskTitle.trim();
    if (!title) return;
    setCreatingTask(true);
    try {
      await fetch("/api/tasks", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({
          title,
          conversation_id: conv.id,
          client_id:       conv.clientId ?? undefined,
          priority:        "medium",
        }),
      });
      setNewTaskTitle("");
      setShowTaskForm(false);
      // Refresh task list
      const res  = await fetch(`/api/tasks?conversation_id=${conv.id}&limit=20`, { credentials: "include" });
      const data = await res.json() as { tasks?: { id: string; title: string; status: string }[] };
      setConvTasks(data.tasks ?? []);
    } catch { /* silent */ } finally { setCreatingTask(false); }
  }

  async function searchClients(q: string) {
    if (!q.trim()) { setClientResults([]); return; }
    setSearching(true);
    try {
      const res  = await fetch(`/api/clients?search=${encodeURIComponent(q)}&limit=8`, { credentials: "include" });
      const data = await res.json() as { clients?: { id: string; name: string; company: string | null }[] };
      setClientResults(data.clients ?? []);
    } catch { /* silent */ } finally { setSearching(false); }
  }

  async function linkClient(clientId: string | null) {
    const res = await fetch(`/api/conversations/${conv.id}`, {
      method:      "PATCH",
      credentials: "include",
      headers:     { "Content-Type": "application/json" },
      body:        JSON.stringify({ client_id: clientId }),
    });
    if (res.ok) {
      onClientLinked(clientId);
      setLinkingClient(false);
      setClientSearch("");
      setClientResults([]);
    }
  }

  return (
    <div className="flex flex-col gap-4 py-5 px-4 overflow-y-auto h-full">
      {/* Identity card */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3">
        <div className="w-10 h-10 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[13px] font-bold text-white mb-2.5">
          {initials(conv.title || "?")}
        </div>
        <p className="text-[13px] font-semibold text-[var(--color-fg)] truncate mb-0.5">
          {conv.title || "Unknown"}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
          <ChannelBadge channel={conv.channel} />
          <StatusBadge  status={conv.status} />
          {conv.isPersonal && conv.channel === "telegram" && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-blue-50 text-[#0066aa] border border-blue-200">
              <Zap size={8} /> Personal account
            </span>
          )}
        </div>
        {conv.externalId && (
          <p className="text-[10px] text-[var(--color-fg-faint)] mt-2">
            <span className="font-medium">{conv.channel === "telegram" ? "Chat ID" : "ID"}: </span>
            {conv.externalId}
          </p>
        )}
      </div>

      {/* Email metadata */}
      {conv.channel === "email" && conv.metadata && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)] mb-2">Email</p>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2 space-y-1.5">
            {conv.metadata.subject && (
              <div className="flex items-start gap-1.5">
                <span className="text-[10px] text-[var(--color-fg-faint)] w-12 flex-shrink-0 mt-0.5">Subject</span>
                <span className="text-[11px] text-[var(--color-fg)] leading-relaxed">{conv.metadata.subject}</span>
              </div>
            )}
            {conv.metadata.from && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--color-fg-faint)] w-12 flex-shrink-0">From</span>
                <span className="text-[11px] text-[var(--color-fg-muted)] truncate">{conv.metadata.from}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Linked Client */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)]">Client</p>
          <button
            onClick={() => setLinkingClient((v) => !v)}
            className="text-[10px] text-[var(--color-accent)] hover:underline flex items-center gap-1"
          >
            <Link2 size={10} /> {conv.clientId ? "Change" : "Link"}
          </button>
        </div>

        {conv.clientId ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl">
            <div className="w-5 h-5 rounded-full bg-[var(--color-accent)] flex items-center justify-center flex-shrink-0">
              <User size={9} className="text-white" />
            </div>
            <span className="text-[11px] text-[var(--color-fg)] flex-1 truncate">Linked client</span>
            <button
              onClick={() => router.push(`/clients/${conv.clientId}`)}
              className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]"
            >
              <ExternalLink size={11} />
            </button>
          </div>
        ) : (
          <div className="px-3 py-2 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl">
            <p className="text-[11px] text-[var(--color-fg-faint)]">No client linked</p>
          </div>
        )}

        {linkingClient && (
          <div className="mt-2 space-y-2">
            <input
              value={clientSearch}
              onChange={(e) => { setClientSearch(e.target.value); void searchClients(e.target.value); }}
              placeholder="Search clients…"
              className="w-full px-2.5 py-1.5 text-[12px] bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg text-[var(--color-fg)] outline-none focus:border-[var(--color-accent)]"
            />
            {searching && <div className="flex items-center justify-center py-2"><Loader2 size={13} className="animate-spin text-[var(--color-fg-faint)]" /></div>}
            {clientResults.length > 0 && (
              <div className="border border-[var(--color-border)] rounded-xl overflow-hidden">
                {clientResults.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { void linkClient(c.id); }}
                    className="w-full text-left px-3 py-2 text-[12px] hover:bg-[var(--color-canvas)] border-b border-[var(--color-border)] last:border-0 transition-colors"
                  >
                    <span className="font-medium text-[var(--color-fg)]">{c.name}</span>
                    {c.company && <span className="text-[var(--color-fg-faint)] ml-1">· {c.company}</span>}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => router.push("/clients?new=1")}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] text-[var(--color-accent)] border border-[var(--color-accent)]/30 rounded-lg hover:bg-[var(--color-accent)]/5 transition-colors"
              >
                <UserPlus size={11} /> Create Client
              </button>
              {conv.clientId && (
                <button
                  onClick={() => { void linkClient(null); }}
                  className="px-2 py-1.5 text-[11px] text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Unlink
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tasks */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)]">Tasks</p>
          <button
            onClick={() => setShowTaskForm((v) => !v)}
            className="text-[10px] text-[var(--color-accent)] hover:underline flex items-center gap-1"
          >
            <CheckSquare size={10} /> New
          </button>
        </div>

        {/* AI suggestion */}
        {aiTaskTitle && !showTaskForm && (
          <div className="mb-2 px-3 py-2 bg-[var(--color-accent-subtle)] border border-[var(--color-accent)]/20 rounded-xl">
            <p className="text-[9px] font-bold uppercase text-[var(--color-accent)] mb-1">AI Suggested Task</p>
            <p className="text-[11px] text-[var(--color-fg)] leading-snug mb-1.5 line-clamp-2">{aiTaskTitle}</p>
            <div className="flex gap-1.5">
              <button
                onClick={() => { setNewTaskTitle(aiTaskTitle); setShowTaskForm(true); setAiTaskTitle(null); }}
                className="flex-1 px-2 py-1 text-[10px] rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90"
              >
                Create
              </button>
              <button
                onClick={() => setAiTaskTitle(null)}
                className="px-2 py-1 text-[10px] rounded-lg border border-[var(--color-border)] text-[var(--color-fg-faint)] hover:bg-[var(--color-canvas)]"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Quick create form */}
        {showTaskForm && (
          <div className="mb-2 space-y-1.5">
            <input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void createTask(); if (e.key === "Escape") setShowTaskForm(false); }}
              placeholder="Task title…"
              autoFocus
              className="w-full px-2.5 py-1.5 text-[12px] bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg text-[var(--color-fg)] outline-none focus:border-[var(--color-accent)]"
            />
            <div className="flex gap-1.5">
              <button
                onClick={() => void createTask()}
                disabled={creatingTask || !newTaskTitle.trim()}
                className="flex-1 px-2 py-1 text-[11px] rounded-lg bg-[var(--color-accent)] text-white disabled:opacity-40 flex items-center justify-center gap-1"
              >
                {creatingTask ? <Loader2 size={10} className="animate-spin" /> : null}
                Create
              </button>
              <button
                onClick={() => setShowTaskForm(false)}
                className="px-2 py-1 text-[11px] rounded-lg border border-[var(--color-border)] text-[var(--color-fg-faint)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Task list */}
        {convTasks.length === 0 && !showTaskForm ? (
          <div className="px-3 py-2 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl">
            <p className="text-[11px] text-[var(--color-fg-faint)]">No tasks linked</p>
          </div>
        ) : convTasks.length > 0 ? (
          <div className="space-y-1">
            {convTasks.map((t) => (
              <button
                key={t.id}
                onClick={() => router.push(`/tasks`)}
                className="w-full flex items-center gap-2 px-3 py-1.5 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl hover:border-[var(--color-accent)] transition-colors text-left"
              >
                {t.status === "done"
                  ? <CheckCircle2 size={11} className="text-emerald-500 flex-shrink-0" />
                  : <Clock size={11} className="text-[var(--color-fg-faint)] flex-shrink-0" />}
                <span className={cn(
                  "text-[11px] truncate",
                  t.status === "done" ? "line-through text-[var(--color-fg-faint)]" : "text-[var(--color-fg)]",
                )}>{t.title}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Deals */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)]">Deals</p>
          <button
            onClick={() => setShowDealForm((v) => !v)}
            className="text-[10px] text-[var(--color-accent)] hover:underline flex items-center gap-1"
          >
            <TrendingUp size={10} /> New
          </button>
        </div>

        {/* AI buying intent banner */}
        {aiDealTitle && !showDealForm && (
          <div className="mb-2 px-3 py-2 bg-violet-50 border border-violet-200 rounded-xl">
            <p className="text-[9px] font-bold uppercase text-violet-600 mb-1">Buying Signal Detected</p>
            <p className="text-[11px] text-[var(--color-fg)] leading-snug mb-1.5 line-clamp-2">{aiDealTitle}</p>
            <div className="flex gap-1.5">
              <button
                onClick={() => { setNewDealTitle(aiDealTitle); setShowDealForm(true); setAiDealTitle(null); }}
                className="flex-1 px-2 py-1 text-[10px] rounded-lg bg-violet-600 text-white hover:opacity-90"
              >
                Create Deal
              </button>
              <button
                onClick={() => setAiDealTitle(null)}
                className="px-2 py-1 text-[10px] rounded-lg border border-violet-200 text-violet-600 hover:bg-violet-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Quick create deal form */}
        {showDealForm && (
          <div className="mb-2 space-y-1.5">
            <input
              value={newDealTitle}
              onChange={(e) => setNewDealTitle(e.target.value)}
              placeholder="Deal title…"
              className="w-full px-2.5 py-1.5 text-[11px] bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg outline-none focus:border-[var(--color-accent)] text-[var(--color-fg)]"
            />
            <div className="flex gap-1.5">
              <button
                onClick={() => void createDeal()}
                disabled={creatingDeal || !newDealTitle.trim()}
                className="flex-1 px-2 py-1 text-[11px] rounded-lg bg-[var(--color-accent)] text-white disabled:opacity-40 flex items-center justify-center gap-1"
              >
                {creatingDeal ? <Loader2 size={10} className="animate-spin" /> : null}
                Create
              </button>
              <button
                onClick={() => { setShowDealForm(false); setNewDealTitle(""); }}
                className="px-2 py-1 text-[11px] rounded-lg border border-[var(--color-border)] text-[var(--color-fg-muted)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Deal list */}
        {convDeals.length === 0 && !showDealForm ? (
          <div className="px-3 py-2 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl">
            <p className="text-[11px] text-[var(--color-fg-faint)]">No deals linked</p>
          </div>
        ) : convDeals.length > 0 ? (
          <div className="space-y-1">
            {convDeals.map((d) => (
              <button
                key={d.id}
                onClick={() => router.push(`/deals/${d.id}`)}
                className="w-full flex items-center gap-2 px-3 py-1.5 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl hover:border-[var(--color-accent)] transition-colors text-left"
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.stage.color }} />
                <span className="flex-1 text-[11px] text-[var(--color-fg)] truncate">{d.title}</span>
                <span className={cn(
                  "text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0",
                  d.status === "won"  ? "bg-emerald-50 text-emerald-700" :
                  d.status === "lost" ? "bg-red-50 text-red-600" :
                  "bg-blue-50 text-blue-600",
                )}>{d.status}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Channel */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)] mb-2">Channel</p>
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl">
          <ChIco size={13} className={ch.color} />
          <span className="text-[12px] font-medium text-[var(--color-fg)]">{ch.label}</span>
        </div>
      </div>

      {/* Assignment */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)] mb-2">Assigned to</p>
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl">
          <div className="w-5 h-5 rounded-full bg-[var(--color-border)] flex items-center justify-center">
            <User size={10} className="text-[var(--color-fg-faint)]" />
          </div>
          <span className="text-[12px] text-[var(--color-fg-faint)]">
            {conv.assignedUserId ? "Assigned" : "Unassigned"}
          </span>
        </div>
      </div>

      {/* Timestamps */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)] mb-2">Timeline</p>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[var(--color-fg-faint)]">Created</span>
            <span className="text-[var(--color-fg-muted)] font-medium">{relTime(conv.createdAt)}</span>
          </div>
          {conv.lastMessageAt && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--color-fg-faint)]">Last message</span>
              <span className="text-[var(--color-fg-muted)] font-medium">{relTime(conv.lastMessageAt)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const [conversations,    setConversations]    = useState<ConvSummary[]>([]);
  const [loadingConvs,     setLoadingConvs]     = useState(true);
  const [selectedId,       setSelectedId]       = useState<string | null>(null);
  const [messages,         setMessages]         = useState<Message[]>([]);
  const [loadingMsgs,      setLoadingMsgs]      = useState(false);
  const [filter,           setFilter]           = useState<Filter>("all");
  const [search,           setSearch]           = useState("");
  const [debouncedSearch,  setDebouncedSearch]  = useState("");

  const [suggestedReplyText, setSuggestedReplyText] = useState<string | undefined>(undefined);

  const threadRef      = useRef<HTMLDivElement>(null);
  const searchTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollMsgsTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef         = useRef<EventSource | null>(null);
  const selectedIdRef  = useRef<string | null>(null);

  // Debounce search input
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  // ── Fetch conversations ────────────────────────────────────────────────────

  const fetchConversations = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoadingConvs(true);
    try {
      const params = new URLSearchParams();
      if (filter === "assigned")                                        params.set("assigned_to_me", "1");
      else if (["open", "closed", "snoozed"].includes(filter))         params.set("status",  filter);
      else if (["telegram", "email", "whatsapp"].includes(filter))     params.set("channel", filter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("limit", "40");

      const res  = await fetch(`/api/inbox?${params.toString()}`, { credentials: "include" });
      const data = await res.json() as { conversations: ConvSummary[] };
      if (res.ok) setConversations(data.conversations);
    } catch { /* silent */ } finally {
      setLoadingConvs(false);
    }
  }, [filter, debouncedSearch]);

  useEffect(() => { void fetchConversations(true); }, [fetchConversations]);

  // Poll conversations every 10s
  useEffect(() => {
    const t = setInterval(() => { void fetchConversations(false); }, 10_000);
    return () => clearInterval(t);
  }, [fetchConversations]);

  // ── Fetch messages ─────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async (convId: string, showSpinner = false) => {
    if (showSpinner) setLoadingMsgs(true);
    try {
      const res  = await fetch(`/api/conversations/${convId}/messages?limit=50`, { credentials: "include" });
      const data = await res.json() as { messages: Message[] };
      if (res.ok) setMessages(data.messages);
    } catch { /* silent */ } finally {
      setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    setSuggestedReplyText(undefined);
    void fetchMessages(selectedId, true);

    if (pollMsgsTimer.current) clearInterval(pollMsgsTimer.current);
    pollMsgsTimer.current = setInterval(() => {
      void fetchMessages(selectedId, false);
    }, 5_000);

    return () => { if (pollMsgsTimer.current) clearInterval(pollMsgsTimer.current); };
  }, [selectedId, fetchMessages]);

  // Keep selectedIdRef in sync for SSE handler closure
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Auto-scroll thread on new messages
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages.length]);

  // ── Email auto-sync when email filter is active ───────────────────────────

  useEffect(() => {
    if (filter !== "email" && filter !== "all") return;
    // Fire-and-forget: trigger a background sync when the email view opens.
    // Silently ignored if Gmail is not connected.
    void fetch("/api/integrations/email/sync", {
      method:      "POST",
      credentials: "include",
      headers:     { "Content-Type": "application/json" },
      body:        JSON.stringify({ maxResults: 20 }),
    }).then((res) => {
      if (res.ok) void fetchConversations(false);
    }).catch(() => { /* silent — Gmail may not be connected */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // ── Email client matching (server-side via /api/clients/match) ───────────
  // After conversations load, attempt to link unlinked email conversations
  // to CRM clients using the server-side matching API.
  // Runs silently — best-effort, no error surfaces to UI.

  useEffect(() => {
    if (conversations.length === 0) return;

    const unlinked = conversations.filter(
      (c) => c.channel === "email" && !c.clientId && c.metadata?.from,
    );
    if (unlinked.length === 0) return;

    for (const conv of unlinked) {
      const fromEmail = conv.metadata?.from ?? "";
      if (!fromEmail) continue;

      void fetch("/api/clients/match", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ email: fromEmail, name: conv.title, channel: "email" }),
      }).then(async (res) => {
        if (!res.ok) return;
        const data = await res.json() as { clientId?: string | null; confidence?: number };
        // Only auto-link at ≥75 confidence
        if (!data.clientId || (data.confidence ?? 0) < 75) return;

        return fetch(`/api/conversations/${conv.id}`, {
          method:      "PATCH",
          credentials: "include",
          headers:     { "Content-Type": "application/json" },
          body:        JSON.stringify({ client_id: data.clientId }),
        });
      }).then((patchRes) => {
        if (patchRes?.ok) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conv.id ? { ...c, clientId: (c.clientId ?? "") } : c,
            ),
          );
        }
      }).catch(() => { /* silent */ });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length]);

  // ── SSE: real-time personal Telegram push ──────────────────────────────────

  useEffect(() => {
    const es = new EventSource("/api/integrations/telegram-personal/stream", {
      withCredentials: true,
    });
    sseRef.current = es;

    es.addEventListener("personal_update", (e: MessageEvent) => {
      // Refresh conversation list without spinner
      void fetchConversations(false);

      // If the incoming message belongs to the currently open conversation,
      // also refresh the message thread.
      try {
        const payload = JSON.parse(e.data as string) as {
          dialog?: { peerId?: string | number };
        };
        const peerId = String(payload.dialog?.peerId ?? "");
        if (peerId && selectedIdRef.current) {
          // Find matching conversation by externalId (peerId)
          // We can't read setConversations here without stale closure, so
          // compare against the DOM — instead we just always refresh messages
          // when the thread is open and the update arrives.
          void fetchMessages(selectedIdRef.current, false);
        }
      } catch { /* malformed event — ignore */ }
    });

    es.onerror = () => {
      // SSE auto-reconnects natively; no action needed.
    };

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, [fetchConversations, fetchMessages]);

  // ── Optimistic message handling ────────────────────────────────────────────

  function handleSent(msg: Message) {
    setMessages((prev) => {
      if (msg.pending) return [...prev, msg];
      const idx = prev.findIndex((m) => m.id.startsWith("opt_") && m.content === msg.content && m.pending);
      if (idx >= 0) {
        const next = [...prev];
        next[idx]  = msg;
        return next;
      }
      return prev;
    });
    setConversations((prev) =>
      prev.map((c) =>
        c.id === selectedId
          ? { ...c, lastMessageText: msg.content, lastMessageAt: msg.createdAt }
          : c,
      ),
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  const selectedConv = conversations.find((c) => c.id === selectedId) ?? null;

  function buildThreadItems() {
    type Item = { type: "date"; label: string } | { type: "msg"; msg: Message };
    const items: Item[] = [];
    let lastDate = "";
    for (const msg of messages) {
      const d = msgDateLabel(msg.createdAt);
      if (d !== lastDate) {
        items.push({ type: "date", label: d });
        lastDate = d;
      }
      items.push({ type: "msg", msg });
    }
    return items;
  }

  const FILTERS: Array<{ key: Filter; label: string }> = [
    { key: "all",      label: "All"      },
    { key: "open",     label: "Open"     },
    { key: "assigned", label: "Mine"     },
    { key: "telegram", label: "Telegram" },
    { key: "email",    label: "Email"    },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <TopBar title="Inbox" subtitle="All conversations" />

      <div className="flex flex-1 min-h-0">

        {/* ── Left: conversation list ─────────────────────────────────── */}
        <div className="w-[272px] flex-shrink-0 border-r border-[var(--color-border)] flex flex-col min-h-0">

          {/* Filter tabs */}
          <div className="flex items-center gap-0.5 px-2 pt-2 pb-1 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors",
                  filter === f.key
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-fg-muted)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-fg)]",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="px-2 pb-1.5">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl">
              <Search  size={12} className="text-[var(--color-fg-faint)] flex-shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="flex-1 bg-transparent text-[12px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-faint)] outline-none"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-[var(--color-fg-faint)] hover:text-[var(--color-fg)]">
                  <XCircle size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Count + refresh */}
          <div className="flex items-center justify-between px-3 pb-1">
            <span className="text-[10px] text-[var(--color-fg-faint)]">
              {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => { void fetchConversations(true); }}
              className="text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] transition-colors"
              title="Refresh"
            >
              <RefreshCw size={11} />
            </button>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {loadingConvs ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={18} className="animate-spin text-[var(--color-fg-faint)]" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-14 px-4 text-center">
                <div className="w-10 h-10 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-border)] flex items-center justify-center">
                  <Inbox size={16} className="text-[var(--color-fg-faint)]" />
                </div>
                <p className="text-[12px] font-medium text-[var(--color-fg-faint)]">No conversations yet</p>
                <p className="text-[10px] text-[var(--color-fg-faint)]">
                  Messages will appear here once your Telegram bot or other channel receives a message.
                </p>
              </div>
            ) : (
              conversations.map((conv) => (
                <ConvRow
                  key={conv.id}
                  conv={conv}
                  selected={conv.id === selectedId}
                  onClick={() => { setSelectedId(conv.id); trackEvent("conversation_opened", { channel: conv.channel }); }}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Center: message thread ──────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {!selectedConv ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2.5">
                <div className="w-12 h-12 rounded-2xl bg-[var(--color-canvas)] border border-[var(--color-border)] flex items-center justify-center mx-auto">
                  <Inbox size={20} className="text-[var(--color-fg-faint)]" />
                </div>
                <p className="text-[13px] font-medium text-[var(--color-fg-muted)]">Select a conversation</p>
                <p className="text-[11px] text-[var(--color-fg-faint)]">
                  Choose from the left to view messages.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-canvas)]/50 flex-shrink-0">
                <div className="w-7 h-7 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                  {initials(selectedConv.title || "?")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[var(--color-fg)] truncate">
                    {selectedConv.title || "Unknown"}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <ChannelBadge channel={selectedConv.channel} />
                    <StatusBadge  status={selectedConv.status}  />
                  </div>
                </div>
                <ChevronDown size={14} className="text-[var(--color-fg-faint)] flex-shrink-0" />
              </div>

              {/* Messages */}
              <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
                {loadingMsgs ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={18} className="animate-spin text-[var(--color-fg-faint)]" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <p className="text-[12px] text-[var(--color-fg-faint)]">
                      No messages yet in this conversation.
                    </p>
                  </div>
                ) : (
                  buildThreadItems().map((item, idx) =>
                    item.type === "date" ? (
                      <div key={`date-${idx}`} className="flex items-center justify-center my-2">
                        <span className="text-[10px] text-[var(--color-fg-faint)] bg-[var(--color-canvas)] border border-[var(--color-border)] px-2.5 py-1 rounded-full">
                          {item.label}
                        </span>
                      </div>
                    ) : (
                      <MessageBubble key={item.msg.id} msg={item.msg} />
                    ),
                  )
                )}
              </div>

              {/* AI reply suggestions */}
              <AIReplySuggestionsBar
                conv={selectedConv}
                messages={messages}
                onUseSuggestion={(text) => setSuggestedReplyText(text)}
              />

              {/* Reply bar */}
              <ReplyBar
                convId={selectedId!}
                channel={selectedConv.channel}
                onSent={handleSent}
                externalText={suggestedReplyText}
                onExternalTextConsumed={() => setSuggestedReplyText(undefined)}
              />
            </>
          )}
        </div>

        {/* ── Right: metadata panel ────────────────────────────────────── */}
        {selectedConv && (
          <div className="w-[248px] flex-shrink-0 border-l border-[var(--color-border)] overflow-hidden">
            <ConvMetaPanel
              conv={selectedConv}
              onClientLinked={(clientId) => {
                setConversations((prev) =>
                  prev.map((c) => c.id === selectedConv.id ? { ...c, clientId } : c),
                );
              }}
            />
          </div>
        )}

      </div>
    </div>
  );
}
