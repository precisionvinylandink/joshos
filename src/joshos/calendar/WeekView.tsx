import { cn } from '../../shared/lib/cn';
import type { CalItem } from './model';
import { clock, itemColor } from './style';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function WeekView({
  days,
  onPickDay,
}: {
  days: Array<{ day: Date; items: CalItem[] }>;
  onPickDay: (d: Date) => void;
}) {
  const today = new Date().toDateString();
  return (
    <div className="grid grid-cols-7 gap-2 overflow-x-auto">
      {days.map(({ day, items }) => {
        const isToday = day.toDateString() === today;
        return (
          <div key={day.toISOString()} className="min-w-[120px]">
            <button
              onClick={() => onPickDay(day)}
              className={cn(
                'mb-2 w-full rounded-theme border px-2 py-1.5 text-left transition hover:border-white/20',
                isToday ? 'border-brand bg-brand/[0.06]' : 'border-border',
              )}
            >
              <div className="text-[10px] uppercase tracking-wide text-muted">{DOW[day.getDay()]}</div>
              <div className={cn('font-display text-lg leading-none', isToday ? 'text-brand' : 'text-text')}>
                {day.getDate()}
              </div>
            </button>
            <div className="space-y-1">
              {items.length === 0 && <div className="px-1 text-[11px] text-faint">—</div>}
              {items.map((i) => (
                <div key={i.id} className="flex items-start gap-1.5 rounded-[5px] border border-border bg-surface px-1.5 py-1">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: itemColor(i) }} />
                  <div className="min-w-0">
                    <div className="truncate text-[11px] text-text">{i.title}</div>
                    <div className="font-mono text-[9px] text-muted">{i.timed ? clock(i.start) : 'due'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
