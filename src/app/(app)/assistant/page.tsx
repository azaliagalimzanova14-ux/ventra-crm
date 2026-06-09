"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { getClients, getProjects, getTasks } from "@/lib/storage";
import type { Client, Project, Task } from "@/lib/types";
import { useLanguage } from "@/context/language-context";
import {
  Sparkles, Send, User, RotateCcw, Copy, Check,
  ThumbsUp, ThumbsDown, Zap, ChevronRight,
  AlertTriangle, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface CRMData {
  clients: Client[];
  projects: Project[];
  tasks: Task[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86_400_000);
}

function overdueTasks(tasks: Task[]): Task[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < today && t.status !== "done" && t.status !== "cancelled"
  ).sort((a, b) => {
    const prio = ["urgent", "high", "medium", "low"];
    return prio.indexOf(a.priority) - prio.indexOf(b.priority);
  });
}

function priorityEmoji(p: string) {
  return p === "urgent" ? "🔴" : p === "high" ? "🟠" : p === "medium" ? "🟡" : "⚪";
}

function statusEmoji(s: string) {
  return s === "completed" ? "✅" : s === "in_progress" ? "🔵" : s === "review" ? "🟡" : s === "on_hold" ? "⏸️" : "📋";
}

// ─────────────────────────────────────────────────────────────────────────────
// Response generators — each returns Markdown-ish text with **bold** markers
// ─────────────────────────────────────────────────────────────────────────────

function genOverdue(lang: Lang, data: CRMData): string {
  const overdue = overdueTasks(data.tasks);
  if (lang === "ru") {
    if (!overdue.length) return "✅ Отличная работа — **просроченных задач нет**!\n\nВсе задачи выполняются в срок.";
    const list = overdue.map((t) => {
      const days = Math.abs(daysUntil(t.dueDate));
      return `${priorityEmoji(t.priority)} **${t.title}**\n   → ${t.projectName || "Без проекта"} · просрочено на **${days} дн.** · ${t.assignee || "не назначено"}`;
    }).join("\n\n");
    return `⚠️ Найдено **${overdue.length} просроченных задач**:\n\n${list}\n\n**Рекомендация:** начните с задач с наивысшим приоритетом и обновите статусы или договоритесь о новых сроках.`;
  } else {
    if (!overdue.length) return "✅ Great work — **no overdue tasks**!\n\nEverything is running on schedule.";
    const list = overdue.map((t) => {
      const days = Math.abs(daysUntil(t.dueDate));
      return `${priorityEmoji(t.priority)} **${t.title}**\n   → ${t.projectName || "No project"} · **${days}d overdue** · ${t.assignee || "unassigned"}`;
    }).join("\n\n");
    return `⚠️ Found **${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}**:\n\n${list}\n\n**Recommendation:** tackle highest-priority items first and update statuses or renegotiate deadlines.`;
  }
}

function genThisWeek(lang: Lang, data: CRMData): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
  const due = data.tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) <= in7 && t.status !== "done" && t.status !== "cancelled"
  ).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  if (lang === "ru") {
    if (!due.length) return "🎉 На этой неделе **нет задач с дедлайном**.\n\nХорошее время, чтобы разобраться с накопившимися задачами или запланировать следующий спринт.";
    const list = due.map((t) => {
      const d = daysUntil(t.dueDate);
      const when = d < 0 ? `просрочено ${Math.abs(d)} дн.` : d === 0 ? "сегодня!" : `через ${d} дн.`;
      return `${priorityEmoji(t.priority)} **${t.title}** — ${when}\n   → ${t.projectName || "Без проекта"} · ${t.status === "in_progress" ? "в работе" : "к выполнению"}`;
    }).join("\n\n");
    return `📅 **${due.length} задач** на этой неделе:\n\n${list}`;
  } else {
    if (!due.length) return "🎉 **No tasks due this week.**\n\nGood time to get ahead on backlog or plan your next sprint.";
    const list = due.map((t) => {
      const d = daysUntil(t.dueDate);
      const when = d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "today!" : `in ${d}d`;
      return `${priorityEmoji(t.priority)} **${t.title}** — ${when}\n   → ${t.projectName || "No project"} · ${t.status === "in_progress" ? "in progress" : "to do"}`;
    }).join("\n\n");
    return `📅 **${due.length} task${due.length > 1 ? "s" : ""}** due this week:\n\n${list}`;
  }
}

