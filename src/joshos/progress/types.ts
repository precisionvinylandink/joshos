import type { Context, Priority } from '../primitives/types';

/**
 * Progress must represent meaningful advancement — not clicks or busywork. Every
 * completion emits a ProgressEvent carrying a weight; downstream systems
 * (rollups, motivation, garden, reviews) consume these events.
 */
export type ProgressEventType =
  | 'task_completed'
  | 'milestone_completed'
  | 'project_completed'
  | 'goal_progressed'
  | 'focus_block_completed'
  | 'routine_completed';

export interface ProgressEvent {
  id: string;
  type: ProgressEventType;
  context: Context;
  weight: number;
  refId?: string;
  label?: string;
  at: string; // ISO
}

/** Weight of completing a task, by priority. Importance, not effort. */
export const PRIORITY_WEIGHT: Record<Priority, number> = {
  critical: 25,
  high: 15,
  normal: 10,
  low: 5,
};

export const EVENT_WEIGHT = {
  milestone: 30,
  project: 60,
  goal: 100,
  focusBlock: 12,
  routine: 8,
} as const;
