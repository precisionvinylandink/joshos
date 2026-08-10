import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';

export interface SlideOverProps {
  open: boolean;
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function SlideOver({ open, title, onClose, children, footer }: SlideOverProps) {
  // Mount → next frame flips `shown` so the panel transitions in from the right.
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div
        className={cn(
          'absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200',
          shown ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          'absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col border-l border-border bg-surface shadow-2xl transition-transform duration-200',
          shown ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="text-sm font-medium text-text">{title}</div>
          <button
            onClick={onClose}
            className="rounded-theme p-1 text-muted transition hover:bg-white/5 hover:text-text"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="border-t border-border px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
