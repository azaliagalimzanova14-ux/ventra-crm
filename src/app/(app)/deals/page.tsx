"use client";

/**
 * /deals — Deals & Sales Pipeline (M13)
 *
 * Views: Kanban (default) | List
 * Features:
 *  - Stage-based Kanban columns with deal cards
 *  - List view with sortable table
 *  - Create / Edit / Delete deals
 *  - Move deal to a stage from Kanban card
 *  - AI buying-intent detection from conversation messages
 *  - 300ms debounced search
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Link                                          from "next/link";
import { TopBar }                                    from "@/components/layout/top-bar";
import { cn }                                        from "@/lib/utils";
import {
  Plus, X, TrendingUp, ChevronRight, Search,
  LayoutGrid, List, Pencil, Trash2, Loader2,
  AlertCircle, ChevronDown, User, Calendar,
  Sparkles, Check, ArrowRight,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DealStage {
  id:          string;
  name:        string;
  order_index: number;
  color:       string;
  is_won:      number;
  is_lost:     number;
  is_default:  number;
}

interface Deal {
  id:               string;
  title:            string;
  client_id:        string | null;
  client_name:      string | null;
  stage_id:         string;
  stage:            DealStage;
  value:            number;
  currency:         string;
  probability:      number;
  expected_close:   string | null;
  assigned_user_id: string | null;
  description:      string | null;
  status:           "open" | "won" | "lost";
  created_at:       string;
  updated_at:       string;
}

interface Client { id: string; name: string; company: string | null; }

type ViewMode = "kanban" | "list";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt$(n: number, currency = "USD") {
  if (n >= 1_000_000) return `${currency === "USD" ? "$" : ""}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${currency === "USD" ? "$" : ""}${(n / 1_000).toFixed(0)}K`;
  return `${currency === "USD" ? "$" : ""}${n.toLocaleString()}`;
}

function daysUntil(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

// ── Deal Form Modal ────────────────────────────────────────────────────────────

interface DealFormProps {
  deal?:     Deal;
  stages:    DealStage[];
  clients:   Client[];
  onSave:    (data: Partial<Deal>) => Promise<void>;
  onClose:   () => void;
  saving:    boolean;
}

function DealFormModal({ deal, stages, clients, onSave, onClose, saving }: DealFormProps) {
  const [title,       setTitle]       = useState(deal?.title            ?? "");
  const [clientId,    setClientId]    = useState(deal?.client_id        ?? "");
  const [stageId,     setStageId]     = useState(deal?.stage_id        ?? stages.find(s => s.is_default)?.id ?? stages[0]?.id ?? "");
  const [value,       setValue]       = useState(deal?.value            ?? 0);
  const [currency,    setCurrency]    = useState(deal?.currency         ?? "USD");
  const [probability, setProbability] = useState(deal?.probability      ?? 0);
  const [closeDate,   setCloseDate]   = useState(deal?.expected_close   ?? "");
  const [description, setDescription] = useState(deal?.description     ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      title:          title.trim(),
      client_id:      clientId || null,
      stage_id:       stageId,
      value,
      currency,
      probability,
      expected_close: closeDate || null,
      description:    description.trim() || null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-[var(--color-surface)] rounded-xl shadow-2xl w-full max-w-lg border border-[var(--color-border)]">
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
          <h2 className="font-semibold text-[var(--color-fg)]">
            {deal ? "Edit Deal" : "New Deal"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--color-canvas)] text-[var(--color-fg-faint)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-faint)] mb-1">Deal Title *</label>
            <input
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              placeholder="e.g. Enterprise License Renewal"
            />
          </div>

          {/* Client + Stage */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-fg-faint)] mb-1">Client</label>
              <select
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              >
                <option value="">No client</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-fg-faint)] mb-1">Stage</label>
              <select
                value={stageId}
                onChange={e => setStageId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              >
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* Value + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-fg-faint)] mb-1">Value</label>
              <input
                type="number"
                min={0}
                step={100}
                value={value}
                onChange={e => setValue(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-fg-faint)] mb-1">Currency</label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              >
                {["USD","EUR","GBP","AED","SAR","JPY","CAD","AUD"].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Probability + Close date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-fg-faint)] mb-1">Probability %</label>
              <input
                type="number"
                min={0}
                max={100}
                value={probability}
                onChange={e => setProbability(Math.min(100, Math.max(0, Number(e.target.value))))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-fg-faint)] mb-1">Expected Close</label>
              <input
                type="date"
                value={closeDate}
                onChange={e => setCloseDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-faint)] mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              placeholder="Optional notes..."
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-fg-muted)] hover:bg-[var(--color-canvas)]">
              Cancel
            </button>
            <button type="submit" disabled={saving || !title.trim()}
              className="flex-1 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {deal ? "Save Changes" : "Create Deal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Deal Card (Kanban) ─────────────────────────────────────────────────────────

