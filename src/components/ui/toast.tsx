/**
 * Unified Toast — bottom-center, auto-dismiss.
 * Replaces all inline toast implementations across the app.
 *
 * Usage:
 *   const [toast, setToast] = useState<string | null>(null);
 *   showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2500); }
 *   ...
 *   <AppToast msg={toast} />
 */

import { useEffect } from "react";
import { Check }     from "lucide-react";

export function AppToast({
  msg,
  onDone,
}: {
  msg:    string | null;
  onDone?: () => void;
}) {
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => onDone?.(), 2500);
    return () => clearTimeout(id);
  }, [msg, onDone]);

  if (!msg) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-4 py-2.5 bg-[var(--color-fg)] text-white rounded-xl shadow-xl text-[13px] font-medium pointer-events-none animate-in slide-in-from-bottom-2 duration-150"
    >
      <Check size={13} className="text-emerald-400 flex-shrink-0" />
      {msg}
    </div>
  );
}
