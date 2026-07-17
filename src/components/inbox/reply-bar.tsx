"use client";

/**
 * ReplyBar — the bottom reply strip in each Inbox conversation.
 *
 * Channels:
 *   telegram  — textarea + Send, with file picker + voice recorder
 *   email     — textarea + Send, with file picker
 *   whatsapp  — "coming soon" placeholder
 *   call      — "Call transcript — no reply needed"
 *
 * Attachment flow:
 *   📎 Paperclip → file input (image/*, .pdf, .doc, .docx, .txt, …)
 *   🎤 Mic → VoiceRecorder overlay → on confirm, attachment set to voice Blob
 *   Attachment chip shows above textarea; × removes it.
 *   On Send: FormData POST (text + optional file).
 *
 * Optimistic send:
 *   1. User clicks Send → onMessageUpdate({ status: "sending" }) → parent shows immediately
 *   2. POST to channel API
 *   3. Success → "sent" → "delivered" after 1.5 s (Telegram) / immediate (email)
 *   4. Failure → "failed" + error, retry via retryById ref
 */

import {
  useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef,
} from "react";
import { Send, Sparkles, Loader2, Paperclip, Mic, X, FileText, ImageIcon, File as FileIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  saveOutboundMessage,
  updateOutboundStatus,
  generateOutboundId,
  type OutboundMessage,
  type DeliveryStatus,
} from "@/lib/outbox";
import {
  kindFromMime, kindFromFilename, formatFileSize,
  ATTACHMENT_DATAURL_LIMIT, type MessageAttachment, type AttachmentKind,
} from "@/lib/attachment-types";
import { VoiceRecorder } from "./voice-recorder";
import type { IntegrationConnection } from "@/lib/integrations";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReplyChannel = "telegram" | "email" | "whatsapp" | "call";

export interface ReplyBarRef {
  retryById: (outboundId: string) => void;
}

interface PendingAttachment {
  file:    File;
  kind:    AttachmentKind;
  preview: string | null;   // object URL for images, null otherwise
}

interface ReplyBarProps {
  convId:         string;
  channel:        ReplyChannel;
  chatId?:        number | null;
  threadId?:      string;
  emailTo?:       string;
  emailSubject?:  string;
  telegramConn:   IntegrationConnection | null;
  onMessageUpdate: (msg: OutboundMessage) => void;
  onDraftWithAI:   () => void;
  onToast:         (msg: string) => void;
}

// ── API helpers ────────────────────────────────────────────────────────────────

interface SendApiResponse {
  ok:                boolean;
  telegramMessageId?: number;
  messageId?:        string;
  isMock?:           boolean;
  error?:            string;
}

