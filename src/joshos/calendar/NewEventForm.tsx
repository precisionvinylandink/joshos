import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Button, Input } from '../../shared/ui';
import { joshos } from '../store';
import type { Context, EventKind } from '../primitives/types';

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const KINDS: EventKind[] = ['event', 'meal', 'break', 'deadline'];

export function NewEventForm({ defaultDate, onDone }: { defaultDate: Date; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(ymd(defaultDate));
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [context, setContext] = useState<Context>('life');
  const [kind, setKind] = useState<EventKind>('event');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const startIso = new Date(`${date}T${start}`).toISOString();
    const endIso = new Date(`${date}T${end}`).toISOString();
    joshos.addEvent({ title, context, kind, start: startIso, end: endIso });
    toast.success('Event added');
    onDone();
  }

  const field = 'w-full rounded-theme border border-border bg-bg px-3 py-2 text-sm text-text focus:border-brand focus:outline-none';

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-dim">Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-dim">Start</label>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={field} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-dim">End</label>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={field} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-dim">Context</label>
          <select value={context} onChange={(e) => setContext(e.target.value as Context)} className={field}>
            <option value="life">Life</option>
            <option value="work">Work</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-dim">Kind</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as EventKind)} className={field}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button type="submit" className="mt-1">
        Add event
      </Button>
    </form>
  );
}
