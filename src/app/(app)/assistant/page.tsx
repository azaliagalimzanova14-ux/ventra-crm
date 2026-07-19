"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { TopBar }      from "@/components/layout/top-bar";
import { TaskModal }   from "@/components/tasks/task-modal";
import { getClients, getProjects, getTasks, getDeals, saveTasks, logActivity } from "@/lib/storage";
import type { Client, Project, Task, Deal } from "@/lib/types";
import { useTheme }          from "@/context/theme-context";
import { OpportunityDetection } from "@/components/rie/OpportunityDetection";
import { FounderMemory }        from "@/components/memory/FounderMemory";
import {
  Sparkles, Send, User, RotateCcw, Copy, Check,
  ThumbsUp, ThumbsDown, ChevronRight,
  AlertTriangle, TrendingUp, Users, CheckSquare,
  Mail, Zap, MessageSquare, Clock,
  ArrowRight, Calendar, BarChart2, Phone,
  DollarSign, Brain, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface CRMData {
  clients:  Client[];
  projects: Project[];
  tasks:    Task[];
  deals:    Deal[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86_400_000);
}

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function overdueTasks(tasks: Task[]): Task[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return tasks
    .filter((t) => t.dueDate && new Date(t.dueDate) < today && t.status !== "done" && t.status !== "cancelled")
    .sort((a, b) => ["urgent","high","medium","low"].indexOf(a.priority) - ["urgent","high","medium","low"].indexOf(b.priority));
}

function priorityEmoji(p: string) {
  return p === "urgent" ? "🔴" : p === "high" ? "🟠" : p === "medium" ? "🟡" : "⚪";
}

function statusEmoji(s: string) {
  return s === "completed" ? "✅" : s === "in_progress" ? "🔵" : s === "review" ? "🟡" : "⏸️";
}

// ─── Response generators ────────────────────────────────────────────────────────

function genOverdue(data: CRMData): string {
  const overdue = overdueTasks(data.tasks);
  if (!overdue.length) return "✅ **No overdue tasks** — great work! Everything is running on schedule.";
  const list = overdue.map((t) => {
    const days = Math.abs(daysUntil(t.dueDate));
    return `${priorityEmoji(t.priority)} **${t.title}**\n   → ${t.projectName || "No project"} · **${days}d overdue**`;
  }).join("\n\n");
  return `⚠️ Found **${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}**:\n\n${list}\n\n**Recommendation:** tackle highest-priority items first and update deadlines where needed.`;
}

function genThisWeek(data: CRMData): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
  const due = data.tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) <= in7 && t.status !== "done" && t.status !== "cancelled"
  ).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  if (!due.length) return "🎉 **No tasks due this week.** Good time to get ahead on backlog or plan your next sprint.";
  const list = due.map((t) => {
    const d = daysUntil(t.dueDate);
    const when = d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "today!" : `in ${d}d`;
    return `${priorityEmoji(t.priority)} **${t.title}** — ${when}\n   → ${t.projectName || "No project"}`;
  }).join("\n\n");
  return `📅 **${due.length} task${due.length > 1 ? "s" : ""}** due this week:\n\n${list}`;
}

function genBudget(data: CRMData): string {
  const withBudget = data.projects.filter((p) => p.budget > 0).sort((a, b) => (b.spent / b.budget) - (a.spent / a.budget));
  if (!withBudget.length) return "No projects with a budget set. Add budgets on the Projects page to track spend.";
  const list = withBudget.map((p) => {
    const pct = Math.round((p.spent / p.budget) * 100);
    const flag = pct >= 95 ? "🔴 Critical" : pct >= 85 ? "⚠️ At risk" : "✅ On track";
    return `**${p.name}** — ${flag}\n   → ${fmt$(p.spent)} of ${fmt$(p.budget)} (${pct}%) · Remaining: ${fmt$(Math.max(0, p.budget - p.spent))}`;
  }).join("\n\n");
  const tb = withBudget.reduce((s, p) => s + p.budget, 0);
  const ts = withBudget.reduce((s, p) => s + p.spent, 0);
  return `💰 **Budget analysis** (${withBudget.length} project${withBudget.length > 1 ? "s" : ""}):\n\n${list}\n\n**Total:** ${fmt$(ts)} of ${fmt$(tb)} spent (${Math.round(ts / tb * 100)}%)`;
}

function genProjects(data: CRMData): string {
  const { projects } = data;
  if (!projects.length) return "No projects yet. Create your first on the **Projects** page.";
  const atRisk = projects.filter((p) => {
    const budgetRisk   = p.budget > 0 && p.spent / p.budget > 0.85;
    const scheduleRisk = p.dueDate && daysUntil(p.dueDate) < 30 && p.progress < 70 && p.status !== "completed";
    return budgetRisk || scheduleRisk;
  });
  const list = projects.map((p) => {
    const budgetPct = p.budget > 0 ? Math.round((p.spent / p.budget) * 100) : 0;
    const risk = p.budget > 0 && p.spent / p.budget > 0.85 ? " ⚠️" : "";
    return `${statusEmoji(p.status)} **${p.name}** (${p.clientName})${risk}\n   → Progress: **${p.progress}%** · Budget: **${budgetPct}%** used · Due: ${p.dueDate || "not set"}`;
  }).join("\n\n");
  const warn = atRisk.length
    ? `\n\n⚠️ **${atRisk.length} project${atRisk.length > 1 ? "s" : ""} at risk** — ${atRisk.map((p) => p.name).join(", ")}.`
    : "\n\n✅ All projects are on track.";
  return `📋 Overview of **${projects.length} project${projects.length > 1 ? "s" : ""}**:\n\n${list}${warn}`;
}

