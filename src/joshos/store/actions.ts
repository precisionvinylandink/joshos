/**
 * The JoshOS mutation layer. Actions operate on the durable app document
 * directly (via the persistence singleton), so a single user action can update
 * several slices atomically — this is where the core loop lives:
 *
 *   completeTask → progress event → goal/project rollup → motivation/garden.
 *
 * Reactive reads happen through the hooks in ./hooks; both share the same store,
 * so any mutation here re-renders subscribers.
 */
import { appStore } from '../../shared/persistence';
import type { Updater } from '../../shared/persistence';
import { newId } from '../primitives/ids';
import { K } from './keys';
import type {
  BlockKind,
  CalendarEvent,
  Context,
  EventKind,
  Goal,
  Milestone,
  Priority,
  Project,
  ScheduleBlock,
  Task,
} from '../primitives/types';
import type { ProgressEvent } from '../progress/types';
import { EVENT_WEIGHT, PRIORITY_WEIGHT } from '../progress/types';
import { goalProgress, projectProgress } from '../progress/engine';
import type { MotivationState } from '../motivation/types';
import { EMPTY_MOTIVATION, applyProgress } from '../motivation/engine';
import type { AppNotification, NotificationCategory } from '../notifications/types';

const get = <T,>(k: string, fb: T): T => appStore.getSlice<T>(k, fb);
const set = <T,>(k: string, updater: Updater<T>, fb: T): void => appStore.setSlice<T>(k, updater, fb);
const now = () => new Date().toISOString();

// ── internal: progress + rollups + motivation ───────────────────────────────
function pushProgress(e: Omit<ProgressEvent, 'id'>): void {
  set<ProgressEvent[]>(K.progress, (arr) => [{ id: newId('prg'), ...e }, ...arr].slice(0, 1000), []);
}

function bumpMotivation(weight: number, at: string): void {
  set<MotivationState>(K.motivation, (s) => applyProgress(s, weight, at), EMPTY_MOTIVATION);
}

function recomputeRollups(projectId?: string, goalId?: string): void {
  const tasks = get<Task[]>(K.tasks, []);
  const milestones = get<Milestone[]>(K.milestones, []);
  const goalIds = new Set<string>();
  if (goalId) goalIds.add(goalId);
  if (projectId) {
    const proj = get<Project[]>(K.projects, []).find((p) => p.id === projectId);
    if (proj?.goalId) goalIds.add(proj.goalId);
    set<Project[]>(
      K.projects,
      (ps) => ps.map((p) => (p.id === projectId ? { ...p, progress: projectProgress(projectId, tasks, milestones) } : p)),
      [],
    );
  }
  if (goalIds.size) {
    const projects = get<Project[]>(K.projects, []);
    set<Goal[]>(
      K.goals,
      (gs) => gs.map((g) => (goalIds.has(g.id) ? { ...g, progress: goalProgress(g.id, projects, tasks, milestones) } : g)),
      [],
    );
  }
}

// ── Tasks ────────────────────────────────────────────────────────────────────
export interface NewTask {
  title: string;
  context: Context;
  priority?: Priority;
  domain?: string;
  description?: string;
  dueDate?: string;
  estimatedMinutes?: number;
  goalId?: string;
  projectId?: string;
  milestoneId?: string;
}

export function addTask(input: NewTask): string {
  const task: Task = {
    id: newId('task'),
    title: input.title.trim(),
    description: input.description,
    status: 'todo',
    priority: input.priority ?? 'normal',
    context: input.context,
    domain: input.domain,
    dueDate: input.dueDate,
    estimatedMinutes: input.estimatedMinutes,
    goalId: input.goalId,
    projectId: input.projectId,
    milestoneId: input.milestoneId,
    source: 'joshos',
    createdAt: now(),
  };
  set<Task[]>(K.tasks, (ts) => [task, ...ts], []);
  return task.id;
}

export function updateTask(id: string, patch: Partial<Task>): void {
  set<Task[]>(K.tasks, (ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)), []);
}

export function setTaskStatus(id: string, status: Task['status']): void {
  updateTask(id, { status });
}

export function deleteTask(id: string): void {
  set<Task[]>(K.tasks, (ts) => ts.filter((t) => t.id !== id), []);
}

/** The reward event. Marks done, records progress, rolls up, grows the garden. */
export function completeTask(id: string): void {
  const task = get<Task[]>(K.tasks, []).find((t) => t.id === id);
  if (!task || task.status === 'done') return;
  const at = now();
  set<Task[]>(K.tasks, (ts) => ts.map((t) => (t.id === id ? { ...t, status: 'done', completedAt: at } : t)), []);
  const weight = PRIORITY_WEIGHT[task.priority];
  pushProgress({ type: 'task_completed', context: task.context, weight, refId: id, label: task.title, at });
  recomputeRollups(task.projectId, task.goalId);
  bumpMotivation(weight, at);
}

// ── Goals / Projects / Milestones ─────────────────────────────────────────────
export function addGoal(input: { title: string; context: Context; vision?: string; targetDate?: string }): string {
  const goal: Goal = {
    id: newId('goal'),
    title: input.title.trim(),
    context: input.context,
    vision: input.vision,
    targetDate: input.targetDate,
    progress: 0,
    createdAt: now(),
  };
  set<Goal[]>(K.goals, (gs) => [goal, ...gs], []);
  return goal.id;
}

