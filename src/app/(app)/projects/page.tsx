"use client";

import { useState, useEffect } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { ProjectModal } from "@/components/projects/project-modal";
import { getProjects, saveProjects } from "@/lib/storage";
import type { Project, ProjectStatus, TaskPriority } from "@/lib/types";
import { useLanguage } from "@/context/language-context";
import {
  Calendar, DollarSign, LayoutGrid, List,
  TrendingUp, Pencil, FolderKanban, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";

const avatarColors = [
  "bg-indigo-500", "bg-emerald-500", "bg-amber-500", "bg-violet-500", "bg-blue-500",
];

type ModalState =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "edit"; project: Project };

export default function ProjectsPage() {
  const { t } = useLanguage();

  // ── State ──────────────────────────────────────────────────────────────────
  const [projectList, setProjectList]     = useState<Project[]>([]);
  const [view, setView]                   = useState<"grid" | "list">("grid");
  const [filterStatus, setFilterStatus]   = useState<ProjectStatus | "all">("all");
  const [modal, setModal]                 = useState<ModalState>({ open: false });
  const [toast, setToast]                 = useState<string | null>(null);

  useEffect(() => {
    setProjectList(getProjects());
  }, []);

  // ── Toast ──────────────────────────────────────────────────────────────────
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────
  function handleSave(project: Project) {
    const isNew = !projectList.find((p) => p.id === project.id);
    const updated = isNew
      ? [project, ...projectList]
      : projectList.map((p) => (p.id === project.id ? project : p));
    saveProjects(updated);
    setProjectList(updated);
    setModal({ open: false });
    showToast(isNew ? t("project_created") : t("project_saved"));
  }

  function handleDelete(id: string) {
    const updated = projectList.filter((p) => p.id !== id);
    saveProjects(updated);
    setProjectList(updated);
    setModal({ open: false });
    showToast(t("project_deleted"));
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const statusConfig: Record<ProjectStatus, { label: string; class: string }> = {
    planning:    { label: t("status_planning"),    class: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
    in_progress: { label: t("status_in_progress"), class: "bg-indigo-500/15 text-indigo-400 border-indigo-500/20" },
    review:      { label: t("status_review"),      class: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
    completed:   { label: t("status_completed"),   class: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
    on_hold:     { label: t("status_on_hold"),     class: "bg-[#1c1c35] text-[#8080a8] border-[#252545]" },
  };

  const priorityConfig: Record<TaskPriority, { label: string; dot: string }> = {
    low:    { label: t("priority_low"),    dot: "bg-[#5a5a8a]" },
    medium: { label: t("priority_medium"), dot: "bg-blue-400" },
    high:   { label: t("priority_high"),   dot: "bg-amber-400" },
    urgent: { label: t("priority_urgent"), dot: "bg-red-400" },
  };

  const filtered = projectList.filter(
    (p) => filterStatus === "all" || p.status === filterStatus
  );

  const totalBudget = projectList.reduce((a, p) => a + p.budget, 0);
  const totalSpent  = projectList.reduce((a, p) => a + p.spent, 0);

  const filterKeys: (ProjectStatus | "all")[] = ["all", "planning", "in_progress", "review", "completed"];

  const summaryMetrics = [
    { label: t("projects_budget"),     value: `$${(totalBudget / 1000).toFixed(0)}K`, icon: DollarSign,  color: "text-emerald-400" },
    { label: t("projects_spent_date"), value: `$${(totalSpent / 1000).toFixed(0)}K`,  icon: TrendingUp,  color: "text-amber-400" },
    {
      label: t("projects_inprogress"),
      value: projectList.filter((p) => p.status === "in_progress").length,
      icon: LayoutGrid,
      color: "text-indigo-400",
    },
    {
      label: t("projects_avg_prog"),
      value: projectList.length
        ? `${Math.round(projectList.reduce((a, p) => a + p.progress, 0) / projectList.length)}%`
        : "—",
      icon: Calendar,
      color: "text-violet-400",
    },
  ];

  // ── ProjectCard ────────────────────────────────────────────────────────────
  function ProjectCard({ project }: { project: Project }) {
    const cfg      = statusConfig[project.status];
    const priCfg   = project.priority ? priorityConfig[project.priority] : null;
    const overBudget = project.budget > 0 && project.spent / project.budget > 0.9;

    return (
      <div
        className="bg-[#111128] border border-[#1c1c35] rounded-xl p-5 hover:border-[#252545] transition-all flex flex-col gap-4 cursor-pointer group relative"
        onClick={() => setModal({ open: true, mode: "edit", project })}
      >
        {/* Edit badge */}
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <span className="text-[10px] font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-1.5 py-0.5 rounded-md flex items-center gap-1">
            <Pencil size={9} />{t("btn_edit")}
          </span>
        </div>

        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-md border", cfg.class)}>
                {cfg.label}
              </span>
              {priCfg && (
                <span className="flex items-center gap-1 text-[11px] text-[#8080a8]">
                  <span className={cn("w-1.5 h-1.5 rounded-full", priCfg.dot)} />
                  {priCfg.label}
                </span>
              )}
            </div>
            <h3 className="text-[14px] font-semibold text-white truncate mt-1.5">{project.name}</h3>
            <p className="text-[12px] text-[#5a5a8a] mt-0.5">{project.clientName}</p>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-[#5a5a8a]">{t("projects_progress")}</span>
            <span className="text-[11px] font-medium text-[#e0e0f0]">{project.progress}%</span>
          </div>
          <div className="h-1.5 bg-[#1c1c35] rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                project.progress === 100
                  ? "bg-emerald-500"
                  : "bg-linear-to-r from-indigo-500 to-violet-500"
              )}
              style={{ width: `${project.progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[11px] text-[#5a5a8a]">
              {project.completedTasks}/{project.taskCount} {t("projects_tasks")}
            </span>
            <span className="text-[11px] text-[#5a5a8a]">{t("projects_due")} {project.dueDate}</span>
          </div>
        </div>

        <div className="flex items-center justify-between py-3 border-y border-[#1c1c35]">
          <div>
            <p className="text-[11px] text-[#5a5a8a]">{t("projects_budget_lbl")}</p>
            <p className="text-[13px] font-semibold text-white">${project.budget.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-[#5a5a8a]">{t("projects_spent_lbl")}</p>
            <p className={cn("text-[13px] font-semibold", overBudget ? "text-amber-400" : "text-white")}>
              ${project.spent.toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-[#5a5a8a]">{t("projects_remaining")}</p>
            <p className="text-[13px] font-semibold text-emerald-400">
              ${Math.max(0, project.budget - project.spent).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex -space-x-1.5">
            {project.team.slice(0, 4).map((m, i) => (
              <div
                key={`${m}-${i}`}
                className={cn(
                  "w-6 h-6 rounded-full border-2 border-[#111128] flex items-center justify-center text-[9px] font-bold text-white",
                  avatarColors[i % avatarColors.length]
                )}
              >
                {m[0]}
              </div>
            ))}
            {project.team.length > 4 && (
              <div className="w-6 h-6 rounded-full border-2 border-[#111128] bg-[#1c1c35] flex items-center justify-center text-[9px] font-bold text-[#8080a8]">
                +{project.team.length - 4}
              </div>
            )}
          </div>
          <div className="flex gap-1 flex-wrap justify-end">
            {project.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="text-[10px] bg-[#1c1c35] text-[#8080a8] px-1.5 py-0.5 rounded-md">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[200] bg-[#1c1c35] border border-indigo-500/30 text-white text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
          {toast}
        </div>
      )}

      {/* Modal */}
      <ProjectModal
        open={modal.open}
        project={modal.open && modal.mode === "edit" ? modal.project : undefined}
        onClose={() => setModal({ open: false })}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      <div className="flex flex-col flex-1">
        <TopBar
          title={t("projects_title")}
          subtitle={`${projectList.length} ${t("projects_subtitle")}`}
          action={{
            label: t("projects_new"),
            onClick: () => setModal({ open: true, mode: "create" }),
          }}
        />

        <div className="flex-1 p-6 space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-4 gap-4">
            {summaryMetrics.map((s) => (
              <div key={s.label} className="bg-[#111128] border border-[#1c1c35] rounded-xl p-4 flex items-center gap-3">
                <s.icon size={20} className={s.color} />
                <div>
                  <p className="text-[20px] font-bold text-white">{s.value}</p>
                  <p className="text-[12px] text-[#5a5a8a]">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Filters + View toggle */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-[#111128] border border-[#1c1c35] rounded-lg p-1">
              {filterKeys.map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors",
                    filterStatus === s ? "bg-indigo-600 text-white" : "text-[#8080a8] hover:text-white"
                  )}
                >
                  {s === "all" ? t("all") : statusConfig[s as ProjectStatus].label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-1 bg-[#111128] border border-[#1c1c35] rounded-lg p-1">
              <button
                onClick={() => setView("grid")}
                className={cn("p-1.5 rounded-md transition-colors", view === "grid" ? "bg-indigo-600 text-white" : "text-[#5a5a8a] hover:text-white")}
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={() => setView("list")}
                className={cn("p-1.5 rounded-md transition-colors", view === "list" ? "bg-indigo-600 text-white" : "text-[#5a5a8a] hover:text-white")}
              >
                <List size={14} />
              </button>
            </div>
          </div>

          {/* Grid view */}
          {view === "grid" && (
            <div className="grid grid-cols-3 gap-4">
              {filtered.map((p) => <ProjectCard key={p.id} project={p} />)}
              {filtered.length === 0 && projectList.length > 0 && (
                <div className="col-span-3">
                  <EmptyState icon={Search} title={t("empty_projects_filtered")} subtitle={t("empty_projects_filtered_sub")} />
                </div>
              )}
              {filtered.length === 0 && projectList.length === 0 && (
                <div className="col-span-3">
                  <EmptyState
                    icon={FolderKanban}
                    title={t("empty_projects_title")}
                    subtitle={t("empty_projects_sub")}
                    action={{ label: t("empty_add_project"), onClick: () => setModal({ open: true, mode: "create" }) }}
                  />
                </div>
              )}
            </div>
          )}

          {/* List view */}
          {view === "list" && (
            <div className="bg-[#111128] border border-[#1c1c35] rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1c1c35]">
                    {[
                      t("projects_col_proj"),
                      t("projects_col_status"),
                      t("projects_col_client"),
                      t("projects_col_prog"),
                      t("projects_col_budget"),
                      t("projects_col_due"),
                      "",
                    ].map((h, i) => (
                      <th key={i} className="text-left px-5 py-3 text-[11px] font-medium text-[#5a5a8a] uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c1c35]">
                  {filtered.map((p) => {
                    const cfg    = statusConfig[p.status];
                    const priCfg = p.priority ? priorityConfig[p.priority] : null;
                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-white/[0.02] transition-colors cursor-pointer group"
                        onClick={() => setModal({ open: true, mode: "edit", project: p })}
                      >
                        <td className="px-5 py-3.5">
                          <p className="text-[13px] font-medium text-white">{p.name}</p>
                          <p className="text-[11px] text-[#5a5a8a] mt-0.5">
                            {p.completedTasks}/{p.taskCount} {t("projects_tasks")}
                          </p>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={cn("text-[11px] font-medium px-2 py-1 rounded-md border", cfg.class)}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-[13px] text-[#8080a8]">{p.clientName}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-1.5 bg-[#1c1c35] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-linear-to-r from-indigo-500 to-violet-500 rounded-full"
                                style={{ width: `${p.progress}%` }}
                              />
                            </div>
                            <span className="text-[12px] text-[#8080a8]">{p.progress}%</span>
                          </div>
                          {priCfg && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className={cn("w-1.5 h-1.5 rounded-full", priCfg.dot)} />
                              <span className="text-[10px] text-[#5a5a8a]">{priCfg.label}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-[13px] text-white font-medium">
                          ${p.budget.toLocaleString()}
                        </td>
                        <td className="px-5 py-3.5 text-[12px] text-[#8080a8]">{p.dueDate}</td>
                        <td className="px-5 py-3.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); setModal({ open: true, mode: "edit", project: p }); }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-white/5 text-[#5a5a8a] hover:text-indigo-400 transition-all"
                          >
                            <Pencil size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && projectList.length > 0 && (
                <EmptyState icon={Search} title={t("empty_projects_filtered")} subtitle={t("empty_projects_filtered_sub")} />
              )}
              {filtered.length === 0 && projectList.length === 0 && (
                <EmptyState
                  icon={FolderKanban}
                  title={t("empty_projects_title")}
                  subtitle={t("empty_projects_sub")}
                  action={{ label: t("empty_add_project"), onClick: () => setModal({ open: true, mode: "create" }) }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
