"use client";

/**
 * GmailConnectModal — real OAuth flow.
 *
 * Clicking "Continue with Google" does a hard redirect to
 * /api/integrations/email/oauth/start, which builds the Google consent URL
 * and sends the browser there. Google then redirects to
 * /api/integrations/email/oauth/callback, which exchanges the code, saves
 * tokens, runs the initial sync, and redirects back to
 * /settings?tab=integrations&email_connected=1.
 *
 * This modal only handles the intro step; the importing/complete feedback
 * is shown by the settings page after the OAuth round-trip.
 */

import { useState, useEffect } from "react";
import {
  X, Mail, Check, Shield, Sparkles,
  MessageSquare, UserCheck,
  Lock, Globe, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GmailConnection } from "@/lib/gmail";

// ── Step types ────────────────────────────────────────────────────────────────

type GmailStep = "intro" | "oauth";

// ── Props ─────────────────────────────────────────────────────────────────────

interface GmailConnectModalProps {
  open:        boolean;
  existing:    GmailConnection | null;
  onClose:     () => void;
  onConnected: (conn: GmailConnection) => void;
  onSuggestionsReady?: () => void;
}

// ── Step progress indicator ───────────────────────────────────────────────────

const PROGRESS_STEPS = ["Overview", "Connect"] as const;

function stepToIndex(step: GmailStep): number {
  return step === "intro" ? 0 : 1;
}

