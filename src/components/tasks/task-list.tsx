"use client";

import { Check, Circle, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import type { Task, TaskStatus } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { useLanguage } from "@/context/language-context";

interface TaskListProps {
  tasks: Task[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: (task: Omit<Task, "id">) => void;
}

const priorityColors: Record<Task["priority"], string> = {
  low: "text-zinc-500",
  medium: "text-amber-400",
  high: "text-red-400",
  urgent: "text-orange-400",
};

export function TaskList({ tasks, onToggle, onDelete, onAdd }: TaskListProps) {
  const { t } = useLanguage();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");

  const filtered = tasks.filter((t) => {
    if (filter === "active") return t.status !== "done";
    if (filter === "done") return t.status === "done";
    return true;
  });

  const pending = tasks.filter((t) => t.status !== "done");
  const completed = tasks.filter((t) => t.status === "done");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({
      title: title.trim(),
      description: "",
      projectId: "",
      projectName: "",
      clientName: "",
      assignee: "",
      assigneeAvatar: "",
      status: "todo" as TaskStatus,
      priority,
      dueDate: new Date().toISOString().split("T")[0],
      createdAt: new Date().toISOString(),
      tags: [],
    });
    setTitle("");
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
          {(["all", "active", "done"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                filter === f
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="h-4 w-4" />
          New task
        </Button>
      </div>

      {showForm && (
        <Card className="p-4">
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <Input
                id="task-title"
                label={t("tasks_input_label")}
                placeholder={t("tasks_input_ph")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-300">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Task["priority"])}
                className="h-10 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 text-sm text-zinc-100"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <Button type="submit">Add</Button>
          </form>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
            To do ({pending.length})
          </h3>
          <ul className="space-y-2">
            {filtered
              .filter((t) => t.status !== "done")
              .map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onToggle={onToggle}
                  onDelete={onDelete}
                />
              ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Completed ({completed.length})
          </h3>
          <ul className="space-y-2">
            {filtered
              .filter((t) => t.status === "done")
              .map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onToggle={onToggle}
                  onDelete={onDelete}
                />
              ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function TaskItem({
  task,
  onToggle,
  onDelete,
}: {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const isDone = task.status === "done";
  return (
    <li
      className={cn(
        "group flex items-start gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-4 py-3 transition-colors hover:border-zinc-700/80",
        isDone && "opacity-60",
      )}
    >
      <button
        onClick={() => onToggle(task.id)}
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          isDone
            ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
            : "border-zinc-600 hover:border-violet-500 hover:text-violet-400",
        )}
      >
        {isDone ? (
          <Check className="h-3 w-3" />
        ) : (
          <Circle className="h-3 w-3 opacity-0 group-hover:opacity-100" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium text-zinc-200",
            isDone && "line-through text-zinc-500",
          )}
        >
          {task.title}
        </p>
        {task.description && (
          <p className="mt-0.5 text-xs text-zinc-500">{task.description}</p>
        )}
        <div className="mt-1 flex items-center gap-3 text-xs">
          <span className="text-zinc-600">Due {formatDate(task.dueDate)}</span>
          <span className={cn("font-medium capitalize", priorityColors[task.priority])}>
            {task.priority}
          </span>
        </div>
      </div>
      <button
        onClick={() => onDelete(task.id)}
        className="shrink-0 rounded p-1 text-zinc-600 opacity-0 transition-all hover:bg-zinc-800 hover:text-red-400 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
