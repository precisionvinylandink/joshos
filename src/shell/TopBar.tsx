import type { ReactNode } from 'react';
import { Bell, Search } from 'lucide-react';
import { cn } from '../shared/lib/cn';

export interface TopBarProps {
  title: string;
  onOpenPalette: () => void;
  notifications?: number;
  userInitials: string;
  /** Desktop supplies a live notification bell here; web falls back to a static one. */
  notificationSlot?: ReactNode;
}

export function TopBar({ title, onOpenPalette, notifications = 0, userInitials, notificationSlot }: TopBarProps) {
  return (
    <header className="app-drag flex h-14 shrink-0 items-center gap-4 border-b border-border bg-bg px-4">
      <div className="shrink-0 text-sm font-medium text-text">{title}</div>

      <button
        onClick={onOpenPalette}
        className="app-no-drag mx-auto flex w-full max-w-md items-center gap-2 rounded-theme border border-border bg-surface px-3 py-1.5 text-sm text-muted transition hover:border-white/20"
      >
        <Search size={15} />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-dim">⌘K</kbd>
      </button>

      <div className="app-no-drag flex shrink-0 items-center gap-3">
        {notificationSlot ?? (
          <button
            className="relative rounded-theme p-1.5 text-muted transition hover:bg-white/5 hover:text-text"
            aria-label="Notifications"
          >
            <Bell size={18} />
            {notifications > 0 && (
              <span
                className={cn(
                  'absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white',
                )}
              >
                {notifications > 9 ? '9+' : notifications}
              </span>
            )}
          </button>
        )}
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
          {userInitials}
        </div>
      </div>
    </header>
  );
}