function genProjects(lang: Lang, data: CRMData): string {
  const { projects } = data;
  if (!projects.length) {
    return lang === "ru" ? "Проектов пока нет. Создайте первый проект на странице **Проекты**." : "No projects yet. Create your first one on the **Projects** page.";
  }
  const atRisk = projects.filter((p) => {
    const budgetRisk = p.budget > 0 && p.spent / p.budget > 0.85;
    const scheduleRisk = p.dueDate && daysUntil(p.dueDate) < 30 && p.progress < 70 && p.status !== "completed";
    return budgetRisk || scheduleRisk;
  });

  if (lang === "ru") {
    const list = projects.map((p) => {
      const budgetPct = p.budget > 0 ? Math.round((p.spent / p.budget) * 100) : 0;
      const risk = p.budget > 0 && p.spent / p.budget > 0.85 ? " ⚠️" : "";
      return `${statusEmoji(p.status)} **${p.name}** (${p.clientName})${risk}\n   → Прогресс: **${p.progress}%** · Бюджет: **${budgetPct}%** использовано · Дедлайн: ${p.dueDate || "не задан"}`;
    }).join("\n\n");
    const warn = atRisk.length ? `\n\n⚠️ **${atRisk.length} проект(а) под риском** — ${atRisk.map((p) => p.name).join(", ")}. Рекомендую проверить бюджеты и сроки.` : "\n\n✅ Все проекты в рамках бюджета и сроков.";
    return `📋 Обзор **${projects.length} проектов**:\n\n${list}${warn}`;
  } else {
    const list = projects.map((p) => {
      const budgetPct = p.budget > 0 ? Math.round((p.spent / p.budget) * 100) : 0;
      const risk = p.budget > 0 && p.spent / p.budget > 0.85 ? " ⚠️" : "";
      return `${statusEmoji(p.status)} **${p.name}** (${p.clientName})${risk}\n   → Progress: **${p.progress}%** · Budget: **${budgetPct}%** used · Due: ${p.dueDate || "not set"}`;
    }).join("\n\n");
    const warn = atRisk.length ? `\n\n⚠️ **${atRisk.length} project${atRisk.length > 1 ? "s" : ""} at risk** — ${atRisk.map((p) => p.name).join(", ")}. Recommend reviewing budgets and timelines.` : "\n\n✅ All projects are on track.";
    return `📋 Overview of **${projects.length} project${projects.length > 1 ? "s" : ""}**:\n\n${list}${warn}`;
  }
}

function genBudget(lang: Lang, data: CRMData): string {
  const { projects } = data;
  const withBudget = projects.filter((p) => p.budget > 0).sort((a, b) => (b.spent / b.budget) - (a.spent / a.budget));
  if (!withBudget.length) {
    return lang === "ru" ? "Нет проектов с заданным бюджетом." : "No projects with a budget set.";
  }
  if (lang === "ru") {
    const list = withBudget.map((p) => {
      const pct = Math.round((p.spent / p.budget) * 100);
      const flag = pct >= 95 ? "🔴 Критично" : pct >= 85 ? "⚠️ Риск" : "✅ В норме";
      return `**${p.name}** — ${flag}\n   → $${p.spent.toLocaleString()} из $${p.budget.toLocaleString()} (${pct}%) · Остаток: $${Math.max(0, p.budget - p.spent).toLocaleString()}`;
    }).join("\n\n");
    const totalBudget = withBudget.reduce((s, p) => s + p.budget, 0);
    const totalSpent  = withBudget.reduce((s, p) => s + p.spent, 0);
    return `💰 **Анализ бюджета** (${withBudget.length} проектов):\n\n${list}\n\n**Итого:** $${totalSpent.toLocaleString()} из $${totalBudget.toLocaleString()} потрачено (${Math.round(totalSpent / totalBudget * 100)}%)`;
  } else {
    const list = withBudget.map((p) => {
      const pct = Math.round((p.spent / p.budget) * 100);
      const flag = pct >= 95 ? "🔴 Critical" : pct >= 85 ? "⚠️ At risk" : "✅ On track";
      return `**${p.name}** — ${flag}\n   → $${p.spent.toLocaleString()} of $${p.budget.toLocaleString()} (${pct}%) · Remaining: $${Math.max(0, p.budget - p.spent).toLocaleString()}`;
    }).join("\n\n");
    const totalBudget = withBudget.reduce((s, p) => s + p.budget, 0);
    const totalSpent  = withBudget.reduce((s, p) => s + p.spent, 0);
    return `💰 **Budget analysis** (${withBudget.length} project${withBudget.length > 1 ? "s" : ""}):\n\n${list}\n\n**Total:** $${totalSpent.toLocaleString()} of $${totalBudget.toLocaleString()} spent (${Math.round(totalSpent / totalBudget * 100)}%)`;
  }
}

