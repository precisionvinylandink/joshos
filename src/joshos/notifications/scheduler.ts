import type { CalendarEvent, Task } from '../primitives/types';
import type { NotificationCategory } from './types';

/**
 * Pure candidate generation for the notification scheduler. Each candidate has a
 * stable `key` so `emitOnce` fires it exactly once. Useful, not noisy (Part XXI):
 * meals/breaks & next commitments ~15 min out, and once-a-day overdue nudges.
 */
export interface NotifCandidate {
  key: string;
  category: NotificationCategory;
  title: string;
  body?: string;
  actionLabel?: string;
  actionHref?: string;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

function parseDue(s: string): Date {
  if (s.length <= 10) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  }
  return new Date(s);
}

export function candidates(now: Date, events: CalendarEvent[], tasks: Task[]): NotifCandidate[] {
  const out: NotifCandidate[] = [];
  const day = dayKey(now);

  for (const e of events) {
    const start = new Date(e.start);
    if (!sameDay(start, now)) continue;
    const mins = Math.round((start.getTime() - now.getTime()) / 60_000);
    if (mins <= 0 || mins > 15) continue;
    const category: NotificationCategory =
      e.kind === 'meal' || e.kind === 'break' ? 'life' : 'schedule';
    out.push({
      key: `${day}:soon:${e.id}`,
      category,
      title: `${e.title} in ${mins} minute${mins === 1 ? '' : 's'}`,
      body: e.location,
      actionLabel: 'View',
      actionHref: '/life/calendar',
    });
  }

  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (const t of tasks) {
    if (t.status === 'done' || t.status === 'cancelled' || !t.dueDate) continue;
    const due = parseDue(t.dueDate);
    if (due.getTime() >= todayMidnight.getTime()) continue; // only past-due
    out.push({
      key: `${day}:overdue:${t.id}`,
      category: 'important',
      title: `Overdue: ${t.title}`,
      actionLabel: 'View',
      actionHref: t.context === 'work' ? '/job/jobs' : '/life/tasks',
    });
  }

  return out;
}