export function addProject(input: { title: string; context: Context; goalId?: string }): string {
  const project: Project = {
    id: newId('proj'),
    title: input.title.trim(),
    context: input.context,
    goalId: input.goalId,
    progress: 0,
    createdAt: now(),
  };
  set<Project[]>(K.projects, (ps) => [project, ...ps], []);
  return project.id;
}

export function addMilestone(input: { title: string; projectId: string }): string {
  const milestone: Milestone = {
    id: newId('mile'),
    title: input.title.trim(),
    projectId: input.projectId,
    done: false,
    createdAt: now(),
  };
  set<Milestone[]>(K.milestones, (ms) => [...ms, milestone], []);
  return milestone.id;
}

export function toggleMilestone(id: string): void {
  const m = get<Milestone[]>(K.milestones, []).find((x) => x.id === id);
  if (!m) return;
  const at = now();
  const nowDone = !m.done;
  set<Milestone[]>(
    K.milestones,
    (ms) => ms.map((x) => (x.id === id ? { ...x, done: nowDone, completedAt: nowDone ? at : undefined } : x)),
    [],
  );
  const proj = get<Project[]>(K.projects, []).find((p) => p.id === m.projectId);
  recomputeRollups(m.projectId, proj?.goalId);
  if (nowDone) {
    pushProgress({
      type: 'milestone_completed',
      context: proj?.context ?? 'life',
      weight: EVENT_WEIGHT.milestone,
      refId: id,
      label: m.title,
      at,
    });
    bumpMotivation(EVENT_WEIGHT.milestone, at);
  }
}

// ── Events / Blocks ───────────────────────────────────────────────────────────
export function addEvent(input: {
  title: string;
  context: Context;
  start: string;
  end?: string;
  kind?: EventKind;
  location?: string;
}): string {
  const ev: CalendarEvent = {
    id: newId('evt'),
    title: input.title.trim(),
    kind: input.kind ?? 'event',
    context: input.context,
    start: input.start,
    end: input.end,
    location: input.location,
    source: 'joshos',
    createdAt: now(),
  };
  set<CalendarEvent[]>(K.events, (es) => [...es, ev], []);
  return ev.id;
}

export function addBlock(input: {
  title: string;
  context: Context;
  start: string;
  end: string;
  kind?: BlockKind;
  taskId?: string;
  projectId?: string;
}): string {
  const block: ScheduleBlock = {
    id: newId('blk'),
    title: input.title.trim(),
    context: input.context,
    start: input.start,
    end: input.end,
    kind: input.kind ?? 'focus',
    taskId: input.taskId,
    projectId: input.projectId,
    createdAt: now(),
  };
  set<ScheduleBlock[]>(K.blocks, (bs) => [...bs, block], []);
  return block.id;
}

/** Focus block finished — logs progress + growth (not the same as completing a task). */
export function recordFocusComplete(input: { taskId?: string; minutes: number; context: Context }): void {
  const at = now();
  pushProgress({
    type: 'focus_block_completed',
    context: input.context,
    weight: EVENT_WEIGHT.focusBlock,
    refId: input.taskId,
    label: `${input.minutes}m focus`,
    at,
  });
  bumpMotivation(EVENT_WEIGHT.focusBlock, at);
}

// ── Notifications ─────────────────────────────────────────────────────────────
export function pushNotification(input: {
  category: NotificationCategory;
  title: string;
  body?: string;
  actionLabel?: string;
  actionHref?: string;
}): string {
  const n: AppNotification = { id: newId('ntf'), read: false, createdAt: now(), ...input };
  set<AppNotification[]>(K.notifications, (ns) => [n, ...ns].slice(0, 200), []);
  return n.id;
}

export function markNotificationRead(id: string): void {
  set<AppNotification[]>(K.notifications, (ns) => ns.map((n) => (n.id === id ? { ...n, read: true } : n)), []);
}

export function dismissNotification(id: string): void {
  set<AppNotification[]>(K.notifications, (ns) => ns.filter((n) => n.id !== id), []);
}

export function markAllNotificationsRead(): void {
  set<AppNotification[]>(K.notifications, (ns) => ns.map((n) => ({ ...n, read: true })), []);
}

export function snoozeNotification(id: string, minutes: number): void {
  const until = new Date(Date.now() + minutes * 60_000).toISOString();
  set<AppNotification[]>(
    K.notifications,
    (ns) => ns.map((n) => (n.id === id ? { ...n, read: true, snoozedUntil: until } : n)),
    [],
  );
}

/**
 * Idempotent notification emit used by the scheduler: fires once per unique
 * `key` (persisted, so it won't repeat across reloads), and mirrors to a native
 * OS notification on desktop.
 */
export function emitOnce(
  key: string,
  input: {
    category: NotificationCategory;
    title: string;
    body?: string;
    actionLabel?: string;
    actionHref?: string;
  },
): void {
  const seen = get<string[]>(K.notifKeys, []);
  if (seen.includes(key)) return;
  set<string[]>(K.notifKeys, (ks) => [key, ...ks].slice(0, 500), []);
  pushNotification(input);
  window.joshOS?.showNotification?.(input.title, input.body ?? '', { route: input.actionHref });
}
