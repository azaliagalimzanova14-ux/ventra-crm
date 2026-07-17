import type { Client, Task, Deal } from "./types";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type NotifKind     = "danger" | "warning" | "opportunity" | "action" | "ok";
export type NotifCategory = "task" | "deal" | "client" | "lead" | "ai";
export type NotifPriority = "urgent" | "high" | "medium" | "low";

export interface Notification {
  id:        string;
  kind:      NotifKind;
  category:  NotifCategory;
  priority:  NotifPriority;
  title:     string;
  body:      string;
  href:      string;
  entityId?: string;
  createdAt: string; // ISO string — used for "time ago" display
  read:      boolean;
}

// ─── Priority sort order ──────────────────────────────────────────────────────

export const PRIO_ORDER: NotifPriority[] = ["urgent", "high", "medium", "low"];

// ─── Storage ──────────────────────────────────────────────────────────────────

const READ_KEY  = "ventra_notifications_read";
const COUNT_KEY = "ventra_notif_unread_count";

export function getReadIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(READ_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markRead(id: string): void {
  if (typeof window === "undefined") return;
  const ids = getReadIds();
  ids.add(id);
  localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
}

export function markAllRead(ids: string[]): void {
  if (typeof window === "undefined") return;
  const existing = getReadIds();
  ids.forEach((id) => existing.add(id));
  localStorage.setItem(READ_KEY, JSON.stringify([...existing]));
}

export function getStoredUnreadCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    return parseInt(localStorage.getItem(COUNT_KEY) ?? "0", 10);
  } catch {
    return 0;
  }
}

