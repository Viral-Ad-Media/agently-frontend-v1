import React, { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface AppModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  hideHeader?: boolean;
  className?: string;
  bodyClassName?: string;
  closeOnBackdrop?: boolean;
}

const SIZE_CLASS: Record<NonNullable<AppModalProps["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  "2xl": "max-w-5xl",
};

const AppModal: React.FC<AppModalProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "lg",
  hideHeader = false,
  className = "",
  bodyClassName = "",
  closeOnBackdrop = true,
}) => {
  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[400] overflow-hidden bg-slate-950/65 p-0 sm:p-4 lg:p-6"
      onClick={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) {
          onClose();
        }
      }}
      aria-modal="true"
      role="dialog"
      aria-label={title}
    >
      <div className="flex h-full min-w-0 items-end justify-center sm:items-center">
        <div
          className={`relative flex max-h-[94dvh] w-full min-w-0 flex-col overflow-hidden ${SIZE_CLASS[size]} rounded-t-[1.5rem] border border-white/70 bg-white shadow-xl sm:max-h-[calc(100vh-2rem)] sm:rounded-[2rem] ${className}`}
          onClick={(event) => event.stopPropagation()}
        >
          {!hideHeader ? (
            <div className="flex min-w-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5 lg:px-8">
              <div className="min-w-0">
                <h3 className="truncate text-base font-black tracking-tight text-slate-900 sm:text-lg lg:text-xl">
                  {title}
                </h3>
                {description ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500 sm:text-sm">
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-2xl p-2.5 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close modal"
              >
                <i className="fa-sharp fa-solid fa-xmark text-lg" />
              </button>
            </div>
          ) : null}

          <div
            className={`min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 ${hideHeader ? "p-0 sm:p-0 lg:p-0 " : ""}${bodyClassName}`}
          >
            {children}
          </div>

          {footer ? (
            <div className="border-t border-slate-100 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default AppModal;