interface DealCardProps {
  deal:     Deal;
  stages:   DealStage[];
  onEdit:   (d: Deal) => void;
  onDelete: (d: Deal) => void;
  onMove:   (dealId: string, stageId: string) => void;
}

function DealCard({ deal, stages, onEdit, onDelete, onMove }: DealCardProps) {
  const [moveOpen, setMoveOpen] = useState(false);
  const days = deal.expected_close ? daysUntil(deal.expected_close) : null;
  const overdue = days !== null && days < 0 && deal.status === "open";

  return (
    <div className={cn(
      "bg-[var(--color-surface)] rounded-lg border p-3 space-y-2 shadow-sm group hover:shadow-md transition-shadow",
      deal.status === "won"  ? "border-emerald-300" :
      deal.status === "lost" ? "border-red-300" :
      "border-[var(--color-border)]",
    )}>
      {/* Title + actions */}
      <div className="flex items-start justify-between gap-2">
        <Link href={`/deals/${deal.id}`} className="text-sm font-medium text-[var(--color-fg)] hover:text-[var(--color-accent)] line-clamp-2 leading-snug">
          {deal.title}
        </Link>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => onEdit(deal)} className="p-1 rounded hover:bg-[var(--color-canvas)] text-[var(--color-fg-faint)]">
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={() => onDelete(deal)} className="p-1 rounded hover:bg-red-50 text-[var(--color-fg-faint)] hover:text-red-600">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Client */}
      {deal.client_name && (
        <div className="flex items-center gap-1 text-xs text-[var(--color-fg-faint)]">
          <User className="w-3 h-3 shrink-0" />
          <span className="truncate">{deal.client_name}</span>
        </div>
      )}

      {/* Value row */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--color-fg)]">
          {fmt$(deal.value, deal.currency)}
        </span>
        <span className="text-xs text-[var(--color-fg-faint)]">{deal.probability}%</span>
      </div>

      {/* Close date */}
      {deal.expected_close && (
        <div className={cn("flex items-center gap-1 text-xs", overdue ? "text-red-600" : "text-[var(--color-fg-faint)]")}>
          <Calendar className="w-3 h-3 shrink-0" />
          <span>{overdue ? `${Math.abs(days!)}d overdue` : days === 0 ? "Due today" : `${days}d left`}</span>
        </div>
      )}

      {/* Move stage */}
      {deal.status === "open" && (
        <div className="relative">
          <button
            onClick={() => setMoveOpen(v => !v)}
            className="w-full flex items-center justify-center gap-1 py-1 text-xs text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] hover:bg-[var(--color-canvas)] rounded transition-colors"
          >
            <ArrowRight className="w-3 h-3" />
            Move stage
            <ChevronDown className="w-3 h-3" />
          </button>
          {moveOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg z-10 overflow-hidden">
              {stages.filter(s => s.id !== deal.stage_id).map(s => (
                <button
                  key={s.id}
                  onClick={() => { onMove(deal.id, s.id); setMoveOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-[var(--color-canvas)] text-[var(--color-fg)]"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  {s.name}
                  {(s.is_won || s.is_lost) && (
                    <span className={cn("ml-auto text-[10px] font-medium", s.is_won ? "text-emerald-600" : "text-red-500")}>
                      {s.is_won ? "Won" : "Lost"}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Status badge for closed */}
      {deal.status !== "open" && (
        <div className={cn(
          "flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 w-fit",
          deal.status === "won" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
        )}>
          {deal.status === "won" ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
          {deal.status === "won" ? "Won" : "Lost"}
        </div>
      )}
    </div>
  );
}

// ── AI Banner ─────────────────────────────────────────────────────────────────

interface AIBannerProps {
  title:       string;
  onConfirm:   () => void;
  onDismiss:   () => void;
}

function AIBanner({ title, onConfirm, onDismiss }: AIBannerProps) {
  return (
    <div className="mb-4 flex items-start gap-3 p-3 bg-violet-50 border border-violet-200 rounded-lg text-sm">
      <Sparkles className="w-4 h-4 text-violet-600 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-violet-900">Buying signal detected</p>
        <p className="text-violet-700 text-xs mt-0.5 truncate">Create a deal: <strong>{title}</strong>?</p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button onClick={onConfirm} className="px-2 py-1 text-xs bg-violet-600 text-white rounded-md hover:bg-violet-700">Create</button>
        <button onClick={onDismiss} className="px-2 py-1 text-xs border border-violet-200 text-violet-600 rounded-md hover:bg-violet-100">Dismiss</button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DealsPage() {
  const [view,       setView]       = useState<ViewMode>("kanban");
  const [deals,      setDeals]      = useState<Deal[]>([]);
  const [stages,     setStages]     = useState<DealStage[]>([]);
  const [clients,    setClients]    = useState<Client[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [searchQ,    setSearchQ]    = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "open" | "won" | "lost">("");

  // Modals
  const [formOpen,   setFormOpen]   = useState(false);
  const [editDeal,   setEditDeal]   = useState<Deal | null>(null);
  const [delTarget,  setDelTarget]  = useState<Deal | null>(null);
  const [saving,     setSaving]     = useState(false);

  // AI suggestion
  const [aiTitle,    setAiTitle]    = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load stages + clients once
  useEffect(() => {
    void Promise.all([
      fetch("/api/deal-stages", { credentials: "include" }).then(r => r.json()),
      fetch("/api/clients?limit=200", { credentials: "include" }).then(r => r.json()),
    ]).then(([stagesRes, clientsRes]: [{ stages?: DealStage[] }, { clients?: Client[] }]) => {
      if (stagesRes.stages) setStages(stagesRes.stages);
      if (clientsRes.clients) setClients(clientsRes.clients);
    }).catch(() => { /* silent — auth may not be ready yet */ });
  }, []);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (searchQ)       params.set("search", searchQ);
    if (statusFilter)  params.set("status", statusFilter);
    try {
      const res = await fetch(`/api/deals?${params}`, { credentials: "include" });
      const data = await res.json() as { deals?: Deal[] };
      setDeals(data.deals ?? []);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [searchQ, statusFilter]);

  useEffect(() => { void fetchDeals(); }, [fetchDeals]);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchQ(search), 300);
  }, [search]);

  // Create / edit
  async function handleSave(data: Partial<Deal>) {
    setSaving(true);
    try {
      if (editDeal) {
        const res = await fetch(`/api/deals/${editDeal.id}`, {
          method: "PATCH", credentials: "include",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
        });
        if (res.ok) {
          const { deal } = await res.json() as { deal: Deal };
          setDeals(prev => prev.map(d => d.id === deal.id ? deal : d));
          setFormOpen(false); setEditDeal(null);
        }
      } else {
        const res = await fetch("/api/deals", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
        });
        if (res.ok) {
          await fetchDeals();
          setFormOpen(false);
        }
      }
    } catch { /* silent */ } finally { setSaving(false); }
  }

  // Move stage
  async function handleMove(dealId: string, stageId: string) {
    try {
      const res = await fetch(`/api/deals/${dealId}/stage`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage_id: stageId }),
      });
      if (res.ok) {
        const { deal } = await res.json() as { deal: Deal };
        setDeals(prev => prev.map(d => d.id === deal.id ? deal : d));
      }
    } catch { /* silent */ }
  }

  // Delete
  async function handleDelete() {
    if (!delTarget) return;
    try {
      const res = await fetch(`/api/deals/${delTarget.id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        setDeals(prev => prev.filter(d => d.id !== delTarget.id));
        setDelTarget(null);
      }
    } catch { /* silent */ }
  }

  // Group deals by stage for Kanban
  const dealsByStage = new Map<string, Deal[]>();
  for (const s of stages) dealsByStage.set(s.id, []);
  for (const d of deals)  {
    const arr = dealsByStage.get(d.stage_id);
    if (arr) arr.push(d);
    else dealsByStage.set(d.stage_id, [d]);
  }

  const totalValue = deals.filter(d => d.status === "open").reduce((s, d) => s + d.value, 0);
  const currency   = deals[0]?.currency ?? "USD";

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Deals" />

      <div className="flex-1 overflow-auto p-6">
        {/* Summary pills */}
        <div className="flex gap-3 mb-5 flex-wrap">
          {[
            { label: "Open deals",      value: deals.filter(d => d.status === "open").length,  color: "text-[var(--color-accent)]" },
            { label: "Pipeline value",  value: fmt$(totalValue, currency),                      color: "text-emerald-600" },
            { label: "Won",             value: deals.filter(d => d.status === "won").length,   color: "text-emerald-600" },
            { label: "Lost",            value: deals.filter(d => d.status === "lost").length,  color: "text-red-500" },
          ].map(p => (
            <div key={p.label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-canvas)] border border-[var(--color-border)]">
              <span className="text-xs text-[var(--color-fg-faint)]">{p.label}</span>
              <span className={cn("text-sm font-semibold", p.color)}>{p.value}</span>
            </div>
          ))}
        </div>

        {/* AI banner */}
        {aiTitle && (
          <AIBanner
            title={aiTitle}
            onConfirm={() => { setAiTitle(null); setFormOpen(true); }}
            onDismiss={() => setAiTitle(null)}
          />
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-fg-faint)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search deals…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as "" | "open" | "won" | "lost")}
            className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>

          {/* View toggle */}
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
            {(["kanban", "list"] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={cn(
                  "p-2 text-sm flex items-center gap-1.5",
                  view === v
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-[var(--color-surface)] text-[var(--color-fg-faint)] hover:bg-[var(--color-canvas)]",
                )}>
                {v === "kanban" ? <LayoutGrid className="w-4 h-4" /> : <List className="w-4 h-4" />}
              </button>
            ))}
          </div>

          <button
            onClick={() => { setEditDeal(null); setFormOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90"
          >
            <Plus className="w-4 h-4" />
            New Deal
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--color-accent)]" />
          </div>
        )}

        {/* Empty */}
        {!loading && deals.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <TrendingUp className="w-10 h-10 text-[var(--color-fg-faint)] mb-3" />
            <p className="font-medium text-[var(--color-fg)]">No deals yet</p>
            <p className="text-sm text-[var(--color-fg-faint)] mt-1 mb-4">Create your first deal to start tracking your pipeline.</p>
            <button onClick={() => setFormOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-sm">
              <Plus className="w-4 h-4" /> New Deal
            </button>
          </div>
        )}

        {/* ── Kanban view ── */}
        {!loading && deals.length > 0 && view === "kanban" && (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {stages.map(stage => {
              const stageDeals = dealsByStage.get(stage.id) ?? [];
              const stageValue = stageDeals.filter(d => d.status === "open").reduce((s, d) => s + d.value, 0);
              return (
                <div key={stage.id} className="flex-shrink-0 w-64">
                  {/* Column header */}
                  <div className={cn(
                    "flex items-center justify-between mb-3 pb-2 border-b-2",
                  )} style={{ borderColor: stage.color }}>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="text-sm font-semibold text-[var(--color-fg)]">{stage.name}</span>
                      <span className="text-xs bg-[var(--color-canvas)] text-[var(--color-fg-faint)] rounded-full px-1.5 py-0.5">
                        {stageDeals.length}
                      </span>
                    </div>
                    {stageValue > 0 && (
                      <span className="text-xs font-medium text-[var(--color-fg-faint)]">{fmt$(stageValue, currency)}</span>
                    )}
                  </div>

                  {/* Cards */}
                  <div className="space-y-2">
                    {stageDeals.map(deal => (
                      <DealCard
                        key={deal.id}
                        deal={deal}
                        stages={stages}
                        onEdit={d => { setEditDeal(d); setFormOpen(true); }}
                        onDelete={setDelTarget}
                        onMove={handleMove}
                      />
                    ))}
                  </div>

                  {/* Add to this stage */}
                  <button
                    onClick={() => {
                      setEditDeal(null);
                      setFormOpen(true);
                    }}
                    className="mt-2 w-full py-2 text-xs text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] hover:bg-[var(--color-canvas)] rounded-lg flex items-center justify-center gap-1 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Add deal
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── List view ── */}
        {!loading && deals.length > 0 && view === "list" && (
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-canvas)]">
                  {["Deal", "Client", "Stage", "Value", "Probability", "Close Date", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[var(--color-fg-faint)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {deals.map(deal => {
                  const days = deal.expected_close ? daysUntil(deal.expected_close) : null;
                  const overdue = days !== null && days < 0 && deal.status === "open";
                  return (
                    <tr key={deal.id} className="hover:bg-[var(--color-canvas)] group">
                      <td className="px-4 py-3">
                        <Link href={`/deals/${deal.id}`} className="font-medium text-[var(--color-fg)] hover:text-[var(--color-accent)]">
                          {deal.title}
                        </Link>
                        {deal.status !== "open" && (
                          <span className={cn(
                            "ml-2 text-[10px] font-medium rounded-full px-1.5 py-0.5",
                            deal.status === "won" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
                          )}>{deal.status}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-fg-faint)]">{deal.client_name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: deal.stage.color }} />
                          <span className="text-[var(--color-fg-muted)]">{deal.stage.name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--color-fg)]">{fmt$(deal.value, deal.currency)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-[var(--color-canvas)] rounded-full overflow-hidden">
                            <div className="h-full bg-[var(--color-accent)] rounded-full" style={{ width: `${deal.probability}%` }} />
                          </div>
                          <span className="text-xs text-[var(--color-fg-faint)]">{deal.probability}%</span>
                        </div>
                      </td>
                      <td className={cn("px-4 py-3 text-xs", overdue ? "text-red-600 font-medium" : "text-[var(--color-fg-faint)]")}>
                        {deal.expected_close
                          ? overdue ? `${Math.abs(days!)}d overdue` : deal.expected_close
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditDeal(deal); setFormOpen(true); }}
                            className="p-1 rounded hover:bg-[var(--color-canvas)] text-[var(--color-fg-faint)]">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDelTarget(deal)}
                            className="p-1 rounded hover:bg-red-50 text-[var(--color-fg-faint)] hover:text-red-600">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <Link href={`/deals/${deal.id}`}
                            className="p-1 rounded hover:bg-[var(--color-canvas)] text-[var(--color-fg-faint)]">
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {formOpen && stages.length > 0 && (
        <DealFormModal
          deal={editDeal ?? undefined}
          stages={stages}
          clients={clients}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditDeal(null); }}
          saving={saving}
        />
      )}

      {delTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[var(--color-surface)] rounded-xl shadow-2xl w-full max-w-sm border border-[var(--color-border)] p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-[var(--color-fg)]">Delete deal?</p>
                <p className="text-sm text-[var(--color-fg-faint)] mt-1">
                  &ldquo;{delTarget.title}&rdquo; will be permanently deleted.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDelTarget(null)} className="flex-1 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-fg-muted)] hover:bg-[var(--color-canvas)]">Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
