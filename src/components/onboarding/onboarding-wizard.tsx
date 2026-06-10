"use client";

import { useState } from "react";
import { useLanguage } from "@/context/language-context";
import { markOnboardingDone, markSetupStep, saveClients, saveProjects, getClients, getProjects } from "@/lib/storage";
import type { Client, Project, ClientStatus, ProjectStatus } from "@/lib/types";
import { Zap, Users, FolderKanban, CheckCircle2, ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingWizardProps {
  onComplete: () => void;
}

type WizardStep = 0 | 1 | 2 | 3;

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { t } = useLanguage();
  const [step, setStep] = useState<WizardStep>(0);

  // Client form
  const [clientName,    setClientName]    = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientEmail,   setClientEmail]   = useState("");

  // Project form
  const [projectTitle,  setProjectTitle]  = useState("");
  const [projectClient, setProjectClient] = useState("");

  function finish() {
    markOnboardingDone();
    onComplete();
  }

  function skip() {
    markOnboardingDone();
    onComplete();
  }

  function handleClientNext() {
    if (clientName.trim()) {
      const newClient: Client = {
        id: `c-${Date.now()}`,
        name: clientName.trim(),
        company: clientCompany.trim() || clientName.trim(),
        email: clientEmail.trim(),
        phone: "",
        avatar: clientName.trim().slice(0, 2).toUpperCase(),
        status: "active" as ClientStatus,
        totalValue: 0,
        projectCount: 0,
        location: "",
        industry: "",
        joinedAt: new Date().toISOString().split("T")[0],
        lastContact: new Date().toISOString().split("T")[0],
        tags: [],
      };
      saveClients([...getClients(), newClient]);
      markSetupStep("client");
      setProjectClient(clientCompany.trim() || clientName.trim());
    }
    setStep(2);
  }

  function handleProjectNext() {
    if (projectTitle.trim()) {
      const newProject: Project = {
        id: `p-${Date.now()}`,
        name: projectTitle.trim(),
        clientId: "",
        clientName: projectClient.trim() || clientCompany.trim() || "—",
        status: "planning" as ProjectStatus,
        priority: "medium",
        progress: 0,
        budget: 0,
        spent: 0,
        dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
        startDate: new Date().toISOString().split("T")[0],
        description: "",
        taskCount: 0,
        completedTasks: 0,
        team: [],
        tags: [],
      };
      saveProjects([...getProjects(), newProject]);
      markSetupStep("project");
    }
    setStep(3);
  }

  const steps = [
    { label: t("onb_welcome_title").split(" ").slice(-1)[0], icon: Zap },
    { label: t("nav_clients"), icon: Users },
    { label: t("nav_projects"), icon: FolderKanban },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="w-full max-w-lg bg-[#0d0d1c] border border-[#1c1c35] rounded-2xl shadow-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-0.5 bg-[#1c1c35]">
          <div
            className="h-full bg-linear-to-r from-indigo-500 to-violet-500 transition-all duration-500"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* Step indicators */}
        {step < 3 && (
          <div className="flex items-center justify-between px-6 pt-5">
            <div className="flex items-center gap-2">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all",
                    i < step
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : i === step
                      ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                      : "bg-[#1c1c35] text-[#5a5a8a] border border-[#252545]"
                  )}>
                    {i < step ? <CheckCircle2 size={12} /> : i + 1}
                  </div>
                  {i < steps.length - 1 && <div className="w-6 h-px bg-[#1c1c35]" />}
                </div>
              ))}
            </div>
            <button onClick={skip} className="text-[12px] text-[#5a5a8a] hover:text-white transition-colors flex items-center gap-1">
              <X size={13} />{t("onb_skip")}
            </button>
          </div>
        )}

        {/* ── Step 0: Welcome ── */}
        {step === 0 && (
          <div className="px-8 py-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-xl shadow-indigo-500/30">
              <Zap size={28} className="text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-[22px] font-bold text-white">{t("onb_welcome_title")}</h2>
              <p className="text-[14px] text-[#8080a8] mt-2 leading-relaxed">{t("onb_welcome_sub")}</p>
            </div>
            <div className="flex flex-col gap-2 pt-2 text-left">
              {[t("onb_client_title"), t("onb_project_title"), "Explore the pipeline"].map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 bg-[#111128] border border-[#1c1c35] rounded-lg">
                  <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] font-bold flex items-center justify-center border border-indigo-500/30">
                    {i + 1}
                  </div>
                  <span className="text-[13px] text-[#c0c0d8]">{item}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setStep(1)}
              className="w-full mt-2 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
            >
              {t("onb_welcome_btn")} <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* ── Step 1: Add client ── */}
        {step === 1 && (
          <div className="px-6 py-6 space-y-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-indigo-400" />
                <h2 className="text-[17px] font-semibold text-white">{t("onb_client_title")}</h2>
              </div>
              <p className="text-[13px] text-[#8080a8]">{t("onb_client_sub")}</p>
            </div>
            <div className="space-y-3">
              <input
                value={clientName} onChange={(e) => setClientName(e.target.value)}
                placeholder={t("client_ph_name")}
                className="w-full px-3.5 py-2.5 bg-[#111128] border border-[#1c1c35] focus:border-indigo-500/60 rounded-xl text-[13px] text-white placeholder:text-[#3a3a5a] outline-none transition-colors"
              />
              <input
                value={clientCompany} onChange={(e) => setClientCompany(e.target.value)}
                placeholder={t("client_ph_company")}
                className="w-full px-3.5 py-2.5 bg-[#111128] border border-[#1c1c35] focus:border-indigo-500/60 rounded-xl text-[13px] text-white placeholder:text-[#3a3a5a] outline-none transition-colors"
              />
              <input
                value={clientEmail} onChange={(e) => setClientEmail(e.target.value)}
                placeholder={t("client_ph_email")} type="email"
                className="w-full px-3.5 py-2.5 bg-[#111128] border border-[#1c1c35] focus:border-indigo-500/60 rounded-xl text-[13px] text-white placeholder:text-[#3a3a5a] outline-none transition-colors"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setStep(0)}
                className="px-4 py-2.5 text-[13px] text-[#8080a8] border border-[#1c1c35] rounded-xl hover:bg-white/5 transition-colors">
                {t("onb_back")}
              </button>
              <button
                onClick={handleClientNext}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {clientName.trim() ? t("onb_next") : t("onb_skip")} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Add project ── */}
        {step === 2 && (
          <div className="px-6 py-6 space-y-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FolderKanban size={18} className="text-violet-400" />
                <h2 className="text-[17px] font-semibold text-white">{t("onb_project_title")}</h2>
              </div>
              <p className="text-[13px] text-[#8080a8]">{t("onb_project_sub")}</p>
            </div>
            <div className="space-y-3">
              <input
                value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)}
                placeholder={t("project_ph_title")}
                className="w-full px-3.5 py-2.5 bg-[#111128] border border-[#1c1c35] focus:border-indigo-500/60 rounded-xl text-[13px] text-white placeholder:text-[#3a3a5a] outline-none transition-colors"
              />
              <input
                value={projectClient} onChange={(e) => setProjectClient(e.target.value)}
                placeholder={t("project_ph_client")}
                className="w-full px-3.5 py-2.5 bg-[#111128] border border-[#1c1c35] focus:border-indigo-500/60 rounded-xl text-[13px] text-white placeholder:text-[#3a3a5a] outline-none transition-colors"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setStep(1)}
                className="px-4 py-2.5 text-[13px] text-[#8080a8] border border-[#1c1c35] rounded-xl hover:bg-white/5 transition-colors">
                {t("onb_back")}
              </button>
              <button
                onClick={handleProjectNext}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {projectTitle.trim() ? t("onb_next") : t("onb_skip")} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Done ── */}
        {step === 3 && (
          <div className="px-8 py-8 text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 size={30} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-[20px] font-bold text-white">{t("onb_done_title")}</h2>
              <p className="text-[13px] text-[#8080a8] mt-2 leading-relaxed">{t("onb_done_sub")}</p>
            </div>
            <button
              onClick={finish}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
            >
              {t("onb_finish")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