function StepProgress({ step }: { step: GmailStep }) {
  const currentIdx = stepToIndex(step);
  return (
    <div className="flex items-center px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-canvas)] flex-shrink-0">
      {PROGRESS_STEPS.map((label, i) => (
        <div key={label} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300",
              i < currentIdx   ? "bg-emerald-500 text-white"               :
              i === currentIdx ? "bg-[var(--color-accent)] text-white"     :
                                  "bg-[var(--color-border)] text-[var(--color-fg-faint)]",
            )}>
              {i < currentIdx
                ? <Check size={10} />
                : <span className="text-[10px] font-bold">{i + 1}</span>
              }
            </div>
            <span className={cn(
              "text-[9px] font-semibold whitespace-nowrap transition-colors",
              i === currentIdx ? "text-[var(--color-accent)]" : "text-[var(--color-fg-faint)]",
            )}>
              {label}
            </span>
          </div>
          {i < PROGRESS_STEPS.length - 1 && (
            <div className={cn(
              "flex-1 h-0.5 mx-2 mb-4 rounded-full transition-colors duration-300",
              i < currentIdx ? "bg-emerald-400" : "bg-[var(--color-border)]",
            )} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function GmailConnectModal({
  open,
  existing,
  onClose,
}: GmailConnectModalProps) {
  const [step, setStep] = useState<GmailStep>("intro");

  // Reset on open
  useEffect(() => {
    if (open) setStep("intro");
  }, [open]);

  function handleGoogleSignIn() {
    // Real OAuth — redirect to server-side start route.
    // The server builds the Google consent URL with CSRF state and redirects.
    window.location.href = "/api/integrations/email/oauth/start";
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-[560px] bg-[var(--color-surface)] rounded-2xl shadow-2xl border border-[var(--color-border)] flex flex-col max-h-[90vh] overflow-hidden">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center flex-shrink-0">
            <Mail size={16} className="text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[14px] font-bold text-[var(--color-fg)]">
              {existing ? "Gmail — Connected" : "Connect Gmail"}
            </h2>
            <p className="text-[11px] text-[var(--color-fg-faint)]">
              {existing
                ? `Connected as ${existing.displayName}`
                : "Import email threads and let AI detect clients and deals"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--color-canvas)] text-[var(--color-fg-faint)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Step progress ────────────────────────────────────────────────── */}
        <StepProgress step={step} />

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Intro step ─────────────────────────────────────────────── */}
          {step === "intro" && (
            <div className="px-6 py-5 space-y-5">
              {/* Feature highlights */}
              <div className="space-y-3">
                {[
                  {
                    icon:  MessageSquare,
                    color: "text-violet-600",
                    bg:    "bg-violet-50",
                    title: "Email threads in Inbox",
                    desc:  "Every Gmail conversation appears in Ventra Inbox alongside Telegram messages.",
                  },
                  {
                    icon:  UserCheck,
                    color: "text-emerald-600",
                    bg:    "bg-emerald-50",
                    title: "Automatic client matching",
                    desc:  "Sender addresses and names are matched against your CRM — no duplicates.",
                  },
                  {
                    icon:  Sparkles,
                    color: "text-[var(--color-accent)]",
                    bg:    "bg-[var(--color-accent-subtle)]",
                    title: "AI task and deal detection",
                    desc:  "Claude scans threads for follow-up items and revenue signals — you review before anything is created.",
                  },
                  {
                    icon:  Shield,
                    color: "text-blue-600",
                    bg:    "bg-blue-50",
                    title: "Privacy by design",
                    desc:  "We request Gmail modify access (read + send). You can disconnect and delete all email data at any time.",
                  },
                ].map(({ icon: Icon, color, bg, title, desc }) => (
                  <div key={title} className="flex items-start gap-3">
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border", bg, "border-transparent")}>
                      <Icon size={13} className={color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-[var(--color-fg)]">{title}</p>
                      <p className="text-[11px] text-[var(--color-fg-muted)] leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Scope note */}
              <div className="flex items-start gap-2.5 px-3 py-3 rounded-xl bg-blue-50 border border-blue-200">
                <Lock size={12} className="text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-blue-700 leading-relaxed">
                  <span className="font-semibold">Real OAuth flow:</span> You will be redirected to
                  Google to authorise access. Your credentials never touch Ventra — only an
                  encrypted OAuth token is stored.
                </p>
              </div>
            </div>
          )}

          {/* ── OAuth step ─────────────────────────────────────────────── */}
          {step === "oauth" && (
            <div className="px-6 py-5 space-y-5">
              {/* Google sign-in card */}
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="w-16 h-16 rounded-2xl bg-white border border-gray-200 shadow-md flex items-center justify-center">
                  {/* Google "G" logo */}
                  <svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" fill="#FFC107"/>
                    <path d="M6.306 14.691l6.571 4.819C14.655 15.108 19.0 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" fill="#FF3D00"/>
                    <path d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" fill="#4CAF50"/>
                    <path d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" fill="#1976D2"/>
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-[13px] font-semibold text-[var(--color-fg)]">Sign in with Google</p>
                  <p className="text-[11px] text-[var(--color-fg-faint)] mt-1 max-w-[300px] leading-relaxed">
                    You will be redirected to Google to authorise access to your Gmail inbox.
                  </p>
                </div>

                <button
                  onClick={handleGoogleSignIn}
                  className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl font-semibold text-[13px] border bg-white text-[#3c4043] border-gray-300 hover:bg-gray-50 shadow-sm transition-all"
                >
                  <Globe size={14} className="text-blue-500" />
                  Continue with Google
                </button>
              </div>

              {/* Permission list */}
              <div className="bg-[var(--color-canvas)] rounded-xl border border-[var(--color-border)] px-4 py-3 space-y-2">
                <p className="text-[11px] font-semibold text-[var(--color-fg-muted)] uppercase tracking-wider">
                  Permissions requested
                </p>
                {[
                  { icon: CheckCircle2, color: "text-emerald-500", label: "Read your emails" },
                  { icon: CheckCircle2, color: "text-emerald-500", label: "Send email on your behalf" },
                  { icon: CheckCircle2, color: "text-emerald-500", label: "View your email address and profile" },
                ].map(({ icon: Icon, color, label }) => (
                  <div key={label} className="flex items-center gap-2">
                    <Icon size={11} className={color} />
                    <span className="text-[11px] text-[var(--color-fg-muted)]">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-[var(--color-border)] flex-shrink-0 bg-[var(--color-canvas)]">
          {step === "intro" && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-[12px] font-semibold text-[var(--color-fg-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] hover:text-[var(--color-fg)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep("oauth")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors"
              >
                <Mail size={13} />
                Get started
              </button>
            </>
          )}

          {step === "oauth" && (
            <>
              <button
                onClick={() => setStep("intro")}
                className="px-4 py-2 rounded-xl text-[12px] font-semibold text-[var(--color-fg-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] hover:text-[var(--color-fg)] transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleGoogleSignIn}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors"
              >
                <Globe size={13} />
                Connect with Google
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
