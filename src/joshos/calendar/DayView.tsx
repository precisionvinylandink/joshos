import { useMemo } from 'react';
import { formatTime } from '../../shared/lib/formatters';
import { packLanes, type CalItem } from './model';
import { KIND_ICON, clock, itemColor, itemFill } from './style';

const START = 6;
const END = 23;
const HOUR = 48; // px per hour

const hours = Array.from({ length: END - START + 1 }, (_, i) => START + i);

export function DayView({ day, items }: { day: Date; items: CalItem[] }) {
  const packed = useMemo(() => packLanes(items), [items]);
  const dueChips = items.filter((i) => !i.timed);
  const now = new Date();
  const isToday = now.toDateString() === day.toDateString();
  const nowTop = (now.getHours() + now.getMinutes() / 60 - START) * HOUR;

  return (
    <div>
      {dueChips.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {dueChips.map((i) => (
            <span
              key={i.id}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-dim"
              style={{ borderColor: itemColor(i) }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: itemColor(i) }} />
              {i.title}
              <span className="text-muted">· due</span>
            </span>
          ))}
        </div>
      )}

      <div className="flex">
        <div className="relative w-14 shrink-0" style={{ height: (END - START + 1) * HOUR }}>
          {hours.map((h) => (
            <div key={h} className="absolute right-2 -translate-y-1/2 font-mono text-[10px] text-muted" style={{ top: (h - START) * HOUR }}>
              {formatTime(h)}
            </div>
          ))}
        </div>

        <div className="relative flex-1 border-l border-border" style={{ height: (END - START + 1) * HOUR }}>
          {hours.map((h) => (
            <div key={h} className="absolute inset-x-0 border-t border-border/40" style={{ top: (h - START) * HOUR }} />
          ))}

          {isToday && nowTop >= 0 && nowTop <= (END - START + 1) * HOUR && (
            <div className="absolute inset-x-0 z-10" style={{ top: nowTop }}>
              <div className="h-px bg-brand" />
              <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-brand" />
            </div>
          )}

          {packed.map((i) => {
            const top = Math.max(0, (i.start.getHours() + i.start.getMinutes() / 60 - START) * HOUR);
            const rawH = ((i.end.getTime() - i.start.getTime()) / 3_600_000) * HOUR;
            const height = Math.max(22, rawH);
            const width = 100 / i.lanes;
            const Icon = KIND_ICON[i.kind];
            return (
              <div
                key={i.id}
                className="absolute overflow-hidden rounded-[6px] px-2 py-1"
                style={{
                  top,
                  height,
                  left: `calc(${i.lane * width}% + 4px)`,
                  width: `calc(${width}% - 8px)`,
                  borderLeft: `3px solid ${itemColor(i)}`,
                  background: itemFill(i),
                }}
                title={`${i.title} · ${clock(i.start)}`}
              >
                <div className="flex items-center gap-1 text-[11px] text-text">
                  <Icon size={11} className="shrink-0 text-dim" />
                  <span className="truncate">{i.title}</span>
                </div>
                {height > 34 && <div className="truncate font-mono text-[10px] text-muted">{clock(i.start)}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
