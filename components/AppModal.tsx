import React, { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface AppModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  hideHeader?: boolean;
  className?: string;
  bodyClassName?: string;
  closeOnBackdrop?: boolean;
}

const SIZE_CLASS: Record<NonNullable<AppModalProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-5xl',
};

const AppModal: React.FC<AppModalProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'lg',
  hideHeader = false,
  className = '',
  bodyClassName = '',
  closeOnBackdrop = true,
}) => {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[400] overflow-y-auto bg-slate-950/75 backdrop-blur-md p-4 sm:p-6"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) {
          onClose();
        }
      }}
      aria-modal="true"
      role="dialog"
      aria-label={title}
    >
      <div className="flex min-h-full items-center justify-center">
        <div
          className={`relative w-full ${SIZE_CLASS[size]} rounded-[2rem] border border-white/70 bg-white shadow-[0_30px_120px_rgba(15,23,42,0.28)] ${className}`}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {!hideHeader ? (
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 sm:px-8">
              <div>
                <h3 className="text-xl font-black tracking-tight text-slate-900">
                  {title}
                </h3>
                {description ? (
                  <p className="mt-1 text-sm text-slate-500">{description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl p-2.5 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close modal"
              >
                <i className="fa-sharp fa-solid fa-xmark text-lg" />
              </button>
            </div>
          ) : null}

          <div className={`max-h-[calc(100vh-11rem)] overflow-y-auto px-6 py-6 sm:px-8 ${hideHeader ? 'p-0 sm:p-0 ' : ''}${bodyClassName}`}>
            {children}
          </div>

          {footer ? (
            <div className="border-t border-slate-100 px-6 py-5 sm:px-8">
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
