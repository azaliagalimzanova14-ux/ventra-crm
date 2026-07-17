"use client";

import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmModalProps {
  title:        string;
  description:  string;
  /** Bullet list of items that will be affected */
  items?:       string[];
  confirmLabel: string;
  /** Tailwind colour class for the confirm button, e.g. "bg-red-500 hover:bg-red-400" */
  confirmColor?: string;
  cancelLabel?:  string;
  onConfirm:    () => void;
  onCancel:     () => void;
}

/**
 * Generic destructive-action confirmation dialog.
 * Closes on backdrop click or Cancel. Does NOT auto-close on Confirm — the
 * caller is responsible for hiding the modal after the action completes.
 */
export function ConfirmModal({
  title,
  description,
  items,
  confirmLabel,
  confirmColor = "bg-red-500 hover:bg-red-400",
  cancelLabel  = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-[420px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center flex-shrink-0 mt-0.5">
            <AlertTriangle size={16} className="text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-bold text-[var(--color-fg)]">{title}</h2>
            <p className="text-[13px] text-[var(--color-fg-muted)] mt-1 leading-relaxed">{description}</p>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg text-[var(--color-fg-faint)] hover:text-[var(--color-fg)] hover:bg-[var(--color-canvas)] transition-colors flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {/* Items list */}
        {items && items.length > 0 && (
          <div className="mx-5 mb-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-[10px] font-bold text-red-700 uppercase tracking-wider mb-2">
              This will remove:
            </p>
            {items.map((item) => (
              <div key={item} className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />
                <span className="text-[12px] text-red-700">{item}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2.5 px-5 pb-5">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-accent-subtle)] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-colors",
              confirmColor,
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