function genClients(lang: Lang, data: CRMData): string {
  const { clients, projects } = data;
  if (!clients.length) {
    return lang === "ru" ? "Клиентов пока нет. Добавьте первого на странице **Клиенты**." : "No clients yet. Add your first on the **Clients** page.";
  }
  const active   = clients.filter((c) => c.status === "active").length;
  const leads    = clients.filter((c) => c.status === "lead").length;
  const inactive = clients.filter((c) => c.status === "inactive" || c.status === "churned").length;
  const top3     = [...clients].filter((c) => c.totalValue > 0).sort((a, b) => b.totalValue - a.totalValue).slice(0, 3);
  const totalVal = clients.reduce((s, c) => s + c.totalValue, 0);

  const today30 = new Date(); today30.setDate(today30.getDate() - 30);
  const recentlyContacted = clients.filter((c) => c.lastContact && new Date(c.lastContact) >= today30).length;

  if (lang === "ru") {
    const topList = top3.map((c, i) => `${i + 1}. **${c.name}** (${c.company}) — $${c.totalValue.toLocaleString()}`).join("\n");
    const projMap = clients.map((c) => {
      const cp = projects.filter((p) => p.clientId === c.id || p.clientName === c.company);
      return cp.length ? `· ${c.name}: ${cp.length} проект(ов)` : null;
    }).filter(Boolean).slice(0, 4).join("\n");
    return `👥 **Сводка по клиентам** (${clients.length} всего):\n\n**По статусам:** ${active} активных · ${leads} лидов · ${inactive} неактивных\n**Контакты за 30 дней:** ${recentlyContacted} клиентов\n**Общая стоимость:** $${totalVal.toLocaleString()}\n\n🏆 **Топ клиенты:**\n${topList}${projMap ? `\n\n📋 **Проекты по клиентам:**\n${projMap}` : ""}`;
  } else {
    const topList = top3.map((c, i) => `${i + 1}. **${c.name}** (${c.company}) — $${c.totalValue.toLocaleString()}`).join("\n");
    const projMap = clients.map((c) => {
      const cp = projects.filter((p) => p.clientId === c.id || p.clientName === c.company);
      return cp.length ? `· ${c.name}: ${cp.length} project(s)` : null;
    }).filter(Boolean).slice(0, 4).join("\n");
    return `👥 **Client summary** (${clients.length} total):\n\n**By status:** ${active} active · ${leads} leads · ${inactive} inactive\n**Contacted in 30 days:** ${recentlyContacted} clients\n**Total value:** $${totalVal.toLocaleString()}\n\n🏆 **Top clients:**\n${topList}${projMap ? `\n\n📋 **Projects by client:**\n${projMap}` : ""}`;
  }
}

