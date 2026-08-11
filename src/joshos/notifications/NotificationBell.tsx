import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import { cn } from '../../shared/lib/cn';
import { formatRelative } from '../../shared/lib/formatters';
import { useNotifications, joshos } from '../store';
import type { NotificationCategory } from './types';

const CAT_COLOR: Record<NotificationCategory, string> = {
  now: 'var(--brand)',
  important: 'var(--danger)',
  reminder: 'var(--accent3)',
  schedule: 'var(--accent3)',
  life: '#639922',
  work: '#378add',
  jobos: '#378add',
  progress: 'var(--success)',
  system: 'var(--text-muted)',
};

export function NotificationBell() {
  const notifications = useNotifications();
  const [open, setOpen] = useState(false);

  const nowMs = Date.now();
  const visible = notifications
    .filter((n) => !n.snoozedUntil || new Date(n.snoozedUntil).getTime() <= nowMs)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const unread = visible.filter((n) => !n.read).length;

  return (
    <div className="relative app-no-drag">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-theme p-1.5 text-muted transition hover:bg-white/5 hover:text-text"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed right-4 top-14 z-50 flex max-h-[70vh] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-theme border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="text-sm font-medium text-text">Notifications</div>
              {unread > 0 && (
                <button onClick={() => joshos.markAllNotificationsRead()} className="text-xs text-muted transition hover:text-text">
                  Mark all read
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {visible.length === 0 ? (
                <div className="px-4 py-10 text-center text-xs text-muted">You’re all caught up.</div>
              ) : (
                visible.map((n) => (
                  <div key={n.id} className={cn('flex gap-2.5 border-b border-border px-4 py-2.5 last:border-0', !n.read && 'bg-white/[0.02]')}>
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: CAT_COLOR[n.category] }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-text">{n.title}</div>
                      {n.body && <div className="text-xs text-dim">{n.body}</div>}
                      <div className="mt-1 flex items-center gap-3 text-[11px]">
                        <span className="text-muted">{formatRelative(n.createdAt)}</span>
                        {n.actionHref && (
                          <Link
                            to={n.actionHref}
                            onClick={() => {
                              joshos.markNotificationRead(n.id);
                              setOpen(false);
                            }}
                            className="text-accent3 hover:underline"
                          >
                            {n.actionLabel ?? 'Open'}
                          </Link>
                        )}
                        <button onClick={() => joshos.snoozeNotification(n.id, 10)} className="text-muted transition hover:text-text">
                          Snooze
                        </button>
                      </div>
                    </div>
                    <button onClick={() => joshos.dismissNotification(n.id)} className="shrink-0 text-muted transition hover:text-text" aria-label="Dismiss">
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
