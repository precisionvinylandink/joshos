import { usePersistentSlice } from '../../shared/persistence';
import { K } from './keys';
import type {
  CalendarEvent,
  Goal,
  Milestone,
  Project,
  ScheduleBlock,
  Task,
} from '../primitives/types';
import type { ProgressEvent } from '../progress/types';
import type { MotivationState } from '../motivation/types';
import { EMPTY_MOTIVATION } from '../motivation/engine';
import type { AppNotification } from '../notifications/types';

/** Reactive reads. Writes live in ./actions (they share the same durable store). */
export const useTasks = (): Task[] => usePersistentSlice<Task[]>(K.tasks, [])[0];
export const useEvents = (): CalendarEvent[] => usePersistentSlice<CalendarEvent[]>(K.events, [])[0];
export const useBlocks = (): ScheduleBlock[] => usePersistentSlice<ScheduleBlock[]>(K.blocks, [])[0];
export const useGoals = (): Goal[] => usePersistentSlice<Goal[]>(K.goals, [])[0];
export const useProjects = (): Project[] => usePersistentSlice<Project[]>(K.projects, [])[0];
export const useMilestones = (): Milestone[] =>
  usePersistentSlice<Milestone[]>(K.milestones, [])[0];
export const useProgressEvents = (): ProgressEvent[] =>
  usePersistentSlice<ProgressEvent[]>(K.progress, [])[0];
export const useMotivation = (): MotivationState =>
  usePersistentSlice<MotivationState>(K.motivation, EMPTY_MOTIVATION)[0];
export const useNotifications = (): AppNotification[] =>
  usePersistentSlice<AppNotification[]>(K.notifications, [])[0];