function genPriority(lang: Lang, data: CRMData): string {
  const { clients, projects, tasks } = data;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const actions: { urgency: number; text: string }[] = [];

  // Overdue tasks
  const overdue = overdueTasks(tasks);
  if (overdue.length) {
    if (lang === "ru") {
      actions.push({ urgency: 10, text: `🔴 **Разобраться с ${overdue.length} просроченными задачами** — начните с "${overdue[0].title}"` });
    } else {
      actions.push({ urgency: 10, text: `🔴 **Address ${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}** — start with "${overdue[0].title}"` });
    }
  }

  // Urgent tasks not yet done
  const urgentPending = tasks.filter((t) => t.priority === "urgent" && t.status !== "done" && t.status !== "cancelled");
  urgentPending.forEach((t) => {
    if (lang === "ru") {
      actions.push({ urgency: 9, text: `🟠 **Срочная задача: "${t.title}"** (${t.projectName || "без проекта"})` });
    } else {
      actions.push({ urgency: 9, text: `🟠 **Urgent task: "${t.title}"** (${t.projectName || "no project"})` });
    }
  });

  // Projects over budget
  const overBudget = projects.filter((p) => p.budget > 0 && p.spent / p.budget > 0.85 && p.status !== "completed");
  overBudget.forEach((p) => {
    const pct = Math.round(p.spent / p.budget * 100);
    if (lang === "ru") {
      actions.push({ urgency: 8, text: `💰 **Бюджет "${p.name}" использован на ${pct}%** — обсудите риск с ${p.clientName}` });
    } else {
      actions.push({ urgency: 8, text: `💰 **"${p.name}" is ${pct}% through budget** — flag risk with ${p.clientName}` });
    }
  });

  // Tasks due in 2 days
  const dueSoon = tasks.filter((t) => {
    if (!t.dueDate || t.status === "done" || t.status === "cancelled") return false;
    const d = daysUntil(t.dueDate);
    return d >= 0 && d <= 2;
  });
  dueSoon.forEach((t) => {
    const d = daysUntil(t.dueDate);
    if (lang === "ru") {
      actions.push({ urgency: 7, text: `🗓️ **"${t.title}"** — дедлайн ${d === 0 ? "сегодня" : `через ${d} дн.`}` });
    } else {
      actions.push({ urgency: 7, text: `🗓️ **"${t.title}"** — due ${d === 0 ? "today" : `in ${d}d`}` });
    }
  });

  // Clients with no recent contact (>30 days)
  const stale = clients.filter((c) => {
    if (!c.lastContact || c.status !== "active") return false;
    return daysUntil(c.lastContact) < -30;
  });
  if (stale.length) {
    if (lang === "ru") {
      actions.push({ urgency: 5, text: `📞 **Связаться с клиентами: ${stale.map((c) => c.name).slice(0, 3).join(", ")}** — последний контакт более 30 дней назад` });
    } else {
      actions.push({ urgency: 5, text: `📞 **Follow up with: ${stale.map((c) => c.name).slice(0, 3).join(", ")}** — no contact in 30+ days` });
    }
  }

  const sorted = actions.sort((a, b) => b.urgency - a.urgency).slice(0, 6);

  if (!sorted.length) {
    return lang === "ru"
      ? "✅ Всё выглядит хорошо! Нет срочных задач, просроченных дедлайнов или рисков по бюджету.\n\nХорошее время, чтобы поработать над долгосрочными целями или обновить контакты с клиентами."
      : "✅ Everything looks good! No urgent tasks, overdue deadlines, or budget risks.\n\nGreat time to work on long-term goals or touch base with clients.";
  }

  const header = lang === "ru" ? `🎯 **Топ приоритетов прямо сейчас** (${sorted.length} действий):\n\n` : `🎯 **Top priorities right now** (${sorted.length} action${sorted.length > 1 ? "s" : ""}):\n\n`;
  return header + sorted.map((a, i) => `${i + 1}. ${a.text}`).join("\n\n");
}

function genSummary(lang: Lang, data: CRMData): string {
  const { clients, projects, tasks } = data;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const activeClients  = clients.filter((c) => c.status === "active").length;
  const activeProjects = projects.filter((p) => p.status === "in_progress" || p.status === "review").length;
  const doneTasks      = tasks.filter((t) => t.status === "done").length;
  const overdue        = overdueTasks(tasks).length;
  const totalBudget    = projects.reduce((s, p) => s + p.budget, 0);

  if (lang === "ru") {
    return `📊 **Сводка по вашей CRM:**\n\n👥 **Клиенты:** ${clients.length} всего · ${activeClients} активных\n📋 **Проекты:** ${projects.length} всего · ${activeProjects} в работе\n✅ **Задачи:** ${tasks.length} всего · ${doneTasks} выполнено · ${overdue > 0 ? `⚠️ ${overdue} просрочено` : "0 просрочено"}\n💰 **Общий бюджет:** $${totalBudget.toLocaleString()}\n\nЧто хотите разобрать подробнее? Могу проанализировать:\n· **просроченные задачи** → «Какие задачи просрочены?»\n· **проекты под риском** → «Анализ проектов»\n· **приоритеты дня** → «На чём мне сосредоточиться?»`;
  } else {
    return `📊 **Your CRM snapshot:**\n\n👥 **Clients:** ${clients.length} total · ${activeClients} active\n📋 **Projects:** ${projects.length} total · ${activeProjects} in progress\n✅ **Tasks:** ${tasks.length} total · ${doneTasks} done · ${overdue > 0 ? `⚠️ ${overdue} overdue` : "0 overdue"}\n💰 **Total budget:** $${totalBudget.toLocaleString()}\n\nWhat would you like to explore? I can analyse:\n· **overdue tasks** → "What tasks are overdue?"\n· **at-risk projects** → "Analyse projects"\n· **today's priorities** → "What should I focus on?"`;
  }
}

