"use client";

/**
 * VoiceRecorder — inline voice message recorder for the ReplyBar.
 *
 * States:
 *   idle       → "Start recording" button
 *   requesting → awaiting mic permission
 *   recording  → pulsing red dot + elapsed timer + Stop button
 *   review     → audio player + duration + Discard / Use buttons
 *   error      → permission denied or API unavailable
 *
 * The component does NOT send anything — it hands the recorded Blob + duration
 * back to the parent via onRecorded().
 *
 * Browser notes:
 *   MediaRecorder outputs audio/webm;codecs=opus on Chrome/Firefox.
 *   Safari outputs audio/mp4 (AAC). Both work fine via sendDocument on Telegram.
 *   Native voice message (OGG/Opus) conversion is a roadmap item.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Square, Play, Pause, X, Check, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/attachment-types";

type RecorderState = "idle" | "requesting" | "recording" | "review" | "error";

interface VoiceRecorderProps {
  onRecorded: (blob: Blob, durationSec: number) => void;
  onCancel:   () => void;
}

const MAX_DURATION_SEC = 120; // 2 minutes max

export function VoiceRecorder({ onRecorded, onCancel }: VoiceRecorderProps) {
  const [state,       setState]       = useState<RecorderState>("idle");
  const [elapsed,     setElapsed]     = useState(0);    // recording seconds
  const [duration,    setDuration]    = useState(0);    // review seconds
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [playProgress, setPlayProgress] = useState(0);  // 0–1
  const [errorMsg,    setErrorMsg]    = useState("");
  const [reviewUrl,   setReviewUrl]   = useState<string | null>(null);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks        = useRef<Blob[]>([]);
  const stream        = useRef<MediaStream | null>(null);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef      = useRef<HTMLAudioElement | null>(null);
  const recordedBlob  = useRef<Blob | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  // ── Start recording ────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    setState("requesting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Microphone access denied";
      setErrorMsg(msg.includes("denied") ? "Microphone permission denied" : msg);
      setState("error");
      return;
    }

    const mimeType =
      MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" :
      MediaRecorder.isTypeSupported("audio/webm")             ? "audio/webm" :
      MediaRecorder.isTypeSupported("audio/mp4")              ? "audio/mp4" :
      "";                                                        // browser default

    const recorder = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
    mediaRecorder.current = recorder;
    chunks.current        = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data);
    };

    recorder.onstop = () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      const blob     = new Blob(chunks.current, { type: recorder.mimeType || "audio/webm" });
      const url      = URL.createObjectURL(blob);
      recordedBlob.current = blob;
      setReviewUrl(url);
      setDuration(elapsed);
      setState("review");
    };

    recorder.start(250); // collect chunks every 250 ms
    setState("recording");
    setElapsed(0);

    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        if (prev + 1 >= MAX_DURATION_SEC) {
          stopRecording();
          return MAX_DURATION_SEC;
        }
        return prev + 1;
      });
    }, 1000);
  }, [elapsed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stop recording ─────────────────────────────────────────────────────────

  function stopRecording() {
    stopTimer();
    if (mediaRecorder.current?.state === "recording") {
      mediaRecorder.current.stop();
    }
  }

  // ── Playback ───────────────────────────────────────────────────────────────

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      void audio.play();
      setIsPlaying(true);
    }
  }

  function handleAudioEnded() {
    setIsPlaying(false);
    setPlayProgress(1);
  }

  function handleAudioTimeUpdate() {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setPlayProgress(audio.currentTime / audio.duration);
  }

  // ── Confirm / discard ──────────────────────────────────────────────────────

  function handleUse() {
    if (!recordedBlob.current) return;
    onRecorded(recordedBlob.current, duration);
  }

  function handleDiscard() {
    if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    recordedBlob.current = null;
    setReviewUrl(null);
    setElapsed(0);
    setDuration(0);
    setPlayProgress(0);
    setIsPlaying(false);
    setState("idle");
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (state === "idle") {
    return (
      <button
        onClick={() => { void startRecording(); }}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--color-border)] hover:border-red-300 text-[var(--color-fg-muted)] hover:text-red-600 text-[11px] font-medium transition-colors"
        title="Record voice message"
      >
        <Mic size={13} />
      </button>
    );
  }

  if (state === "requesting") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-fg-faint)] text-[11px]">
        <Loader2 size={12} className="animate-spin" />
        Requesting mic…
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-red-600 text-[11px] max-w-[240px]">
        <AlertCircle size={12} className="flex-shrink-0" />
        <span className="truncate">{errorMsg}</span>
        <button onClick={onCancel} className="ml-auto flex-shrink-0">
          <X size={12} />
        </button>
      </div>
    );
  }

  if (state === "recording") {
    const pct = (elapsed / MAX_DURATION_SEC) * 100;
    return (
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-red-200 bg-red-50">
        {/* Pulsing dot */}
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
        {/* Progress bar */}
        <div className="flex-1 h-1.5 rounded-full bg-red-100 overflow-hidden">
          <div className="h-full bg-red-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        {/* Timer */}
        <span className="text-[11px] font-mono text-red-600 tabular-nums flex-shrink-0">
          {formatDuration(elapsed)}
        </span>
        {/* Stop */}
        <button
          onClick={stopRecording}
          className="w-6 h-6 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors flex-shrink-0"
          title="Stop recording"
        >
          <Square size={9} className="text-white fill-white" />
        </button>
        {/* Cancel */}
        <button onClick={() => { stopTimer(); stream.current?.getTracks().forEach((t) => t.stop()); onCancel(); }} className="text-red-400 hover:text-red-600">
          <X size={13} />
        </button>
      </div>
    );
  }

  // review state
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)]">
      {/* Play/Pause */}
      <button
        onClick={togglePlay}
        className="w-7 h-7 rounded-full bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] flex items-center justify-center flex-shrink-0 transition-colors"
      >
        {isPlaying
          ? <Pause size={11} className="text-white" />
          : <Play  size={11} className="text-white ml-0.5" />}
      </button>

      {/* Waveform / progress */}
      <div className="flex-1 h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
        <div
          className="h-full bg-[var(--color-accent)] transition-all"
          style={{ width: `${playProgress * 100}%` }}
        />
      </div>

      {/* Duration */}
      <span className="text-[10px] text-[var(--color-fg-faint)] font-mono tabular-nums flex-shrink-0">
        {formatDuration(duration)}
      </span>

      {/* Use button */}
      <button
        onClick={handleUse}
        className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
          "bg-emerald-500 hover:bg-emerald-600",
        )}
        title="Use this recording"
      >
        <Check size={11} className="text-white" />
      </button>

      {/* Discard */}
      <button
        onClick={handleDiscard}
        className="text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] transition-colors"
        title="Discard and re-record"
      >
        <X size={13} />
      </button>

      {reviewUrl && (
        <audio
          ref={audioRef}
          src={reviewUrl}
          onEnded={handleAudioEnded}
          onTimeUpdate={handleAudioTimeUpdate}
          className="hidden"
        />
      )}
    </div>
  );
}
