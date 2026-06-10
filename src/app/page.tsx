"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { useLanguage } from "@/context/language-context";
import {
  Zap, Users, TrendingUp, FolderKanban, Sparkles,
  BarChart3, Smartphone, ArrowRight, CheckCircle2, Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Feature data ────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: Users,       key: "f1", color: "text-indigo-400 bg-indigo-500/10" },
  { icon: TrendingUp,  key: "f2", color: "text-violet-400 bg-violet-500/10" },
  { icon: FolderKanban,key: "f3", color: "text-emerald-400 bg-emerald-500/10" },
  { icon: Sparkles,    key: "f4", color: "text-amber-400 bg-amber-500/10" },
  { icon: BarChart3,   key: "f5", color: "text-pink-400 bg-pink-500/10" },
  { icon: Smartphone,  key: "f6", color: "text-cyan-400 bg-cyan-500/10" },
];

const HERO_STATS = [
  { value: "100%", label: "Free to use" },
  { value: "Local", label: "Data stays private" },
  { value: "6+", label: "Built-in modules" },
];

// ─── Landing page ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter();
  const { t, lang, setLang } = useLanguage();

  // Redirect logged-in users immediately
  useEffect(() => {
    if (getSession()) router.replace("/dashboard");
  }, [router]);

  const featureTitles: Record<string, string> = {
    f1: t("land_f1_title"), f2: t("land_f2_title"), f3: t("land_f3_title"),
    f4: t("land_f4_title"), f5: t("land_f5_title"), f6: t("land_f6_title"),
  };
  const featureSubs: Record<string, string> = {
    f1: t("land_f1_sub"), f2: t("land_f2_sub"), f3: t("land_f3_sub"),
    f4: t("land_f4_sub"), f5: t("land_f5_sub"), f6: t("land_f6_sub"),
  };

  return (
    <div className="min-h-screen bg-[#07070f] text-white overflow-x-hidden">

      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#1c1c35]/60 bg-[#07070f]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Zap size={14} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-[15px] text-white tracking-tight">Ventra</span>
            <span className="text-[10px] font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-1.5 py-0.5 rounded-md ml-1">
              {t("land_hero_badge").split("—")[1]?.trim() ?? "Beta"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLang(lang === "en" ? "ru" : "en")}
              className="hidden sm:flex items-center gap-1.5 text-[12px] text-[#5a5a8a] hover:text-white transition-colors"
            >
              <Globe size={13} />{lang === "en" ? "RU" : "EN"}
            </button>
            <Link href="/login"
              className="px-3.5 py-1.5 text-[13px] font-medium text-[#8080a8] hover:text-white border border-[#1c1c35] hover:border-[#252545] rounded-lg transition-colors">
              {t("land_hero_login")}
            </Link>
            <Link href="/register"
              className="px-3.5 py-1.5 text-[13px] font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-lg shadow-indigo-500/20">
              {t("land_hero_cta")}
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 md:pt-40 md:pb-28 px-4 md:px-6 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-indigo-500/8 rounded-full blur-3xl" />
          <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] bg-violet-500/6 rounded-full blur-3xl" />
        </div>

        <div className="max-w-4xl mx-auto text-center relative">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[12px] text-indigo-400 font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            {t("land_hero_badge")}
          </div>

          {/* Headline */}
          <h1 className="text-[40px] md:text-[60px] font-bold text-white leading-[1.1] tracking-tight mb-5">
            {t("land_hero_title").split("\n").map((line, i) => (
              <span key={i}>
                {i === 1 ? (
                  <span className="bg-linear-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                    {line}
                  </span>
                ) : line}
                {i === 0 && <br />}
              </span>
            ))}
          </h1>

          <p className="text-[16px] md:text-[18px] text-[#8080a8] max-w-2xl mx-auto leading-relaxed mb-8">
            {t("land_hero_sub")}
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
            <Link href="/register"
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-all shadow-xl shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5">
              {t("land_hero_cta")} <ArrowRight size={16} />
            </Link>
            <Link href="/login"
              className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-[#c0c0d8] border border-[#1c1c35] hover:border-[#252545] rounded-xl transition-all">
              {t("land_hero_login")}
            </Link>
          </div>

          {/* Hero stats */}
          <div className="flex items-center justify-center gap-8 md:gap-12">
            {HERO_STATS.map(({ value, label }) => (
              <div key={label} className="text-center">
                <p className="text-[22px] md:text-[26px] font-bold text-white">{value}</p>
                <p className="text-[12px] text-[#5a5a8a] mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* App preview mockup */}
        <div className="max-w-5xl mx-auto mt-16 relative">
          <div className="bg-[#0d0d1c] border border-[#1c1c35] rounded-2xl overflow-hidden shadow-2xl shadow-black/50">
            {/* Fake browser bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1c1c35] bg-[#0d0d1c]">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/40" />
                <div className="w-3 h-3 rounded-full bg-amber-500/40" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/40" />
              </div>
              <div className="flex-1 mx-3 h-5 bg-[#1c1c35] rounded-md flex items-center px-3">
                <span className="text-[10px] text-[#3a3a5a]">app.ventra.io/dashboard</span>
              </div>
            </div>
            {/* Fake dashboard grid */}
            <div className="p-4 grid grid-cols-4 gap-3">
              {["$215K", "24", "8", "$480K"].map((v, i) => (
                <div key={i} className="bg-[#111128] border border-[#1c1c35] rounded-xl p-3.5">
                  <div className={cn("w-6 h-6 rounded-lg mb-2",
                    i === 0 ? "bg-emerald-500/15" : i === 1 ? "bg-indigo-500/15" : i === 2 ? "bg-violet-500/15" : "bg-amber-500/15"
                  )} />
                  <p className="text-[16px] font-bold text-white">{v}</p>
                  <div className="w-12 h-1.5 bg-[#1c1c35] rounded-full mt-2" />
                </div>
              ))}
              <div className="col-span-3 bg-[#111128] border border-[#1c1c35] rounded-xl p-3.5">
                <div className="w-20 h-2 bg-[#1c1c35] rounded-full mb-3" />
                <div className="flex items-end gap-1 h-12">
                  {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
                    <div key={i} className="flex-1 rounded-sm bg-indigo-500/20"
                      style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
              <div className="bg-[#111128] border border-[#1c1c35] rounded-xl p-3.5 space-y-2">
                {[3, 2, 4].map((w, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-indigo-500/20 flex-shrink-0" />
                    <div className={`h-1.5 bg-[#1c1c35] rounded-full`} style={{ width: `${w * 20}px` }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Glow under mockup */}
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-3/4 h-20 bg-indigo-500/15 blur-3xl rounded-full pointer-events-none" />
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 px-4 md:px-6 border-t border-[#1c1c35]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-[28px] md:text-[36px] font-bold text-white mb-3">
              {t("land_features_title")}
            </h2>
            <p className="text-[15px] text-[#8080a8] max-w-xl mx-auto">
              {t("land_features_sub")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, key, color }) => (
              <div
                key={key}
                className="bg-[#0d0d1c] border border-[#1c1c35] rounded-2xl p-5 hover:border-[#252545] hover:bg-[#111128] transition-all group"
              >
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-105", color)}>
                  <Icon size={20} strokeWidth={1.75} />
                </div>
                <h3 className="text-[15px] font-semibold text-white mb-1.5">{featureTitles[key]}</h3>
                <p className="text-[13px] text-[#5a5a8a] leading-relaxed">{featureSubs[key]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social proof strip ── */}
      <section className="py-10 px-4 md:px-6 border-y border-[#1c1c35] bg-[#0d0d1c]/40">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-6 md:gap-12">
          {[
            { icon: CheckCircle2, text: "No credit card required" },
            { icon: CheckCircle2, text: "Data stored locally" },
            { icon: CheckCircle2, text: "Free forever plan" },
            { icon: CheckCircle2, text: "No data sent to servers" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2 text-[13px] text-[#8080a8]">
              <Icon size={14} className="text-emerald-400 flex-shrink-0" />
              {text}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-4 md:px-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-indigo-500/8 rounded-full blur-3xl" />
        </div>
        <div className="max-w-2xl mx-auto text-center relative">
          <h2 className="text-[28px] md:text-[40px] font-bold text-white mb-3">
            {t("land_cta_title")}
          </h2>
          <p className="text-[15px] text-[#8080a8] mb-8 leading-relaxed">
            {t("land_cta_sub")}
          </p>
          <Link href="/register"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-2xl transition-all shadow-2xl shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-0.5 text-[15px]">
            {t("land_cta_btn")} <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-6 px-4 md:px-6 border-t border-[#1c1c35]">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Zap size={10} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-[13px] text-[#5a5a8a]">Ventra CRM</span>
          </div>
          <p className="text-[12px] text-[#3a3a5a]">{t("land_footer")}</p>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-[12px] text-[#5a5a8a] hover:text-white transition-colors">{t("land_hero_login")}</Link>
            <Link href="/register" className="text-[12px] text-[#5a5a8a] hover:text-white transition-colors">{t("land_hero_cta")}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
