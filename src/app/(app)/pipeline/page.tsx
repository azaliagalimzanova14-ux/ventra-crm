"use client";

import { useState, useEffect, useRef } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { useLanguage } from "@/context/language-context";
import { useTheme } from "@/context/theme-context";
import { getDeals, saveDeals } from "@/lib/storage";
import type { Deal, DealStage } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Plus, X, TrendingUp, DollarSign, Users, GripVertical,
  ChevronRight, Pencil, Trash2, Check,
} from "lucide-react";

// ─── Stage config ─────────────────────────────────────────────────────────────

const STAGES: DealStage[] = [
  "lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost",
];

const STAGE_META: Record<DealStage, { headerBg: string; dot: string; valueBg: string; valueText: string; dropBorder: string }> = {
  lead:        { headerBg: "bg-gray-50",    dot: "bg-gray-400",    valueBg: "bg-gray-50",    valueText: "text-gray-600",    dropBorder: "border-gray-300" },
  qualified:   { headerBg: "bg-blue-50",   dot: "bg-blue-400",    valueBg: "bg-blue-50",   valueText: "text-blue-700",   dropBorder: "border-blue-300" },
  proposal:    { headerBg: "bg-violet-50", dot: "bg-violet-400",  valueBg: "bg-violet-50", valueText: "text-violet-700", dropBorder: "border-violet-300" },
  negotiation: { headerBg: "bg-amber-50",  dot: "bg-amber-400",   valueBg: "bg-amber-50",  valueText: "text-amber-700",  dropBorder: "border-amber-300" },
  closed_won:  { headerBg: "bg-emerald-50",dot: "bg-emerald-400", valueBg: "bg-emerald-50",valueText: "text-emerald-700",dropBorder: "border-emerald-300" },
  closed_lost: { headerBg: "bg-red-50",    dot: "bg-red-400",     valueBg: "bg-red-50",    valueText: "text-red-600",    dropBorder: "border-red-300" },
};

// ─── Deal modal ───────────────────────────────────────────────────────────────

interface DealFormState {
  title: string; clientName: string; clientAvatar: string;
  value: string; stage: DealStage; probability: string;
  expectedClose: string; owner: string;
}

const emptyForm = (stage: DealStage = "lead"): DealFormState => ({
  title: "", clientName: "", clientAvatar: "",
  value: "", stage, probability: "50",
  expectedClose: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
  owner: "",
});

function useStageLabels() {
  const { t } = useLanguage();
  return {
    lead: t("stage_lead"), qualified: t("stage_qualified"), proposal: t("stage_proposal"),
    negotiation: t("stage_negotiation"), closed_won: t("stage_closed_won"), closed_lost: t("stage_closed_lost"),
  };
}

