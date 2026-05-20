import React from "react";
import { cn } from "../../lib/utils";

type CardVariant = "default" | "glass" | "ink" | "outline";
type CardPadding = "none" | "sm" | "md" | "lg";

export interface LuxuryCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
}

const variants: Record<CardVariant, string> = {
  default: "border border-slate-200/80 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.06)]",
  glass: "border border-white/65 bg-white/78 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-xl",
  ink: "border border-white/10 bg-slate-950 text-white shadow-[0_24px_70px_rgba(15,23,42,0.24)]",
  outline: "border border-slate-200 bg-transparent",
};

const paddings: Record<CardPadding, string> = {
  none: "p-0",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export const LuxuryCard = React.forwardRef<HTMLDivElement, LuxuryCardProps>(
  ({ className, variant = "default", padding = "md", children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("overflow-hidden rounded-[1.35rem] transition-all duration-200", variants[variant], paddings[padding], className)}
      {...props}
    >
      {children}
    </div>
  ),
);

LuxuryCard.displayName = "LuxuryCard";
