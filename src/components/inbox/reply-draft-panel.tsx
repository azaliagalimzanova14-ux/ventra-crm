"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sparkles, X, Copy, RefreshCw, Save, Send,
  ChevronDown, ChevronUp, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  generateAIDraft,
  saveDraft,
  getDraft,
  updateDraftContent,
  sendDraft,
  sendButtonLabel,
  DRAFT_STYLE_META,
  type AIDraft,
  type DraftStyle,
  type DraftChannel,
  type DraftGenerationInput,
} from "@/lib/ai-drafts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReplyDraftMessage {
  id:        string;
  role:      "client" | "you";
  content:   string;
  timestamp: string;
}

interface ReplyDraftPanelProps {
  convId:        string;
  channel:       DraftChannel;
  clientName:    string;
  clientCompany?: string;
  subject?:       string;
  messages:       ReplyDraftMessage[];
  onClose:        () => void;
  onToast:        (msg: string) => void;
}

// ── Confidence bar ────────────────────────────────────────────────────────────

function ConfidenceBar({ score }: { score: number }) {
  const color =
    score >= 80 ? "bg-emerald-500"
    : score >= 60 ? "bg-[var(--color-accent)]"
    : score >= 40 ? "bg-amber-500"
    : "bg-red-400";

  const label =
    score >= 80 ? "High confidence"
    : score >= 60 ? "Good confidence"
    : score >= 40 ? "Moderate confidence"
    : "Low confidence";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-[10px] font-semibold text-[var(--color-fg-faint)] whitespace-nowrap">
        {score}% · {label}
      </span>
    </div>
  );
}

// ── Style tab ─────────────────────────────────────────────────────────────────

function StyleTab({
  style,
  active,
  hasDraft,
  onClick,
}: {
  style:    DraftStyle;
  active:   boolean;
  hasDraft: boolean;
  onClick:  () => void;
}) {
  const meta = DRAFT_STYLE_META[style];
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex-1 flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg text-center transition-colors text-[11px] font-medium",
        active
          ? "bg-[var(--color-accent)] text-white"
          : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)]",
      )}
    >
      {hasDraft && !active && (
        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
      )}
      <span className="font-semibold">{meta.label}</span>
      <span className={cn(
        "text-[9px] leading-tight",
        active ? "text-white/80" : "text-[var(--color-fg-faint)]",
      )}>
        {meta.description}
      </span>
    </button>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

const STYLES: DraftStyle[] = ["professional", "friendly", "short", "detailed"];

