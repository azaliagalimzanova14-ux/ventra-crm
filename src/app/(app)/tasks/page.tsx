"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TopBar } from "@/components/layout/top-bar";
import { usePermissions } from "@/context/permission-context";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";
import {
  Plus, Search, X, CheckCircle2, Circle, Clock, AlertCircle,
  List as ListIcon, LayoutGrid, Calendar as CalIcon,
  ChevronLeft, ChevronRight, Pencil, Trash2, User,
  MessageSquare, CheckSquare, Bell, ExternalLink, Loader2,
  AlertTriangle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Task {
  id:               string;
  title:            string;
  description:      string | null;
  status:           "todo" | "in_progress" | "done" | "cancelled";
  priority:         "low" | "medium" | "high" | "urgent";
  due_date:         string | null;
  assigned_user_id: string | null;
  client_id:        string | null;
  conversation_id:  string | null;
  created_at:       string;
  completed_at:     string | null;
}

interface TaskFull extends Task {
  checklist: { id: string; title: string; completed: number; order_index: number }[];
  comments:  { id: string; user_id: string; content: string; created_at: string }[];
  reminders: { id: string; remind_at: string; sent: number }[];
}

type ViewMode = "list" | "kanban" | "calendar";

// ─── Static configs ───────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  todo:        { label: "To Do",       icon: Circle,       cls: "text-[var(--color-fg-faint)]",   dot: "bg-gray-400"                      },
  in_progress: { label: "In Progress", icon: Clock,        cls: "text-[var(--color-accent)]",      dot: "bg-[var(--color-accent)]"         },
  done:        { label: "Done",        icon: CheckCircle2, cls: "text-emerald-600",                dot: "bg-emerald-500"                   },
  cancelled:   { label: "Cancelled",   icon: AlertCircle,  cls: "text-[var(--color-fg-faint)]",   dot: "bg-gray-300"                      },
} as const;

const PRIORITY_CONFIG = {
  urgent: { label: "Urgent", badge: "bg-red-50 text-red-700 border-red-200",     dot: "bg-red-500"    },
  high:   { label: "High",   badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  medium: { label: "Medium", badge: "bg-blue-50 text-blue-700 border-blue-200",   dot: "bg-blue-500"  },
  low:    { label: "Low",    badge: "bg-gray-100 text-gray-500 border-gray-200",  dot: "bg-gray-400"  },
} as const;

const KANBAN_COLS: { status: Task["status"]; label: string }[] = [
  { status: "todo",        label: "To Do"       },
  { status: "in_progress", label: "In Progress" },
  { status: "done",        label: "Done"        },
  { status: "cancelled",   label: "Cancelled"   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status === "done" || task.status === "cancelled") return false;
  return task.due_date < new Date().toISOString().slice(0, 10);
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[var(--color-fg)] text-[var(--color-bg)] text-[13px] px-4 py-2.5 rounded-xl shadow-xl z-50 flex items-center gap-2">
      <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
      {msg}
    </div>
  );
}

// ─── Task Form Modal ──────────────────────────────────────────────────────────

interface TaskFormProps {
  initial?:          Partial<Task>;
  prefillClientId?:  string;
  prefillConvId?:    string;
  onSave:            (data: Partial<Task>) => void;
  onClose:           () => void;
  saving?:           boolean;
}