function genClients(data: CRMData): string {
  const { clients, projects } = data;
  if (!clients.length) return "No clients yet. Add your first on the **Clients** page.";
  const active   = clients.filter((c) => c.status === "active").length;
  const leads    = clients.filter((c) => c.status === "lead").length;
  const inactive = clients.filter((c) => c.status === "inactive" || c.status === "churned").length;
  const top3     = [...clients].filter((c) => c.totalValue > 0).sort((a, b) => b.totalValue - a.totalValue).slice(0, 3);
  const totalVal = clients.reduce((s, c) => s + c.totalValue, 0);
  const stale    = clients.filter((c) => c.status === "active" && c.lastContact && daysAgo(c.lastContact) >= 14);
  const topList  = top3.map((c, i) => `${i + 1}. **${c.name}** (${c.company}) — ${fmt$(c.totalValue)}`).join("\n");
  const projMap  = clients.map((c) => {
    const cp = projects.filter((p) => p.clientId === c.id || p.clientName === c.company);
    return cp.length ? `· ${c.name}: ${cp.length} project(s)` : null;
  }).filter(Boolean).slice(0, 4).join("\n");
  const followStr = stale.length ? `\n\n📞 **Follow-up needed:** ${stale.map((c) => c.name).slice(0, 3).join(", ")} (14+ days no contact)` : "";
  return `👥 **Client summary** (${clients.length} total):\n\n**By status:** ${active} active · ${leads} leads · ${inactive} inactive\n**Total value:** ${fmt$(totalVal)}\n\n🏆 **Top clients:**\n${topList}${projMap ? `\n\n📋 **Projects by client:**\n${projMap}` : ""}${followStr}`;
}

function genPipeline(data: CRMData): string {
  const { deals } = data;
  if (!deals.length) return "No deals yet. Add your first on the **Pipeline** page.";
  const now    = new Date();
  const active = deals.filter((d) => d.stage !== "closed_won" && d.stage !== "closed_lost");
  const won    = deals.filter((d) => d.stage === "closed_won");
  const stuck  = active.filter((d) => new Date(d.expectedClose) < now);
  const hot    = active.filter((d) => d.probability >= 70);
  const pipelineVal = active.reduce((s, d) => s + d.value, 0);
  const wonVal      = won.reduce((s, d) => s + d.value, 0);
  const stageOrder  = ["lead","qualified","proposal","negotiation"];
  const topDeals = [...active]
    .sort((a, b) => (b.probability * b.value) - (a.probability * a.value))
    .slice(0, 4)
    .map((d) => {
      const daysLeft = Math.ceil((new Date(d.expectedClose).getTime() - now.getTime()) / 86_400_000);
      const urgency  = daysLeft < 0 ? "⚠️ past due" : daysLeft <= 7 ? `⚡ ${daysLeft}d left` : `📅 ${daysLeft}d`;
      const stageIdx = stageOrder.indexOf(d.stage);
      const stageStr = stageIdx >= 0 ? ["Lead","Qualified","Proposal","Negotiation"][stageIdx] : d.stage;
      return `• **${d.title}** — ${stageStr} · ${fmt$(d.value)} · ${d.probability}% · ${urgency}`;
    }).join("\n");
  return `📈 **Deal pipeline:**\n\n**Active:** ${active.length} · Value: ${fmt$(pipelineVal)}\n**Closed (won):** ${won.length} · ${fmt$(wonVal)}\n${stuck.length ? `⚠️ **Stuck past close date:** ${stuck.length} deals\n` : ""}${hot.length ? `🔥 **High-probability (70%+):** ${hot.length} deals\n` : ""}\n**Top deals:**\n${topDeals}`;
}

function genDealsAtRisk(data: CRMData): string {
  const { deals } = data;
  const now = new Date();
  const atRisk = deals.filter((d) => {
    if (d.stage === "closed_won" || d.stage === "closed_lost") return false;
    return (new Date(d.expectedClose).getTime() - now.getTime()) / 86_400_000 < 7;
  }).sort((a, b) => new Date(a.expectedClose).getTime() - new Date(b.expectedClose).getTime());
  if (!atRisk.length) return "✅ No deals at risk right now. All within their expected timelines.";
  const list = atRisk.map((d) => {
    const days   = Math.ceil((new Date(d.expectedClose).getTime() - now.getTime()) / 86_400_000);
    const status = days < 0 ? `${Math.abs(days)}d past deadline` : days === 0 ? "closes today!" : `${days}d left`;
    return `⚠️ **${d.title}** (${d.clientName}) — ${fmt$(d.value)} · ${d.probability}%\n   → ${status}`;
  }).join("\n\n");
  return `🚨 **${atRisk.length} deal${atRisk.length > 1 ? "s" : ""} require${atRisk.length === 1 ? "s" : ""} attention:**\n\n${list}\n\n**Action:** open the pipeline to push forward or reassess these deals.`;
}