export function ReplyDraftPanel({
  convId,
  channel,
  clientName,
  clientCompany,
  subject,
  messages,
  onClose,
  onToast,
}: ReplyDraftPanelProps) {
  const [activeStyle,     setActiveStyle]     = useState<DraftStyle>("professional");
  const [draft,           setDraft]           = useState<AIDraft | null>(null);
  const [editedText,      setEditedText]      = useState("");
  const [isGenerating,    setIsGenerating]    = useState(false);
  const [isSending,       setIsSending]       = useState(false);
  const [showReasoning,   setShowReasoning]   = useState(false);
  const [savedStyles,     setSavedStyles]     = useState<Set<DraftStyle>>(new Set());
  const [isSaved,         setIsSaved]         = useState(false);

  // Track which styles have saved drafts (dot indicator)
  useEffect(() => {
    const found = new Set<DraftStyle>();
    for (const s of STYLES) {
      if (getDraft(convId, s)) found.add(s);
    }
    setSavedStyles(found);
  }, [convId]);

  // Generate or load draft when style changes
  const loadOrGenerate = useCallback(
    async (style: DraftStyle, forceRegenerate = false) => {
      if (!forceRegenerate) {
        const existing = getDraft(convId, style);
        if (existing) {
          setDraft(existing);
          setEditedText(existing.editedContent ?? existing.content);
          setIsSaved(true);
          return;
        }
      }

      setIsGenerating(true);
      setDraft(null);
      setEditedText("");

      // Brief simulated generation delay for UX feedback
      await new Promise((r) => setTimeout(r, 600));

      const input: DraftGenerationInput = {
        convId,
        channel,
        clientName,
        clientCompany,
        subject,
        messages,
        style,
      };

      const generated = generateAIDraft(input);
      saveDraft(generated);
      setSavedStyles((prev) => new Set([...prev, style]));
      setDraft(generated);
      setEditedText(generated.content);
      setIsSaved(true);
      setIsGenerating(false);
    },
    [convId, channel, clientName, clientCompany, subject, messages],
  );

  useEffect(() => {
    void loadOrGenerate(activeStyle);
  }, [activeStyle, loadOrGenerate]);

  // Escape key to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  function handleTextChange(value: string) {
    setEditedText(value);
    setIsSaved(false);
  }

  function handleSave() {
    if (!draft) return;
    updateDraftContent(convId, activeStyle, editedText);
    setSavedStyles((prev) => new Set([...prev, activeStyle]));
    setIsSaved(true);
    onToast("Draft saved");
  }

  function handleCopy() {
    navigator.clipboard.writeText(editedText).catch(() => {});
    onToast("Draft copied to clipboard");
  }

  async function handleSend() {
    if (!draft || isSending) return;
    setIsSending(true);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const result = await sendDraft({ ...draft, editedContent: editedText }, convId);
    setIsSending(false);
    // Sending is stubbed — inform user
    onToast("Sending not yet available in this preview — use Copy to paste into your channel");
    onClose();
  }

  const isDirty = draft ? editedText !== draft.content : false;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[660px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-[var(--color-accent)]" />
            <h2 className="text-[14px] font-semibold text-[var(--color-fg)]">AI Reply Draft</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--color-canvas)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Context row */}
        <div className="px-5 py-2.5 bg-[var(--color-canvas)] border-b border-[var(--color-border)] flex-shrink-0">
          <p className="text-[11px] text-[var(--color-fg-faint)]">
            <span className="font-medium text-[var(--color-fg-muted)]">To:</span>{" "}
            {clientName}
            {clientCompany ? ` · ${clientCompany}` : ""}
          </p>
          {subject && (
            <p className="text-[11px] text-[var(--color-fg-faint)] mt-0.5">
              <span className="font-medium text-[var(--color-fg-muted)]">Re:</span> {subject}
            </p>
          )}
        </div>

        {/* Style tabs */}
        <div className="px-5 pt-3.5 pb-2.5 flex gap-1.5 flex-shrink-0">
          {STYLES.map((s) => (
            <StyleTab
              key={s}
              style={s}
              active={activeStyle === s}
              hasDraft={savedStyles.has(s)}
              onClick={() => { if (!isGenerating) setActiveStyle(s); }}
            />
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-3">

          {/* Confidence + Reasoning */}
          {draft && !isGenerating && (
            <div className="mb-3 p-3 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-border)]">
              <ConfidenceBar score={draft.confidence} />
              <button
                onClick={() => setShowReasoning((v) => !v)}
                className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] transition-colors"
              >
                {showReasoning ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                {showReasoning ? "Hide" : "Show"} reasoning
              </button>
              {showReasoning && (
                <ul className="mt-2 space-y-1">
                  {draft.reasoning.map((line, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-[var(--color-fg-muted)]">
                      <span className="mt-0.5 w-1 h-1 rounded-full bg-[var(--color-accent)] flex-shrink-0" />
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Textarea */}
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-border)]">
              <Sparkles size={18} className="text-[var(--color-accent)] animate-pulse" />
              <p className="text-[12px] text-[var(--color-fg-faint)]">Generating {DRAFT_STYLE_META[activeStyle].label.toLowerCase()} draft…</p>
            </div>
          ) : (
            <>
              <div className="relative">
                <textarea
                  value={editedText}
                  onChange={(e) => handleTextChange(e.target.value)}
                  rows={10}
                  className="w-full bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-[13px] text-[var(--color-fg)] leading-relaxed resize-none focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                />
                {isDirty && (
                  <span className="absolute top-2.5 right-3 text-[9px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                    Edited
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--color-fg-faint)] mt-1.5">
                Edit before sending — changes are saved per conversation and style.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--color-border)] flex items-center justify-between gap-2 flex-shrink-0">

          {/* Left: Regenerate */}
          <button
            onClick={() => { void loadOrGenerate(activeStyle, true); }}
            disabled={isGenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] transition-colors disabled:opacity-40"
          >
            <RefreshCw size={11} className={cn(isGenerating && "animate-spin")} />
            Regenerate
          </button>

          {/* Right: Save / Copy / Send */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleSave}
              disabled={isGenerating || isSending || isSaved}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors",
                isSaved
                  ? "text-emerald-600 border-emerald-200 bg-emerald-50"
                  : "text-[var(--color-fg-muted)] border-[var(--color-border)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent-subtle)]",
                "disabled:opacity-40",
              )}
            >
              {isSaved
                ? <><CheckCircle2 size={11} /> Saved</>
                : <><Save size={11} /> Save</>
              }
            </button>

            <button
              onClick={handleCopy}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--color-fg-muted)] border border-[var(--color-border)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent-subtle)] transition-colors disabled:opacity-40"
            >
              <Copy size={11} /> Copy
            </button>

            <button
              onClick={() => { void handleSend(); }}
              disabled={isGenerating || isSending || editedText.trim().length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white transition-colors disabled:opacity-40"
            >
              {isSending
                ? <><Sparkles size={11} className="animate-pulse" /> Sending…</>
                : <><Send size={11} /> {sendButtonLabel(channel)}</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
