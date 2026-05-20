import React from "react";

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-white/70 px-6 py-10 text-center backdrop-blur-xl">
      {icon ? <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-[#ff9900]">{icon}</div> : null}
      <p className="font-black text-slate-900">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
