"use client";

/**
 * /clients/[id] — Client Detail Page (M11)
 *
 * Shows:
 *  - Profile card (name, company, position, status, notes)
 *  - Contact details (email, phone, plus client_contacts)
 *  - Tags
 *  - Linked conversations (Telegram / Email)
 *  - Activity timeline for this client
 *  - Edit button → opens ClientFormModal
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams }             from "next/navigation";
import { TopBar }                           from "@/components/layout/top-bar";
import { cn }                               from "@/lib/utils";
import {
  Loader2, Pencil, Trash2, Mail, Phone,
  MessageCircle, Send, Tag, AlertCircle,
  X, ExternalLink, CheckCircle2, Circle, Clock,
  Plus, Sparkles, RefreshCw,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type ClientStatus  = "lead" | "active" | "inactive" | "churned";
type ConvChannel   = "telegram" | "email" | "whatsapp";
type ConvStatus    = "open" | "closed" | "snoozed";

interface Contact {
  id:        string;
  type:      string;
  value:     string;
  is_primary: number;
}

interface ApiClient {
  id:               string;
  name:             string;
  company:          string | null;
  email:            string | null;
  phone:            string | null;
  position:         string | null;
  source:           string | null;
  status:           ClientStatus;
  assigned_user_id: string | null;
  notes:            string | null;
  created_at:       string;
  updated_at:       string;
  contacts:         Contact[];
  tags:             string[];
}

interface Conversation {
  id:             string;
  channel:        ConvChannel;
  title:          string;
  status:         ConvStatus;
  lastMessageAt:  string | null;
  lastMessageText: string | null;
  createdAt:      string;
}

interface ClientTask {
  id:          string;
  title:       string;
  status:      "todo" | "in_progress" | "done" | "cancelled";
  priority:    "low" | "medium" | "high" | "urgent";
  due_date:    string | null;
  completed_at: string | null;
}

interface ClientDeal {
  id:           string;
  title:        string;
  status:       "open" | "won" | "lost";
  value:        number;
  currency:     string;
  probability:  number;
  stage:        { name: string; color: string; is_won: number; is_lost: number };
  expected_close: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ClientStatus, string> = {
  lead:     "bg-amber-50   text-amber-700   border-amber-200",
  active:   "bg-emerald-50 text-emerald-700  border-emerald-200",
  inactive: "bg-slate-100  text-slate-500    border-slate-200",
  churned:  "bg-red-50     text-red-600      border-red-200",
};

const STATUS_LABELS: Record<ClientStatus, string> = {
  lead: "Lead", active: "Active", inactive: "Inactive", churned: "Churned",
};

const ALL_STATUSES: ClientStatus[] = ["lead", "active", "inactive", "churned"];

const CHANNEL_COLORS: Record<ConvChannel, string> = {
  telegram: "text-[#0088cc]  bg-blue-50",
  email:    "text-indigo-600  bg-indigo-50",
  whatsapp: "text-[#25d366]  bg-green-50",
};

const CHANNEL_ICONS: Record<ConvChannel, React.ElementType> = {
  telegram: Send,
  email:    Mail,
  whatsapp: MessageCircle,
};

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return "just now";
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Edit Modal ─────────────────────────────────────────────────────────────────

function EditModal({ client, onClose, onSaved }: {
  client:  ApiClient;
  onClose: () => void;
  onSaved: (c: ApiClient) => void;
}) {
  const [name,     setName]     = useState(client.name     ?? "");
  const [company,  setCompany]  = useState(client.company  ?? "");
  const [email,    setEmail]    = useState(client.email    ?? "");
  const [phone,    setPhone]    = useState(client.phone    ?? "");
  const [position, setPosition] = useState(client.position ?? "");
  const [status,   setStatus]   = useState<ClientStatus>(client.status);
  const [notes,    setNotes]    = useState(client.notes    ?? "");
  const [tags,     setTags]     = useState((client.tags ?? []).join(", "));
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true); setError(null);
    try {
      const res  = await fetch(`/api/clients/${client.id}`, {
        method:      "PATCH",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({
          name: name.trim(), company: company || null, email: email || null,
          phone: phone || null, position: position || null, status, notes: notes || null,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      const data = await res.json() as { client?: ApiClient; error?: string };
      if (!res.ok) { setError(data.error ?? "Save failed"); return; }
      onSaved(data.client!);
    } catch { setError("Network error"); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-[14px] font-semibold text-[var(--color-fg)]">Edit Client</h2>
          <button onClick={onClose} className="text-[var(--color-fg-faint)] hover:text-[var(--color-fg)]"><X size={16} /></button>
        </div>
        <form onSubmit={(e) => { void submit(e); }} className="p-5 space-y-3">
          {error && (
            <div className="flex items-center gap-2 text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={13} /> {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-[var(--color-fg-muted)] mb-1">Full Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required
                className="w-full px-3 py-2 text-[13px] bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg outline-none focus:border-[var(--color-accent)] text-[var(--color-fg)]" />
            </div>
            {[
              { label: "Company",  val: company,  set: setCompany,  ph: "Acme Corp" },
              { label: "Position", val: position, set: setPosition, ph: "CEO" },
              { label: "Email",    val: email,    set: setEmail,    ph: "jane@acme.com" },
              { label: "Phone",    val: phone,    set: setPhone,    ph: "+1 555 0100" },
            ].map(({ label, val, set, ph }) => (
              <div key={label}>
                <label className="block text-[11px] font-medium text-[var(--color-fg-muted)] mb-1">{label}</label>
                <input value={val} onChange={(e) => set(e.target.value)} placeholder={ph}
                  className="w-full px-3 py-2 text-[13px] bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg outline-none focus:border-[var(--color-accent)] text-[var(--color-fg)]" />
              </div>
            ))}
            <div>
              <label className="block text-[11px] font-medium text-[var(--color-fg-muted)] mb-1">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as ClientStatus)}
                className="w-full px-3 py-2 text-[13px] bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg outline-none focus:border-[var(--color-accent)] text-[var(--color-fg)]">
                {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--color-fg-muted)] mb-1">Tags</label>
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="vip, enterprise"
                className="w-full px-3 py-2 text-[13px] bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg outline-none focus:border-[var(--color-accent)] text-[var(--color-fg)]" />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-[var(--color-fg-muted)] mb-1">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                className="w-full px-3 py-2 text-[13px] bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg outline-none focus:border-[var(--color-accent)] text-[var(--color-fg)] resize-none" />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-[13px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-[13px] font-medium bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors flex items-center gap-2">
              {saving && <Loader2 size={13} className="animate-spin" />} Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ClientDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id     = params.id;

  const [client,        setClient]        = useState<ApiClient | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [clientTasks,   setClientTasks]   = useState<ClientTask[]>([]);
  const [clientDeals,   setClientDeals]   = useState<ClientDeal[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [showEdit,      setShowEdit]      = useState(false);
  const [showDelete,    setShowDelete]    = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [toast,         setToast]         = useState<string | null>(null);

  // AI summary state
  const [aiSummary,        setAiSummary]        = useState<{
    summary: string;
    relationship: string;
    keyTopics: string[];
    nextAction: string;
    provider: string;
  } | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  async function fetchAiSummary(c: ApiClient, tasks: ClientTask[], deals: ClientDeal[]) {
    setAiSummaryLoading(true);
    try {
      const daysSince = c.updated_at
        ? Math.floor((Date.now() - new Date(c.updated_at).getTime()) / 86_400_000)
        : 0;
      const res = await fetch("/api/ai/client-summary", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({
          clientId:         c.id,
          clientName:       c.name,
          company:          c.company,
          dealCount:        deals.filter((d) => d.status === "open").length,
          taskCount:        tasks.filter((t) => t.status !== "done" && t.status !== "cancelled").length,
          daysSinceContact: daysSince,
        }),
      });
      if (res.ok) {
        const data = await res.json() as {
          summary?: {
            summary: string;
            relationship: string;
            keyTopics: string[];
            nextAction: string;
            provider: string;
          }
        };
        setAiSummary(data.summary ?? null);
      }
    } catch { /* silent */ } finally { setAiSummaryLoading(false); }
  }

  const fetchClient = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/clients/${id}`, { credentials: "include" });
      if (res.status === 404) { router.replace("/clients"); return; }
      const data = await res.json() as { client?: ApiClient; conversations?: Conversation[] };
      if (res.ok && data.client) {
        setClient(data.client);
        setConversations(data.conversations ?? []);
        // Fetch tasks and deals for this client
        const [tRes, dRes] = await Promise.all([
          fetch(`/api/tasks?client_id=${id}&limit=100`, { credentials: "include" }),
          fetch(`/api/deals?client_id=${id}&limit=50`,  { credentials: "include" }),
        ]);
        const tData = await tRes.json() as { tasks?: ClientTask[] };
        const dData = await dRes.json() as { deals?: ClientDeal[] };
        const tasks = tData.tasks ?? [];
        const deals = dData.deals ?? [];
        setClientTasks(tasks);
        setClientDeals(deals);
        // Fire AI summary in background
        void fetchAiSummary(data.client, tasks, deals);
      }
    } catch { /* silent */ } finally { setLoading(false); }
    }, [id, router]);

  useEffect(() => { void fetchClient(); }, [fetchClient]);

  async function handleDelete() {
    if (!client) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { router.replace("/clients"); }
    } catch { /* silent */ } finally { setDeleting(false); }
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1">
        <TopBar title="Client" subtitle="Loading…" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[var(--color-fg-faint)]" />
        </div>
      </div>
    );
  }

  if (!client) return null;

  const allContacts: Contact[] = [
    ...(client.email ? [{ id: "email", type: "email", value: client.email, is_primary: 1 }] : []),
    ...(client.phone ? [{ id: "phone", type: "phone", value: client.phone, is_primary: 1 }] : []),
    ...client.contacts.filter((c) => c.type !== "email" || c.value !== client.email).filter((c) => c.type !== "phone" || c.value !== client.phone),
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <TopBar
        title={client.name}
        subtitle={[client.company, client.position].filter(Boolean).join(" · ") || "Client"}
      />

      <div className="flex-1 overflow-y-auto px-5 py-5 max-w-4xl mx-auto w-full">
        {/* Header card */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 mb-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[var(--color-accent)] flex items-center justify-center text-[18px] font-bold text-white flex-shrink-0">
              {initials(client.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <h1 className="text-[18px] font-bold text-[var(--color-fg)] leading-tight">{client.name}</h1>
                  {(client.company || client.position) && (
                    <p className="text-[13px] text-[var(--color-fg-muted)] mt-0.5">
                      {[client.position, client.company].filter(Boolean).join(" at ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={cn("inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-full border", STATUS_COLORS[client.status])}>
                    {STATUS_LABELS[client.status]}
                  </span>
                  <button onClick={() => setShowEdit(true)}
                    className="p-2 rounded-lg text-[var(--color-fg-muted)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-fg)] transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setShowDelete(true)}
                    className="p-2 rounded-lg text-[var(--color-fg-muted)] hover:bg-red-50 hover:text-red-600 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {client.notes && (
                <p className="text-[12px] text-[var(--color-fg-muted)] mt-2 leading-relaxed">{client.notes}</p>
              )}
              <div className="flex items-center gap-2 mt-2 text-[11px] text-[var(--color-fg-faint)]">
                <span>Added {relTime(client.created_at)}</span>
                {client.source && <><span>·</span><span className="capitalize">{client.source}</span></>}
              </div>
            </div>
          </div>
        </div>

        {/* AI Summary card */}
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles size={13} className="text-violet-600" />
              <p className="text-[11px] font-bold uppercase tracking-wider text-violet-700">AI Relationship Summary</p>
            </div>
            <button
              onClick={() => void fetchAiSummary(client, clientTasks, clientDeals)}
              disabled={aiSummaryLoading}
              className="flex items-center gap-1 text-[10px] text-violet-600 hover:opacity-70 transition-opacity disabled:opacity-40"
            >
              <RefreshCw size={10} className={aiSummaryLoading ? "animate-spin" : ""} />
              {aiSummaryLoading ? "Analysing…" : "Refresh"}
            </button>
          </div>
          {aiSummaryLoading && !aiSummary && (
            <div className="flex items-center gap-2 text-[12px] text-violet-600">
              <Loader2 size={12} className="animate-spin" /> Generating summary…
            </div>
          )}
          {aiSummary && (
            <div className="space-y-2">
              <p className="text-[12px] text-[var(--color-fg)] leading-relaxed">{aiSummary.summary}</p>
              {aiSummary.keyTopics.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {aiSummary.keyTopics.map((t) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full border border-violet-200">{t}</span>
                  ))}
                </div>
              )}
              {aiSummary.nextAction && (
                <div className="flex items-start gap-1.5 mt-1">
                  <span className="text-[10px] font-bold text-violet-700 flex-shrink-0 mt-0.5">Next:</span>
                  <p className="text-[11px] text-violet-800 leading-snug">{aiSummary.nextAction}</p>
                </div>
              )}
            </div>
          )}
          {!aiSummaryLoading && !aiSummary && (
            <p className="text-[12px] text-violet-500 italic">Click Refresh to generate an AI summary for this client.</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Contact details */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)] mb-3">Contact Details</p>
            {allContacts.length === 0 ? (
              <p className="text-[12px] text-[var(--color-fg-faint)]">No contact info added.</p>
            ) : (
              <div className="space-y-2">
                {allContacts.map((c) => {
                  const isEmail = c.type === "email";
                  const isPhone = c.type === "phone";
                  return (
                    <div key={c.id} className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-[var(--color-canvas)] flex items-center justify-center flex-shrink-0">
                        {isEmail ? <Mail size={11} className="text-[var(--color-fg-faint)]" />
                          : isPhone ? <Phone size={11} className="text-[var(--color-fg-faint)]" />
                          : <MessageCircle size={11} className="text-[var(--color-fg-faint)]" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-[var(--color-fg-faint)] capitalize">{c.type}</p>
                        <p className="text-[12px] text-[var(--color-fg)] truncate">{c.value}</p>
                      </div>
                      {isEmail && (
                        <a href={`mailto:${c.value}`} className="text-[var(--color-accent)] hover:underline" onClick={(e) => e.stopPropagation()}>
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tags */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)] mb-3">Tags</p>
            {client.tags.length === 0 ? (
              <p className="text-[12px] text-[var(--color-fg-faint)]">No tags added.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {client.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-[var(--color-canvas)] border border-[var(--color-border)] text-[var(--color-fg-muted)] rounded-full">
                    <Tag size={9} /> {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tasks */}
        {(() => {
          const today    = new Date().toISOString().slice(0, 10);
          const active   = clientTasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
          const overdue  = active.filter((t) => t.due_date && t.due_date < today);
          const upcoming = active.filter((t) => !t.due_date || t.due_date >= today);
          const done     = clientTasks.filter((t) => t.status === "done");

          const PRIO_BADGE: Record<string, string> = {
            urgent: "bg-red-50 text-red-700 border-red-200",
            high:   "bg-amber-50 text-amber-700 border-amber-200",
            medium: "bg-blue-50 text-blue-700 border-blue-200",
            low:    "bg-gray-100 text-gray-500 border-gray-200",
          };

          function TaskLine({ t }: { t: ClientTask }) {
            const StatusIcon = t.status === "done" ? CheckCircle2 : t.status === "in_progress" ? Clock : Circle;
            const statusCls  = t.status === "done" ? "text-emerald-500" : t.status === "in_progress" ? "text-[var(--color-accent)]" : "text-[var(--color-fg-faint)]";
            return (
              <button
                onClick={() => router.push(`/tasks?open=${t.id}`)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[var(--color-canvas)] transition-colors text-left group"
              >
                <StatusIcon size={14} className={statusCls} />
                <span className={cn("flex-1 text-[12px] truncate", t.status === "done" ? "line-through text-[var(--color-fg-faint)]" : "text-[var(--color-fg)]")}>{t.title}</span>
                {t.priority && (
                  <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0", PRIO_BADGE[t.priority])}>{t.priority}</span>
                )}
                {t.due_date && (
                  <span className={cn("text-[10px] flex-shrink-0", t.due_date < today && t.status !== "done" ? "text-red-500 font-medium" : "text-[var(--color-fg-faint)]")}>
                    {new Date(t.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                )}
              </button>
            );
          }

          return (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)]">
                  Tasks ({clientTasks.length})
                </p>
                <button
                  onClick={() => router.push(`/tasks?new=1&client_id=${id}`)}
                  className="flex items-center gap-1 text-[11px] text-[var(--color-accent)] hover:underline"
                >
                  <Plus size={11} /> Add task
                </button>
              </div>

              {clientTasks.length === 0 ? (
                <p className="text-[12px] text-[var(--color-fg-faint)]">No tasks linked to this client yet.</p>
              ) : (
                <div className="space-y-1">
                  {overdue.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider px-3 mb-0.5">Overdue</p>
                      {overdue.map((t) => <TaskLine key={t.id} t={t} />)}
                    </div>
                  )}
                  {upcoming.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider px-3 mb-0.5 mt-1">Active</p>
                      {upcoming.map((t) => <TaskLine key={t.id} t={t} />)}
                    </div>
                  )}
                  {done.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider px-3 mb-0.5 mt-1">Completed ({done.length})</p>
                      {done.slice(0, 3).map((t) => <TaskLine key={t.id} t={t} />)}
                      {done.length > 3 && (
                        <p className="text-[11px] text-[var(--color-fg-faint)] px-3">+{done.length - 3} more completed</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Deals */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)]">
              Deals ({clientDeals.length})
            </p>
            <button
              onClick={() => router.push("/deals")}
              className="text-[11px] text-[var(--color-accent)] hover:underline">
              View pipeline
            </button>
          </div>
          {clientDeals.length === 0 ? (
            <p className="text-[12px] text-[var(--color-fg-faint)]">No deals linked to this client yet.</p>
          ) : (
            <div className="space-y-2">
              {clientDeals.map((deal) => (
                <button
                  key={deal.id}
                  onClick={() => router.push(`/deals/${deal.id}`)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl hover:border-[var(--color-accent)] transition-colors text-left"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: deal.stage.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-[var(--color-fg)] truncate">{deal.title}</p>
                    <p className="text-[11px] text-[var(--color-fg-faint)]">{deal.stage.name}</p>
                  </div>
                  <div className="flex-shrink-0 flex flex-col items-end gap-1">
                    <span className="text-[12px] font-semibold text-[var(--color-fg)]">
                      {deal.currency === "USD" ? "$" : ""}{deal.value >= 1000 ? `${(deal.value / 1000).toFixed(0)}K` : deal.value}
                    </span>
                    <span className={cn(
                      "text-[9px] font-semibold px-1.5 py-0.5 rounded-full",
                      deal.status === "won"  ? "bg-emerald-50 text-emerald-700" :
                      deal.status === "lost" ? "bg-red-50 text-red-600" :
                      "bg-blue-50 text-blue-600",
                    )}>
                      {deal.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Conversations */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-faint)]">
              Conversations ({conversations.length})
            </p>
            <button onClick={() => router.push("/inbox")}
              className="text-[11px] text-[var(--color-accent)] hover:underline">
              Open inbox
            </button>
          </div>
          {conversations.length === 0 ? (
            <p className="text-[12px] text-[var(--color-fg-faint)]">No conversations linked to this client yet.</p>
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => {
                const ChIcon = CHANNEL_ICONS[conv.channel];
                const chCls  = CHANNEL_COLORS[conv.channel];
                return (
                  <button
                    key={conv.id}
                    onClick={() => router.push(`/inbox?conv=${conv.id}`)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl hover:border-[var(--color-accent)] transition-colors text-left"
                  >
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0", chCls.split(" ")[1])}>
                      <ChIcon size={13} className={chCls.split(" ")[0]} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-[var(--color-fg)] truncate">{conv.title}</p>
                      {conv.lastMessageText && (
                        <p className="text-[11px] text-[var(--color-fg-faint)] truncate">{conv.lastMessageText}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0 flex flex-col items-end gap-1">
                      <span className="text-[10px] text-[var(--color-fg-faint)]">{relTime(conv.lastMessageAt)}</span>
                      <span className={cn(
                        "text-[9px] font-semibold px-1.5 py-0.5 rounded-full",
                        conv.status === "open"    && "bg-emerald-50 text-emerald-700",
                        conv.status === "closed"  && "bg-slate-100  text-slate-500",
                        conv.status === "snoozed" && "bg-amber-50   text-amber-700",
                      )}>
                        {conv.status}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {showEdit && (
        <EditModal
          client={client}
          onClose={() => setShowEdit(false)}
          onSaved={(c) => { setClient(c); setShowEdit(false); showToast("Client updated"); }}
        />
      )}

      {/* Delete confirm */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-xl w-full max-w-sm p-5">
            <h3 className="text-[14px] font-semibold text-[var(--color-fg)] mb-1">Delete Client?</h3>
            <p className="text-[12px] text-[var(--color-fg-muted)] mb-4">
              This will permanently delete <strong>{client.name}</strong>.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShowDelete(false)} className="px-4 py-2 text-[13px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors">Cancel</button>
              <button onClick={() => { void handleDelete(); }} disabled={deleting}
                className="px-4 py-2 text-[13px] font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center gap-2">
                {deleting && <Loader2 size={13} className="animate-spin" />} Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-[var(--color-fg)] text-[var(--color-canvas)] text-[12px] font-medium px-4 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
