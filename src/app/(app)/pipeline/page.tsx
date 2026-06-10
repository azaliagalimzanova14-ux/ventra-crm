"use client";

import { useState, useEffect, useRef } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { useLanguage } from "@/context/language-context";
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

const STAGE_META: Record<DealStage, { color: string; dot: string; light: string }> = {
  lead:        { color: "text-[#8080a8]",   dot: "bg-[#5a5a8a]",     light: "bg-[#1c1c35]" },
  qualified:   { color: "text-blue-400",    dot: "bg-blue-400",      light: "bg-blue-500/10" },
  proposal:    { color: "text-violet-400",  dot: "bg-violet-400",    light: "bg-violet-500/10" },
  negotiation: { color: "text-amber-400",   dot: "bg-amber-400",     light: "bg-amber-500/10" },
  closed_won:  { color: "text-emerald-400", dot: "bg-emerald-400",   light: "bg-emerald-500/10" },
  closed_lost: { color: "text-red-400",     dot: "bg-red-400",       light: "bg-red-500/10" },
};

// ─── Deal modal ───────────────────────────────────────────────────────────────

interface DealFormState {
  title: string;
  clientName: string;
  clientAvatar: string;
  value: string;
  stage: DealStage;
  probability: string;
  expectedClose: string;
  owner: string;
}

const emptyForm = (stage: DealStage = "lead"): DealFormState => ({
  title: "", clientName: "", clientAvatar: "",
  value: "", stage, probability: "50",
  expectedClose: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
  owner: "",
});