function TaskFormModal({ initial, prefillClientId, prefillConvId, onSave, onClose, saving }: TaskFormProps) {
  const [title,       setTitle]       = useState(initial?.title       ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status,      setStatus]      = useState<Task["status"]>(initial?.status   ?? "todo");
  const [priority,    setPriority]    = useState<Task["priority"]>(initial?.priority ?? "medium");
  const [dueDate,     setDueDate]     = useState(initial?.due_date ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      title:           title.trim(),
      description:     description.trim() || undefined,
      status,
      priority,
      due_date:        dueDate || undefined,
      client_id:       prefillClientId,
      conversation_id: prefillConvId,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-[15px] font-semibold text-[var(--color-fg)]">
            {initial?.id ? "Edit Task" : "New Task"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--color-canvas)] text-[var(--color-fg-faint)]">
            <X size={15} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[var(--color-fg-muted)] mb-1">Title *</label>
            <input
              value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] text-[13px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-accent)]"
              placeholder="Task title…" autoFocus required
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[var(--color-fg-muted)] mb-1">Description</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] text-[13px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-accent)] resize-none"
              placeholder="Optional details…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-[var(--color-fg-muted)] mb-1">Status</label>
              <select
                value={status} onChange={(e) => setStatus(e.target.value as Task["status"])}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] text-[13px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-accent)]"
              >
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[var(--color-fg-muted)] mb-1">Priority</label>
              <select
                value={priority} onChange={(e) => setPriority(e.target.value as Task["priority"])}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] text-[13px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-accent)]"
              >
                {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[var(--color-fg-muted)] mb-1">Due Date</label>
            <input
              type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] text-[13px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-[var(--color-border)] text-[13px] text-[var(--color-fg-muted)] hover:bg-[var(--color-canvas)] transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || !title.trim()}
              className="flex-1 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2">
              {saving && <Loader2 size={13} className="animate-spin" />}
              {initial?.id ? "Save Changes" : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Task Detail Panel ────────────────────────────────────────────────────────

function TaskDetailPanel({ taskId, onClose, onUpdated }: {
  taskId:    string;
  onClose:   () => void;
  onUpdated: () => void;
}) {
  const { user } = useAuth();
  const [task,       setTask]       = useState<TaskFull | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [newComment, setNewComment] = useState("");
  const [newItem,    setNewItem]    = useState("");
  const [saving,     setSaving]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/tasks/${taskId}`);
      const data = await res.json() as { task?: TaskFull };
      if (data.task) setTask(data.task);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { void load(); }, [load]);

  async function toggleStatus() {
    if (!task) return;
    const next = task.status === "done" ? "todo" : "done";
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    await load();
    onUpdated();
  }

  async function addComment() {
    if (!task || !newComment.trim()) return;
    setSaving(true);
    await fetch(`/api/tasks/${task.id}/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newComment.trim() }),
    });
    setNewComment("");
    setSaving(false);
    await load();
  }

  async function addChecklistItem() {
    if (!task || !newItem.trim()) return;
    setSaving(true);
    await fetch(`/api/tasks/${task.id}/checklist`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newItem.trim() }),
    });
    setNewItem("");
    setSaving(false);
    await load();
  }

  async function toggleChecklist(itemId: string, completed: boolean) {
    if (!task) return;
    await fetch(`/api/tasks/${task.id}/checklist`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, completed: !completed }),
    });
    await load();
  }

  async function deleteChecklistItem(itemId: string) {
    if (!task) return;
    await fetch(`/api/tasks/${task.id}/checklist`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    await load();
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[var(--color-accent)]" />
      </div>
    );
  }

  if (!task) return null;

  const StatusIcon = STATUS_CONFIG[task.status].icon;
  const doneItems  = task.checklist.filter((i) => i.completed).length;
  const totalItems = task.checklist.length;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-end">
      <div className="w-full max-w-md h-screen bg-[var(--color-surface)] border-l border-[var(--color-border)] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-[var(--color-border)]">
          <button onClick={toggleStatus} className="mt-0.5 flex-shrink-0">
            <StatusIcon size={18} className={STATUS_CONFIG[task.status].cls} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className={cn(
              "text-[15px] font-semibold text-[var(--color-fg)] leading-tight",
              task.status === "done" && "line-through text-[var(--color-fg-faint)]",
            )}>{task.title}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn(
                "text-[10px] font-semibold px-1.5 py-0.5 rounded-md border",
                PRIORITY_CONFIG[task.priority].badge,
              )}>{PRIORITY_CONFIG[task.priority].label}</span>
              {task.due_date && (
                <span className={cn(
                  "text-[11px]",
                  isOverdue(task) ? "text-red-500 font-medium" : "text-[var(--color-fg-faint)]",
                )}>
                  Due {fmtDate(task.due_date)}
                  {isOverdue(task) && " · Overdue"}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--color-canvas)] text-[var(--color-fg-faint)] flex-shrink-0">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Description */}
          {task.description && (
            <div>
              <p className="text-[12px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider mb-1.5">Description</p>
              <p className="text-[13px] text-[var(--color-fg-muted)] leading-relaxed">{task.description}</p>
            </div>
          )}

          {/* Links */}
          {(task.client_id || task.conversation_id) && (
            <div className="flex gap-2 flex-wrap">
              {task.client_id && (
                <a href={`/clients/${task.client_id}`} className="flex items-center gap-1.5 text-[12px] text-[var(--color-accent)] hover:underline">
                  <User size={12} /> View Client <ExternalLink size={10} />
                </a>
              )}
              {task.conversation_id && (
                <a href={`/inbox?conv=${task.conversation_id}`} className="flex items-center gap-1.5 text-[12px] text-[var(--color-accent)] hover:underline">
                  <MessageSquare size={12} /> View Conversation <ExternalLink size={10} />
                </a>
              )}
            </div>
          )}

          {/* Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider">
                Checklist {totalItems > 0 && `(${doneItems}/${totalItems})`}
              </p>
            </div>
            {totalItems > 0 && (
              <div className="mb-2 h-1 bg-[var(--color-border)] rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${(doneItems / totalItems) * 100}%` }} />
              </div>
            )}
            <div className="space-y-1.5">
              {task.checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-2 group">
                  <button onClick={() => void toggleChecklist(item.id, !!item.completed)} className="flex-shrink-0">
                    {item.completed
                      ? <CheckCircle2 size={15} className="text-emerald-500" />
                      : <Circle size={15} className="text-[var(--color-fg-faint)]" />}
                  </button>
                  <span className={cn(
                    "text-[13px] flex-1",
                    item.completed ? "line-through text-[var(--color-fg-faint)]" : "text-[var(--color-fg)]",
                  )}>{item.title}</span>
                  <button onClick={() => void deleteChecklistItem(item.id)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--color-fg-faint)] hover:text-red-500">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <input
                value={newItem} onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void addChecklistItem(); }}
                placeholder="Add item…"
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] text-[12px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-accent)]"
              />
              <button onClick={() => void addChecklistItem()} disabled={saving || !newItem.trim()}
                className="px-2.5 py-1.5 rounded-lg bg-[var(--color-accent)] text-white text-[12px] disabled:opacity-40">
                Add
              </button>
            </div>
          </div>

          {/* Comments */}
          <div>
            <p className="text-[12px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider mb-2">
              Comments ({task.comments.length})
            </p>
            <div className="space-y-3">
              {task.comments.map((c) => (
                <div key={c.id} className="flex gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                    {c.user_id.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 bg-[var(--color-canvas)] rounded-lg px-3 py-2">
                    <p className="text-[13px] text-[var(--color-fg)]">{c.content}</p>
                    <p className="text-[10px] text-[var(--color-fg-faint)] mt-0.5">{relTime(c.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <div className="w-6 h-6 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 mt-1">
                {user?.name?.slice(0, 2).toUpperCase() ?? "ME"}
              </div>
              <textarea
                value={newComment} onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment…" rows={2}
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] text-[13px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-accent)] resize-none"
              />
            </div>
            {newComment.trim() && (
              <div className="flex justify-end mt-1.5">
                <button onClick={() => void addComment()} disabled={saving}
                  className="px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-white text-[12px] disabled:opacity-40">
                  Post
                </button>
              </div>
            )}
          </div>

          {/* Reminders */}
          {task.reminders.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider mb-2">Reminders</p>
              <div className="space-y-1.5">
                {task.reminders.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-[13px] text-[var(--color-fg-muted)]">
                    <Bell size={12} className="text-[var(--color-fg-faint)]" />
                    {new Date(r.remind_at).toLocaleString()}
                    {!!r.sent && <span className="text-[10px] text-emerald-600 font-medium">Sent</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, onView, onEdit, onDelete, onToggle }: {
  task:     Task;
  onView:   () => void;
  onEdit:   () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const StatusIcon = STATUS_CONFIG[task.status].icon;
  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-canvas)] transition-colors group border-b border-[var(--color-border)] last:border-0 cursor-pointer",
      task.status === "done" && "opacity-60",
    )} onClick={onView}>
      <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className="flex-shrink-0">
        <StatusIcon size={16} className={STATUS_CONFIG[task.status].cls} />
      </button>
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-[13px] font-medium text-[var(--color-fg)] truncate",
          task.status === "done" && "line-through text-[var(--color-fg-faint)]",
        )}>{task.title}</p>
        {task.description && (
          <p className="text-[11px] text-[var(--color-fg-faint)] truncate mt-0.5">{task.description}</p>
        )}
      </div>
      <span className={cn(
        "text-[10px] font-semibold px-1.5 py-0.5 rounded-md border flex-shrink-0",
        PRIORITY_CONFIG[task.priority].badge,
      )}>{PRIORITY_CONFIG[task.priority].label}</span>
      {task.due_date && (
        <span className={cn(
          "text-[11px] flex-shrink-0",
          isOverdue(task) ? "text-red-500 font-medium" : "text-[var(--color-fg-faint)]",
        )}>
          {isOverdue(task) && <AlertTriangle size={10} className="inline mr-0.5" />}
          {fmtDate(task.due_date)}
        </span>
      )}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1 rounded hover:bg-[var(--color-border)] text-[var(--color-fg-faint)]">
          <Pencil size={12} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 rounded hover:bg-red-50 text-[var(--color-fg-faint)] hover:text-red-500">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanCol({ status, label, tasks, onView, onToggle }: {
  status:   Task["status"];
  label:    string;
  tasks:    Task[];
  onView:   (id: string) => void;
  onToggle: (t: Task) => void;
}) {
  const { dot } = STATUS_CONFIG[status];
  return (
    <div className="flex flex-col min-w-[260px] max-w-[300px] flex-1">
      <div className="flex items-center gap-2 px-1 mb-3">
        <div className={cn("w-2 h-2 rounded-full", dot)} />
        <span className="text-[12px] font-semibold text-[var(--color-fg)]">{label}</span>
        <span className="ml-auto text-[11px] text-[var(--color-fg-faint)] bg-[var(--color-canvas)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-md">{tasks.length}</span>
      </div>
      <div className="flex flex-col gap-2 flex-1">
        {tasks.map((task) => {
          const StatusIcon = STATUS_CONFIG[task.status].icon;
          return (
            <div key={task.id}
              onClick={() => onView(task.id)}
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3 cursor-pointer hover:border-[var(--color-accent)]/40 transition-colors">
              <div className="flex items-start gap-2">
                <button onClick={(e) => { e.stopPropagation(); onToggle(task); }} className="mt-0.5 flex-shrink-0">
                  <StatusIcon size={14} className={STATUS_CONFIG[task.status].cls} />
                </button>
                <p className={cn(
                  "text-[13px] font-medium text-[var(--color-fg)] leading-snug",
                  task.status === "done" && "line-through text-[var(--color-fg-faint)]",
                )}>{task.title}</p>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className={cn(
                  "text-[10px] font-semibold px-1.5 py-0.5 rounded-md border",
                  PRIORITY_CONFIG[task.priority].badge,
                )}>{PRIORITY_CONFIG[task.priority].label}</span>
                {task.due_date && (
                  <span className={cn(
                    "text-[10px]",
                    isOverdue(task) ? "text-red-500 font-medium" : "text-[var(--color-fg-faint)]",
                  )}>{fmtDate(task.due_date)}</span>
                )}
              </div>
            </div>
          );
        })}
        {tasks.length === 0 && (
          <div className="border-2 border-dashed border-[var(--color-border)] rounded-xl h-16 flex items-center justify-center text-[12px] text-[var(--color-fg-faint)]">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Calendar View ────────────────────────────────────────────────────────────

function CalendarView({ tasks, onView }: { tasks: Task[]; onView: (id: string) => void }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const year     = month.getFullYear();
  const mon      = month.getMonth();
  const daysInM  = new Date(year, mon + 1, 0).getDate();
  const startDay = new Date(year, mon, 1).getDay();
  const today    = new Date().toISOString().slice(0, 10);

  const tasksByDate = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.due_date) continue;
    const list = tasksByDate.get(t.due_date) ?? [];
    list.push(t);
    tasksByDate.set(t.due_date, list);
  }

  const prevMonth = () => setMonth(new Date(year, mon - 1, 1));
  const nextMonth = () => setMonth(new Date(year, mon + 1, 1));

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-[var(--color-canvas)] text-[var(--color-fg-muted)]"><ChevronLeft size={15} /></button>
        <span className="text-[14px] font-semibold text-[var(--color-fg)]">
          {month.toLocaleString(undefined, { month: "long", year: "numeric" })}
        </span>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-[var(--color-canvas)] text-[var(--color-fg-muted)]"><ChevronRight size={15} /></button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
          <div key={d} className="text-[11px] font-semibold text-[var(--color-fg-faint)] text-center py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-[var(--color-border)] rounded-xl overflow-hidden border border-[var(--color-border)]">
        {Array.from({ length: startDay }).map((_, i) => (
          <div key={`e${i}`} className="bg-[var(--color-canvas)] min-h-[80px]" />
        ))}
        {Array.from({ length: daysInM }).map((_, i) => {
          const day    = i + 1;
          const dateStr = `${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayTasks = tasksByDate.get(dateStr) ?? [];
          const isToday  = dateStr === today;
          return (
            <div key={day} className={cn(
              "bg-[var(--color-surface)] min-h-[80px] p-1.5",
              isToday && "bg-[var(--color-accent-subtle)]",
            )}>
              <div className={cn(
                "text-[11px] font-semibold mb-1 w-5 h-5 flex items-center justify-center rounded-full",
                isToday ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-fg-muted)]",
              )}>{day}</div>
              <div className="space-y-0.5">
                {dayTasks.slice(0, 2).map((t) => (
                  <button key={t.id} onClick={() => onView(t.id)}
                    className="w-full text-left text-[10px] truncate px-1 py-0.5 rounded bg-[var(--color-accent-subtle)] text-[var(--color-accent)] font-medium hover:opacity-80">
                    {t.title}
                  </button>
                ))}
                {dayTasks.length > 2 && (
                  <p className="text-[10px] text-[var(--color-fg-faint)] pl-1">+{dayTasks.length - 2} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── AI Suggestion Banner ─────────────────────────────────────────────────────

interface AISuggestion {
  title:    string;
  reason:   string;
  priority: Task["priority"];
}

function AISuggestionBanner({ suggestion, onAccept, onDismiss }: {
  suggestion: AISuggestion;
  onAccept:   () => void;
  onDismiss:  () => void;
}) {
  return (
    <div className="flex items-start gap-3 bg-[var(--color-accent-subtle)] border border-[var(--color-accent)]/20 rounded-xl px-4 py-3 mb-4">
      <CheckSquare size={16} className="text-[var(--color-accent)] flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-[var(--color-accent)] mb-0.5">AI Suggested Task</p>
        <p className="text-[13px] text-[var(--color-fg)] font-medium">{suggestion.title}</p>
        <p className="text-[11px] text-[var(--color-fg-muted)] mt-0.5">{suggestion.reason}</p>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button onClick={onAccept}
          className="px-2.5 py-1 rounded-lg bg-[var(--color-accent)] text-white text-[11px] font-medium hover:opacity-90">
          Create
        </button>
        <button onClick={onDismiss}
          className="px-2.5 py-1 rounded-lg border border-[var(--color-border)] text-[11px] text-[var(--color-fg-muted)] hover:bg-[var(--color-canvas)]">
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { can }      = usePermissions();

  const [tasks,       setTasks]       = useState<Task[]>([]);
  const [total,       setTotal]       = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [view,        setView]        = useState<ViewMode>("list");
  const [search,      setSearch]      = useState("");
  const [statusFlt,   setStatusFlt]   = useState<string>("");
  const [priorityFlt, setPriorityFlt] = useState<string>("");
  const [page,        setPage]        = useState(0);
  const [toast,       setToast]       = useState<string | null>(null);
  const [showForm,    setShowForm]    = useState(false);
  const [editTask,    setEditTask]    = useState<Task | null>(null);
  const [detailId,    setDetailId]    = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [delTarget,   setDelTarget]   = useState<Task | null>(null);
  const [aiSugg,      setAiSugg]      = useState<AISuggestion | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const LIMIT = 50;

  // Open "new" form if ?new=1 is in the URL
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setShowForm(true);
      router.replace("/tasks");
    }
  }, [searchParams, router]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit:  String(LIMIT),
        offset: String(page * LIMIT),
      });
      if (search)      params.set("search",   search);
      if (statusFlt)   params.set("status",   statusFlt);
      if (priorityFlt) params.set("priority", priorityFlt);

      const res  = await fetch(`/api/tasks?${params.toString()}`);
      const data = await res.json() as { tasks?: Task[]; total?: number };
      setTasks(data.tasks ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [search, statusFlt, priorityFlt, page]);

  // Debounced search
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => { void fetchTasks(); }, 300);
    return () => { if (searchRef.current) clearTimeout(searchRef.current); };
  }, [fetchTasks]);

  async function handleCreate(data: Partial<Task>) {
    setSaving(true);
    try {
      await fetch("/api/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setShowForm(false);
      setAiSugg(null);
      setToast("Task created");
      await fetchTasks();
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(data: Partial<Task>) {
    if (!editTask) return;
    setSaving(true);
    try {
      await fetch(`/api/tasks/${editTask.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setEditTask(null);
      setToast("Task updated");
      await fetchTasks();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(task: Task) {
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    setDelTarget(null);
    setToast("Task deleted");
    await fetchTasks();
  }

  async function handleToggle(task: Task) {
    const next = task.status === "done" ? "todo" : "done";
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setToast(next === "done" ? "Task completed!" : "Task reopened");
    await fetchTasks();
  }

  function acceptAiSugg() {
    if (!aiSugg) return;
    setShowForm(true);
    // The form will open with defaults; AI suggestion pre-populates via editTask trick
    setEditTask({ ...(aiSugg as unknown as Task), id: "" });
    setAiSugg(null);
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="flex flex-col h-screen bg-[var(--color-canvas)] overflow-hidden">
      <TopBar title="Tasks" />

      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-6xl mx-auto w-full">

        {/* AI Suggestion */}
        {aiSugg && (
          <AISuggestionBanner
            suggestion={aiSugg}
            onAccept={acceptAiSugg}
            onDismiss={() => setAiSugg(null)}
          />
        )}

        {/* Header */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-faint)]" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search tasks…"
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[13px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-accent)]"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-fg-faint)]">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Status filter */}
          <select
            value={statusFlt}
            onChange={(e) => { setStatusFlt(e.target.value); setPage(0); }}
            className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[13px] text-[var(--color-fg)] focus:outline-none"
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          {/* Priority filter */}
          <select
            value={priorityFlt}
            onChange={(e) => { setPriorityFlt(e.target.value); setPage(0); }}
            className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[13px] text-[var(--color-fg)] focus:outline-none"
          >
            <option value="">All priorities</option>
            {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          {/* View toggle */}
          <div className="flex items-center gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-0.5">
            {([
              ["list",     <ListIcon key="l" size={13} />],
              ["kanban",   <LayoutGrid key="k" size={13} />],
              ["calendar", <CalIcon key="c" size={13} />],
            ] as [ViewMode, React.ReactNode][]).map(([v, icon]) => (
              <button key={v} onClick={() => setView(v)}
                className={cn(
                  "px-2.5 py-1.5 rounded-md text-[12px] flex items-center gap-1 transition-colors",
                  view === v
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
                )}>
                {icon}
              </button>
            ))}
          </div>

          <span className="text-[12px] text-[var(--color-fg-faint)]">{total} task{total !== 1 ? "s" : ""}</span>

          {/* Create */}
          {can("tasks.create") && (
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-accent)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity ml-auto">
              <Plus size={14} />
              New Task
            </button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={24} className="animate-spin text-[var(--color-accent)]" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
            <CheckSquare size={36} className="text-[var(--color-fg-faint)]" />
            <p className="text-[14px] font-semibold text-[var(--color-fg-muted)]">No tasks found</p>
            <p className="text-[13px] text-[var(--color-fg-faint)]">
              {search || statusFlt || priorityFlt ? "Try different filters" : "Create your first task to get started"}
            </p>
            {can("tasks.create") && !search && !statusFlt && !priorityFlt && (
              <button onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-accent)] text-white text-[13px] font-medium hover:opacity-90 mt-1">
                <Plus size={14} /> New Task
              </button>
            )}
          </div>
        ) : view === "list" ? (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onView={() => setDetailId(task.id)}
                onEdit={() => setEditTask(task)}
                onDelete={() => setDelTarget(task)}
                onToggle={() => void handleToggle(task)}
              />
            ))}
          </div>
        ) : view === "kanban" ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {KANBAN_COLS.map((col) => (
              <KanbanCol
                key={col.status}
                status={col.status}
                label={col.label}
                tasks={tasks.filter((t) => t.status === col.status)}
                onView={(id) => setDetailId(id)}
                onToggle={(t) => void handleToggle(t)}
              />
            ))}
          </div>
        ) : (
          <CalendarView tasks={tasks} onView={(id) => setDetailId(id)} />
        )}

        {/* Pagination */}
        {totalPages > 1 && view === "list" && (
          <div className="flex items-center justify-center gap-3 mt-5">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
              className="p-1.5 rounded-lg border border-[var(--color-border)] disabled:opacity-40 hover:bg-[var(--color-canvas)]">
              <ChevronLeft size={14} />
            </button>
            <span className="text-[12px] text-[var(--color-fg-muted)]">
              Page {page + 1} / {totalPages}
            </span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg border border-[var(--color-border)] disabled:opacity-40 hover:bg-[var(--color-canvas)]">
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <TaskFormModal
          initial={editTask?.id === "" ? { title: editTask.title, priority: editTask.priority } : undefined}
          onSave={handleCreate}
          onClose={() => { setShowForm(false); setEditTask(null); }}
          saving={saving}
        />
      )}

      {/* Edit form */}
      {editTask && editTask.id !== "" && (
        <TaskFormModal
          initial={editTask}
          onSave={handleEdit}
          onClose={() => setEditTask(null)}
          saving={saving}
        />
      )}

      {/* Delete confirm */}
      {delTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-[15px] font-semibold text-[var(--color-fg)] mb-2">Delete Task?</h3>
            <p className="text-[13px] text-[var(--color-fg-muted)] mb-4">
              &ldquo;{delTarget.title}&rdquo; will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDelTarget(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-[var(--color-border)] text-[13px] text-[var(--color-fg-muted)] hover:bg-[var(--color-canvas)]">
                Cancel
              </button>
              <button onClick={() => void handleDelete(delTarget)}
                className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white text-[13px] font-medium hover:bg-red-600">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail panel */}
      {detailId && (
        <TaskDetailPanel
          taskId={detailId}
          onClose={() => setDetailId(null)}
          onUpdated={() => void fetchTasks()}
        />
      )}

      {/* Toast */}
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
