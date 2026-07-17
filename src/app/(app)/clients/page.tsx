"use client";

/**
 * /clients — CRM Clients list (M11)
 *
 * Features: server-backed list, search, status filter, create/edit/delete,
 * pagination, navigation to /clients/[id] for full detail.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter }   from "next/navigation";
import { TopBar }      from "@/components/layout/top-bar";
import { cn }          from "@/lib/utils";
import {
  Search, Plus, Loader2, Users, X,
  ChevronLeft, ChevronRight, Mail, Phone, Building2,
  MoreHorizontal, Trash2, Pencil, Eye, AlertCircle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type ClientStatus = "lead" | "active" | "inactive" | "churned";

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
  contacts?:        { id: string; type: string; value: string; is_primary: number }[];
  tags?:            string[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ClientStatus, string> = {
  lead:     "bg-amber-50   text-amber-700   border-amber-200",
  active:   "bg-emerald-50 text-emerald-700  border-emerald-200",
  inactive: "bg-slate-100  text-slate-500    border-slate-200",
  churned:  "bg-red-50     text-red-600      border-red-200",
};

const STATUS_LABELS: Record<ClientStatus, string> = {
  lead:     "Lead",
  active:   "Active",
  inactive: "Inactive",
  churned:  "Churned",
};

const ALL_STATUSES: ClientStatus[] = ["lead", "active", "inactive", "churned"];

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30)  return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// ── Client Form Modal ──────────────────────────────────────────────────────────

function ClientFormModal({
  existing,
  onClose,
  onSaved,
}: {
  existing?: ApiClient;
  onClose:   () => void;
  onSaved:   (c: ApiClient) => void;
}) {
  const [name,     setName]     = useState(existing?.name     ?? "");
  const [company,  setCompany]  = useState(existing?.company  ?? "");
  const [email,    setEmail]    = useState(existing?.email    ?? "");
  const [phone,    setPhone]    = useState(existing?.phone    ?? "");
  const [position, setPosition] = useState(existing?.position ?? "");
  const [status,   setStatus]   = useState<ClientStatus>(existing?.status ?? "lead");
  const [notes,    setNotes]    = useState(existing?.notes    ?? "");
  const [tags,     setTags]     = useState((existing?.tags ?? []).join(", "));
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const isEdit = Boolean(existing);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true); setError(null);

    const payload = {
      name:     name.trim(),
      company:  company.trim()  || null,
      email:    email.trim()    || null,
      phone:    phone.trim()    || null,
      position: position.trim() || null,
      status,
      notes:    notes.trim()    || null,
      tags:     tags.split(",").map((t) => t.trim()).filter(Boolean),
    };

    try {
      const res  = await fetch(isEdit ? `/api/clients/${existing!.id}` : "/api/clients", {
        method:      isEdit ? "PATCH" : "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify(payload),
      });
      const data = await res.json() as { client?: ApiClient; error?: string };
      if (!res.ok) { setError(data.error ?? "Save failed"); return; }
      onSaved(data.client!);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-[14px] font-semibold text-[var(--color-fg)]">
            {isEdit ? "Edit Client" : "New Client"}
          </h2>
          <button onClick={onClose} className="text-[var(--color-fg-faint)] hover:text-[var(--color-fg)]">
            <X size={16} />
          </button>
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
                className="w-full px-3 py-2 text-[13px] bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg outline-none focus:border-[var(--color-accent)] text-[var(--color-fg)]"
                placeholder="Jane Smith" />
            </div>
            {[
              { label: "Company",  val: company,  set: setCompany,  ph: "Acme Corp" },
              { label: "Position", val: position, set: setPosition, ph: "CEO" },
              { label: "Email",    val: email,    set: setEmail,    ph: "jane@acme.com" },
              { label: "Phone",    val: phone,    set: setPhone,    ph: "+1 555 0100" },
            ].map(({ label, val, set, ph }) => (
              <div key={label}>
                <label className="block text-[11px] font-medium text-[var(--color-fg-muted)] mb-1">{label}</label>
                <input value={val} onChange={(e) => set(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg outline-none focus:border-[var(--color-accent)] text-[var(--color-fg)]"
                  placeholder={ph} />
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
              <label className="block text-[11px] font-medium text-[var(--color-fg-muted)] mb-1">Tags (comma-separated)</label>
              <input value={tags} onChange={(e) => setTags(e.target.value)}
                className="w-full px-3 py-2 text-[13px] bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg outline-none focus:border-[var(--color-accent)] text-[var(--color-fg)]"
                placeholder="vip, enterprise" />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-[var(--color-fg-muted)] mb-1">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                className="w-full px-3 py-2 text-[13px] bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg outline-none focus:border-[var(--color-accent)] text-[var(--color-fg)] resize-none"
                placeholder="Internal notes…" />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-[13px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-[13px] font-medium bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors flex items-center gap-2">
              {saving && <Loader2 size={13} className="animate-spin" />}
              {isEdit ? "Save Changes" : "Create Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Row context menu ───────────────────────────────────────────────────────────

function RowMenu({ onView, onEdit, onDelete }: {
  onView: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="p-1 rounded text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] transition-colors">
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg py-1 w-36">
          {[
            { icon: Eye,    label: "View",   action: onView,   cls: "text-[var(--color-fg)] hover:bg-[var(--color-canvas)]" },
            { icon: Pencil, label: "Edit",   action: onEdit,   cls: "text-[var(--color-fg)] hover:bg-[var(--color-canvas)]" },
          ].map(({ icon: Icon, label, action, cls }) => (
            <button key={label} onClick={() => { setOpen(false); action(); }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors ${cls}`}>
              <Icon size={12} /> {label}
            </button>
          ))}
          <div className="my-1 border-t border-[var(--color-border)]" />
          <button onClick={() => { setOpen(false); onDelete(); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50 transition-colors">
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export default function ClientsPage() {
  const router = useRouter();

  const [clients,      setClients]      = useState<ApiClient[]>([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [debouncedQ,   setDebouncedQ]   = useState("");
  const [statusFilter, setStatusFilter] = useState<ClientStatus | "">("");
  const [page,         setPage]         = useState(0);
  const [showCreate,   setShowCreate]   = useState(false);
  const [editTarget,   setEditTarget]   = useState<ApiClient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiClient | null>(null);
  const [deleting,     setDeleting]     = useState(false);
  const [toast,        setToast]        = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setDebouncedQ(search); setPage(0); }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (debouncedQ)   p.set("search", debouncedQ);
      if (statusFilter) p.set("status", statusFilter);
      const res  = await fetch(`/api/clients?${p.toString()}`, { credentials: "include" });
      const data = await res.json() as { clients?: ApiClient[]; total?: number };
      if (res.ok) { setClients(data.clients ?? []); setTotal(data.total ?? 0); }
    } catch { /* silent */ } finally { setLoading(false); }
  }, [page, debouncedQ, statusFilter]);

  useEffect(() => { void fetchClients(); }, [fetchClients]);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  function handleSaved(c: ApiClient) {
    setShowCreate(false); setEditTarget(null);
    void fetchClients();
    showToast(`Client "${c.name}" ${editTarget ? "updated" : "created"}`);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/clients/${deleteTarget.id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        setClients((prev) => prev.filter((c) => c.id !== deleteTarget.id));
        setTotal((n) => Math.max(0, n - 1));
        showToast(`Client "${deleteTarget.name}" deleted`);
      }
    } catch { /* silent */ } finally { setDeleting(false); setDeleteTarget(null); }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <TopBar title="Clients" subtitle={`${total} client${total !== 1 ? "s" : ""}`} />

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--color-border)] flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[180px] max-w-xs px-3 py-1.5 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl">
          <Search size={13} className="text-[var(--color-fg-faint)] flex-shrink-0" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients…"
            className="flex-1 bg-transparent text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-faint)] outline-none" />
          {search && <button onClick={() => setSearch("")} className="text-[var(--color-fg-faint)] hover:text-[var(--color-fg)]"><X size={12} /></button>}
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as ClientStatus | ""); setPage(0); }}
          className="px-3 py-1.5 text-[12px] bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl text-[var(--color-fg)] outline-none">
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <div className="flex-1" />
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[var(--color-accent)] text-white rounded-xl hover:bg-[var(--color-accent-hover)] transition-colors">
          <Plus size={13} /> New Client
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin text-[var(--color-fg-faint)]" /></div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[var(--color-canvas)] border border-[var(--color-border)] flex items-center justify-center">
              <Users size={20} className="text-[var(--color-fg-faint)]" />
            </div>
            <p className="text-[13px] font-medium text-[var(--color-fg-muted)]">No clients found</p>
            <p className="text-[11px] text-[var(--color-fg-faint)]">
              {debouncedQ || statusFilter ? "Try changing your search or filters." : "Create your first client to get started."}
            </p>
            {!debouncedQ && !statusFilter && (
              <button onClick={() => setShowCreate(true)}
                className="mt-1 flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium bg-[var(--color-accent)] text-white rounded-xl hover:bg-[var(--color-accent-hover)] transition-colors">
                <Plus size={13} /> New Client
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-canvas)]/50">
                {["#", "Name", "Company", "Contact", "Status", "Added", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 font-medium text-[var(--color-fg-faint)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map((c, i) => (
                <tr key={c.id} onClick={() => router.push(`/clients/${c.id}`)}
                  className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-canvas)]/60 cursor-pointer transition-colors">
                  <td className="px-4 py-3 text-[var(--color-fg-faint)]">{page * PAGE_SIZE + i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                        {initials(c.name)}
                      </div>
                      <div>
                        <p className="font-medium text-[var(--color-fg)]">{c.name}</p>
                        {c.position && <p className="text-[10px] text-[var(--color-fg-faint)]">{c.position}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-fg-muted)]">
                    {c.company
                      ? <div className="flex items-center gap-1.5"><Building2 size={11} className="text-[var(--color-fg-faint)]" />{c.company}</div>
                      : <span className="text-[var(--color-fg-faint)]">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      {c.email && <div className="flex items-center gap-1 text-[11px] text-[var(--color-fg-muted)]"><Mail size={10} className="text-[var(--color-fg-faint)]" /><span className="truncate max-w-[140px]">{c.email}</span></div>}
                      {c.phone && <div className="flex items-center gap-1 text-[11px] text-[var(--color-fg-muted)]"><Phone size={10} className="text-[var(--color-fg-faint)]" />{c.phone}</div>}
                      {!c.email && !c.phone && <span className="text-[var(--color-fg-faint)]">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full border", STATUS_COLORS[c.status])}>
                      {STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-fg-faint)]">{relTime(c.created_at)}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <RowMenu
                      onView={() => router.push(`/clients/${c.id}`)}
                      onEdit={() => setEditTarget(c)}
                      onDelete={() => setDeleteTarget(c)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border)] flex-shrink-0">
          <span className="text-[11px] text-[var(--color-fg-faint)]">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
              className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:bg-[var(--color-canvas)] disabled:opacity-30 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-[12px] text-[var(--color-fg-muted)] px-2">{page + 1} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:bg-[var(--color-canvas)] disabled:opacity-30 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreate && <ClientFormModal onClose={() => setShowCreate(false)} onSaved={handleSaved} />}
      {editTarget  && <ClientFormModal existing={editTarget} onClose={() => setEditTarget(null)} onSaved={handleSaved} />}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-xl w-full max-w-sm p-5">
            <h3 className="text-[14px] font-semibold text-[var(--color-fg)] mb-1">Delete Client?</h3>
            <p className="text-[12px] text-[var(--color-fg-muted)] mb-4">
              This will permanently delete <strong>{deleteTarget.name}</strong> and all their contacts and tags.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-[13px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors">Cancel</button>
              <button onClick={() => { void confirmDelete(); }} disabled={deleting}
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