function genEmailDraft(data: CRMData, query: string): string {
  const { clients } = data;
  const match  = clients.find((c) =>
    query.toLowerCase().includes(c.name.toLowerCase().split(" ")[0]) ||
    query.toLowerCase().includes(c.company.toLowerCase().split(" ")[0])
  );
  const client = match ?? clients.filter((c) => c.status === "active").sort((a, b) => daysAgo(b.lastContact) - daysAgo(a.lastContact))[0];
  if (!client) return "Add clients first so I can draft a relevant email.";
  const days = client.lastContact ? daysAgo(client.lastContact) : null;
  return `✉️ **Email draft for ${client.name}** (${client.company}):\n\n---\n\n**Subject:** Checking in — ${days ? `it's been ${days} days` : "let's reconnect"}\n\nHi ${client.name.split(" ")[0]},\n\nHope things are going well on your end${days && days > 14 ? ` — it's been a while since we last connected` : ""}. I wanted to check in and see if there's anything new I can help with.\n\nIf it makes sense, I'd love to jump on a quick 15–20 min call this week to touch base and explore any upcoming needs.\n\nBest,\n\n---\n\nWant me to adjust the tone, add pricing details, or draft a different version?`;
}

function genClientSummary(data: CRMData, query: string): string {
  const { clients, projects, tasks, deals } = data;
  const match  = clients.find((c) =>
    query.toLowerCase().includes(c.name.toLowerCase().split(" ")[0]) ||
    query.toLowerCase().includes(c.company.toLowerCase().split(" ")[0])
  );
  const client = match ?? [...clients].filter((c) => c.status === "active").sort((a, b) => b.totalValue - a.totalValue)[0];
  if (!client) return "No clients yet.";
  const cp      = projects.filter((p) => p.clientId === client.id || p.clientName === client.company);
  const ct      = tasks.filter((t) => cp.some((p) => p.id === t.projectId));
  const cd      = deals.filter((d) => d.clientName === client.name || d.clientName === client.company);
  const overdue = ct.filter((t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done");
  const days    = client.lastContact ? daysAgo(client.lastContact) : null;
  return `👤 **${client.name}** · ${client.company}\n\n**Status:** ${client.status} · **Value:** ${fmt$(client.totalValue)}\n**Last contact:** ${days !== null ? `${days}d ago` : "no data"}\n\n**Projects:** ${cp.length} · **Tasks:** ${ct.length}${overdue.length ? ` · ⚠️ ${overdue.length} overdue` : ""}\n**Deals:** ${cd.length}${cd.length ? ` · ${fmt$(cd.reduce((s, d) => s + d.value, 0))} in pipeline` : ""}\n\n${days && days >= 14 ? "⚠️ **Time to reach out** — more than two weeks without contact." : "✅ Contact cadence looks good."}`;
}

function genFollowUp(data: CRMData): string {
  const stale = data.clients
    .filter((c) => c.status === "active" && c.lastContact)
    .sort((a, b) => daysAgo(b.lastContact) - daysAgo(a.lastContact))
    .slice(0, 5);
  if (!stale.length) return "✅ No clients urgently need follow-up right now.";
  const list = stale.map((c) => {
    const days = daysAgo(c.lastContact);
    const urg  = days >= 30 ? "🔴" : days >= 14 ? "🟠" : "🟡";
    return `${urg} **${c.name}** (${c.company}) — ${days}d no contact · ${c.totalValue ? fmt$(c.totalValue) : "no value data"}`;
  }).join("\n\n");
  return `📞 **Clients to follow up with** (prioritised by recency):\n\n${list}\n\n**Tip:** start with the highest-value clients who've been waiting longest.`;
}

function genPriority(data: CRMData): string {
  const { clients, projects, tasks, deals } = data;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const actions: { urgency: number; text: string }[] = [];

  const overdue = overdueTasks(tasks);
  if (overdue.length) actions.push({ urgency: 10, text: `🔴 **Address ${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}** — start with "${overdue[0].title}"` });

  const urgentPending = tasks.filter((t) => t.priority === "urgent" && t.status !== "done" && t.status !== "cancelled");
  urgentPending.slice(0, 2).forEach((t) => actions.push({ urgency: 9, text: `🟠 **Urgent task: "${t.title}"** (${t.projectName || "no project"})` }));

  const stuckDeals = deals.filter((d) => d.stage !== "closed_won" && d.stage !== "closed_lost" && new Date(d.expectedClose) < now);
  if (stuckDeals.length) actions.push({ urgency: 9, text: `💼 **${stuckDeals.length} deal${stuckDeals.length > 1 ? "s" : ""} past close date** — "${stuckDeals[0].title}" · ${fmt$(stuckDeals[0].value)}` });

  projects.filter((p) => p.budget > 0 && p.spent / p.budget > 0.85 && p.status !== "completed")
    .forEach((p) => actions.push({ urgency: 8, text: `💰 **"${p.name}" is ${Math.round(p.spent / p.budget * 100)}% through budget** — flag with ${p.clientName}` }));

  tasks.filter((t) => {
    if (!t.dueDate || t.status === "done" || t.status === "cancelled") return false;
    const d = daysUntil(t.dueDate);
    return d >= 0 && d <= 2;
  }).forEach((t) => {
    const d = daysUntil(t.dueDate);
    actions.push({ urgency: 7, text: `🗓️ **"${t.title}"** — due ${d === 0 ? "today" : `in ${d}d`}` });
  });

  const hotDeals = deals.filter((d) => d.probability >= 70 && d.stage !== "closed_won" && d.stage !== "closed_lost");
  if (hotDeals.length) actions.push({ urgency: 6, text: `🔥 **${hotDeals.length} deal${hotDeals.length > 1 ? "s" : ""} at 70%+ probability** — ${fmt$(hotDeals.reduce((s, d) => s + d.value, 0))} ready to close` });

  const stale = clients.filter((c) => c.status === "active" && c.lastContact && daysAgo(c.lastContact) >= 14);
  if (stale.length) actions.push({ urgency: 5, text: `📞 **Follow up with ${stale.slice(0, 2).map((c) => c.name).join(", ")}** — no contact in 14+ days` });

  const sorted = actions.sort((a, b) => b.urgency - a.urgency).slice(0, 6);
  if (!sorted.length) return "✅ Everything looks good! No urgent tasks, overdue deadlines, or pipeline risks.\n\nGreat time to work on long-term goals or touch base with clients.";
  return `🎯 **Top priorities right now** (${sorted.length} action${sorted.length > 1 ? "s" : ""}):\n\n${sorted.map((a, i) => `${i + 1}. ${a.text}`).join("\n\n")}`;
}

function genSummary(data: CRMData): string {
  const { clients, projects, tasks, deals } = data;
  const activeClients  = clients.filter((c) => c.status === "active").length;
  const activeProjects = projects.filter((p) => p.status === "in_progress" || p.status === "review").length;
  const doneTasks      = tasks.filter((t) => t.status === "done").length;
  const overdueCount   = overdueTasks(tasks).length;
  const activeDeals    = deals.filter((d) => d.stage !== "closed_won" && d.stage !== "closed_lost");
  const pipelineVal    = activeDeals.reduce((s, d) => s + d.value, 0);
  return `📊 **Your CRM snapshot:**\n\n👥 **Clients:** ${clients.length} total · ${activeClients} active\n📋 **Projects:** ${projects.length} total · ${activeProjects} in progress\n✅ **Tasks:** ${tasks.length} total · ${doneTasks} done${overdueCount ? ` · ⚠️ ${overdueCount} overdue` : ""}\n💼 **Deals:** ${activeDeals.length} active · ${fmt$(pipelineVal)} pipeline\n\nWhat would you like to explore?`;
}

// ─── Intent router ─────────────────────────────────────────────────────────────

function generateResponse(input: string, data: CRMData): string {
  const q  = input.toLowerCase();
  const is = (p: RegExp) => p.test(q);
  if (is(/overdue|late\b|delay/))                                     return genOverdue(data);
  if (is(/this week|due soon/))                                       return genThisWeek(data);
  if (is(/budget|over.?budget|spend/))                                return genBudget(data);
  if (is(/project|progress|behind|status/) && !is(/pipeline|deal/))  return genProjects(data);
  if (is(/client|customer|contact/) && !is(/email|draft/))            return genClients(data);
  if (is(/follow.?up|followup|call/))                                 return genFollowUp(data);
  if (is(/email|draft|outreach/))                                     return genEmailDraft(data, input);
  if (is(/summariz|summary|profile/) && !is(/pipeline/))             return genClientSummary(data, input);
  if (is(/pipeline|deal/) && !is(/at risk|stuck/))                   return genPipeline(data);
  if (is(/at risk|stuck|danger/))                                     return genDealsAtRisk(data);
  if (is(/focus|priority|what should|help me|today/))                 return genPriority(data);
  return genSummary(data);
}

// ─── Message renderer ──────────────────────────────────────────────────────────

function MsgContent({ content }: { content: string }) {
  return (
    <div className="text-[13px] text-[var(--color-fg)] leading-relaxed whitespace-pre-wrap">
      {content.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
        part.startsWith("**") && part.endsWith("**")
          ? <strong key={i} className="font-semibold text-[var(--color-fg)]">{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
    </div>
  );
}

// ─── Smart suggestions ──────────────────────────────────────────────────────────

interface Suggestion {
  id:    string;
  icon:  React.ElementType;
  text:  string;
  sub?:  string;
  color: string;
  dot:   string;
  prompt: string;
}

function buildSuggestions(data: CRMData): Suggestion[] {
  const { clients, tasks, deals, projects } = data;
  const now = new Date();
  const out: Suggestion[] = [];

  const stale = clients.filter((c) => c.status === "active" && c.lastContact && daysAgo(c.lastContact) >= 14);
  if (stale.length) {
    const val = stale.reduce((s, c) => s + c.totalValue, 0);
    out.push({
      id: "stale",
      icon: Phone,
      text: `Contact ${stale.length} overdue client${stale.length > 1 ? "s" : ""}`,
      sub: val > 0 ? `${fmt$(val)} combined value at stake` : `${stale[0].name} hasn't been reached in ${daysAgo(stale[0].lastContact)}d`,
      color: "bg-amber-50 border-amber-200 text-amber-800",
      dot: "bg-amber-500",
      prompt: "Which clients need follow-up?",
    });
  }

  const atRisk = deals.filter((d) => {
    if (d.stage === "closed_won" || d.stage === "closed_lost") return false;
    return (new Date(d.expectedClose).getTime() - now.getTime()) / 86_400_000 < 7;
  });
  if (atRisk.length) {
    const val = atRisk.reduce((s, d) => s + d.value, 0);
    out.push({
      id: "risk",
      icon: AlertTriangle,
      text: `${atRisk.length} deal${atRisk.length > 1 ? "s" : ""} at risk of closing`,
      sub: `${fmt$(val)} could be lost — act now`,
      color: "bg-red-50 border-red-200 text-red-800",
      dot: "bg-red-500",
      prompt: "Which deals are at risk?",
    });
  }

  const hotDeals = deals.filter((d) => d.probability >= 70 && d.stage !== "closed_won" && d.stage !== "closed_lost");
  if (hotDeals.length) {
    const val = hotDeals.reduce((s, d) => s + d.value, 0);
    out.push({
      id: "hot",
      icon: TrendingUp,
      text: `${fmt$(val)} ready to close`,
      sub: `${hotDeals.length} high-probability deal${hotDeals.length > 1 ? "s" : ""} at 70%+ — push to close`,
      color: "bg-emerald-50 border-emerald-200 text-emerald-800",
      dot: "bg-emerald-500",
      prompt: "Summarize my pipeline",
    });
  }

  const overdue = overdueTasks(tasks);
  if (overdue.length) {
    out.push({
      id: "overdue",
      icon: Clock,
      text: `${overdue.length} overdue task${overdue.length > 1 ? "s" : ""} need attention`,
      sub: `Longest overdue: "${overdue[0].title}"`,
      color: "bg-red-50 border-red-200 text-red-800",
      dot: "bg-red-500",
      prompt: "Show overdue tasks",
    });
  }

  const staleFollowVal = stale.length > 0
    ? stale.filter((c) => c.totalValue > 0).reduce((s, c) => s + c.totalValue * 0.15, 0)
    : 0;
  if (staleFollowVal > 500) {
    out.push({
      id: "revenue",
      icon: DollarSign,
      text: `Follow-ups could unlock ~${fmt$(Math.round(staleFollowVal))}`,
      sub: `Estimated revenue potential from ${stale.length} overdue contacts`,
      color: "bg-violet-50 border-violet-200 text-violet-800",
      dot: "bg-violet-500",
      prompt: "Which clients need follow-up?",
    });
  }

  const overBudget = projects.filter((p) => p.budget > 0 && p.spent / p.budget > 0.85 && p.status !== "completed");
  if (overBudget.length) {
    out.push({
      id: "budget",
      icon: Zap,
      text: `${overBudget.length} project${overBudget.length > 1 ? "s" : ""} nearing budget limit`,
      sub: `${overBudget.map((p) => p.name).join(", ")}`,
      color: "bg-amber-50 border-amber-200 text-amber-800",
      dot: "bg-amber-500",
      prompt: "Which projects are over budget?",
    });
  }

  return out.slice(0, 4);
}

// ─── Action cards config ────────────────────────────────────────────────────────

type ActionId = "followup" | "email" | "create_task" | "summarize" | "open_deal" | "pipeline";

interface ActionCard {
  id:          ActionId;
  icon:        React.ElementType;
  title:       string;
  description: string;
  iconBg:      string;
  iconColor:   string;
  borderHover: string;
  btnColor:    string;
}

const ACTION_CARDS: ActionCard[] = [
  {
    id: "followup",   icon: Users,     title: "Follow up with client",
    description: "See which active clients haven't been contacted recently and prioritise outreach.",
    iconBg: "bg-amber-100",  iconColor: "text-amber-600",
    borderHover: "hover:border-amber-300 hover:shadow-amber-100/60",
    btnColor: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
  },
  {
    id: "email",      icon: Mail,      title: "Generate email",
    description: "AI drafts a personalised follow-up email for your most overdue client contact.",
    iconBg: "bg-blue-100",   iconColor: "text-blue-600",
    borderHover: "hover:border-blue-300 hover:shadow-blue-100/60",
    btnColor: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
  },
  {
    id: "create_task", icon: CheckSquare, title: "Create task",
    description: "Add a task to your list — AI suggests a title based on overdue work.",
    iconBg: "bg-violet-100", iconColor: "text-violet-600",
    borderHover: "hover:border-violet-300 hover:shadow-violet-100/60",
    btnColor: "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100",
  },
  {
    id: "summarize",  icon: MessageSquare, title: "Summarize client",
    description: "Get a full AI summary of your top client: projects, deals, tasks, and contact history.",
    iconBg: "bg-indigo-100", iconColor: "text-indigo-600",
    borderHover: "hover:border-indigo-300 hover:shadow-indigo-100/60",
    btnColor: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100",
  },
  {
    id: "open_deal",  icon: TrendingUp, title: "Open deal",
    description: "Jump to your most urgent deal in the pipeline — act before it goes cold.",
    iconBg: "bg-emerald-100",iconColor: "text-emerald-600",
    borderHover: "hover:border-emerald-300 hover:shadow-emerald-100/60",
    btnColor: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
  },
  {
    id: "pipeline",   icon: BarChart2,  title: "Analyze pipeline",
    description: "Full AI breakdown of your pipeline: stage distribution, value, and close probability.",
    iconBg: "bg-rose-100",   iconColor: "text-rose-600",
    borderHover: "hover:border-rose-300 hover:shadow-rose-100/60",
    btnColor: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100",
  },
];

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AssistantPage() {
  const { sw } = useTheme();

  const [clients,  setClients]  = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks,    setTasks]    = useState<Task[]>([]);
  const [deals,    setDeals]    = useState<Deal[]>([]);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  useEffect(() => {
    setClients(getClients());
    setProjects(getProjects());
    setTasks(getTasks());
    setDeals(getDeals());
  }, []);

  const data: CRMData = { clients, projects, tasks, deals };

  // ── Derived context ──────────────────────────────────────────────────────────
  const now          = new Date();
  const overdueList  = overdueTasks(tasks);
  const todayTasks   = tasks.filter((t) => {
    if (!t.dueDate || t.status === "done" || t.status === "cancelled") return false;
    return new Date(t.dueDate).toDateString() === now.toDateString();
  });
  const staleClients = clients.filter((c) => c.status === "active" && c.lastContact && daysAgo(c.lastContact) >= 14);
  const dealsAtRisk  = deals.filter((d) => {
    if (d.stage === "closed_won" || d.stage === "closed_lost") return false;
    return (new Date(d.expectedClose).getTime() - now.getTime()) / 86_400_000 < 7;
  });
  const suggestions  = buildSuggestions(data).filter((s) => !dismissedSuggestions.has(s.id));

  // ── Chat state ──────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const buildGreeting = useCallback((): Message => ({
    id: "init", role: "assistant",
    content: `Hi! I'm **Ventra AI**, your CRM operating system.\n\nYou have **${clients.length} client${clients.length !== 1 ? "s" : ""}**, **${tasks.length} task${tasks.length !== 1 ? "s" : ""}**, **${deals.length} deal${deals.length !== 1 ? "s" : ""}**${overdueList.length > 0 ? ` · ⚠️ **${overdueList.length} overdue**` : " · ✅ all tasks on track"}.\n\nClick any action card or ask me anything below.`,
    timestamp: "now",
  }), [clients.length, tasks.length, deals.length, overdueList.length]);

  useEffect(() => {
    setMessages([buildGreeting()]);
  }, [buildGreeting]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = {
      id: Date.now().toString(), role: "user",
      content: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    // Try real AI first; fall back to rule-based on error or 503
    let aiResponse: string | null = null;
    try {
      const aiRes = await fetch("/api/assistant/chat", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ message: text }),
      });
      if (aiRes.ok) {
        const aiJson = await aiRes.json() as { response?: string };
        aiResponse = aiJson.response ?? null;
      }
    } catch { /* network error — fall through to rule-based */ }
    setMessages((prev) => [...prev, {
      id: (Date.now() + 1).toString(), role: "assistant",
      content: aiResponse ?? generateResponse(text, data),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }]);
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

  // ── Action card execution ────────────────────────────────────────────────────
  const executeAction = (id: ActionId) => {
    switch (id) {
      case "followup":   sendMessage("Which clients need follow-up?"); break;
      case "email":      sendMessage("Draft a follow-up email"); break;
      case "create_task": setTaskModalOpen(true); break;
      case "summarize": {
        const top = clients.filter((c) => c.status === "active").sort((a, b) => b.totalValue - a.totalValue)[0];
        sendMessage(top ? `Summarize client ${top.name}` : "Summarize client overview");
        break;
      }
      case "open_deal":  sendMessage("Which deals are at risk?"); break;
      case "pipeline":   sendMessage("Analyze my pipeline"); break;
    }
  };

  const handleTaskSave = (task: Task) => {
    const cur = getTasks();
    const isNew = !cur.find((t) => t.id === task.id);
    saveTasks(isNew ? [task, ...cur] : cur.map((t) => t.id === task.id ? task : t));
    logActivity({ type: "task_created", title: "Task created", description: task.title });
    setTasks(getTasks());
    setTaskModalOpen(false);
    sendMessage(`I just created a task: "${task.title}". What should I know about prioritising it?`);
  };

  // ── Greeting ────────────────────────────────────────────────────────────────
  const hr       = now.getHours();
  const greeting = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  const dateStr  = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="flex flex-col flex-1 bg-[var(--color-canvas)] overflow-hidden">
      <TopBar title="Ventra Brain" subtitle="Your AI business operator" />

      {/* ── Main split layout ──────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: insights + actions (scrollable) ──────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[860px] mx-auto p-4 md:p-6 space-y-5">

            {/* ── 1. Daily Briefing ─────────────────────────────────────────── */}
            <div className="bg-linear-to-r from-violet-600 via-indigo-600 to-blue-600 rounded-2xl p-6 text-white relative overflow-hidden">
              {/* blobs */}
              <div className="absolute -top-10 -right-10 w-48 h-48 bg-white/5 rounded-full pointer-events-none" />
              <div className="absolute top-4 right-20 w-16 h-16 bg-white/5 rounded-full pointer-events-none" />
              <div className="absolute -bottom-6 left-8 w-32 h-32 bg-white/5 rounded-full pointer-events-none" />

              <div className="relative">
                {/* Header row */}
                <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center">
                        <Brain size={14} className="text-white" />
                      </div>
                      <span className="text-[11px] font-bold text-white/60 uppercase tracking-widest">Daily Briefing</span>
                    </div>
                    <h1 className="text-[24px] font-bold leading-tight">{greeting} 👋</h1>
                    <p className="text-[13px] text-white/60 mt-0.5">{dateStr}</p>
                  </div>
                  <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2 border border-white/20">
                    <Sparkles size={13} className="text-white/70" />
                    <span className="text-[12px] font-semibold text-white/70">Ventra AI</span>
                  </div>
                </div>

                {/* Stat tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: "Due today",     value: todayTasks.length,   sub: "tasks",   hot: false },
                    { label: "Overdue",        value: overdueList.length,  sub: "tasks",   hot: overdueList.length > 0 },
                    { label: "Deals at risk",  value: dealsAtRisk.length,  sub: "deals",   hot: dealsAtRisk.length > 0 },
                    { label: "Need follow-up", value: staleClients.length, sub: "clients", hot: false },
                  ].map(({ label, value, sub, hot }) => (
                    <div key={label} className={cn(
                      "rounded-xl px-4 py-3 flex flex-col border",
                      hot && value > 0 ? "bg-white/20 border-white/30" : "bg-white/10 border-white/15"
                    )}>
                      <p className="text-[28px] font-black leading-none tabular-nums">{value}</p>
                      <p className="text-[11px] text-white/75 mt-0.5 font-semibold">{label}</p>
                      <p className="text-[10px] text-white/40 mt-0.5">{sub}</p>
                    </div>
                  ))}
                </div>

                {/* Top priorities */}
                {(overdueList.length > 0 || dealsAtRisk.length > 0 || staleClients.length > 0) && (
                  <div className="bg-white/10 rounded-xl p-4 border border-white/20 space-y-2">
                    <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1">Top priorities right now</p>
                    {overdueList.slice(0, 1).map((t) => (
                      <Link key={t.id} href="/tasks" className="flex items-center gap-2.5 group">
                        <Clock size={13} className="text-red-300 flex-shrink-0" />
                        <p className="text-[13px] font-medium flex-1 truncate">{t.title}</p>
                        <span className="text-[10px] text-red-300 font-bold">{Math.abs(daysUntil(t.dueDate))}d overdue</span>
                        <ChevronRight size={11} className="text-white/30 group-hover:text-white/70 transition-colors" />
                      </Link>
                    ))}
                    {dealsAtRisk.slice(0, 1).map((d) => (
                      <Link key={d.id} href="/pipeline" className="flex items-center gap-2.5 group">
                        <AlertTriangle size={13} className="text-amber-300 flex-shrink-0" />
                        <p className="text-[13px] font-medium flex-1 truncate">{d.title}</p>
                        <span className="text-[10px] text-amber-300 font-bold">{fmt$(d.value)}</span>
                        <ChevronRight size={11} className="text-white/30 group-hover:text-white/70 transition-colors" />
                      </Link>
                    ))}
                    {staleClients.slice(0, 1).map((c) => (
                      <Link key={c.id} href="/clients" className="flex items-center gap-2.5 group">
                        <Calendar size={13} className="text-blue-300 flex-shrink-0" />
                        <p className="text-[13px] font-medium flex-1 truncate">{c.name} · {c.company}</p>
                        <span className="text-[10px] text-blue-300 font-bold">{daysAgo(c.lastContact)}d ago</span>
                        <ChevronRight size={11} className="text-white/30 group-hover:text-white/70 transition-colors" />
                      </Link>
                    ))}
                    {overdueList.length === 0 && dealsAtRisk.length === 0 && staleClients.length === 0 && (
                      <p className="text-[13px] text-white/60">✅ All clear — nothing urgent today.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── 2. Smart Suggestions ──────────────────────────────────────── */}
            {suggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-[var(--color-fg-faint)] uppercase tracking-widest">Smart Suggestions</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {suggestions.map((s) => {
                    const Icon = s.icon;
                    return (
                      <button key={s.id} onClick={() => sendMessage(s.prompt)}
                        className={cn(
                          "flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-all hover:shadow-sm group relative",
                          s.color
                        )}>
                        <span className={cn("w-2 h-2 rounded-full flex-shrink-0 mt-1.5", s.dot)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold leading-snug">{s.text}</p>
                          {s.sub && <p className="text-[11px] opacity-70 mt-0.5 truncate">{s.sub}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Icon size={13} className="opacity-60" />
                          <button
                            onClick={(e) => { e.stopPropagation(); setDismissedSuggestions((p) => new Set([...p, s.id])); }}
                            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-0.5 rounded"
                            aria-label="Dismiss">
                            <X size={11} />
                          </button>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── 3. AI Action Cards ────────────────────────────────────────── */}
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-[var(--color-fg-faint)] uppercase tracking-widest">AI Actions</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {ACTION_CARDS.map((card) => {
                  const Icon = card.icon;
                  // Live data hint for each card
                  const hint = (() => {
                    if (card.id === "followup")   return staleClients.length > 0 ? `${staleClients.length} client${staleClients.length > 1 ? "s" : ""} overdue` : "All contacts up to date";
                    if (card.id === "email")       return staleClients.length > 0 ? `Draft for ${staleClients[0].name}` : "Ready to draft";
                    if (card.id === "create_task") return `${tasks.filter((t) => t.status !== "done").length} open tasks`;
                    if (card.id === "summarize") {
                      const top = clients.filter((c) => c.status === "active").sort((a, b) => b.totalValue - a.totalValue)[0];
                      return top ? `Top: ${top.name}` : "No active clients";
                    }
                    if (card.id === "open_deal") {
                      const urgent = deals.filter((d) => d.stage !== "closed_won" && d.stage !== "closed_lost").sort((a, b) => new Date(a.expectedClose).getTime() - new Date(b.expectedClose).getTime())[0];
                      return urgent ? urgent.title : "No open deals";
                    }
                    if (card.id === "pipeline") {
                      const val = deals.filter((d) => d.stage !== "closed_won" && d.stage !== "closed_lost").reduce((s, d) => s + d.value, 0);
                      return val > 0 ? `${fmt$(val)} active` : "No deals yet";
                    }
                    return "";
                  })();

                  return (
                    <button key={card.id} onClick={() => executeAction(card.id)}
                      className={cn(
                        "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 text-left",
                        "transition-all hover:shadow-md",
                        card.borderHover
                      )}>
                      {/* Icon */}
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-4", card.iconBg)}>
                        <Icon size={18} className={card.iconColor} strokeWidth={sw} />
                      </div>

                      {/* Title + description */}
                      <h3 className="text-[14px] font-semibold text-[var(--color-fg)] leading-snug mb-1">
                        {card.title}
                      </h3>
                      <p className="text-[12px] text-[var(--color-fg-faint)] leading-snug mb-4">
                        {card.description}
                      </p>

                      {/* Live data + CTA */}
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[var(--color-fg-faint)]">{hint}</span>
                        <div className={cn("flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border", card.btnColor)}>
                          <Sparkles size={10} />
                          Run
                          <ArrowRight size={10} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── 4. Opportunity Detection ──────────────────────────────────── */}
            <div
              className="rounded-2xl p-5 border"
              style={{
                backgroundColor: "var(--color-surface)",
                borderColor:     "var(--color-border)",
              }}
            >
              <OpportunityDetection />
            </div>

            {/* ── 5. Founder Memory ─────────────────────────────────────────── */}
            <div
              className="rounded-2xl p-5 border"
              style={{
                backgroundColor: "var(--color-surface)",
                borderColor:     "var(--color-border)",
              }}
            >
              <FounderMemory />
            </div>

          </div>
        </div>

        {/* ── Right: Chat sidebar ─────────────────────────────────────────── */}
        <div className="hidden lg:flex w-[360px] flex-shrink-0 border-l border-[var(--color-border)] flex-col bg-[var(--color-surface)]">
          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--color-border)] flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <Sparkles size={11} className="text-white" />
              </div>
              <span className="text-[13px] font-semibold text-[var(--color-fg)]">Ask Ventra AI</span>
            </div>
            <button onClick={() => setMessages([buildGreeting()])}
              className="flex items-center gap-1 text-[11px] text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] px-2 py-1 rounded-lg hover:bg-[var(--color-canvas)] transition-colors">
              <RotateCcw size={10} /> Clear
            </button>
          </div>

          {/* Quick prompt chips */}
          <div className="px-3 py-2 border-b border-[var(--color-border)] flex flex-wrap gap-1.5 flex-shrink-0">
            {[
              { label: "Focus for today", prompt: "What should I focus on today?" },
              { label: "Pipeline",        prompt: "Analyze my pipeline" },
              { label: "Overdue tasks",   prompt: "Show overdue tasks" },
              { label: "Client summary",  prompt: "Summarize client overview" },
            ].map(({ label, prompt }) => (
              <button key={label} onClick={() => sendMessage(prompt)} disabled={loading}
                className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors disabled:opacity-50">
                {label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4 min-h-0">
            {messages.map((msg) => (
              <div key={msg.id} className={cn("flex gap-2", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                  msg.role === "assistant" ? "bg-linear-to-br from-indigo-500 to-violet-600" : "bg-[var(--color-canvas)] border border-[var(--color-border)]"
                )}>
                  {msg.role === "assistant" ? <Sparkles size={10} className="text-white" /> : <User size={10} className="text-[var(--color-fg-muted)]" />}
                </div>
                <div className={cn("flex flex-col gap-1 min-w-0", msg.role === "user" ? "items-end max-w-[85%]" : "items-start max-w-[90%]")}>
                  <div className={cn(
                    "rounded-2xl px-3 py-2.5",
                    msg.role === "assistant" ? "bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-tl-sm" : "bg-[var(--color-accent)] rounded-tr-sm"
                  )}>
                    {msg.role === "assistant"
                      ? <MsgContent content={msg.content} />
                      : <p className="text-[12px] text-white leading-relaxed">{msg.content}</p>}
                  </div>
                  {msg.role === "assistant" && (
                    <div className="flex items-center gap-0.5 pl-1">
                      <span className="text-[10px] text-[var(--color-fg-faint)] mr-1">{msg.timestamp}</span>
                      <button onClick={() => copyMessage(msg.id, msg.content)}
                        className="p-1 rounded hover:bg-[var(--color-canvas)] text-[var(--color-fg-faint)] hover:text-[var(--color-fg-muted)] transition-colors">
                        {copiedId === msg.id ? <Check size={10} className="text-emerald-600" /> : <Copy size={10} />}
                      </button>
                      <button className="p-1 rounded hover:bg-[var(--color-canvas)] text-[var(--color-fg-faint)] hover:text-emerald-600 transition-colors"><ThumbsUp size={10} /></button>
                      <button className="p-1 rounded hover:bg-[var(--color-canvas)] text-[var(--color-fg-faint)] hover:text-red-500 transition-colors"><ThumbsDown size={10} /></button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
                  <Sparkles size={10} className="text-white" />
                </div>
                <div className="bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-2xl rounded-tl-sm px-3 py-2.5">
                  <div className="flex gap-1 items-center h-4">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-[var(--color-border)] p-3 flex-shrink-0">
            <div className="flex items-end gap-2 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl px-3 py-2.5 focus-within:border-[var(--color-accent)] transition-colors">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about your CRM…"
                rows={1}
                className="flex-1 bg-transparent text-[12px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-placeholder)] resize-none focus:outline-none leading-relaxed max-h-24"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="p-1.5 rounded-lg bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors flex-shrink-0">
                <Send size={12} />
              </button>
            </div>
            <p className="text-[10px] text-[var(--color-fg-faint)] text-center mt-1.5">
              <kbd className="font-mono bg-[var(--color-canvas)] border border-[var(--color-border)] px-1 py-0.5 rounded text-[9px]">Enter</kbd> send ·{" "}
              <kbd className="font-mono bg-[var(--color-canvas)] border border-[var(--color-border)] px-1 py-0.5 rounded text-[9px]">⇧Enter</kbd> newline
            </p>
          </div>
        </div>

        {/* ── Mobile chat button (small screens) ────────────────────────── */}
        <div className="lg:hidden fixed bottom-24 right-4 z-40">
          <button
            onClick={() => sendMessage("What should I focus on today?")}
            className="w-12 h-12 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-full flex items-center justify-center shadow-xl shadow-black/15 text-white transition-colors">
            <MessageSquare size={18} />
          </button>
        </div>

      </div>

      {/* Task modal */}
      <TaskModal open={taskModalOpen} onClose={() => setTaskModalOpen(false)} onSave={handleTaskSave} />
    </div>
  );
}