function DealModal({ deal, defaultStage, onSave, onDelete, onClose }: {
  deal?: Deal; defaultStage?: DealStage;
  onSave: (d: Omit<Deal, "id">) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const stageLabels = useStageLabels();
  const [form, setForm] = useState<DealFormState>(
    deal
      ? { title: deal.title, clientName: deal.clientName, clientAvatar: deal.clientAvatar,
          value: String(deal.value), stage: deal.stage, probability: String(deal.probability),
          expectedClose: deal.expectedClose, owner: deal.owner }
      : emptyForm(defaultStage)
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isEdit = Boolean(deal);

  function set(k: keyof DealFormState, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.clientName.trim()) return;
    const initials = form.clientAvatar || form.clientName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    onSave({
      title: form.title.trim(), clientName: form.clientName.trim(), clientAvatar: initials,
      value: Number(form.value) || 0, stage: form.stage,
      probability: Math.min(100, Math.max(0, Number(form.probability) || 50)),
      expectedClose: form.expectedClose, owner: form.owner.trim(),
    });
  }

  const inputClass = "w-full h-9 px-3 bg-[var(--color-surface)] border border-[var(--color-border)] focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent rounded-lg text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-placeholder)] outline-none transition-shadow";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl shadow-black/10 animate-in slide-in-from-bottom-4 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-[15px] font-semibold text-[var(--color-fg)]">
            {isEdit ? t("deal_modal_edit") : t("deal_modal_create")}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-[var(--color-fg-muted)]">{t("deal_field_title")} *</label>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder={t("deal_ph_title")} required className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[var(--color-fg-muted)]">{t("deal_field_client")} *</label>
              <input value={form.clientName} onChange={(e) => set("clientName", e.target.value)} placeholder={t("deal_ph_client")} required className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[var(--color-fg-muted)]">{t("deal_field_value")}</label>
              <input type="number" min="0" value={form.value} onChange={(e) => set("value", e.target.value)} placeholder="0" className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[var(--color-fg-muted)]">{t("deal_field_stage")}</label>
              <select value={form.stage} onChange={(e) => set("stage", e.target.value as DealStage)}
                className={inputClass + " cursor-pointer"}>
                {STAGES.map((s) => <option key={s} value={s}>{stageLabels[s]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[var(--color-fg-muted)]">{t("deal_field_prob")}</label>
              <input type="number" min="0" max="100" value={form.probability} onChange={(e) => set("probability", e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[var(--color-fg-muted)]">{t("deal_field_close")}</label>
              <input type="date" value={form.expectedClose} onChange={(e) => set("expectedClose", e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[var(--color-fg-muted)]">{t("deal_field_owner")}</label>
              <input value={form.owner} onChange={(e) => set("owner", e.target.value)} placeholder={t("deal_ph_owner")} className={inputClass} />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            {isEdit && onDelete && (
              confirmDelete ? (
                <>
                  <button type="button" onClick={onDelete}
                    className="px-3 py-1.5 text-[12px] font-medium bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
                    {t("btn_delete")}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 text-[12px] font-medium text-[var(--color-fg-muted)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-canvas)] transition-colors">
                    {t("btn_cancel")}
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)}
                  className="p-2 rounded-lg text-[var(--color-fg-faint)] hover:text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 size={15} />
                </button>
              )
            )}
            <div className="flex-1" />
            <button type="button" onClick={onClose}
              className="px-4 py-1.5 text-[13px] font-medium text-[var(--color-fg-muted)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-canvas)] transition-colors">
              {t("btn_cancel")}
            </button>
            <button type="submit"
              className="px-4 py-1.5 text-[13px] font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-lg transition-colors shadow-sm">
              {isEdit ? t("btn_save") : t("btn_create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Deal card ────────────────────────────────────────────────────────────────

function DealCard({ deal, onEdit, onDragStart }: {
  deal: Deal; onEdit: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const { sw } = useTheme();
  return (
    <div draggable onDragStart={onDragStart}
      className="group bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 cursor-grab active:cursor-grabbing hover:border-[var(--color-accent-subtle)] hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-150 shadow-card">
      <div className="flex items-start gap-2">
        <GripVertical size={13} className="text-[var(--color-fg-faint)] mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={sw} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[var(--color-fg)] leading-snug truncate">{deal.title}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className="w-5 h-5 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0">
              {deal.clientAvatar?.slice(0, 1) ?? "?"}
            </div>
            <span className="text-[11px] text-[var(--color-fg-muted)] truncate">{deal.clientName}</span>
          </div>
        </div>
        <button onClick={onEdit}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)] transition-all flex-shrink-0">
          <Pencil size={12} strokeWidth={sw} />
        </button>
      </div>

      <div className="flex items-center justify-between mt-3.5 pt-3 border-t border-[var(--color-border)]">
        <span className="text-[14px] font-bold text-[var(--color-fg)]">
          ${deal.value >= 1000 ? `${(deal.value / 1000).toFixed(0)}K` : deal.value}
        </span>
        <div className="flex items-center gap-2">
          <div className="w-14 h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full",
              deal.probability >= 70 ? "bg-emerald-500" : deal.probability >= 40 ? "bg-amber-500" : "bg-gray-300")}
              style={{ width: `${deal.probability}%` }} />
          </div>
          <span className="text-[11px] text-[var(--color-fg-faint)] tabular-nums">{deal.probability}%</span>
        </div>
      </div>

      {deal.expectedClose && (
        <p className="text-[11px] text-[var(--color-fg-faint)] mt-2 flex items-center gap-1">
          <ChevronRight size={10} strokeWidth={sw} />{deal.expectedClose}
        </p>
      )}
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

function KanbanColumn({ stage, deals, stageLabel, onAddDeal, onEditDeal, onDrop }: {
  stage: DealStage; deals: Deal[]; stageLabel: string;
  onAddDeal: () => void; onEditDeal: (deal: Deal) => void;
  onDrop: (stage: DealStage) => void;
}) {
  const { sw } = useTheme();
  const [isDragOver, setIsDragOver] = useState(false);
  const meta = STAGE_META[stage];
  const total = deals.reduce((s, d) => s + d.value, 0);

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border transition-all duration-150 min-w-[240px] flex-shrink-0 w-[240px]",
        isDragOver
          ? `border-[var(--color-accent)] bg-[var(--color-accent-subtle)]/30`
          : "border-[var(--color-border)] bg-[var(--color-canvas)]"
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); onDrop(stage); }}
    >
      {/* Column header */}
      <div className={cn("px-4 py-3 rounded-t-2xl border-b border-[var(--color-border)] flex items-center gap-2", meta.headerBg)}>
        <span className={cn("w-2 h-2 rounded-full flex-shrink-0", meta.dot)} />
        <span className="text-[12px] font-semibold text-[var(--color-fg)] flex-1 truncate">{stageLabel}</span>
        <span className="text-[11px] text-[var(--color-fg-faint)] font-medium">{deals.length}</span>
      </div>

      {/* Value summary */}
      {deals.length > 0 && (
        <div className={cn("mx-3 mt-3 px-3 py-2 rounded-xl text-center", meta.valueBg)}>
          <span className={cn("text-[12px] font-bold", meta.valueText)}>
            ${total >= 1000 ? `${(total / 1000).toFixed(0)}K` : total}
          </span>
        </div>
      )}

      {/* Cards */}
      <div className="flex-1 px-3 py-3 space-y-2.5 overflow-y-auto min-h-[80px]">
        {deals.length === 0 && (
          <div className={cn(
            "rounded-xl border-2 border-dashed p-4 text-center transition-colors",
            isDragOver ? `${meta.dropBorder} bg-[var(--color-surface)]` : "border-[var(--color-border-subtle)]"
          )}>
            <p className="text-[11px] text-[var(--color-fg-faint)]">Drop here</p>
          </div>
        )}
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal}
            onEdit={() => onEditDeal(deal)}
            onDragStart={(e) => e.dataTransfer.setData("dealId", deal.id)} />
        ))}
      </div>

      {/* Add */}
      <button onClick={onAddDeal}
        className="mx-3 mb-3 px-3 py-2 rounded-xl border border-dashed border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)] text-[12px] text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] transition-all flex items-center gap-1.5 font-medium">
        <Plus size={12} strokeWidth={sw} /> Add deal
      </button>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => { const id = setTimeout(onDone, 2500); return () => clearTimeout(id); }, [onDone]);
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 bg-[var(--color-fg)] text-white rounded-xl shadow-xl text-[13px] font-medium animate-in slide-in-from-bottom-2 duration-200">
      <Check size={14} className="text-emerald-400" />
      {msg}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type ModalState =
  | { open: false }
  | { open: true; mode: "create"; stage: DealStage }
  | { open: true; mode: "edit"; deal: Deal };

