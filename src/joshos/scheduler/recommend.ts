import { PRIORITY_RANK, type CalendarEvent, type Goal, type Task } from '../primitives/types';

/**
 * "What should I do now?" — v1 heuristic foundation (Parts VII, XXVIII). This is
 * NOT autonomous scheduling; it reduces decision fatigue by recommending ONE
 * next action from real state, with transparent reasons. The scoring is
 * deliberately simple and easy to evolve.
 */
export interface Recommendation {
  task: Task;
  reasons: string[];
  availableMinutes: number;
}

/** Minutes until the next fixed commitment (defaults to a 120-min block). */
export function availableMinutesUntilNext(events: CalendarEvent[], now = new Date()): number {
  const next = events
    .map((e) => new Date(e.start).getTime())
    .filter((t) => t > now.getTime())
    .sort((a, b) => a - b)[0];
  if (!next) return 120;
  return Math.max(5, Math.round((next - now.getTime()) / 60_000));
}

export function recommendNext(
  tasks: Task[],
  events: CalendarEvent[],
  _goals: Goal[],
  now = new Date(),
): Recommendation | null {
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  if (!open.length) return null;

  const available = availableMinutesUntilNext(events, now);
  const todayKey = now.toISOString().slice(0, 10);

  const scored = open
    .map((t) => {
      const reasons: string[] = [];
      let score = (4 - PRIORITY_RANK[t.priority]) * 10;
      if (t.priority === 'critical') reasons.push('Critical');
      else if (t.priority === 'high') reasons.push('High priority');
      if (t.dueDate && t.dueDate.slice(0, 10) <= todayKey) {
        score += 25;
        reasons.push('Due today');
      }
      if (t.estimatedMinutes && t.estimatedMinutes <= available) {
        score += 8;
        reasons.push(`Fits your ${available} min`);
      }
      if (t.goalId) {
        score += 6;
        reasons.push('Advances a goal');
      }
      return { task: t, score, reasons };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0]!;
  return {
    task: best.task,
    reasons: best.reasons.length ? best.reasons : ['Next up'],
    availableMinutes: available,
  };
}
