import React from "react";

export function FormField({ label, description, error, children }: { label?: string; description?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      {label ? <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-600">{label}</span> : null}
      {children}
      {description ? <span className="block text-xs text-slate-400">{description}</span> : null}
      {error ? <span className="block text-xs font-bold text-red-600">{error}</span> : null}
    </label>
  );
}
