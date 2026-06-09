"use client";

import { useEffect, useState } from "react";
import { X, Trash2, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import type { Project, ProjectStatus, TaskPriority } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ProjectModalProps {
  open: boolean;
  project?: Project;
  onClose: () => void;
  onSave: (project: Project) => void;
  onDelete?: (id: string) => void;
}

const STATUS_OPTIONS: ProjectStatus[] = ["planning", "in_progress", "review", "completed", "on_hold"];
const PRIORITY_OPTIONS: TaskPriority[] = ["low", "medium", "high", "urgent"];

type FormState = {
  name: string;
  clientName: string;
  status: ProjectStatus;
  priority: TaskPriority;
  dueDate: string;
  progress: string;
  budget: string;
  team: string;
  description: string;
  tags: string;
};

function buildInitialForm(project?: Project): FormState {
  return {
    name:        project?.name        ?? "",
    clientName:  project?.clientName  ?? "",
    status:      project?.status      ?? "planning",
    priority:    project?.priority    ?? "medium",
    dueDate:     project?.dueDate     ?? "",
    progress:    String(project?.progress ?? 0),
    budget:      String(project?.budget   ?? ""),
    team:        project?.team?.join(", ") ?? "",
    description: project?.description ?? "",
    tags:        project?.tags?.join(", ") ?? "",
  };
}

export function ProjectModal({ open, project, onClose, onSave, onDelete }: ProjectModalProps) {
  const { t } = useLanguage();
  const isEdit = !!project;

  const [form, setForm] = useState<FormState>(buildInitialForm(project));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(buildInitialForm(project));
      setErrors({});
      setConfirmDelete(false);
    }
  }, [open, project]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const set =
    (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!form.name.trim())       errs.name       = t("required_field");
    if (!form.clientName.trim()) errs.clientName = t("required_field");
    if (!form.dueDate)           errs.dueDate    = t("required_field");
    const prog = Number(form.progress);
    if (isNaN(prog) || prog < 0 || prog > 100) errs.progress = "0–100";
    if (form.budget && isNaN(Number(form.budget))) errs.budget = "Invalid number";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!validate()) return;

    const today = new Date().toISOString().split("T")[0];
    const saved: Project = {
      id:             project?.id           ?? `p-${Date.now()}`,
      clientId:       project?.clientId     ?? `c-manual`,
      startDate:      project?.startDate    ?? today,
      spent:          project?.spent        ?? 0,
      taskCount:      project?.taskCount    ?? 0,
      completedTasks: project?.completedTasks ?? 0,
      name:        form.name.trim(),
      clientName:  form.clientName.trim(),
      status:      form.status,
      priority:    form.priority,
      dueDate:     form.dueDate,
      progress:    Math.max(0, Math.min(100, Number(form.progress) || 0)),
      budget:      Number(form.budget) || 0,
      team:        form.team.split(",").map((s) => s.trim()).filter(Boolean),
      description: form.description.trim(),
      tags:        form.tags.split(",").map((s) => s.trim()).filter(Boolean),
    };
    onSave(saved);
  }

  function handleDeleteClick() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    onDelete?.(project!.id);
  }

  if (!open) return null;

  const statusLabels: Record<ProjectStatus, string> = {
    planning:    t("status_planning"),
    in_progress: t("status_in_progress"),
    review:      t("status_review"),
    completed:   t("status_completed"),
    on_hold:     t("status_on_hold"),
  };

  const priorityLabels: Record<TaskPriority, string> = {
    low:    t("priority_low"),
    medium: t("priority_medium"),
    high:   t("priority_high"),
    urgent: t("priority_urgent"),
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Card */}
      <div className="relative z-10 w-full max-w-[520px] bg-[#0d0d1c] border border-[#1c1c35] rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1c1c35] flex-shrink-0">
          <div>
            <h2 className="text-[15px] font-semibold text-white">
              {isEdit ? t("project_modal_edit") : t("project_modal_create")}
            </h2>
            {isEdit && (
              <p className="text-[12px] text-[#5a5a8a] mt-0.5">{project.name} · {project.clientName}</p>
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

          {/* Title + Client */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("project_field_title")} required error={errors.name}>
              <input
                type="text" value={form.name} onChange={set("name")}
                placeholder={t("project_ph_title")} className={inputCls(!!errors.name)}
              />
            </FormField>
            <FormField label={t("project_field_client")} required error={errors.clientName}>
              <input
                type="text" value={form.clientName} onChange={set("clientName")}
                placeholder={t("project_ph_client")} className={inputCls(!!errors.clientName)}
              />
            </FormField>
          </div>

          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("project_field_status")}>
              <select value={form.status} onChange={set("status")} className={inputCls(false) + " cursor-pointer"}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s} style={{ background: "#111128" }}>{statusLabels[s]}</option>
                ))}
              </select>
            </FormField>
            <FormField label={t("project_field_priority")}>
              <select value={form.priority} onChange={set("priority")} className={inputCls(false) + " cursor-pointer"}>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p} style={{ background: "#111128" }}>{priorityLabels[p]}</option>
                ))}
              </select>
            </FormField>
          </div>

          {/* Deadline + Progress */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("project_field_deadline")} required error={errors.dueDate}>
              <input
                type="date" value={form.dueDate} onChange={set("dueDate")}
                className={inputCls(!!errors.dueDate) + " [color-scheme:dark]"}
              />
            </FormField>
            <FormField label={t("project_field_progress")} error={errors.progress}>
              <div className="relative">
                <input
                  type="number" min={0} max={100} value={form.progress} onChange={set("progress")}
                  className={inputCls(!!errors.progress) + " pr-8"}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#5a5a8a]">%</span>
              </div>
              {/* Live progress bar */}
              <div className="mt-1.5 h-1 bg-[#1c1c35] rounded-full overflow-hidden">
                <div
                  className="h-full bg-linear-to-r from-indigo-500 to-violet-500 rounded-full transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, Number(form.progress) || 0))}%` }}
                />
              </div>
            </FormField>
          </div>

          {/* Budget + Team */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("project_field_budget")} error={errors.budget}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-[#5a5a8a]">$</span>
                <input
                  type="number" min={0} value={form.budget} onChange={set("budget")}
                  placeholder="0" className={inputCls(!!errors.budget) + " pl-6"}
                />
              </div>
            </FormField>
            <FormField label={t("project_field_team")}>
              <input
                type="text" value={form.team} onChange={set("team")}
                placeholder={t("project_ph_team")} className={inputCls(false)}
              />
            </FormField>
          </div>

          {/* Description */}
          <FormField label={t("project_field_desc")}>
            <textarea
              value={form.description} onChange={set("description")}
              placeholder={t("project_ph_desc")} rows={3}
              className={inputCls(false) + " resize-none leading-relaxed"}
            />
          </FormField>

          {/* Tags */}
          <FormField label={t("project_field_tags")}>
            <input
              type="text" value={form.tags} onChange={set("tags")}
              placeholder={t("project_ph_tags")} className={inputCls(false)}
            />
          </FormField>

          {/* Delete confirmation */}
          {confirmDelete && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-medium text-red-300">{t("project_delete_title")}</p>
                <p className="text-[12px] text-red-400/70 mt-0.5">{t("project_delete_body")}</p>
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
              {confirmDelete ? t("project_delete_title") : t("btn_delete")}
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
                  type="button"
                  onClick={() => handleSubmit()}
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
