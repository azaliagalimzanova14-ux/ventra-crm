import type { Activity } from "./types";
import { getClients, getProjects, getTasks, getDeals, getActivityLog } from "./storage";

/**
 * Returns the activity feed.
 * Real user actions (event log) come first, newest-first.
 * Derived snapshot events fill the rest up to 15 total.
 */
export function generateActivity(): Activity[] {
  const logged    = getActivityLog();                          // real actions, newest-first
  const loggedIds = new Set(logged.map((e) => e.id));

  // ── Derived fallback events (from data snapshots) ──────────────────────────
  const clients  = getClients();
  const projects = getProjects();
  const tasks    = getTasks();
  const deals    = getDeals();
  const derived: Activity[] = [];

  [...clients].reverse().slice(0, 4).forEach((c) => {
    const id = `c_${c.id}`;
    if (!loggedIds.has(id)) derived.push({
      id, type: "client_added",
      title: `${c.name} added`,
      description: c.company,
      timestamp: c.joinedAt,
      avatar: c.avatar,
    });
  });

  [...projects].reverse().slice(0, 3).forEach((p) => {
    const id = `p_${p.id}`;
    if (!loggedIds.has(id)) derived.push({
      id, type: "project_created",
      title: `Project: ${p.name}`,
      description: `${p.clientName} · ${p.status.replace("_", " ")}`,
      timestamp: p.startDate,
    });
  });

  tasks.filter((t) => t.status === "done").slice(0, 3).forEach((t) => {
    const id = `t_${t.id}`;
    if (!loggedIds.has(id)) derived.push({
      id, type: "task_done",
      title: "Task completed",
      description: t.title,
      timestamp: t.dueDate,
    });
  });

  deals.filter((d) => d.stage === "closed_won").slice(0, 3).forEach((d) => {
    const id = `dw_${d.id}`;
    if (!loggedIds.has(id)) derived.push({
      id, type: "deal_won",
      title: `Deal won: ${d.title}`,
      description: `${d.clientName} · $${d.value.toLocaleString()}`,
      timestamp: d.expectedClose,
      meta: `$${d.value.toLocaleString()}`,
    });
  });

  deals.filter((d) => d.stage === "closed_lost").slice(0, 2).forEach((d) => {
    const id = `dl_${d.id}`;
    if (!loggedIds.has(id)) derived.push({
      id, type: "deal_lost",
      title: `Deal lost: ${d.title}`,
      description: d.clientName,
      timestamp: d.expectedClose,
    });
  });

  // Merge: real events first, then unique derived events, newest-first, cap 15
  return [...logged, ...derived]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 15);
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return "upcoming";
  const min = Math.floor(diff / 60_000);
  if (min < 1)  return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)  return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d === 1)  return "yesterday";
  if (d < 30)   return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}