/** Read file as base64 data URL. Returns null if file is too large. */
function fileToDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    if (file.size > ATTACHMENT_DATAURL_LIMIT) { resolve(null); return; }
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function callSendApi(
  endpoint: string,
  formData: FormData,
): Promise<SendApiResponse> {
  const res = await fetch(endpoint, { method: "POST", body: formData });
  return res.json() as Promise<SendApiResponse>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const ReplyBar = forwardRef<ReplyBarRef, ReplyBarProps>(function ReplyBar(
  {
    convId, channel, chatId, threadId, emailTo, emailSubject,
    telegramConn, onMessageUpdate, onDraftWithAI, onToast,
  },
  ref,
) {
  const [text,           setText]          = useState("");
  const [isSending,      setIsSending]     = useState(false);
  const [attachment,     setAttachment]    = useState<PendingAttachment | null>(null);
  const [showVoice,      setShowVoice]     = useState(false);

  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingRetries = useRef<Map<string, { text: string; file?: File }>>(new Map());

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  // Cleanup object URLs on unmount / attachment change
  useEffect(() => {
    return () => {
      if (attachment?.preview) URL.revokeObjectURL(attachment.preview);
    };
  }, [attachment]);

  // ── Attachment helpers ─────────────────────────────────────────────────────

  function setFileAttachment(file: File) {
    const kind    = kindFromMime(file.type) || kindFromFilename(file.name);
    const preview = kind === "image" ? URL.createObjectURL(file) : null;
    setAttachment({ file, kind, preview });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileAttachment(file);
    // Reset input so the same file can be selected again
    e.target.value = "";
  }

  function handleVoiceRecorded(blob: Blob, durationSec: number) {
    setShowVoice(false);
    const ext      = blob.type.includes("webm") ? "webm" : blob.type.includes("mp4") ? "m4a" : "ogg";
    const file     = new File([blob], `voice_${Date.now()}.${ext}`, { type: blob.type });
    const kind: AttachmentKind = "voice";
    const preview  = URL.createObjectURL(blob);
    // Attach duration as a custom property (we'll read it in doSend)
    Object.defineProperty(file, "__duration", { value: durationSec, writable: false });
    setAttachment({ file, kind, preview });
  }

  function removeAttachment() {
    if (attachment?.preview) URL.revokeObjectURL(attachment.preview);
    setAttachment(null);
  }

  // ── Core send ──────────────────────────────────────────────────────────────

  const doSend = useCallback(async (
    content:     string,
    fileArg?:    File,
    outboundId?: string,
  ) => {
    const trimmed = content.trim();
    if (!trimmed && !fileArg) return;
    if (isSending) return;

    const id      = outboundId ?? generateOutboundId();
    const now     = new Date().toISOString();
    const isMock  = telegramConn?.isMock ?? true;
    const tgChatId = chatId ?? (
      convId.startsWith("tg_conv_") ? Number(convId.replace("tg_conv_", "")) : null
    );

    // Build attachment metadata for outbox (compute dataUrl for small files)
    let attachMeta: MessageAttachment | undefined;
    if (fileArg) {
      const kind      = kindFromMime(fileArg.type) || kindFromFilename(fileArg.name);
      const dataUrl   = await fileToDataUrl(fileArg);
      const durationProp = Object.getOwnPropertyDescriptor(fileArg, "__duration")?.value as number | undefined;
      attachMeta = {
        kind,
        name:      fileArg.name,
        mimeType:  fileArg.type,
        sizeBytes: fileArg.size,
        dataUrl:   dataUrl ?? undefined,
        duration:  durationProp,
      };
    }

    const outbound: OutboundMessage = {
      id, convId,
      channel:      channel as "telegram" | "email" | "whatsapp",
      content:      trimmed || (fileArg?.name ?? ""),
      sentAt:       now,
      status:       "sending",
      chatId:       tgChatId ?? undefined,
      threadId,
      emailTo,
      emailSubject: emailSubject ? `Re: ${emailSubject.replace(/^Re:\s*/i, "")}` : undefined,
      isMock,
      attachment:   attachMeta,
    };

    if (!outboundId) {
      saveOutboundMessage(outbound);
      setText("");
      // Inline removal to keep doSend's dep array clean
      setAttachment((prev) => {
        if (prev?.preview) URL.revokeObjectURL(prev.preview);
        return null;
      });
      textareaRef.current?.focus();
    } else {
      updateOutboundStatus(id, "sending");
    }
    onMessageUpdate({ ...outbound, status: "sending" });

    setIsSending(true);
    pendingRetries.current.set(id, { text: trimmed, file: fileArg });

    try {
      // Build FormData
      const form = new FormData();

      if (channel === "telegram") {
        form.append("chatId", (tgChatId ?? 0).toString());
        if (trimmed) form.append("text", trimmed);
        if (fileArg) {
          form.append("file", fileArg);
          form.append("kind", attachMeta?.kind ?? "document");
        }
      } else if (channel === "email") {
        form.append("to",      emailTo ?? "");
        form.append("subject", emailSubject ? `Re: ${emailSubject.replace(/^Re:\s*/i, "")}` : "Reply");
        form.append("body",    trimmed || (fileArg?.name ?? ""));
        if (threadId) form.append("threadId", threadId);
        if (fileArg) {
          form.append("file", fileArg);
          form.append("kind", attachMeta?.kind ?? "document");
        }
      }

      const endpoint = channel === "telegram"
        ? "/api/integrations/telegram/send"
        : "/api/integrations/gmail/send";

      let result: SendApiResponse;

      // Mock convs (conv-*) — simulate without hitting API
      if (channel === "telegram" && (!tgChatId || isNaN(tgChatId))) {
        await new Promise((r) => setTimeout(r, 350));
        result = { ok: true, telegramMessageId: Math.floor(Math.random() * 900_000), isMock: true };
      } else {
        result = await callSendApi(endpoint, form);
      }

      if (!result.ok) {
        const errMsg = result.error ?? "Send failed";
        updateOutboundStatus(id, "failed", { error: errMsg });
        onMessageUpdate({ ...outbound, status: "failed", error: errMsg });
        onToast(`Send failed: ${errMsg.slice(0, 80)}`);
      } else {
        const apiId         = (result.telegramMessageId?.toString() ?? result.messageId);
        const finalStatus: DeliveryStatus = channel === "email" ? "delivered" : "sent";
        updateOutboundStatus(id, finalStatus, { apiMessageId: apiId });
        onMessageUpdate({ ...outbound, status: finalStatus, apiMessageId: apiId });
        pendingRetries.current.delete(id);

        if (channel === "telegram") {
          setTimeout(() => {
            updateOutboundStatus(id, "delivered");
            onMessageUpdate({ ...outbound, status: "delivered" });
          }, 1500);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      updateOutboundStatus(id, "failed", { error: errMsg });
      onMessageUpdate({ ...outbound, status: "failed", error: errMsg });
      onToast(`Send failed: ${errMsg.slice(0, 80)}`);
    } finally {
      setIsSending(false);
    }
  }, [
    isSending, convId, channel, chatId, threadId, emailTo, emailSubject,
    telegramConn, onMessageUpdate, onToast,
  ]);

  useImperativeHandle(ref, () => ({
    retryById: (outboundId: string) => {
      const p = pendingRetries.current.get(outboundId);
      if (p) void doSend(p.text, p.file, outboundId);
    },
  }), [doSend]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !isSending) {
      e.preventDefault();
      void doSend(text, attachment?.file ?? undefined);
    }
  }

  // ── Non-interactive channels ───────────────────────────────────────────────

  if (channel === "call") {
    return (
      <div className="px-5 py-3.5 border-t border-[var(--color-border)] bg-[var(--color-surface)] flex-shrink-0">
        <div className="flex items-center gap-2.5 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl px-4 py-2.5">
          <p className="flex-1 text-[12px] text-[var(--color-fg-faint)] cursor-default select-none">
            Call transcript — no reply needed
          </p>
        </div>
      </div>
    );
  }

  if (channel === "whatsapp") {
    return (
      <div className="px-5 py-3.5 border-t border-[var(--color-border)] bg-[var(--color-surface)] flex-shrink-0">
        <div className="flex items-center justify-between gap-2.5 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl px-4 py-2.5">
          <p className="flex-1 text-[12px] text-[var(--color-fg-faint)] cursor-default select-none">
            WhatsApp sending coming soon…
          </p>
          <button
            onClick={onDraftWithAI}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[11px] font-semibold transition-colors flex-shrink-0"
          >
            <Sparkles size={10} /> Draft with AI
          </button>
        </div>
      </div>
    );
  }

  // ── Active reply bar (telegram / email) ────────────────────────────────────

  const canSend     = (text.trim().length > 0 || !!attachment) && !isSending;
  const placeholder = channel === "telegram"
    ? "Reply via Telegram… (⌘↵ to send)"
    : "Reply via Email… (⌘↵ to send)";

  return (
    <div className="px-5 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] flex-shrink-0 space-y-2">

      {/* Voice recorder overlay */}
      {showVoice && (
        <VoiceRecorder
          onRecorded={handleVoiceRecorded}
          onCancel={() => setShowVoice(false)}
        />
      )}

      {/* Attachment chip */}
      {attachment && !showVoice && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--color-accent-subtle)] border border-[var(--color-border)] w-fit max-w-full">
          {attachment.kind === "image" && attachment.preview
            ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={attachment.preview} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
            )
            : attachment.kind === "image"
              ? <ImageIcon size={14} className="text-[var(--color-accent)] flex-shrink-0" />
              : attachment.kind === "pdf"
                ? <FileText size={14} className="text-red-500 flex-shrink-0" />
                : attachment.kind === "voice"
                  ? <Mic size={14} className="text-[var(--color-accent)] flex-shrink-0" />
                  : <FileIcon size={14} className="text-blue-500 flex-shrink-0" />
          }
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-[var(--color-fg)] truncate max-w-[160px]">
              {attachment.file.name}
            </p>
            <p className="text-[10px] text-[var(--color-fg-faint)]">
              {formatFileSize(attachment.file.size)}
            </p>
          </div>
          <button
            onClick={removeAttachment}
            className="ml-1 p-0.5 text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] flex-shrink-0"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Main input row */}
      {!showVoice && (
        <div className="flex items-end gap-2">
          {/* Textarea */}
          <div className="flex-1 bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 focus-within:border-[var(--color-accent)] transition-colors">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={1}
              disabled={isSending}
              className={cn(
                "w-full bg-transparent text-[13px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-faint)]",
                "resize-none focus:outline-none leading-relaxed disabled:opacity-60",
              )}
              style={{ minHeight: "24px", maxHeight: "120px" }}
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 pb-[3px]">
            {/* File picker */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending}
              className="flex items-center gap-1 px-2.5 py-[9px] rounded-xl border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] text-[var(--color-fg-muted)] hover:text-[var(--color-accent)] transition-colors flex-shrink-0 disabled:opacity-40"
              title="Attach file"
            >
              <Paperclip size={13} />
            </button>

            {/* Voice recorder (Telegram only) */}
            {channel === "telegram" && !attachment && (
              <button
                onClick={() => setShowVoice(true)}
                disabled={isSending}
                className="flex items-center gap-1 px-2.5 py-[9px] rounded-xl border border-[var(--color-border)] hover:border-red-200 text-[var(--color-fg-muted)] hover:text-red-500 transition-colors flex-shrink-0 disabled:opacity-40"
                title="Record voice message"
              >
                <Mic size={13} />
              </button>
            )}

            {/* AI Draft */}
            <button
              onClick={onDraftWithAI}
              className="flex items-center gap-1.5 px-2.5 py-[9px] rounded-xl border border-[var(--color-border)] hover:border-[var(--color-accent-subtle)] text-[var(--color-fg-muted)] hover:text-[var(--color-accent)] transition-colors flex-shrink-0"
              title="Draft with AI"
            >
              <Sparkles size={12} />
            </button>

            {/* Send */}
            <button
              onClick={() => { void doSend(text, attachment?.file ?? undefined); }}
              disabled={!canSend}
              className={cn(
                "flex items-center gap-1.5 px-3 py-[9px] rounded-xl text-[12px] font-semibold transition-colors flex-shrink-0",
                canSend
                  ? "bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white"
                  : "bg-[var(--color-border)] text-[var(--color-fg-faint)] cursor-not-allowed",
              )}
              title="Send (⌘↵)"
            >
              {isSending
                ? <Loader2 size={13} className="animate-spin" />
                : <Send size={13} />}
              <span className="hidden sm:inline">{isSending ? "Sending" : "Send"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.mp3,.m4a,.wav"
        onChange={handleFileChange}
      />
    </div>
  );
});

ReplyBar.displayName = "ReplyBar";