export default function PipelinePage() {
  const { t } = useLanguage();
  const { sw } = useTheme();
  const stageLabels = useStageLabels();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [modal, setModal] = useState<ModalState>({ open: false });
  const [toast, setToast] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  useEffect(() => { setDeals(getDeals()); }, []);

  function persist(next: Deal[]) { setDeals(next); saveDeals(next); }

  function handleDrop(toStage: DealStage) {
    if (!dragId.current) return;
    const id = dragId.current;
    dragId.current = null;
    persist(deals.map((d) => d.id === id ? { ...d, stage: toStage } : d));
    setToast(t("deal_moved"));
  }

  function handleSave(data: Omit<Deal, "id">) {
    if (modal.open && modal.mode === "edit") {
      persist(deals.map((d) => d.id === modal.deal.id ? { ...d, ...data } : d));
      setToast(t("deal_saved"));
    } else {
      persist([...deals, { ...data, id: `deal-${Date.now()}` }]);
      setToast(t("deal_created"));
    }
    setModal({ open: false });
  }

  function handleDelete() {
    if (!modal.open || modal.mode !== "edit") return;
    persist(deals.filter((d) => d.id !== modal.deal.id));
    setToast(t("deal_deleted"));
    setModal({ open: false });
  }

  const totalValue  = deals.reduce((s, d) => s + d.value, 0);
  const activeDeals = deals.filter((d) => d.stage !== "closed_lost").length;
  const wonDeals    = deals.filter((d) => d.stage === "closed_won").length;

  const stats = [
    { label: t("pipeline_total_value"), value: `$${totalValue >= 1000 ? (totalValue / 1000).toFixed(0) + "K" : totalValue}`, icon: DollarSign, color: "text-emerald-600 bg-emerald-50" },
    { label: t("pipeline_deals_count"), value: String(deals.length),                                                           icon: TrendingUp, color: "text-blue-600 bg-blue-50" },
    { label: "Active",                  value: String(activeDeals),                                                            icon: Users,      color: "text-violet-600 bg-violet-50" },
    { label: "Won",                     value: String(wonDeals),                                                               icon: Check,      color: "text-emerald-600 bg-emerald-50" },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-screen bg-[var(--color-canvas)]">
      <TopBar title={t("pipeline_title")} subtitle={t("pipeline_subtitle")} action={{
        label: t("pipeline_add_deal"),
        onClick: () => setModal({ open: true, mode: "create", stage: "lead" }),
      }} />

      <div className="flex-1 p-4 md:p-6 space-y-5 flex flex-col">
        {/* Stats strip */}
        <div className="flex items-center gap-3 flex-wrap">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="flex items-center gap-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 shadow-card hover:shadow-card-hover transition-shadow">
              <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0", color)}>
                <Icon size={14} strokeWidth={sw} />
              </div>
              <div>
                <p className="text-[16px] font-bold text-[var(--color-fg)] leading-none">{value}</p>
                <p className="text-[11px] text-[var(--color-fg-muted)] mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Kanban */}
        <div className="flex-1 overflow-x-auto pb-4">
          <div className="flex gap-4 h-full" style={{ minWidth: `${STAGES.length * 260}px` }}>
            {STAGES.map((stage) => (
              <KanbanColumn key={stage} stage={stage}
                deals={deals.filter((d) => d.stage === stage)}
                stageLabel={stageLabels[stage]}
                onAddDeal={() => setModal({ open: true, mode: "create", stage })}
                onEditDeal={(deal) => setModal({ open: true, mode: "edit", deal })}
                onDrop={handleDrop}
              />
            ))}
          </div>
        </div>
      </div>

      {modal.open && (
        <DealModal
          deal={modal.mode === "edit" ? modal.deal : undefined}
          defaultStage={modal.mode === "create" ? modal.stage : undefined}
          onSave={handleSave}
          onDelete={modal.mode === "edit" ? handleDelete : undefined}
          onClose={() => setModal({ open: false })}
        />
      )}

      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
