/**
 * Badge — design-token aware.
 * Generic badge + InsightKindBadge variant built on KIND_STYLES.
 */

import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";
import { KIND_STYLES, type InsightKind } from "./ai-insight-card";

/** Generic badge — pass className for colour */
export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border",
        className,
      )}
      {...props}
    />
  );
}

/** Status/insight-kind badge using the unified KIND_STYLES */
export function KindBadge({
  kind,
  label,
  className,
}: {
  kind:      InsightKind;
  label?:    string;
  className?: string;
}) {
  const style = KIND_STYLES[kind];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border", style.badge, className)}>
      {label ?? style.label}
    </span>
  );
}
