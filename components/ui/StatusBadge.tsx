import React from "react";
import { cn } from "../../lib/utils";

type StatusVariant = "success" | "warning" | "error" | "info" | "neutral";

export function StatusBadge({ children, variant = "neutral", dot = true, className = "" }: { children: React.ReactNode; variant?: StatusVariant; dot?: boolean; className?: string }) {
  const variants: Record<StatusVariant, string> = {
    success: "border-emerald-100 bg-emerald-50 text-emerald-700",
    warning: "border-amber-100 bg-amber-50 text-amber-700",
    error: "border-red-100 bg-red-50 text-red-700",
    info: "border-blue-100 bg-blue-50 text-blue-700",
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
  };
  const dots: Record<StatusVariant, string> = {
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    error: "bg-red-500",
    info: "bg-blue-500",
    neutral: "bg-slate-400",
  };
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em]", variants[variant], className)}>
      {dot ? <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dots[variant])} /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}
