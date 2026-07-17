"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, Users, CheckSquare, TrendingUp, X } from "lucide-react";
import { ClientModal } from "@/components/clients/client-modal";
import { TaskModal }   from "@/components/tasks/task-modal";
import { DealModal }   from "@/components/pipeline/deal-modal";
import {
  getClients, saveClients, getTasks, saveTasks, getDeals, saveDeals, logActivity,
} from "@/lib/storage";
import type { Client, Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { normalizeClient } from "@/lib/normalize";

type ActionKey = "client" | "task" | "deal";

const ACTIONS: { key: ActionKey; label: string; icon: React.ElementType; color: string }[] = [
  { key: "deal",   label: "Create Deal",  icon: TrendingUp,  color: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
  { key: "task",   label: "Add Task",     icon: CheckSquare, color: "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100" },
  { key: "client", label: "Add Client",   icon: Users,       color: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
];

export function QuickActions() {
  const [open,      setOpen]      = useState(false);
  const [activeKey, setActiveKey] = useState<ActionKey | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Client save ────────────────────────────────────────────────────────────
  function handleClientSave(client: Client) {
    const safe    = normalizeClient(client);
    const current = getClients();
    const isNew   = !current.find((c) => c.id === safe.id);
    saveClients(isNew ? [safe, ...current] : current.map((c) => c.id === safe.id ? safe : c));
    logActivity({ type: "client_added", title: `${safe.name} added`, description: safe.company, avatar: safe.avatar });
    setActiveKey(null);
  }

  // ── Task save ──────────────────────────────────────────────────────────────
  function handleTaskSave(task: Task) {
    const current = getTasks();
    const isNew   = !current.find((t) => t.id === task.id);
    saveTasks(isNew ? [task, ...current] : current.map((t) => t.id === task.id ? task : t));
    logActivity({ type: "task_created", title: "Task created", description: task.title, meta: task.priority });
    setActiveKey(null);
  }

  // ── Deal save ──────────────────────────────────────────────────────────────
  function handleDealSave(data: Omit<import("@/lib/types").Deal, "id">) {
    const current = getDeals();
    const newDeal = { ...data, id: `deal-${Date.now()}` };
    saveDeals([...current, newDeal]);
    logActivity({ type: "deal_moved", title: `New deal: ${data.title}`, description: `${data.clientName} · ${data.stage.replace("_", " ")}`, meta: `$${data.value.toLocaleString()}` });
    setActiveKey(null);
  }

  return (
    <>
      {/* Modals */}
      <ClientModal open={activeKey === "client"} onClose={() => setActiveKey(null)} onSave={handleClientSave} />
      <TaskModal   open={activeKey === "task"}   onClose={() => setActiveKey(null)} onSave={handleTaskSave} />
      <DealModal   open={activeKey === "deal"}   onClose={() => setActiveKey(null)} onSave={handleDealSave} />

      {/* FAB */}
      <div ref={menuRef} className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {/* Action items — shown when menu open */}
        {open && (
          <div className="flex flex-col items-end gap-2 animate-in slide-in-from-bottom-2 duration-150">
            {ACTIONS.map(({ key, label, icon: Icon, color }) => (
              <button
                key={key}
                onClick={() => { setOpen(false); setActiveKey(key); }}
                className={cn(
                  "flex items-center gap-2.5 pl-4 pr-3 py-2.5 rounded-xl border text-[13px] font-semibold shadow-lg shadow-black/5 transition-all",
                  color
                )}
              >
                {label}
                <div className="w-7 h-7 rounded-lg bg-white/60 flex items-center justify-center flex-shrink-0">
                  <Icon size={14} />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Main FAB button */}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close quick actions" : "Quick actions"}
          className={cn(
            "w-12 h-12 rounded-full shadow-xl shadow-black/15 flex items-center justify-center transition-all duration-200",
            open
              ? "bg-[var(--color-fg)] text-[var(--color-canvas)] rotate-45"
              : "bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white"
          )}
        >
          {open ? <X size={18} /> : <Plus size={20} strokeWidth={2.5} />}
        </button>
      </div>
    </>
  );
}
