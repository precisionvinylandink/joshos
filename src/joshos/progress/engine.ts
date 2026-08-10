import type { Goal, Milestone, Project, Task } from '../primitives/types';
import type { ProgressEvent } from './types';

/** Fraction 0..1 a project is complete: average of its task and milestone ratios. */
export function projectProgress(
  projectId: string,
  tasks: Task[],
  milestones: Milestone[],
): number {
  const pt = tasks.filter((t) => t.projectId === projectId);
  const pm = milestones.filter((m) => m.projectId === projectId);
  const signals: number[] = [];
  if (pt.length) signals.push(pt.filter((t) => t.status === 'done').length / pt.length);
  if (pm.length) signals.push(pm.filter((m) => m.done).length / pm.length);
  if (!signals.length) return 0;
  return signals.reduce((a, b) => a + b, 0) / signals.length;
}

/** Fraction 0..1 a goal is complete: average of its projects + direct tasks. */
export function goalProgress(
  goalId: string,
  projects: Project[],
  tasks: Task[],
  milestones: Milestone[],
): number {
  const gp = projects.filter((p) => p.goalId === goalId);
  const gt = tasks.filter((t) => t.goalId === goalId && !t.projectId);
  const signals: number[] = gp.map((p) => projectProgress(p.id, tasks, milestones));
  if (gt.length) signals.push(gt.filter((t) => t.status === 'done').length / gt.length);
  if (!signals.length) return 0;
  return signals.reduce((a, b) => a + b, 0) / signals.length;
}

const dayKey = (iso: string) => iso.slice(0, 10);

export interface ProgressSummary {
  count: number;
  weight: number;
}

/** Sum of progress in a window (from `since` inclusive). */
export function summarize(events: ProgressEvent[], since: Date): ProgressSummary {
  const cutoff = since.getTime();
  let count = 0;
  let weight = 0;
  for (const e of events) {
    if (new Date(e.at).getTime() >= cutoff) {
      count++;
      weight += e.weight;
    }
  }
  return { count, weight };
}

export function startOfToday(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function startOfWeek(now = new Date()): Date {
  const d = startOfToday(now);
  d.setDate(d.getDate() - d.getDay()); // week starts Sunday
  return d;
}

/**
 * Non-punishing streak: consecutive days ending today that have ≥1 progress
 * event. A gap simply ends the count — we never subtract or shame.
 */
export function streakFromEvents(events: ProgressEvent[], now = new Date()): number {
  if (!events.length) return 0;
  const days = new Set(events.map((e) => dayKey(e.at)));
  let streak = 0;
  const cursor = startOfToday(now);
  // If nothing today, the streak can still stand from yesterday backward.
  if (!days.has(dayKey(cursor.toISOString()))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor.toISOString()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