// Static mock for pipeline (no deal data in localStorage yet)
const PIPELINE_MOCK: Record<Lang, string> = {
  ru: `📈 **Воронка сделок** (тестовые данные):\n\n1. 🟡 **Analytics Suite — SkyBridge Ventures** · $68K · 80% вероятность · закрытие 30 июня\n   → В переговорах 12 дней — позвоните на этой неделе.\n\n2. 🔵 **Миграция платформы — Apex Digital** · $42K · 65% · закрытие 1 июля\n   → Предложение отправлено, ожидайте ответа до пятницы.\n\n3. 🟣 **Корпоративная лицензия — Ironclad Systems** · $85K · 40% · закрытие 15 авг\n   → Запланируйте звонок для перехода к следующему этапу.\n\n**Взвешенная стоимость: ~$134K** · Ваш CR 62% выше среднего (47%)`,
  en: `📈 **Deal pipeline** (mock data):\n\n1. 🟡 **Analytics Suite — SkyBridge Ventures** · $68K · 80% probability · Closes June 30\n   → In negotiation 12 days — recommend a call this week.\n\n2. 🔵 **Platform Migration — Apex Digital** · $42K · 65% · Closes July 1\n   → Proposal sent, follow up by Friday if no response.\n\n3. 🟣 **Enterprise License — Ironclad Systems** · $85K · 40% · Closes Aug 15\n   → Schedule a discovery call to advance.\n\n**Weighted value: ~$134K** · Your close rate 62% beats industry avg of 47%`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Intent router
// ─────────────────────────────────────────────────────────────────────────────

function generateResponse(input: string, lang: Lang, data: CRMData): string {
  const q = input.toLowerCase();
  const is = (patterns: RegExp) => patterns.test(q);

  if (is(/overdue|просроч|опоздал|late\b|delay/))                          return genOverdue(lang, data);
  if (is(/this week|эт[уо][йю]? недел|week|неделя|due soon|ближайш/))      return genThisWeek(lang, data);
  if (is(/budget|бюджет|over.?budget|превыш|spend|потрачен/))               return genBudget(lang, data);
  if (is(/project|проект|progress|прогресс|behind|status/))                 return genProjects(lang, data);
  if (is(/client|клиент|customer|заказчик|contact|активн/))                 return genClients(lang, data);
  if (is(/focus|приоритет|priority|фокус|what should|с чего|help me|помоги|today/)) return genPriority(lang, data);
  if (is(/pipeline|воронка|deal|сделк/))                                    return PIPELINE_MOCK[lang];
  return genSummary(lang, data);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suggested prompts
// ─────────────────────────────────────────────────────────────────────────────

const PROMPTS: Record<Lang, { icon: string; label: string; category: string }[]> = {
  ru: [
    { icon: "🎯", label: "На чём мне сосредоточиться сегодня?",    category: "Приоритеты" },
    { icon: "⚠️", label: "Какие задачи просрочены?",               category: "Задачи" },
    { icon: "📋", label: "Анализ всех проектов",                    category: "Проекты" },
    { icon: "💰", label: "Какие проекты превышают бюджет?",         category: "Бюджет" },
    { icon: "🗓️", label: "Что нужно сделать на этой неделе?",      category: "Дедлайны" },
    { icon: "👥", label: "Сводка по активности клиентов",           category: "Клиенты" },
  ],
  en: [
    { icon: "🎯", label: "What should I focus on today?",           category: "Priorities" },
    { icon: "⚠️", label: "Which tasks are overdue?",                category: "Tasks" },
    { icon: "📋", label: "Analyse all projects",                    category: "Projects" },
    { icon: "💰", label: "Which projects are over budget?",         category: "Budget" },
    { icon: "🗓️", label: "What's due this week?",                  category: "Deadlines" },
    { icon: "👥", label: "Summarise client activity",               category: "Clients" },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Message renderer — handles **bold** and newlines
// ─────────────────────────────────────────────────────────────────────────────

function AssistantMessage({ content }: { content: string }) {
  return (
    <div className="text-[13px] text-[#c8c8e8] leading-relaxed whitespace-pre-wrap">
      {content.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
        part.startsWith("**") && part.endsWith("**")
          ? <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AssistantPage() {
  const { lang, t } = useLanguage();

  // CRM data
  const [clients,  setClients]  = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks,    setTasks]    = useState<Task[]>([]);

  useEffect(() => {
    setClients(getClients());
    setProjects(getProjects());
    setTasks(getTasks());
  }, []);

  // Derived context stats
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdueCount = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < today && t.status !== "done" && t.status !== "cancelled"
  ).length;

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const buildGreeting = useCallback((l: Lang): Message => ({
    id: "init",
    role: "assistant",
    content: l === "ru"
      ? `Привет! Я **Ventra ИИ** — ваш ассистент CRM, который анализирует реальные данные.\n\nПрямо сейчас у вас: **${clients.length} клиентов**, **${projects.length} проектов**, **${tasks.length} задач**${overdueCount > 0 ? ` и ⚠️ **${overdueCount} просроченных задач**` : ""}.\n\nСпросите меня о приоритетах дня, просроченных задачах, статусе проектов или активности клиентов.`
      : `Hi! I'm **Ventra AI**, your CRM assistant analysing your live data.\n\nRight now you have: **${clients.length} client${clients.length !== 1 ? "s" : ""}**, **${projects.length} project${projects.length !== 1 ? "s" : ""}**, **${tasks.length} task${tasks.length !== 1 ? "s" : ""}**${overdueCount > 0 ? ` and ⚠️ **${overdueCount} overdue**` : ""}.\n\nAsk me about today's priorities, overdue tasks, project status, or client activity.`,
    timestamp: "now",
  }), [clients.length, projects.length, tasks.length, overdueCount]);

  // Reset on language switch
  useEffect(() => {
    setMessages([buildGreeting(lang)]);
  }, [lang, buildGreeting]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Send message
  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // Simulate thinking delay (800–1600ms)
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 800));

    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: generateResponse(text, lang, { clients, projects, tasks }),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, aiMsg]);
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const copyMessage = (id: string, content: string) => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const resetChat = () => setMessages([buildGreeting(lang)]);

  const prompts = PROMPTS[lang];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title={t("assistant_title")} subtitle={t("assistant_subtitle")} />

      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <div className="w-60 border-r border-[#1c1c35] bg-[#0d0d1c] flex flex-col p-4 gap-4 overflow-y-auto flex-shrink-0">
          <div>
            <p className="text-[11px] font-medium text-[#5a5a8a] uppercase tracking-wider mb-2">
              {t("assistant_quick")}
            </p>
            <div className="space-y-1">
              {prompts.map((p) => (
                <button
                  key={p.label}
                  onClick={() => sendMessage(p.label)}
                  disabled={loading}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left hover:bg-white/5 transition-colors group disabled:opacity-50"
                >
                  <span className="text-[14px] flex-shrink-0 mt-0.5">{p.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[12px] text-[#8080a8] group-hover:text-[#e0e0f0] leading-snug">{p.label}</p>
                    <span className="text-[10px] text-indigo-400/60 font-medium">{p.category}</span>
                  </div>
                  <ChevronRight size={12} className="ml-auto text-[#5a5a8a] opacity-0 group-hover:opacity-100 flex-shrink-0 mt-1" />
                </button>
              ))}
            </div>
          </div>

          {/* Live context panel */}
          <div className="mt-auto">
            <div className="bg-linear-to-br from-indigo-500/10 to-violet-500/10 border border-indigo-500/20 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={13} className="text-indigo-400" />
                <p className="text-[11px] font-semibold text-indigo-300">{t("assistant_ctx")}</p>
              </div>
              <div className="space-y-1.5">
                {[
                  { count: clients.length,  label: t("assistant_ctx_clients"), icon: "👥" },
                  { count: projects.length, label: t("assistant_ctx_proj"),    icon: "📋" },
                  { count: tasks.length,    label: t("assistant_ctx_tasks"),   icon: "✅" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-1.5 text-[11px]">
                    <span>{row.icon}</span>
                    <span className="font-semibold text-white">{row.count}</span>
                    <span className="text-[#5a5a8a]">{row.label}</span>
                  </div>
                ))}
                {overdueCount > 0 && (
                  <div className="flex items-center gap-1.5 text-[11px] mt-2 pt-2 border-t border-indigo-500/20">
                    <AlertTriangle size={11} className="text-red-400" />
                    <span className="font-semibold text-red-400">{overdueCount}</span>
                    <span className="text-red-400/70">{t("assistant_ctx_overdue")}</span>
                  </div>
                )}
                {overdueCount === 0 && tasks.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[11px] mt-2 pt-2 border-t border-indigo-500/20">
                    <TrendingUp size={11} className="text-emerald-400" />
                    <span className="text-emerald-400/80">All on track</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Chat area ───────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {messages.map((msg) => (
              <div key={msg.id} className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                {/* Avatar */}
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                  msg.role === "assistant"
                    ? "bg-linear-to-br from-indigo-500 to-violet-600"
                    : "bg-[#1c1c35] border border-[#252545]"
                )}>
                  {msg.role === "assistant"
                    ? <Sparkles size={14} className="text-white" />
                    : <User size={14} className="text-[#8080a8]" />}
                </div>

                {/* Bubble */}
                <div className={cn("max-w-[78%] flex flex-col gap-1.5", msg.role === "user" ? "items-end" : "items-start")}>
                  <div className={cn(
                    "rounded-2xl px-4 py-3",
                    msg.role === "assistant"
                      ? "bg-[#111128] border border-[#1c1c35] rounded-tl-sm"
                      : "bg-indigo-600 rounded-tr-sm"
                  )}>
                    {msg.role === "assistant"
                      ? <AssistantMessage content={msg.content} />
                      : <p className="text-[13px] text-white">{msg.content}</p>}
                  </div>

                  {/* Action row */}
                  {msg.role === "assistant" && (
                    <div className="flex items-center gap-0.5 pl-1">
                      <span className="text-[10px] text-[#3a3a5a] mr-1.5">{msg.timestamp}</span>
                      <button
                        onClick={() => copyMessage(msg.id, msg.content)}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-[#5a5a8a] hover:text-[#8080a8] transition-colors"
                        title={t("assistant_copied")}
                      >
                        {copiedId === msg.id
                          ? <Check size={12} className="text-emerald-400" />
                          : <Copy size={12} />}
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-white/5 text-[#5a5a8a] hover:text-emerald-400 transition-colors">
                        <ThumbsUp size={12} />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-white/5 text-[#5a5a8a] hover:text-red-400 transition-colors">
                        <ThumbsDown size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Thinking indicator */}
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
                  <Sparkles size={14} className="text-white" />
                </div>
                <div className="bg-[#111128] border border-[#1c1c35] rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1 items-center h-5">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* ── Input ──────────────────────────────────────────────────────── */}
          <div className="border-t border-[#1c1c35] p-4 bg-[#07070f] flex-shrink-0">
            <div className="flex items-end gap-3 bg-[#111128] border border-[#1c1c35] rounded-xl px-4 py-3 focus-within:border-indigo-500/50 transition-colors">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("assistant_ph")}
                rows={1}
                className="flex-1 bg-transparent text-[13px] text-[#e0e0f0] placeholder-[#5a5a8a] resize-none focus:outline-none leading-relaxed max-h-32"
              />
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={resetChat}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-[#5a5a8a] hover:text-white transition-colors"
                  title={t("assistant_reset")}
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
            <p className="text-[10px] text-[#5a5a8a] text-center mt-2">{t("assistant_hint")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
