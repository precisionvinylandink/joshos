import { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';

/**
 * Command palette shell. Opens on ⌘K (handled in AppShell). Results are stubbed
 * for now — the wiring (fuzzy search across jobs, clients, actions) lands with
 * the JobOS domains.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    inputRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search size={16} className="text-muted" />
          <input
            ref={inputRef}
            placeholder="Search jobs, clients, actions…"
            className="w-full bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
          />
          <kbd className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-dim">ESC</kbd>
        </div>
        <div className="px-4 py-10 text-center text-xs text-muted">
          Command palette results coming soon.
        </div>
      </div>
    </div>
  );
}
