"use client";

import { TopBar } from "@/components/layout/top-bar";
import { statsOverview, activities, deals, tasks } from "@/lib/mock-data";
import { useLanguage } from "@/context/language-context";
import {
  TrendingUp, Users, FolderKanban, DollarSign,
  ArrowUpRight, ArrowDownRight, Clock, Zap, MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

const activityIcon: Record<string, string> = {
  client_added: "👤", project_created: "🗂️", task_done: "✅",
  deal_won: "🏆", deal_lost: "❌", message: "💬", invoice: "🧾",
};

const stageColors: Record<string, string> = {
  lead: "bg-[#1c1c35] text-[#8080a8]",
  qualified: "bg-blue-500/15 text-blue-400",
  proposal: "bg-violet-500/15 text-violet-400",
  negotiation: "bg-amber-500/15 text-amber-400",
  closed_won: "bg-emerald-500/15 text-emerald-400",
  closed_lost: "bg-red-500/15 text-red-400",
};

export default function DashboardPage() {
  const { t } = useLanguage();

  const stageLabel: Record<string, string> = {
    lead:        t("stage_lead"),
    qualified:   t("stage_qualified"),
    proposal:    t("stage_proposal"),
    negotiation: t("stage_negotiation"),
    closed_won:  t("stage_closed_won"),
    closed_lost: t("stage_closed_lost"),
  };

  function timeAgo(timestamp: string) {
    const diff = Date.now() - new Date(timestamp).getTime();
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (d > 0) return `${d}${t("time_d_ago")}`;
    if (h > 0) return `${h}${t("time_h_ago")}`;
    return t("time_just_now");
  }

  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled").slice(0, 5);

  const colorMap: Record<string, string> = {
    indigo: "bg-indigo-500/15 text-indigo-400",
    violet: "bg-violet-500/15 text-violet-400",
    emerald: "bg-emerald-500/15 text-emerald-400",
    amber: "bg-amber-500/15 text-amber-400",
  };

  const stats = [
    { label: t("dash_revenue"),      value: statsOverview.totalRevenue.value,    change: statsOverview.totalRevenue.change,    icon: DollarSign,   prefix: "$", color: "emerald" },
    { label: t("dash_clients"),      value: statsOverview.activeClients.value,   change: statsOverview.activeClients.change,   icon: Users,        prefix: "",  color: "indigo" },
    { label: t("dash_projects"),     value: statsOverview.activeProjects.value,  change: statsOverview.activeProjects.change,  icon: FolderKanban, prefix: "",  color: "violet" },
    { label: t("dash_pipeline_val"), value: statsOverview.pipelineValue.value,   change: statsOverview.pipelineValue.change,   icon: TrendingUp,   prefix: "$", color: "amber" },
  ];

  return (
    <div className="flex flex-col flex-1">
      <TopBar title={t("dash_title")} subtitle={t("dash_subtitle")} />

      <div className="flex-1 p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {stats.map(({ label, value, change, icon: Icon, prefix, color }) => {
            const up = change >= 0;
            const displayValue =
              prefix === "$" && value >= 1000
                ? `${prefix}${value >= 1_000_000 ? (value / 1_000_000).toFixed(1) + "M" : (value / 1000).toFixed(0) + "K"}`
                : `${prefix}${value}`;
            return (
              <div key={label} className="bg-[#111128] border border-[#1c1c35] rounded-xl p-5 hover:border-[#252545] transition-colors">
                <div className="flex items-start justify-between mb-4">
                  <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", colorMap[color])}>
                    <Icon size={18} strokeWidth={1.75} />
                  </div>
                  <span className={cn("flex items-center gap-0.5 text-[12px] font-medium", up ? "text-emerald-400" : "text-red-400")}>
                    {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(change)}%
                  </span>
                </div>
                <p className="text-[26px] font-bold text-white leading-none">{displayValue}</p>
                <p className="text-[13px] text-[#5a5a8a] mt-1">{label}</p>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Activity */}
          <div className="col-span-2 bg-[#111128] border border-[#1c1c35] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1c1c35]">
              <h2 className="text-[14px] font-semibold text-white">{t("dash_activity")}</h2>
              <button className="text-[12px] text-[#5a5a8a] hover:text-indigo-400 transition-colors">{t("dash_view_all")}</button>
            </div>
            <div className="divide-y divide-[#1c1c35]">
              {activities.map((a) => (
                <div key={a.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                  <div className="w-8 h-8 rounded-full bg-[#1c1c35] flex items-center justify-center text-[14px] flex-shrink-0 mt-0.5">
                    {activityIcon[a.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-[#e0e0f0]">{a.title}</span>
                      {a.meta && (
                        <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">{a.meta}</span>
                      )}
                    </div>
                    <p className="text-[12px] text-[#5a5a8a] mt-0.5 truncate">{a.description}</p>
                  </div>
                  <span className="text-[11px] text-[#5a5a8a] flex-shrink-0 flex items-center gap-1">
                    <Clock size={11} />{timeAgo(a.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Due soon */}
          <div className="bg-[#111128] border border-[#1c1c35] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1c1c35]">
              <h2 className="text-[14px] font-semibold text-white">{t("dash_due_soon")}</h2>
              <span className="text-[11px] bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-md font-medium">
                {openTasks.length} {t("dash_tasks_badge")}
              </span>
            </div>
            <div className="divide-y divide-[#1c1c35]">
              {openTasks.map((task) => (
                <div key={task.id} className="px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-start gap-2.5">
                    <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0",
                      task.priority === "urgent" ? "bg-red-400" : task.priority === "high" ? "bg-amber-400" : task.priority === "medium" ? "bg-indigo-400" : "bg-[#5a5a8a]"
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#e0e0f0] truncate">{task.title}</p>
                      <p className="text-[11px] text-[#5a5a8a] mt-0.5">{task.clientName}</p>
                      <p className="text-[11px] text-[#5a5a8a] mt-0.5 flex items-center gap-1">
                        <Clock size={10} />{t("dash_due_label")} {task.dueDate}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Deal pipeline */}
        <div className="bg-[#111128] border border-[#1c1c35] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1c1c35]">
            <h2 className="text-[14px] font-semibold text-white">{t("dash_deal_pipe")}</h2>
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-[#5a5a8a]">
                ${(deals.reduce((a, d) => a + d.value, 0) / 1000).toFixed(0)}K {t("dash_total")}
              </span>
              <button className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                <MoreHorizontal size={16} className="text-[#5a5a8a]" />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1c1c35]">
                  {[t("dash_col_deal"), t("dash_col_stage"), t("dash_col_value"), t("dash_col_prob"), t("dash_col_close"), t("dash_col_owner")].map((h) => (
                    <th key={h} className="text-left text-[11px] font-medium text-[#5a5a8a] uppercase tracking-wider px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1c1c35]">
                {deals.map((deal) => (
                  <tr key={deal.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
                          {deal.clientAvatar}
                        </div>
                        <div>
                          <p className="text-[13px] font-medium text-[#e0e0f0]">{deal.title}</p>
                          <p className="text-[11px] text-[#5a5a8a]">{deal.clientName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={cn("text-[11px] font-medium px-2 py-1 rounded-md", stageColors[deal.stage])}>
                        {stageLabel[deal.stage]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[13px] font-semibold text-white">${deal.value.toLocaleString()}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-[#1c1c35] rounded-full overflow-hidden">
                          <div className="h-full bg-linear-to-r from-indigo-500 to-violet-500 rounded-full" style={{ width: `${deal.probability}%` }} />
                        </div>
                        <span className="text-[12px] text-[#8080a8]">{deal.probability}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#8080a8]">{deal.expectedClose}</td>
                    <td className="px-5 py-3.5 text-[12px] text-[#8080a8]">{deal.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI nudge */}
        <div className="bg-linear-to-r from-indigo-500/10 via-violet-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl px-5 py-4 flex items-center gap-4">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
            <Zap size={18} className="text-indigo-400" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-white">
              {t("dash_ai_text")}{" "}
              <span className="text-indigo-400">Amara Diallo</span>{" "}
              {t("dash_ai_text2")}
            </p>
            <p className="text-[12px] text-[#5a5a8a] mt-0.5">{t("dash_ai_sub")}</p>
          </div>
          <div className="flex gap-2 ml-auto flex-shrink-0">
            <button className="px-3 py-1.5 text-[12px] font-medium text-[#8080a8] hover:text-white border border-[#252545] rounded-lg transition-colors">
              {t("dash_dismiss")}
            </button>
            <button className="px-3 py-1.5 text-[12px] font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors">
              {t("dash_draft")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
