/**
 * Unified calendar model (Parts V–VI). One chronological spine: CalendarEvents,
 * ScheduleBlocks, timed JobOS deadlines, and due Tasks are normalized into a
 * single CalItem stream. ALL/LIFE/WORK is a filter, never separate calendars.
 */
import type { CalendarEvent, Context, ScheduleBlock, Task } from '../primitives/types';
import type { JobOSReference } from '../integration/jobos/types';

export type Lens = 'all' | 'life' | 'work';
export type CalKind = 'event' | 'meal' | 'break' | 'deadline' | 'block' | 'task' | 'jobos';

export interface CalItem {
  id: string;
  title: string;
  context: Context;
  kind: CalKind;
  start: Date;
  end: Date;
  /** false = due-only task with no time (rendered as an all-day chip). */
  timed: boolean;
  urgency?: 'critical' | 'high' | 'normal' | 'low';
  href?: string;
  subtitle?: string;
}

export interface CalSources {
  events: CalendarEvent[];
  blocks: ScheduleBlock[];
  tasks: Task[];
  jobos: JobOSReference[];
}

const DEFAULT_MIN = 30;
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** Date-only strings (YYYY-MM-DD) parse as LOCAL midnight to avoid tz day-shift. */
function parseDate(s: string): Date {
  if (s.length <= 10) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  }
  return new Date(s);
}

const withEnd = (start: Date, end?: string): Date =>
  end ? new Date(end) : new Date(start.getTime() + DEFAULT_MIN * 60_000);

const priorityUrgency = (p: Task['priority']): CalItem['urgency'] =>
  p === 'critical' ? 'critical' : p === 'high' ? 'high' : 'normal';

export function itemsForDay(day: Date, src: CalSources, lens: Lens): CalItem[] {
  const inLens = (c: Context) => lens === 'all' || c === lens;
  const out: CalItem[] = [];

  for (const e of src.events) {
    const s = new Date(e.start);
    if (!sameDay(s, day) || !inLens(e.context)) continue;
    out.push({ id: e.id, title: e.title, context: e.context, kind: e.kind, start: s, end: withEnd(s, e.end), timed: true, subtitle: e.location });
  }
  for (const b of src.blocks) {
    const s = new Date(b.start);
    if (!sameDay(s, day) || !inLens(b.context)) continue;
    out.push({ id: b.id, title: b.title, context: b.context, kind: 'block', start: s, end: new Date(b.end), timed: true });
  }
  if (lens !== 'life') {
    for (const r of src.jobos) {
      if (!r.dueDate) continue;
      const s = new Date(r.dueDate);
      if (!sameDay(s, day)) continue;
      out.push({ id: r.entityId, title: r.title, context: 'work', kind: 'jobos', start: s, end: withEnd(s), timed: true, urgency: r.urgency, href: r.url, subtitle: 'JobOS' });
    }
  }
  for (const t of src.tasks) {
    if (t.status === 'done' || t.status === 'cancelled' || !t.dueDate) continue;
    const s = parseDate(t.dueDate);
    if (!sameDay(s, day) || !inLens(t.context)) continue;
    out.push({ id: t.id, title: t.title, context: t.context, kind: 'task', start: s, end: withEnd(s), timed: t.dueDate.length > 10, urgency: priorityUrgency(t.priority) });
  }

  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export interface PackedItem extends CalItem {
  lane: number;
  lanes: number;
}

/** Greedy interval partitioning so overlapping timed items sit side-by-side. */
export function packLanes(items: CalItem[]): PackedItem[] {
  const timed = items.filter((i) => i.timed).sort((a, b) => a.start.getTime() - b.start.getTime());
  const laneEnds: number[] = [];
  const placed = timed.map((it) => {
    let lane = laneEnds.findIndex((end) => end <= it.start.getTime());
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = it.end.getTime();
    return { it, lane };
  });
  const lanes = Math.max(1, laneEnds.length);
  return placed.map((p) => ({ ...p.it, lane: p.lane, lanes }));
}

export function startOfWeek(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - s.getDay());
  return s;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