function DealModal({
  deal, defaultStage, onSave, onDelete, onClose,
}: {
  deal?: Deal;
  defaultStage?: DealStage;
  onSave: (d: Omit<Deal, "id">) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState<DealFormState>(
    deal
      ? { title: deal.title, clientName: deal.clientName, clientAvatar: deal.clientAvatar,
          value: String(deal.value), stage: deal.stage, probability: String(deal.probability),
          expectedClose: deal.expectedClose, owner: deal.owner }
      : emptyForm(defaultStage)
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isEdit = Boolean(deal);

  const stageLabels = useStageLabels();

  function set(k: keyof DealFormState, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.clientName.trim()) return;
    const initials = form.clientAvatar ||
      form.clientName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    onSave({
      title: form.title.trim(),
      clientName: form.clientName.trim(),
      clientAvatar: initials,
      value: Number(form.value) || 0,
      stage: form.stage,
      probability: Math.min(100, Math.max(0, Number(form.probability) || 50)),
      expectedClose: form.expectedClose,
      owner: form.owner.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#0d0d1c] border border-[#1c1c35] rounded-2xl shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1c1c35]">
          <h2 className="text-[15px] font-semibold text-white">
            {isEdit ? t("deal_modal_edit") : t("deal_modal_create")}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#5a5a8a] hover:text-white hover:bg-white/5 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-[#8080a8]">{t("deal_field_title")} *</label>
            <input
              value={form.title} onChange={(e) => set("title", e.target.value)}
              placeholder={t("deal_ph_title")} required
              className="w-full px-3 py-2.5 bg-[#111128] border border-[#1c1c35] focus:border-indigo-500/60 rounded-lg text-[13px] text-white placeholder:text-[#3a3a5a] outline-none transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-[#8080a8]">{t("deal_field_client")} *</label>
              <input
                value={form.clientName} onChange={(e) => set("clientName", e.target.value)}
                placeholder={t("deal_ph_client")} required
                className="w-full px-3 py-2.5 bg-[#111128] border border-[#1c1c35] focus:border-indigo-500/60 rounded-lg text-[13px] text-white placeholder:text-[#3a3a5a] outline-none transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-[#8080a8]">{t("deal_field_value")}</label>
              <input
                type="number" min="0" value={form.value} onChange={(e) => set("value", e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2.5 bg-[#111128] border border-[#1c1c35] focus:border-indigo-500/60 rounded-lg text-[13px] text-white placeholder:text-[#3a3a5a] outline-none transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-[#8080a8]">{t("deal_field_stage")}</label>
              <select
                value={form.stage} onChange={(e) => set("stage", e.target.value as DealStage)}
                className="w-full px-3 py-2.5 bg-[#111128] border border-[#1c1c35] focus:border-indigo-500/60 rounded-lg text-[13px] text-white outline-none transition-colors"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>{stageLabels[s]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-[#8080a8]">{t("deal_field_prob")}</label>
              <input
                type="number" min="0" max="100" value={form.probability}
                onChange={(e) => set("probability", e.target.value)}
                className="w-full px-3 py-2.5 bg-[#111128] border border-[#1c1c35] focus:border-indigo-500/60 rounded-lg text-[13px] text-white outline-none transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-[#8080a8]">{t("deal_field_close")}</label>
              <input
                type="date" value={form.expectedClose} onChange={(e) => set("expectedClose", e.target.value)}
                className="w-full px-3 py-2.5 bg-[#111128] border border-[#1c1c35] focus:border-indigo-500/60 rounded-lg text-[13px] text-white outline-none transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-[#8080a8]">{t("deal_field_owner")}</label>
              <input
                value={form.owner} onChange={(e) => set("owner", e.target.value)}
                placeholder={t("deal_ph_owner")}
                className="w-full px-3 py-2.5 bg-[#111128] border border-[#1c1c35] focus:border-indigo-500/60 rounded-lg text-[13px] text-white placeholder:text-[#3a3a5a] outline-none transition-colors"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {isEdit && onDelete && (
              confirmDelete ? (
                <>
                  <button type="button" onClick={onDelete}
                    className="px-3 py-2 text-[12px] font-medium bg-red-500/15 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors">
                    {t("btn_delete")}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)}
                    className="px-3 py-2 text-[12px] font-medium text-[#8080a8] border border-[#1c1c35] rounded-lg hover:bg-white/5 transition-colors">
                    {t("btn_cancel")}
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)}
                  className="p-2 rounded-lg text-[#5a5a8a] hover:text-red-400 hover:bg-red-500/10 transition-colors">
                  <Trash2 size={15} />
                </button>
              )
            )}
            <div className="flex-1" />
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-[13px] font-medium text-[#8080a8] border border-[#1c1c35] rounded-lg hover:bg-white/5 transition-colors">
              {t("btn_cancel")}
            </button>
            <button type="submit"
              className="px-4 py-2 text-[13px] font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors">
              {isEdit ? t("btn_save") : t("btn_create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Deal card ────────────────────────────────────────────────────────────────

function DealCard({
  deal, onEdit, onDragStart,
}: {
  deal: Deal;
  onEdit: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="group bg-[#111128] border border-[#1c1c35] rounded-xl p-3.5 cursor-grab active:cursor-grabbing hover:border-[#252545] transition-all hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5"
    >
      <div className="flex items-start gap-2.5">
        <GripVertical size={14} className="text-[#3a3a5a] mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-[#e0e0f0] leading-snug truncate">{deal.title}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <div className="w-4 h-4 rounded-full bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0">
              {deal.clientAvatar?.slice(0, 1) ?? "?"}
            </div>
            <span className="text-[11px] text-[#5a5a8a] truncate">{deal.clientName}</span>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-[#5a5a8a] hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
        >
          <Pencil size={12} />
        </button>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#1c1c35]">
        <span className="text-[13px] font-semibold text-white">
          ${deal.value >= 1000 ? `${(deal.value / 1000).toFixed(0)}K` : deal.value}
        </span>
        <div className="flex items-center gap-1.5">
          <div className="w-14 h-1 bg-[#1c1c35] rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full", deal.probability >= 70 ? "bg-emerald-500" : deal.probability >= 40 ? "bg-amber-500" : "bg-[#5a5a8a]")}
              style={{ width: `${deal.probability}%` }}
            />
          </div>
          <span className="text-[10px] text-[#5a5a8a]">{deal.probability}%</span>
        </div>
      </div>

      {deal.expectedClose && (
        <p className="text-[10px] text-[#3a3a5a] mt-1.5 flex items-center gap-1">
          <ChevronRight size={9} />{deal.expectedClose}
        </p>
      )}
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

function KanbanColumn({
  stage, deals, stageLabel, onAddDeal, onEditDeal, onDrop,
}: {
  stage: DealStage;
  deals: Deal[];
  stageLabel: string;
  onAddDeal: () => void;
  onEditDeal: (deal: Deal) => void;
  onDrop: (stage: DealStage) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const meta = STAGE_META[stage];
  const total = deals.reduce((s, d) => s + d.value, 0);

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border transition-all duration-150 min-w-[240px] flex-shrink-0 w-[240px]",
        isDragOver
          ? "border-indigo-500/40 bg-indigo-500/5"
          : "border-[#1c1c35] bg-[#0d0d1c]/60"
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); onDrop(stage); }}
    >
      {/* Column header */}
      <div className="px-3.5 py-3 border-b border-[#1c1c35] flex items-center gap-2">
        <span className={cn("w-2 h-2 rounded-full flex-shrink-0", meta.dot)} />
        <span className={cn("text-[12px] font-semibold flex-1 truncate", meta.color)}>{stageLabel}</span>
        <span className="text-[11px] text-[#5a5a8a] font-mono">{deals.length}</span>
      </div>

      {/* Value summary */}
      {deals.length > 0 && (
        <div className={cn("mx-3.5 mt-2.5 px-2.5 py-1.5 rounded-lg text-center", meta.light)}>
          <span className={cn("text-[11px] font-semibold", meta.color)}>
            ${total >= 1000 ? `${(total / 1000).toFixed(0)}K` : total}
          </span>
        </div>
      )}

      {/* Cards */}
      <div className="flex-1 px-3.5 py-3 space-y-2.5 overflow-y-auto min-h-[80px]">
        {deals.length === 0 && (
          <div className={cn(
            "rounded-lg border-2 border-dashed p-4 text-center transition-colors",
            isDragOver ? "border-indigo-500/40" : "border-[#1c1c35]"
          )}>
            <p className="text-[11px] text-[#3a3a5a]">Drop here</p>
          </div>
        )}
        {deals.map((deal) => (
          <DealCard
            key={deal.id}
            deal={deal}
            onEdit={() => onEditDeal(deal)}
            onDragStart={(e) => e.dataTransfer.setData("dealId", deal.id)}
          />
        ))}
      </div>

      {/* Add button */}
      <button
        onClick={onAddDeal}
        className="mx-3.5 mb-3.5 px-3 py-2 rounded-lg border border-dashed border-[#1c1c35] hover:border-indigo-500/40 hover:bg-indigo-500/5 text-[12px] text-[#5a5a8a] hover:text-indigo-400 transition-all flex items-center gap-1.5"
      >
        <Plus size={12} /> Add deal
      </button>
    </div>
  );
}

// ─── Hook helpers ─────────────────────────────────────────────────────────────

function useStageLabels() {
  const { t } = useLanguage();
  return {
    lead:        t("stage_lead"),
    qualified:   t("stage_qualified"),
    proposal:    t("stage_proposal"),
    negotiation: t("stage_negotiation"),
    closed_won:  t("stage_closed_won"),
    closed_lost: t("stage_closed_lost"),
  };
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 2500);
    return () => clearTimeout(id);
  }, [onDone]);
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 bg-[#111128] border border-[#1c1c35] rounded-xl shadow-2xl text-[13px] text-white animate-in slide-in-from-bottom-2 duration-200">
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
  const stageLabels = useStageLabels();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [modal, setModal] = useState<ModalState>({ open: false });
  const [toast, setToast] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  useEffect(() => { setDeals(getDeals()); }, []);

  function persist(next: Deal[]) {
    setDeals(next);
    saveDeals(next);
  }

  function handleDrop(toStage: DealStage) {
    if (!dragId.current) return;
    const id = dragId.current;
    dragId.current = null;
    const next = deals.map((d) => d.id === id ? { ...d, stage: toStage } : d);
    persist(next);
    setToast(t("deal_moved"));
  }

  function handleSave(data: Omit<Deal, "id">) {
    if (modal.open && modal.mode === "edit") {
      const next = deals.map((d) => d.id === modal.deal.id ? { ...d, ...data } : d);
      persist(next);
      setToast(t("deal_saved"));
    } else {
      const newDeal: Deal = { ...data, id: `deal-${Date.now()}` };
      persist([...deals, newDeal]);
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

  const totalValue = deals.reduce((s, d) => s + d.value, 0);
  const activeDeals = deals.filter((d) => d.stage !== "closed_lost").length;

  const stats = [
    { label: t("pipeline_total_value"), value: `$${totalValue >= 1000 ? (totalValue / 1000).toFixed(0) + "K" : totalValue}`, icon: DollarSign, color: "text-emerald-400 bg-emerald-500/10" },
    { label: t("pipeline_deals_count"), value: String(deals.length), icon: TrendingUp, color: "text-indigo-400 bg-indigo-500/10" },
    { label: "Active", value: String(activeDeals), icon: Users, color: "text-violet-400 bg-violet-500/10" },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-screen">
      <TopBar title={t("pipeline_title")} subtitle={t("pipeline_subtitle")} />

      <div className="flex-1 p-6 space-y-5 flex flex-col">
        {/* Stats row */}
        <div className="flex items-center gap-4 flex-wrap">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="flex items-center gap-2.5 bg-[#111128] border border-[#1c1c35] rounded-xl px-4 py-2.5">
              <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", color)}>
                <Icon size={14} />
              </div>
              <div>
                <p className="text-[15px] font-bold text-white leading-none">{value}</p>
                <p className="text-[11px] text-[#5a5a8a] mt-0.5">{label}</p>
              </div>
            </div>
          ))}
          <div className="ml-auto">
            <button
              onClick={() => setModal({ open: true, mode: "create", stage: "lead" })}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-medium rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
            >
              <Plus size={15} strokeWidth={2.5} />
              {t("pipeline_add_deal")}
            </button>
          </div>
        </div>

        {/* Kanban board — horizontally scrollable */}
        <div className="flex-1 overflow-x-auto pb-4">
          <div className="flex gap-3.5 h-full" style={{ minWidth: `${STAGES.length * 256}px` }}>
            {STAGES.map((stage) => (
              <KanbanColumn
                key={stage}
                stage={stage}
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

      {/* Modal */}
      {modal.open && (
        <DealModal
          deal={modal.mode === "edit" ? modal.deal : undefined}
          defaultStage={modal.mode === "create" ? modal.stage : undefined}
          onSave={handleSave}
          onDelete={modal.mode === "edit" ? handleDelete : undefined}
          onClose={() => setModal({ open: false })}
        />
      )}

      {/* Toast */}
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
