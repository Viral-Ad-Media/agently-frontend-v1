import React from "react";
import { cn } from "../../lib/utils";

type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive" | "glass";
type ButtonSize = "sm" | "md" | "lg" | "xl" | "icon";

export interface LuxuryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-slate-950 text-white shadow-lg shadow-slate-950/20 hover:bg-slate-800",
  secondary: "border border-slate-200 bg-white text-slate-900 shadow-sm hover:border-slate-300 hover:bg-slate-50",
  tertiary: "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950",
  destructive: "border border-red-100 bg-red-50 text-red-700 hover:bg-red-100",
  glass: "border border-white/35 bg-white/70 text-slate-900 shadow-sm backdrop-blur-xl hover:bg-white/90",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-xs gap-1.5",
  md: "min-h-11 px-5 text-sm gap-2",
  lg: "min-h-12 px-7 text-base gap-2.5",
  xl: "min-h-14 px-9 text-base gap-3",
  icon: "h-11 w-11 p-0",
};

export const LuxuryButton = React.forwardRef<HTMLButtonElement, LuxuryButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading = false, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex max-w-full items-center justify-center rounded-[0.9rem] font-black transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff9900] focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {isLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      <span className="min-w-0 truncate">{children}</span>
    </button>
  ),
);

LuxuryButton.displayName = "LuxuryButton";
