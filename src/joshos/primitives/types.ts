/**
 * JoshOS shared primitives. LifeOS and WorkOS are contexts over these — never
 * isolated mini-apps. Everything connects through Task / Event / ScheduleBlock /
 * Goal / Project / Milestone (+ Progress, Motivation, Notification, and JobOS
 * references). These are the nouns of the operating system.
 *
 * Persisted (for now) through the three-layer local store behind typed adapters;
 * a Supabase schema can back them later without touching feature code.
 */
import type { JobOSReference } from '../integration/jobos/types';

/** The two primary lenses of JoshOS. */
export type Context = 'life' | 'work';
export type Priority = 'low' | 'normal' | 'high' | 'critical';
export type ItemSource = 'joshos' | 'jobos';

// ── Task: something that needs to be completed ──────────────────────────────
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  context: Context;
  domain?: string; // e.g. 'health', 'crm', 'personal'
  dueDate?: string; // ISO date/datetime
  estimatedMinutes?: number;
  goalId?: string;
  projectId?: string;
  milestoneId?: string;
  source: ItemSource;
  jobosRef?: JobOSReference;
  createdAt: string;
  completedAt?: string;
}

// ── CalendarEvent: something happening at a particular time ─────────────────
export type EventKind = 'event' | 'meal' | 'break' | 'deadline';

export interface CalendarEvent {
  id: string;
  title: string;
  kind: EventKind;
  context: Context;
  start: string; // ISO datetime
  end?: string; // ISO datetime
  allDay?: boolean;
  location?: string;
  taskId?: string;
  source: ItemSource;
  jobosRef?: JobOSReference;
  createdAt: string;
}

// ── ScheduleBlock: time intentionally allocated to work ─────────────────────
export type BlockKind = 'focus' | 'routine' | 'admin' | 'personal';

export interface ScheduleBlock {
  id: string;
  title: string;
  context: Context;
  start: string; // ISO datetime
  end: string; // ISO datetime
  kind: BlockKind;
  taskId?: string;
  projectId?: string;
  routineId?: string;
  createdAt: string;
}

// ── Goal / Project / Milestone: VISION → GOAL → PROJECT → MILESTONE → TASK ───
export interface Goal {
  id: string;
  title: string;
  context: Context;
  vision?: string; // the WHY above the goal
  targetDate?: string;
  progress: number; // 0..1 (cached rollup)
  createdAt: string;
  archivedAt?: string;
}

export interface Project {
  id: string;
  title: string;
  context: Context;
  goalId?: string;
  progress: number; // 0..1 (cached rollup)
  createdAt: string;
  archivedAt?: string;
}

export interface Milestone {
  id: string;
  title: string;
  projectId: string;
  done: boolean;
  createdAt: string;
  completedAt?: string;
}

/** Priority ordering helper (critical first). */
export const PRIORITY_RANK: Record<Priority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};
