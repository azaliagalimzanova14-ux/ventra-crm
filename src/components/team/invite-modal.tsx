"use client";

/**
 * InviteModal — invite a teammate by email with a role selector.
 *
 * States:
 *   form    → email + role inputs, "Send Invite" CTA
 *   sending → brief spinner
 *   success → confirmation with copy-link option
 */

import { useState, useRef, useEffect } from "react";
import {
  X, Mail, ChevronDown, Check, Send, Loader2, Copy, Users2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ROLE_META, ROLE_HIERARCHY, type TeamRole,
} from "@/lib/team";

interface InviteModalProps {
  onInvite: (email: string, role: TeamRole) => void;
  onClose:  () => void;
}

type Stage = "form" | "sending" | "success";

export function InviteModal({ onInvite, onClose }: InviteModalProps) {
  const [email,        setEmail]        = useState("");
  const [role,         setRole]         = useState<TeamRole>("sales_manager");
  const [roleOpen,     setRoleOpen]     = useState(false);
  const [emailError,   setEmailError]   = useState("");
  const [stage,        setStage]        = useState<Stage>("form");
  const [linkCopied,   setLinkCopied]   = useState(false);

  const emailRef   = useRef<HTMLInputElement>(null);
  const roleRef    = useRef<HTMLDivElement>(null);

  // Auto-focus email on mount
  useEffect(() => { emailRef.current?.focus(); }, []);

  // Close role dropdown on outside click
  useEffect(() => {
    if (!roleOpen) return;
    function handle(e: MouseEvent) {
      if (roleRef.current && !roleRef.current.contains(e.target as Node)) {
        setRoleOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [roleOpen]);

  function validate(): boolean {
    const trimmed = email.trim();
    if (!trimmed) { setEmailError("Email is required"); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError("Enter a valid email address");
      return false;
    }
    setEmailError("");
    return true;
  }

  async function handleSend() {
    if (!validate()) return;
    setStage("sending");
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 900));
    onInvite(email.trim(), role);
    setStage("success");
  }

  function handleCopyLink() {
    void navigator.clipboard.writeText(`https://app.ventra.io/invite/${btoa(email.trim())}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  const roleMeta = ROLE_META[role];

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && stage !== "sending") onClose(); }}
    >
      <div className="w-full max-w-[480px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--color-border)]">
          <div className="w-8 h-8 rounded-xl bg-[var(--color-accent-subtle)] flex items-center justify-center flex-shrink-0">
            <Users2 size={15} className="text-[var(--color-accent)]" />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-[var(--color-fg)]">
              {stage === "success" ? "Invite sent!" : "Invite teammate"}
            </h2>
            <p className="text-[11px] text-[var(--color-fg-faint)]">
              {stage === "success"
                ? `An invite was sent to ${email.trim()}`
                : "They'll receive an email with a link to join your workspace"}
            </p>
          </div>
          {stage !== "sending" && (
            <button
              onClick={onClose}
              className="ml-auto p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] transition-colors flex-shrink-0"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* ── Success state ── */}
        {stage === "success" && (
          <div className="px-5 py-6 space-y-4">
            <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                <Check size={14} className="text-white" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-emerald-800">{email.trim()}</p>
                <p className="text-[11px] text-emerald-600">
                  Invited as {ROLE_META[role].label}
                </p>
              </div>
            </div>

            <div className="bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl p-3">
              <p className="text-[10px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider mb-2">
                Or share invite link
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] text-[var(--color-fg-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 truncate font-mono">
                  {`app.ventra.io/invite/${btoa(email.trim()).slice(0, 16)}…`}
                </code>
                <button
                  onClick={handleCopyLink}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors flex-shrink-0",
                    linkCopied
                      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                      : "bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white",
                  )}
                >
                  {linkCopied ? <Check size={11} /> : <Copy size={11} />}
                  {linkCopied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                onClick={() => { setEmail(""); setRole("sales_manager"); setStage("form"); }}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent-subtle)] transition-colors"
              >
                Invite another
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* ── Form state ── */}
        {stage !== "success" && (
          <div className="px-5 py-5 space-y-4">

            {/* Email */}
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-fg-muted)] uppercase tracking-wider mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-faint)]" />
                <input
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleSend(); }}
                  placeholder="colleague@company.com"
                  disabled={stage === "sending"}
                  className={cn(
                    "w-full pl-9 pr-3 py-2.5 rounded-xl bg-[var(--color-canvas)] border text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-faint)]",
                    "focus:outline-none transition-colors disabled:opacity-60",
                    emailError
                      ? "border-red-300 focus:border-red-400"
                      : "border-[var(--color-border)] focus:border-[var(--color-accent)]",
                  )}
                />
              </div>
              {emailError && (
                <p className="mt-1 text-[11px] text-red-500">{emailError}</p>
              )}
            </div>

            {/* Role */}
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-fg-muted)] uppercase tracking-wider mb-1.5">
                Role
              </label>
              <div ref={roleRef} className="relative">
                <button
                  type="button"
                  onClick={() => setRoleOpen((o) => !o)}
                  disabled={stage === "sending"}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-border)]",
                    "text-left transition-colors focus:outline-none disabled:opacity-60",
                    roleOpen ? "border-[var(--color-accent)]" : "hover:border-[var(--color-accent-subtle)]",
                  )}
                >
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0",
                    roleMeta.bg, roleMeta.color,
                  )}>
                    {roleMeta.label}
                  </span>
                  <span className="flex-1 text-[12px] text-[var(--color-fg-muted)] truncate">
                    {roleMeta.description}
                  </span>
                  <ChevronDown size={13} className={cn(
                    "text-[var(--color-fg-faint)] transition-transform flex-shrink-0",
                    roleOpen && "rotate-180",
                  )} />
                </button>

                {roleOpen && (
                  <div className="absolute z-10 top-full mt-1 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg overflow-hidden">
                    {ROLE_HIERARCHY.filter((r) => r !== "owner").map((r) => {
                      const meta    = ROLE_META[r];
                      const selected = r === role;
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => { setRole(r); setRoleOpen(false); }}
                          className={cn(
                            "w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors",
                            selected
                              ? "bg-[var(--color-accent-subtle)]"
                              : "hover:bg-[var(--color-canvas)]",
                          )}
                        >
                          <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0",
                            meta.bg, meta.color,
                          )}>
                            {meta.label}
                          </span>
                          <span className="flex-1 text-[12px] text-[var(--color-fg-muted)]">
                            {meta.description}
                          </span>
                          {selected && (
                            <Check size={12} className="text-[var(--color-accent)] flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2.5 pt-1">
              <button
                onClick={onClose}
                disabled={stage === "sending"}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent-subtle)] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleSend(); }}
                disabled={stage === "sending" || !email.trim()}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors",
                  stage === "sending" || !email.trim()
                    ? "bg-[var(--color-border)] text-[var(--color-fg-faint)] cursor-not-allowed"
                    : "bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white",
                )}
              >
                {stage === "sending"
                  ? <><Loader2 size={13} className="animate-spin" /> Sending…</>
                  : <><Send size={12} /> Send invite</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
