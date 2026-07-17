"use client";

import { useState, useEffect } from "react";
import { X, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import type { Deal, DealStage } from "@/lib/types";

const STAGES: DealStage[] = [
  "lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost",
];

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

function fromDeal(deal: Deal): DealFormState {
  return {
    title: deal.title, clientName: deal.clientName, clientAvatar: deal.clientAvatar,
    value: String(deal.value), stage: deal.stage, probability: String(deal.probability),
    expectedClose: deal.expectedClose, owner: deal.owner,
  };
}

interface DealModalProps {
  open: boolean;
  deal?: Deal;
  defaultStage?:        DealStage;
  defaultClientName?:   string;
  defaultClientAvatar?: string;
  defaultOwner?:        string;
  onClose: () => void;
  onSave: (d: Omit<Deal, "id">) => void;
  onDelete?: () => void;
}

export function DealModal({ open, deal, defaultStage, defaultClientName, defaultClientAvatar, defaultOwner, onClose, onSave, onDelete }: DealModalProps) {
  const { t } = useLanguage();
  const [form, setForm] = useState<DealFormState>(deal ? fromDeal(deal) : emptyForm(defaultStage));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isEdit = Boolean(deal);

  useEffect(() => {
    if (open) {
      if (deal) {
        setForm(fromDeal(deal));
      } else {
        const base = emptyForm(defaultStage);
        setForm({
          ...base,
          clientName:   defaultClientName   ?? base.clientName,
          clientAvatar: defaultClientAvatar ?? base.clientAvatar,
          owner:        defaultOwner        ?? base.owner,
        });
      }
      setConfirmDelete(false);
    }
  }, [open, deal, defaultStage, defaultClientName, defaultClientAvatar, defaultOwner]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  function set(k: keyof DealFormState, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.clientName.trim()) return;
    const initials = form.clientAvatar ||
      form.clientName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    onSave({
      title: form.title.trim(), clientName: form.clientName.trim(), clientAvatar: initials,
      value: Number(form.value) || 0, stage: form.stage,
      probability: Math.min(100, Math.max(0, Number(form.probability) || 50)),
      expectedClose: form.expectedClose, owner: form.owner.trim(),
    });
  }

  const stageLabels: Record<DealStage, string> = {
    lead: t("stage_lead"), qualified: t("stage_qualified"), proposal: t("stage_proposal"),
    negotiation: t("stage_negotiation"), closed_won: t("stage_closed_won"), closed_lost: t("stage_closed_lost"),
  };

  const inputCls = "w-full h-9 px-3 bg-[var(--color-surface)] border border-[var(--color-border)] focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent rounded-lg text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-placeholder)] outline-none transition-shadow";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
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
            <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder={t("deal_ph_title")} required className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[var(--color-fg-muted)]">{t("deal_field_client")} *</label>
              <input value={form.clientName} onChange={(e) => set("clientName", e.target.value)} placeholder={t("deal_ph_client")} required className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[var(--color-fg-muted)]">{t("deal_field_value")}</label>
              <input type="number" min="0" value={form.value} onChange={(e) => set("value", e.target.value)} placeholder="0" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[var(--color-fg-muted)]">{t("deal_field_stage")}</label>
              <select value={form.stage} onChange={(e) => set("stage", e.target.value as DealStage)} className={inputCls + " cursor-pointer"}>
                {STAGES.map((s) => <option key={s} value={s}>{stageLabels[s]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[var(--color-fg-muted)]">{t("deal_field_prob")}</label>
              <input type="number" min="0" max="100" value={form.probability} onChange={(e) => set("probability", e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[var(--color-fg-muted)]">{t("deal_field_close")}</label>
              <input type="date" value={form.expectedClose} onChange={(e) => set("expectedClose", e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-[var(--color-fg-muted)]">{t("deal_field_owner")}</label>
              <input value={form.owner} onChange={(e) => set("owner", e.target.value)} placeholder={t("deal_ph_owner")} className={inputCls} />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            {isEdit && onDelete && (
              confirmDelete ? (
                <>
                  <button type="button" onClick={onDelete} className="px-3 py-1.5 text-[12px] font-medium bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
                    {t("btn_delete")}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 text-[12px] font-medium text-[var(--color-fg-muted)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-canvas)] transition-colors">
                    {t("btn_cancel")}
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="p-2 rounded-lg text-[var(--color-fg-faint)] hover:text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 size={15} />
                </button>
              )
            )}
            <div className="flex-1" />
            <button type="button" onClick={onClose} className="px-4 py-1.5 text-[13px] font-medium text-[var(--color-fg-muted)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-canvas)] transition-colors">
              {t("btn_cancel")}
            </button>
            <button type="submit" className="px-4 py-1.5 text-[13px] font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-lg transition-colors shadow-sm">
              {isEdit ? t("btn_save") : t("btn_create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