function syncCount(count: number): void {
  if (typeof window !== "undefined")
    localStorage.setItem(COUNT_KEY, String(count));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

// ─── Generator ────────────────────────────────────────────────────────────────
//
// IDs are deterministic (entity-id based) so read state survives re-generation.

export function generateNotifications(
  clients: Client[],
  tasks:   Task[],
  deals:   Deal[],
): Notification[] {
  const now     = new Date();
  const today   = now.toISOString().split("T")[0];
  const readIds = getReadIds();
  const raw: Omit<Notification, "read">[] = [];

  // ── 1. Overdue tasks ──────────────────────────────────────────────────────
  tasks
    .filter(
      (t) =>
        t.dueDate &&
        new Date(t.dueDate) < now &&
        t.status !== "done" &&
        t.status !== "cancelled",
    )
    .forEach((t) => {
      const late = daysAgo(t.dueDate);
      raw.push({
        id:        `notif-task-overdue-${t.id}`,
        kind:      "danger",
        category:  "task",
        priority:  t.priority === "urgent" ? "urgent" : "high",
        title:     `Overdue: ${t.title}`,
        body:      `${late}d overdue${t.clientName ? ` · ${t.clientName}` : ""}${t.projectName ? ` · ${t.projectName}` : ""}`,
        href:      "/tasks",
        entityId:  t.id,
        createdAt: t.dueDate,
      });
    });

  // ── 2. Tasks due today ────────────────────────────────────────────────────
  tasks
    .filter(
      (t) =>
        t.dueDate?.startsWith(today) &&
        t.status !== "done" &&
        t.status !== "cancelled",
    )
    .forEach((t) => {
      raw.push({
        id:        `notif-task-today-${t.id}`,
        kind:      "action",
        category:  "task",
        priority:  t.priority === "urgent" ? "urgent" : "medium",
        title:     `Due today: ${t.title}`,
        body:      `${t.priority} priority${t.clientName ? ` · ${t.clientName}` : ""}`,
        href:      "/tasks",
        entityId:  t.id,
        createdAt: today,
      });
    });

  // ── 3. Deals closing within 7 days ───────────────────────────────────────
  deals
    .filter((d) => {
      if (d.stage === "closed_won" || d.stage === "closed_lost") return false;
      const left = daysUntil(d.expectedClose);
      return left >= 0 && left <= 7;
    })
    .forEach((d) => {
      const left = daysUntil(d.expectedClose);
      raw.push({
        id:        `notif-deal-closing-${d.id}`,
        kind:      "opportunity",
        category:  "deal",
        priority:  left <= 2 ? "urgent" : "high",
        title:     `Closing soon: ${d.title}`,
        body:      `${fmt$(d.value)} · closes in ${left}d · ${d.clientName}`,
        href:      "/pipeline",
        entityId:  d.id,
        createdAt: d.expectedClose,
      });
    });

  // ── 4. Deals past close date (at risk) ───────────────────────────────────
  deals
    .filter((d) => {
      if (d.stage === "closed_won" || d.stage === "closed_lost") return false;
      return new Date(d.expectedClose) < now;
    })
    .forEach((d) => {
      const late = daysAgo(d.expectedClose);
      raw.push({
        id:        `notif-deal-risk-${d.id}`,
        kind:      "warning",
        category:  "deal",
        priority:  "high",
        title:     `Deal at risk: ${d.title}`,
        body:      `${fmt$(d.value)} · ${late}d past expected close · ${d.clientName}`,
        href:      "/pipeline",
        entityId:  d.id,
        createdAt: d.expectedClose,
      });
    });

  // ── 5. Clients needing follow-up (14+ days silent) ───────────────────────
  clients
    .filter((c) => {
      if (c.status === "churned") return false;
      if (!c.lastContact)         return false;
      return daysAgo(c.lastContact) >= 14;
    })
    .forEach((c) => {
      const ago = daysAgo(c.lastContact);
      raw.push({
        id:        `notif-client-followup-${c.id}`,
        kind:      "warning",
        category:  "client",
        priority:  ago >= 30 ? "high" : "medium",
        title:     `Follow up with ${c.name}`,
        body:      `${c.company} · no contact in ${ago}d${c.industry ? ` · ${c.industry}` : ""}`,
        href:      "/clients",
        entityId:  c.id,
        createdAt: c.lastContact,
      });
    });

  // ── 6. New leads ──────────────────────────────────────────────────────────
  clients
    .filter((c) => c.status === "lead")
    .forEach((c) => {
      raw.push({
        id:        `notif-lead-${c.id}`,
        kind:      "opportunity",
        category:  "lead",
        priority:  "medium",
        title:     `New lead: ${c.name}`,
        body:      `${c.company}${c.industry ? ` · ${c.industry}` : ""}`,
        href:      "/clients",
        entityId:  c.id,
        createdAt: c.joinedAt,
      });
    });

  // ── 7. AI: Push top negotiation deal to close ─────────────────────────────
  const topNeg = deals
    .filter((d) => d.stage === "negotiation")
    .sort((a, b) => b.value - a.value)[0];
  if (topNeg) {
    raw.push({
      id:        `notif-ai-negotiation-${topNeg.id}`,
      kind:      "action",
      category:  "ai",
      priority:  "high",
      title:     `AI: Push "${topNeg.title}" to close`,
      body:      `${fmt$(topNeg.value)} in negotiation — schedule a call or offer a concession`,
      href:      "/pipeline",
      entityId:  topNeg.id,
      createdAt: now.toISOString(),
    });
  }

  // ── 8. AI: Re-engage highest-value churned client ─────────────────────────
  const topChurned = clients
    .filter((c) => c.status === "churned" && c.totalValue > 10_000)
    .sort((a, b) => b.totalValue - a.totalValue)[0];
  if (topChurned) {
    raw.push({
      id:        `notif-ai-churn-${topChurned.id}`,
      kind:      "opportunity",
      category:  "ai",
      priority:  "medium",
      title:     `AI: Re-engage ${topChurned.name}`,
      body:      `Previously worth ${fmt$(topChurned.totalValue)} — a win-back email could revive this`,
      href:      "/clients",
      entityId:  topChurned.id,
      createdAt: now.toISOString(),
    });
  }

  // ── 9. AI: Upsell — top active client with no open deal ───────────────────
  const upsellTarget = clients
    .filter(
      (c) =>
        c.status === "active" &&
        !deals.some(
          (d) =>
            d.clientName === c.name &&
            d.stage !== "closed_won" &&
            d.stage !== "closed_lost",
        ),
    )
    .sort((a, b) => b.totalValue - a.totalValue)[0];
  if (upsellTarget) {
    raw.push({
      id:        `notif-ai-upsell-${upsellTarget.id}`,
      kind:      "opportunity",
      category:  "ai",
      priority:  "low",
      title:     `AI: Upsell opportunity — ${upsellTarget.name}`,
      body:      `${upsellTarget.company} has no active deal — ideal time to pitch a new project`,
      href:      "/pipeline",
      entityId:  upsellTarget.id,
      createdAt: now.toISOString(),
    });
  }

  // ── Sort: unread first, then by priority ──────────────────────────────────
  const all: Notification[] = raw
    .map((n) => ({ ...n, read: readIds.has(n.id) }))
    .sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      return PRIO_ORDER.indexOf(a.priority) - PRIO_ORDER.indexOf(b.priority);
    });

  syncCount(all.filter((n) => !n.read).length);
  return all;
}
