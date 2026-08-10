/**
 * User-invoked SAMPLE data (Part XLVI: clearly-identified dev data, never
 * presented as real production data). Populated only via an explicit "Load
 * sample day" affordance, and only when the store is empty. Demonstrates the
 * full loop: goal → project → milestones → tasks → events.
 */
import { appStore } from '../../shared/persistence';
import { K } from './keys';
import { addEvent, addGoal, addMilestone, addProject, addTask } from './actions';
import type { Task } from '../primitives/types';

const at = (h: number, m = 0): string => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export function sampleDayLoaded(): boolean {
  return appStore.getSlice<Task[]>(K.tasks, []).length > 0;
}

export function loadSampleDay(): void {
  if (sampleDayLoaded()) return;

  // WORK — a real vertical: vision → goal → project → milestones → tasks
  const cpgGoal = addGoal({
    title: 'Launch the CPG product line',
    context: 'work',
    vision: 'Build an automated business ecosystem',
    targetDate: at(20).slice(0, 10),
  });
  const cpgProject = addProject({ title: 'CPG Tote Bag Campaign', context: 'work', goalId: cpgGoal });
  addMilestone({ title: 'Finalize artwork', projectId: cpgProject });
  addMilestone({ title: 'Automated invoicing', projectId: cpgProject });

  addTask({ title: 'Send CPG proposal', context: 'work', priority: 'high', projectId: cpgProject, goalId: cpgGoal, dueDate: at(17).slice(0, 10), estimatedMinutes: 45, domain: 'sales' });
  addTask({ title: 'Follow up: ABC Restaurant reorder', context: 'work', priority: 'normal', domain: 'crm' });
  addTask({ title: 'Review production queue', context: 'work', priority: 'normal', domain: 'production' });

  // LIFE
  const trainGoal = addGoal({ title: 'Stay consistent with training', context: 'life' });
  addTask({ title: 'Log morning meds', context: 'life', priority: 'critical', domain: 'health' });
  addTask({ title: 'Gym: chest + back', context: 'life', priority: 'normal', domain: 'health', goalId: trainGoal, estimatedMinutes: 60 });
  addTask({ title: 'Spanish: 15 minutes', context: 'life', priority: 'normal', domain: 'habits', estimatedMinutes: 15 });

  // Events / meals / breaks (personal scheduling objects live in JoshOS)
  addEvent({ title: 'Customer call', context: 'work', start: at(11, 30), end: at(12, 0), kind: 'event' });
  addEvent({ title: 'Lunch', context: 'life', start: at(12, 0), end: at(12, 30), kind: 'meal' });
  addEvent({ title: 'Reset', context: 'life', start: at(12, 30), end: at(12, 50), kind: 'break' });
}
