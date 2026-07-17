"use client";

/**
 * AttachmentBubble — renders a MessageAttachment inside a conversation thread.
 *
 * Variants:
 *   image    → inline thumbnail; click opens a lightbox overlay
 *   pdf      → chip: PDF icon + filename + size
 *   document → chip: file icon + filename + size
 *   voice    → compact audio player: play/pause + progress + duration
 *
 * All variants degrade gracefully when dataUrl is absent (metadata-only display).
 */

import { useState, useRef } from "react";
import {
  Play, Pause, FileText, File, ImageIcon, Mic, X, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFileSize, formatDuration, type MessageAttachment } from "@/lib/attachment-types";

// ── Image bubble ──────────────────────────────────────────────────────────────

function ImageBubble({ att, isYou }: { att: MessageAttachment; isYou: boolean }) {
  const [lightbox, setLightbox] = useState(false);

  if (!att.dataUrl) {
    return (
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-xl text-[12px]",
        isYou
          ? "bg-[var(--color-accent)]/20 text-white"
          : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-fg-muted)]",
      )}>
        <ImageIcon size={13} className="flex-shrink-0 opacity-70" />
        <span className="truncate max-w-[160px]">{att.name || "Photo"}</span>
        {att.sizeBytes > 0 && (
          <span className="text-[10px] opacity-60 flex-shrink-0">{formatFileSize(att.sizeBytes)}</span>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setLightbox(true)}
        className="block rounded-xl overflow-hidden max-w-[220px] hover:opacity-90 transition-opacity"
        title="Click to enlarge"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={att.dataUrl}
          alt={att.name || "Photo"}
          className="w-full object-cover max-h-[180px]"
        />
      </button>

      {lightbox && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setLightbox(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={att.dataUrl}
            alt={att.name || "Photo"}
            className="max-w-full max-h-full rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(false)}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}

// ── Document / PDF chip ───────────────────────────────────────────────────────

function DocumentBubble({ att, isYou }: { att: MessageAttachment; isYou: boolean }) {
  const Icon    = att.kind === "pdf" ? FileText : File;
  const kindLbl = att.kind === "pdf" ? "PDF" : "File";

  return (
    <div className={cn(
      "flex items-center gap-2.5 px-3 py-2.5 rounded-xl max-w-[240px]",
      isYou
        ? "bg-white/15 border border-white/20"
        : "bg-[var(--color-surface)] border border-[var(--color-border)]",
    )}>
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
        att.kind === "pdf"
          ? (isYou ? "bg-red-400/30" : "bg-red-100")
          : (isYou ? "bg-blue-400/30" : "bg-blue-100"),
      )}>
        <Icon size={15} className={att.kind === "pdf"
          ? (isYou ? "text-red-100" : "text-red-600")
          : (isYou ? "text-blue-100" : "text-blue-600")
        } />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn(
          "text-[12px] font-medium truncate",
          isYou ? "text-white" : "text-[var(--color-fg)]",
        )}>
          {att.name || kindLbl}
        </p>
        <p className={cn(
          "text-[10px]",
          isYou ? "text-white/60" : "text-[var(--color-fg-faint)]",
        )}>
          {kindLbl}{att.sizeBytes > 0 ? ` · ${formatFileSize(att.sizeBytes)}` : ""}
        </p>
      </div>
      {att.dataUrl && (
        <a
          href={att.dataUrl}
          download={att.name || "file"}
          className={cn(
            "p-1.5 rounded-lg flex-shrink-0 transition-colors",
            isYou ? "text-white/60 hover:text-white hover:bg-white/10" : "text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)]",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <Download size={12} />
        </a>
      )}
    </div>
  );
}

// ── Voice bubble ──────────────────────────────────────────────────────────────

function VoiceBubble({ att, isYou }: { att: MessageAttachment; isYou: boolean }) {
  const [isPlaying,   setIsPlaying]    = useState(false);
  const [progress,    setProgress]     = useState(0);      // 0–1
  const [currentTime, setCurrentTime]  = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); setIsPlaying(false); }
    else           { void audio.play(); setIsPlaying(true); }
  }

  function handleEnded()      { setIsPlaying(false); setProgress(1); }
  function handleTimeUpdate() {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    setProgress(a.currentTime / a.duration);
    setCurrentTime(a.currentTime);
  }

  const displayDuration = att.duration ?? 0;
  const displayTime     = isPlaying || progress > 0 ? currentTime : displayDuration;
  const hasAudio        = !!att.dataUrl;

  return (
    <div className={cn(
      "flex items-center gap-2.5 px-3 py-2 rounded-xl max-w-[240px]",
      isYou
        ? "bg-white/15 border border-white/20"
        : "bg-[var(--color-surface)] border border-[var(--color-border)]",
    )}>
      {/* Play / pause */}
      <button
        onClick={hasAudio ? togglePlay : undefined}
        disabled={!hasAudio}
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
          isYou
            ? (hasAudio ? "bg-white/30 hover:bg-white/40" : "bg-white/15 cursor-not-allowed")
            : (hasAudio ? "bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]" : "bg-[var(--color-border)] cursor-not-allowed"),
        )}
        title={hasAudio ? (isPlaying ? "Pause" : "Play") : "Audio not available"}
      >
        {isPlaying
          ? <Pause size={10} className={isYou ? "text-white" : "text-white"} />
          : <Play  size={10} className={cn("ml-0.5", isYou ? "text-white" : "text-white")} />}
      </button>

      {/* Progress bar + mic icon */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className={cn(
          "h-1.5 rounded-full overflow-hidden",
          isYou ? "bg-white/20" : "bg-[var(--color-border)]",
        )}>
          <div
            className={cn(
              "h-full rounded-full transition-all",
              isYou ? "bg-white/70" : "bg-[var(--color-accent)]",
            )}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* Duration / time + mic icon */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <Mic size={9} className={isYou ? "text-white/50" : "text-[var(--color-fg-faint)]"} />
        <span className={cn(
          "text-[10px] font-mono tabular-nums",
          isYou ? "text-white/70" : "text-[var(--color-fg-faint)]",
        )}>
          {formatDuration(Math.round(displayTime))}
        </span>
      </div>

      {hasAudio && (
        <audio
          ref={audioRef}
          src={att.dataUrl}
          onEnded={handleEnded}
          onTimeUpdate={handleTimeUpdate}
          className="hidden"
        />
      )}
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

interface AttachmentBubbleProps {
  attachment: MessageAttachment;
  /** true when rendered inside the "You" (outbound) bubble */
  isYou:      boolean;
}

export function AttachmentBubble({ attachment, isYou }: AttachmentBubbleProps) {
  switch (attachment.kind) {
    case "image":
      return <ImageBubble att={attachment} isYou={isYou} />;
    case "pdf":
    case "document":
      return <DocumentBubble att={attachment} isYou={isYou} />;
    case "voice":
      return <VoiceBubble att={attachment} isYou={isYou} />;
  }
}
