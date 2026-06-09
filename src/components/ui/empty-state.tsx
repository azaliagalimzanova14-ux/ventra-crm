"use client";

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon: Icon, title, subtitle, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-20 gap-4", className)}>
      <div className="w-14 h-14 rounded-2xl bg-[#111128] border border-[#1c1c35] flex items-center justify-center">
        <Icon size={24} className="text-[#3a3a5a]" />
      </div>
      <div className="text-center max-w-[240px]">
        <p className="text-[14px] font-semibold text-[#5a5a8a]">{title}</p>
        {subtitle && (
          <p className="text-[12px] text-[#3a3a5a] mt-1 leading-relaxed">{subtitle}</p>
        )}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
        >
          <Plus size={14} strokeWidth={2.5} />
          {action.label}
        </button>
      )}
    </div>
  );
}
