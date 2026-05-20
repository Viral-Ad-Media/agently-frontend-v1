import React from "react";
import { cn } from "../../lib/utils";

export function TableShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("w-full overflow-x-auto rounded-[1.35rem] border border-slate-200 bg-white shadow-sm custom-scrollbar", className)}>{children}</div>;
}
