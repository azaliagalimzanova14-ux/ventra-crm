import type { Activity } from "./types";
import { getClients, getProjects, getTasks, getDeals } from "./storage";

export function generateActivity(): Activity[] {
  const clients  = getClients();
  const projects = getProjects();
  const tasks    = getTasks();
  const deals    = getDeals();

  const entries: Activity[] = [];

  // ── Clients added ──────────────────────────────────────────────────────────
  [...clients].reverse().slice(0, 6).forEach((c) => {
    entries.push({
      id:          `c_${c.id}`,
      type:        "client_added",
      title:       `${c.name} added`,
      description: c.company,
      timestamp:   c.joinedAt,
      avatar:      c.avatar,
    });
  });

  // ── Projects created ───────────────────────────────────────────────────────
  [...projects].reverse().slice(0, 5).forEach((p) => {
    entries.push({
      id:          `p_${p.id}`,
      type:        "project_created",
      title:       `Project: ${p.name}`,
      description: `${p.clientName} · ${p.status.replace("_", " ")}`,
      timestamp:   p.startDate,
    });
  });

  // ── Tasks completed ────────────────────────────────────────────────────────
  tasks
    .filter((t) => t.status === "done")
    .slice(0, 5)
    .forEach((t) => {
      entries.push({
        id:          `t_${t.id}`,
        type:        "task_done",
        title:       "Task completed",
        description: t.title,
        timestamp:   t.dueDate,
      });
    });

  // ── Deals won ──────────────────────────────────────────────────────────────
  deals
    .filter((d) => d.stage === "closed_won")
    .slice(0, 4)
    .forEach((d) => {
      entries.push({
        id:          `dw_${d.id}`,
        type:        "deal_won",
        title:       `Deal won: ${d.title}`,
        description: `${d.clientName} · $${d.value.toLocaleString()}`,
        timestamp:   d.expectedClose,
        meta:        `$${d.value.toLocaleString()}`,
      });
    });

  // ── Deals lost ─────────────────────────────────────────────────────────────
  deals
    .filter((d) => d.stage === "closed_lost")
    .slice(0, 2)
    .forEach((d) => {
      entries.push({
        id:          `dl_${d.id}`,
        type:        "deal_lost",
        title:       `Deal lost: ${d.title}`,
        description: d.clientName,
        timestamp:   d.expectedClose,
      });
    });

  // Sort by most recent, cap at 10
  return entries
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min  = Math.floor(diff / 60_000);
  if (min < 2)  return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)  return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30)   return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}
