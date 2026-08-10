import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button, SlideOver } from '../../shared/ui';
import { cn } from '../../shared/lib/cn';
import { useEvents, useBlocks, useTasks } from '../store';
import { useJobOSAttention } from '../integration/jobos';
import { DayView } from './DayView';
import { WeekView } from './WeekView';
import { NewEventForm } from './NewEventForm';
import { addDays, itemsForDay, startOfWeek, type CalSources, type Lens } from './model';

type View = 'day' | 'week';

export default function CalendarPage() {
  const events = useEvents();
  const blocks = useBlocks();
  const tasks = useTasks();
  const jobos = useJobOSAttention();

  const [view, setView] = useState<View>('day');
  const [cursor, setCursor] = useState(() => new Date());
  const [lens, setLens] = useState<Lens>('all');
  const [addOpen, setAddOpen] = useState(false);

  const sources = useMemo<CalSources>(
    () => ({ events, blocks, tasks, jobos: jobos.data ?? [] }),
    [events, blocks, tasks, jobos.data],
  );

  const dayItems = useMemo(() => itemsForDay(cursor, sources, lens), [cursor, sources, lens]);
  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(start, i);
      return { day, items: itemsForDay(day, sources, lens) };
    });
  }, [cursor, sources, lens]);

  const shift = (dir: number) => setCursor((c) => addDays(c, dir * (view === 'week' ? 7 : 1)));

  const label =
    view === 'day'
      ? cursor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      : `${startOfWeek(cursor).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${addDays(startOfWeek(cursor), 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="rounded-theme border border-border p-1.5 text-muted transition hover:text-text" aria-label="Previous">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => setCursor(new Date())} className="rounded-theme border border-border px-2.5 py-1.5 text-xs text-dim transition hover:text-text">
            Today
          </button>
          <button onClick={() => shift(1)} className="rounded-theme border border-border p-1.5 text-muted transition hover:text-text" aria-label="Next">
            <ChevronRight size={16} />
          </button>
          <h1 className="ml-1 font-display text-2xl tracking-wide">{label}</h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-theme border border-border text-xs">
            {(['all', 'life', 'work'] as Lens[]).map((l) => (
              <button key={l} onClick={() => setLens(l)} className={cn('px-3 py-1.5 uppercase tracking-wide transition', lens === l ? 'bg-brand text-white' : 'text-dim hover:text-text')}>
                {l}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-theme border border-border text-xs">
            {(['day', 'week'] as View[]).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cn('px-3 py-1.5 capitalize transition', view === v ? 'bg-surface2 text-text' : 'text-dim hover:text-text')}>
                {v}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)} leftIcon={<Plus size={14} />}>
            Event
          </Button>
        </div>
      </div>

      <div className="rounded-theme border border-border bg-surface/40 p-4">
        {view === 'day' ? (
          <DayView day={cursor} items={dayItems} />
        ) : (
          <WeekView days={weekDays} onPickDay={(d) => { setCursor(d); setView('day'); }} />
        )}
      </div>

      <SlideOver open={addOpen} title="New event" onClose={() => setAddOpen(false)}>
        <NewEventForm defaultDate={cursor} onDone={() => setAddOpen(false)} />
      </SlideOver>
    </div>
  );
}
