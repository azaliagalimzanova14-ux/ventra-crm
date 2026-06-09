"use client";

import { useEffect, useState } from "react";
import { X, Trash2, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import type { Client, ClientStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ClientModalProps {
  open: boolean;
  client?: Client;           // undefined = create mode
  onClose: () => void;
  onSave: (client: Client) => void;
  onDelete?: (id: string) => void;
}

const STATUS_OPTIONS: ClientStatus[] = ["active", "lead", "inactive", "churned"];

const INDUSTRY_SUGGESTIONS = [
  "Technology", "Marketing", "Finance", "Healthcare", "Retail",
  "Education", "Manufacturing", "Real Estate", "Media", "Consulting",
];

type FormState = {
  name: string;
  company: string;
  email: string;
  phone: string;
  status: ClientStatus;
  industry: string;
  location: string;
  tags: string;
};

function buildInitialForm(client?: Client): FormState {
  return {
    name:     client?.name     ?? "",
    company:  client?.company  ?? "",
    email:    client?.email    ?? "",
    phone:    client?.phone    ?? "",
    status:   client?.status   ?? "lead",
    industry: client?.industry ?? "",
    location: client?.location ?? "",
    tags:     client?.tags?.join(", ") ?? "",
  };
}

export function ClientModal({ open, client, onClose, onSave, onDelete }: ClientModalProps) {
  const { t } = useLanguage();
  const isEdit = !!client;

  const [form, setForm] = useState<FormState>(buildInitialForm(client));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(buildInitialForm(client));
      setErrors({});
      setConfirmDelete(false);
    }
  }, [open, client]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const set = (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!form.name.trim())    errs.name    = t("required_field");
    if (!form.company.trim()) errs.company = t("required_field");
    if (!form.email.trim())   errs.email   = t("required_field");
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = "Invalid email";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const now = new Date().toISOString().split("T")[0];
    const saved: Client = {
      id:           client?.id    ?? `c-${Date.now()}`,
      avatar:       (form.name.trim().slice(0, 2)).toUpperCase(),
      totalValue:   client?.totalValue   ?? 0,
      projectCount: client?.projectCount ?? 0,
      joinedAt:     client?.joinedAt     ?? now,
      lastContact:  now,
      name:     form.name.trim(),
      company:  form.company.trim(),
      email:    form.email.trim(),
      phone:    form.phone.trim(),
      status:   form.status,
      industry: form.industry.trim(),
      location: form.location.trim(),
      tags:     form.tags.split(",").map((s) => s.trim()).filter(Boolean),
    };
    onSave(saved);
  }

  function handleDeleteClick() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    onDelete?.(client!.id);
  }

  if (!open) return null;

  const statusLabels: Record<ClientStatus, string> = {
    active:   t("status_active"),
    inactive: t("status_inactive"),
    lead:     t("status_lead"),
    churned:  t("status_churned"),
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Card */}
      <div className="relative z-10 w-full max-w-[480px] bg-[#0d0d1c] border border-[#1c1c35] rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1c1c35] flex-shrink-0">
          <div>
            <h2 className="text-[15px] font-semibold text-white">
              {isEdit ? t("client_modal_edit") : t("client_modal_create")}
            </h2>
            {isEdit && (
              <p className="text-[12px] text-[#5a5a8a] mt-0.5">{client.name} · {client.company}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-[#5a5a8a] hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Name + Company */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("client_field_name")} required error={errors.name}>
              <input type="text" value={form.name} onChange={set("name")}
                placeholder={t("client_ph_name")} className={inputCls(!!errors.name)} />
            </FormField>
            <FormField label={t("client_field_company")} required error={errors.company}>
              <input type="text" value={form.company} onChange={set("company")}
                placeholder={t("client_ph_company")} className={inputCls(!!errors.company)} />
            </FormField>
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("client_field_email")} required error={errors.email}>
              <input type="email" value={form.email} onChange={set("email")}
                placeholder={t("client_ph_email")} className={inputCls(!!errors.email)} />
            </FormField>
            <FormField label={t("client_field_phone")}>
              <input type="tel" value={form.phone} onChange={set("phone")}
                placeholder={t("client_ph_phone")} className={inputCls(false)} />
            </FormField>
          </div>

          {/* Status + Industry */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("client_field_status")}>
              <select value={form.status} onChange={set("status")} className={inputCls(false) + " cursor-pointer"}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s} style={{ background: "#111128" }}>{statusLabels[s]}</option>
                ))}
              </select>
            </FormField>
            <FormField label={t("client_field_industry")}>
              <input type="text" list="industry-list" value={form.industry} onChange={set("industry")}
                placeholder={t("client_ph_industry")} className={inputCls(false)} />
              <datalist id="industry-list">
                {INDUSTRY_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
              </datalist>
            </FormField>
          </div>

          {/* Location */}
          <FormField label={t("client_field_location")}>
            <input type="text" value={form.location} onChange={set("location")}
              placeholder={t("client_ph_location")} className={inputCls(false)} />
          </FormField>

          {/* Tags */}
          <FormField label={t("client_field_tags")}>
            <input type="text" value={form.tags} onChange={set("tags")}
              placeholder={t("client_ph_tags")} className={inputCls(false)} />
          </FormField>

          {/* Delete confirmation */}
          {confirmDelete && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-medium text-red-300">{t("client_delete_title")}</p>
                <p className="text-[12px] text-red-400/70 mt-0.5">{t("client_delete_body")}</p>
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#1c1c35] flex items-center gap-2 flex-shrink-0">
          {isEdit && onDelete && (
            <button
              type="button"
              onClick={handleDeleteClick}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors",
                confirmDelete
                  ? "bg-red-500 hover:bg-red-400 text-white"
                  : "text-red-400 hover:bg-red-500/10 border border-red-500/20"
              )}
            >
              <Trash2 size={14} />
              {confirmDelete ? t("client_delete_title") : t("btn_delete")}
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            {confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-1.5 rounded-lg text-[13px] font-medium text-[#8080a8] hover:text-white border border-[#1c1c35] hover:border-[#252545] transition-colors"
              >
                {t("btn_cancel")}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 rounded-lg text-[13px] font-medium text-[#8080a8] hover:text-white border border-[#1c1c35] hover:border-[#252545] transition-colors"
                >
                  {t("btn_cancel")}
                </button>
                <button
                  type="submit"
                  form="client-form"
                  onClick={handleSubmit}
                  className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-lg shadow-indigo-500/20"
                >
                  {isEdit ? t("btn_save") : t("btn_create")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label, required, error, children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-medium text-[#8080a8]">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}

function inputCls(hasError: boolean) {
  return cn(
    "w-full bg-[#111128] border rounded-lg px-3 py-2 text-[13px] text-[#e0e0f0] placeholder-[#5a5a8a] focus:outline-none transition-colors",
    hasError
      ? "border-red-500/50 focus:border-red-500"
      : "border-[#1c1c35] focus:border-indigo-500/50"
  );
}
