"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { FeedbackModal } from "./feedback-modal";
import { AppToast } from "@/components/ui/toast";

/**
 * Global floating feedback button.
 * Positioned bottom-right, left of the QuickActions FAB.
 * z-[90] — above content, below modals (z-[190]) and onboarding (z-[200]).
 */
export function FeedbackButton() {
  const pathname  = usePathname();
  const [open,    setOpen]  = useState(false);
  const [toast,   setToast] = useState<string | null>(null);

  return (
    <>
      <AppToast msg={toast} onDone={() => setToast(null)} />

      {/* Feedback pill */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-20 z-[90] flex items-center gap-1.5 px-3 py-2 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] shadow-md hover:border-[var(--color-accent-subtle)] hover:shadow-lg transition-all text-[12px] font-semibold text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        title="Share feedback"
      >
        <MessageSquare size={13} className="text-[var(--color-accent)]" />
        Feedback
      </button>

      {open && (
        <FeedbackModal
          currentPage={pathname}
          onClose={() => setOpen(false)}
          onSubmit={() => setToast("Thanks for your feedback!")}
        />
      )}
    </>
  );
}
