"use client";

import { useState, useEffect } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { TaskModal } from "@/components/tasks/task-modal";
import { getTasks, saveTasks } from "@/lib/storage";
import type { Task, TaskStatus, TaskPriority } from "@/lib/types";
import { useLanguage } from "@/context/language-context";
import {
  CheckCircle2, Circle, Clock, AlertCircle, Pencil, Plus,
  LayoutGrid, List, ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ModalState =
  | { open: false }
  | { open: true; mode: "create"; defaultStatus?: TaskStatus }
  | { open: true; mode: "edit"; task: Task };

export default function TasksPage() {
  const { t } = useLanguage();

  const [taskList,       setTaskList]       = useState<Task[]>([]);
  const [view,           setView]           = useState<"kanban" | "list">("kanban");
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "all">("all");
  const [modal,          setModal]          = useState<ModalState>({ open: false });
  const [toast,          setToast]          = useState<string | null>(null);

  useEffect(() => { setTaskList(getTasks()); }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function handleSave(task: Task) {
    const isNew = !taskList.find((t) => t.id === task.id);
    const updated = isNew
      ? [task, ...taskList]
      : taskList.map((t) => (t.id === task.id ? task : t));
    saveTasks(updated);
    setTaskList(updated);
    setModal({ open: false });
    showToast(isNew ? t("task_created") : t("task_saved"));
  }

  function handleDelete(id: string) {
    const updated = taskList.filter((t) => t.id !== id);
    saveTasks(updated);
    setTaskList(updated);
    setModal({ open: false });
    showToast(t("task_deleted"));
  }

  // ── Configs (inside component so t() is reactive) ─────────────────────────
  const priorityConfig: Record<TaskPriority, { label: string; color: string; dot: string }> = {
    low:    { label: t("priority_low"),    color: "text-[var(--color-fg-faint)]",  dot: "bg-gray-400" },
    medium: { label: t("priority_medium"), color: "text-[var(--color-accent)]", dot: "bg-[var(--color-accent)]" },
    high:   { label: t("priority_high"),   color: "text-amber-600",  dot: "bg-amber-500" },
    urgent: { label: t("priority_urgent"), color: "text-red-500",    dot: "bg-red-500" },
  };

  const statusConfig: Record<TaskStatus, { label: string; icon: React.ElementType; class: string }> = {
    todo:        { label: t("task_todo"),          icon: Circle,       class: "text-[var(--color-fg-faint)]" },
    in_progress: { label: t("status_in_progress"), icon: Clock,        class: "text-[var(--color-accent)]" },
    done:        { label: t("task_done"),           icon: CheckCircle2, class: "text-emerald-600" },
    cancelled:   { label: t("task_cancelled"),      icon: AlertCircle,  class: "text-[var(--color-fg-faint)]" },
  };

  const columns: { id: TaskStatus; label: string; dot: string; count: number }[] = [
    { id: "todo",        label: t("tasks_todo_col"),   dot: "bg-gray-400",    count: taskList.filter(t => t.status === "todo").length },
    { id: "in_progress", label: t("tasks_inprog_col"), dot: "bg-[var(--color-accent)]",   count: taskList.filter(t => t.status === "in_progress").length },
    { id: "done",        label: t("tasks_done_col"),   dot: "bg-emerald-500",  count: taskList.filter(t => t.status === "done").length },
  ];

  const priorityKeys: (TaskPriority | "all")[] = ["all", "urgent", "high", "medium", "low"];
  const filtered  = taskList.filter((task) => filterPriority === "all" || task.priority === filterPriority);
  const byStatus  = (status: TaskStatus) => filtered.filter((task) => task.status === status);

  // ── TaskCard ───────────────────────────────────────────────────────────────
  function TaskCard({ task }: { task: Task }) {
    const prio       = priorityConfig[task.priority] ?? priorityConfig.medium;
    const StatusIcon = statusConfig[task.status]?.icon ?? Circle;
    const isDue      = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";

    return (
      <div
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3.5 hover:border-[var(--color-border)] hover:bg-[var(--color-canvas)] transition-all cursor-pointer group relative"
        onClick={() => setModal({ open: true, mode: "edit", task })}
      >
        {/* Hover edit badge */}
        <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <span className="text-[10px] font-medium bg-[var(--color-accent-subtle)] text-[var(--color-accent)] border border-[var(--color-accent)] px-1.5 py-0.5 rounded flex items-center gap-0.5">
            <Pencil size={8} />{t("btn_edit")}
          </span>
        </div>

        {/* Title row */}
        <div className="flex items-start gap-2 pr-12">
          <StatusIcon size={14} className={cn("mt-0.5 flex-shrink-0", statusConfig[task.status]?.class ?? "text-[var(--color-fg-faint)]")} />
          <div className="flex-1 min-w-0">
            <p className={cn(
              "text-[13px] font-medium leading-snug",
              task.status === "done" ? "line-through text-[var(--color-fg-faint)]" : "text-[var(--color-fg)]"
            )}>
              {task.title}
            </p>
            {task.projectName && (
              <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5 truncate">{task.projectName}</p>
            )}
            {task.description && (
              <p className="text-[11px] text-[var(--color-fg-faint)]/60 mt-1 line-clamp-2 leading-relaxed">
                {task.description}
              </p>
            )}
          </div>
        </div>

        {/* Footer row */}
        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-[var(--color-border)]/60">
          {/* Priority dot + label */}
          <div className={cn("flex items-center gap-1 text-[11px] font-medium", prio.color)}>
            <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", prio.dot)} />
            {prio.label}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {/* Due date */}
            {task.dueDate && (
              <span className={cn(
                "flex items-center gap-0.5 text-[11px]",
                isDue ? "text-red-500 font-medium" : "text-[var(--color-fg-faint)]"
              )}>
                <Clock size={10} />
                {task.dueDate}
                {isDue && <span className="text-[10px]">!</span>}
              </span>
            )}
            {/* Avatar */}
            {task.assigneeAvatar && (
              <div className="w-5 h-5 rounded-full bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-[8px] font-bold text-[var(--color-fg)] flex-shrink-0">
                {task.assigneeAvatar}
              </div>
            )}
          </div>
        </div>

        {/* Tags */}
        {task.tags?.length > 0 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {task.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-[10px] bg-[var(--color-border)] text-[var(--color-fg-faint)] px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[200] bg-[var(--color-border)] border border-[var(--color-accent)] text-[var(--color-fg)] text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
          {toast}
        </div>
      )}

      <TaskModal
        open={modal.open}
        task={modal.open && modal.mode === "edit" ? modal.task : undefined}
        defaultStatus={modal.open && modal.mode === "create" ? modal.defaultStatus : undefined}
        onClose={() => setModal({ open: false })}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      <div className="flex flex-col flex-1">
        <TopBar
          title={t("tasks_title")}
          subtitle={`${taskList.length} ${t("tasks_subtitle")}`}
          action={{ label: t("tasks_add"), onClick: () => setModal({ open: true, mode: "create" }) }}
        />

        <div className="flex-1 p-5 space-y-4">

          {/* ── Toolbar ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status summary pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {columns.map((col) => (
                <span
                  key={col.id}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[12px]"
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", col.dot)} />
                  <span className="text-[var(--color-fg-muted)]">{col.label}</span>
                  <span className="font-semibold text-[var(--color-fg)]">{col.count}</span>
                </span>
              ))}
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[12px]">
                <span className="text-[var(--color-fg-faint)]">{t("tasks_total_lbl")}</span>
                <span className="font-semibold text-[var(--color-fg)]">{taskList.length}</span>
              </span>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Priority filter */}
            <div className="flex items-center gap-0.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-0.5">
              {priorityKeys.map((p) => (
                <button
                  key={p}
                  onClick={() => setFilterPriority(p)}
                  className={cn(
                    "px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                    filterPriority === p ? "bg-[var(--color-accent)] text-[var(--color-fg)]" : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                  )}
                >
                  {p === "all" ? t("all") : priorityConfig[p as TaskPriority].label}
                </button>
              ))}
            </div>

            {/* View toggle — icon buttons */}
            <div className="flex items-center gap-0.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-0.5">
              <button
                onClick={() => setView("kanban")}
                title={t("tasks_kanban")}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                  view === "kanban" ? "bg-[var(--color-accent)] text-[var(--color-fg)]" : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                )}
              >
                <LayoutGrid size={13} />
                <span>{t("tasks_kanban")}</span>
              </button>
              <button
                onClick={() => setView("list")}
                title={t("tasks_list")}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                  view === "list" ? "bg-[var(--color-accent)] text-[var(--color-fg)]" : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                )}
              >
                <List size={13} />
                <span>{t("tasks_list")}</span>
              </button>
            </div>
          </div>

          {/* ── Board view ──────────────────────────────────────────────── */}
          {view === "kanban" && (
            <div className="grid grid-cols-3 gap-3">
              {columns.map((col) => {
                const colTasks = byStatus(col.id);
                return (
                  <div key={col.id} className="flex flex-col gap-2">
                    {/* Column header */}
                    <div className="flex items-center gap-2 px-1 py-1">
                      <span className={cn("w-2 h-2 rounded-full flex-shrink-0", col.dot)} />
                      <span className="text-[12px] font-semibold text-[var(--color-fg)] uppercase tracking-wide">
                        {col.label}
                      </span>
                      <span className="ml-auto text-[11px] text-[var(--color-fg-faint)] font-medium tabular-nums">
                        {colTasks.length}
                      </span>
                    </div>

                    {/* Cards */}
                    <div className="flex flex-col gap-2">
                      {colTasks.map((task) => <TaskCard key={task.id} task={task} />)}

                      {/* Empty state */}
                      {colTasks.length === 0 && (
                        <div className="flex flex-col items-center justify-center gap-2 py-8 rounded-lg border border-dashed border-[var(--color-border)]">
                          <ClipboardList size={20} className="text-[var(--color-fg-faint)]" />
                          <p className="text-[11px] text-[var(--color-fg-faint)]">{t("tasks_no_tasks")}</p>
                        </div>
                      )}

                      {/* Add task */}
                      <button
                        onClick={() => setModal({ open: true, mode: "create", defaultStatus: col.id })}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]/5 border border-dashed border-[var(--color-border)] hover:border-[var(--color-accent)] transition-all w-full"
                      >
                        <Plus size={12} />
                        {t("task_add_col")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── List view ───────────────────────────────────────────────── */}
          {view === "list" && (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16">
                  <ClipboardList size={28} className="text-[var(--color-fg-faint)]" />
                  <p className="text-[13px] text-[var(--color-fg-faint)]">{t("tasks_no_tasks")}</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      {[
                        t("tasks_col_task"),
                        t("tasks_col_status"),
                        t("tasks_col_priority"),
                        t("tasks_col_project"),
                        t("tasks_col_assignee"),
                        t("tasks_col_due"),
                        t("tasks_col_tags"),
                        "",
                      ].map((h, i) => (
                        <th key={i} className="text-left px-4 py-2.5 text-[10px] font-medium text-[var(--color-fg-faint)] uppercase tracking-wider">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {filtered.map((task) => {
                      const prio       = priorityConfig[task.priority] ?? priorityConfig.medium;
                      const StatusIcon = statusConfig[task.status]?.icon ?? Circle;
                      const isDue      = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";

                      return (
                        <tr
                          key={task.id}
                          className="hover:bg-[var(--color-canvas)] transition-colors cursor-pointer group"
                          onClick={() => setModal({ open: true, mode: "edit", task })}
                        >
                          <td className="px-4 py-3 max-w-[220px]">
                            <div className="flex items-center gap-2">
                              <StatusIcon size={14} className={cn("flex-shrink-0", statusConfig[task.status]?.class ?? "text-[var(--color-fg-faint)]")} />
                              <span className={cn(
                                "text-[13px] font-medium truncate",
                                task.status === "done" ? "line-through text-[var(--color-fg-faint)]" : "text-[var(--color-fg)]"
                              )}>
                                {task.title}
                              </span>
                            </div>
                            {task.description && (
                              <p className="text-[11px] text-[var(--color-fg-faint)]/60 mt-0.5 pl-[22px] truncate">
                                {task.description}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[12px] text-[var(--color-fg-muted)] whitespace-nowrap">
                            {statusConfig[task.status]?.label}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", prio.dot)} />
                              <span className={cn("text-[12px] font-medium", prio.color)}>{prio.label}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[12px] text-[var(--color-fg-muted)] max-w-[140px]">
                            <span className="truncate block">{task.projectName || "—"}</span>
                          </td>
                          <td className="px-4 py-3">
                            {task.assignee ? (
                              <div className="flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded-full bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-[8px] font-bold text-[var(--color-fg)] flex-shrink-0">
                                  {task.assigneeAvatar}
                                </div>
                                <span className="text-[12px] text-[var(--color-fg-muted)] truncate max-w-[80px]">
                                  {task.assignee.split(" ")[0]}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[12px] text-[var(--color-fg-faint)]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={cn("text-[12px]", isDue ? "text-red-500 font-medium" : "text-[var(--color-fg-muted)]")}>
                              {task.dueDate || "—"}
                              {isDue && <span className="ml-1 text-[10px]">⚠</span>}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 flex-wrap">
                              {task.tags?.slice(0, 2).map((tag) => (
                                <span key={tag} className="text-[10px] bg-[var(--color-border)] text-[var(--color-fg-faint)] px-1.5 py-0.5 rounded">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={(e) => { e.stopPropagation(); setModal({ open: true, mode: "edit", task }); }}
                              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-[var(--color-canvas)] text-[var(--color-fg-faint)] hover:text-[var(--color-accent)] transition-all"
                            >
                              <Pencil size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
