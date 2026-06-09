"use client";

import { useEffect, useState } from "react";
import { X, Trash2, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import type { Task, TaskStatus, TaskPriority } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TaskModalProps {
  open: boolean;
  task?: Task;
  defaultStatus?: TaskStatus;
  onClose: () => void;
  onSave: (task: Task) => void;
  onDelete?: (id: string) => void;
}

const STATUS_OPTIONS: TaskStatus[]   = ["todo", "in_progress", "done", "cancelled"];
const PRIORITY_OPTIONS: TaskPriority[] = ["low", "medium", "high", "urgent"];

type FormState = {
  title: string;
  description: string;
  projectName: string;
  assignee: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  tags: string;
};

function buildInitialForm(task?: Task, defaultStatus?: TaskStatus): FormState {
  return {
    title:       task?.title       ?? "",
    description: task?.description ?? "",
    projectName: task?.projectName ?? "",
    assignee:    task?.assignee    ?? "",
    status:      task?.status      ?? defaultStatus ?? "todo",
    priority:    task?.priority    ?? "medium",
    dueDate:     task?.dueDate     ?? "",
    tags:        task?.tags?.join(", ") ?? "",
  };
}

/** Derive a 2-letter avatar from a name */
function nameToAvatar(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

export function TaskModal({ open, task, defaultStatus, onClose, onSave, onDelete }: TaskModalProps) {
  const { t } = useLanguage();
  const isEdit = !!task;

  const [form, setForm]       = useState<FormState>(buildInitialForm(task, defaultStatus));
  const [errors, setErrors]   = useState<Partial<Record<keyof FormState, string>>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(buildInitialForm(task, defaultStatus));
      setErrors({});
      setConfirmDelete(false);
    }
  }, [open, task, defaultStatus]);

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
    if (!form.title.trim()) errs.title = t("required_field");
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const today = new Date().toISOString().split("T")[0];
    const saved: Task = {
      id:             task?.id          ?? `t-${Date.now()}`,
      projectId:      task?.projectId  ?? "p-manual",
      clientName:     task?.clientName ?? "",
      createdAt:      task?.createdAt  ?? today,
      assigneeAvatar: nameToAvatar(form.assignee || "??"),
      title:          form.title.trim(),
      description:    form.description.trim(),
      projectName:    form.projectName.trim(),
      assignee:       form.assignee.trim(),
      status:         form.status,
      priority:       form.priority,
      dueDate:        form.dueDate,
      tags:           form.tags.split(",").map((s) => s.trim()).filter(Boolean),
    };
    onSave(saved);
  }

  function handleDeleteClick() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    onDelete?.(task!.id);
  }

  if (!open) return null;

  const statusLabels: Record<TaskStatus, string> = {
    todo:        t("task_todo"),
    in_progress: t("status_in_progress"),
    done:        t("task_done"),
    cancelled:   t("task_cancelled"),
  };

  const priorityLabels: Record<TaskPriority, string> = {
    low:    t("priority_low"),
    medium: t("priority_medium"),
    high:   t("priority_high"),
    urgent: t("priority_urgent"),
  };

  const priorityDots: Record<TaskPriority, string> = {
    low:    "bg-[#5a5a8a]",
    medium: "bg-indigo-400",
    high:   "bg-amber-400",
    urgent: "bg-red-400",
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Card */}
      <div className="relative z-10 w-full max-w-[480px] bg-[#0d0d1c] border border-[#1c1c35] rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1c1c35] flex-shrink-0">
          <div>
            <h2 className="text-[15px] font-semibold text-white">
              {isEdit ? t("task_modal_edit") : t("task_modal_create")}
            </h2>
            {isEdit && (
              <p className="text-[12px] text-[#5a5a8a] mt-0.5 truncate max-w-[300px]">{task.title}</p>
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
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Title */}
          <FormField label={t("task_field_title")} required error={errors.title}>
            <input
              type="text" value={form.title} onChange={set("title")}
              placeholder={t("task_ph_title")} className={inputCls(!!errors.title)}
              autoFocus
            />
          </FormField>

          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("task_field_status")}>
              <select value={form.status} onChange={set("status")} className={inputCls(false) + " cursor-pointer"}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s} style={{ background: "#111128" }}>{statusLabels[s]}</option>
                ))}
              </select>
            </FormField>
            <FormField label={t("task_field_priority")}>
              <div className="relative">
                <span className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full", priorityDots[form.priority])} />
                <select
                  value={form.priority} onChange={set("priority")}
                  className={inputCls(false) + " cursor-pointer pl-7"}
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p} style={{ background: "#111128" }}>{priorityLabels[p]}</option>
                  ))}
                </select>
              </div>
            </FormField>
          </div>

          {/* Project + Assignee */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("task_field_project")}>
              <input
                type="text" value={form.projectName} onChange={set("projectName")}
                placeholder={t("task_ph_project")} className={inputCls(false)}
              />
            </FormField>
            <FormField label={t("task_field_assignee")}>
              <input
                type="text" value={form.assignee} onChange={set("assignee")}
                placeholder={t("task_ph_assignee")} className={inputCls(false)}
              />
            </FormField>
          </div>

          {/* Due date + Tags */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("task_field_due")}>
              <input
                type="date" value={form.dueDate} onChange={set("dueDate")}
                className={inputCls(false) + " [color-scheme:dark]"}
              />
            </FormField>
            <FormField label={t("task_field_tags")}>
              <input
                type="text" value={form.tags} onChange={set("tags")}
                placeholder={t("task_ph_tags")} className={inputCls(false)}
              />
            </FormField>
          </div>

          {/* Description */}
          <FormField label={t("task_field_desc")}>
            <textarea
              value={form.description} onChange={set("description")}
              placeholder={t("task_ph_desc")} rows={3}
              className={inputCls(false) + " resize-none leading-relaxed"}
            />
          </FormField>

          {/* Delete confirmation */}
          {confirmDelete && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-medium text-red-300">{t("task_delete_title")}</p>
                <p className="text-[12px] text-red-400/70 mt-0.5">{t("task_delete_body")}</p>
              </div>
            </div>
          )}
        </div>

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
              {confirmDelete ? t("task_delete_title") : t("btn_delete")}
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
