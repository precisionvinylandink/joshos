import { useMemo, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Play, Trash2 } from 'lucide-react';
import { Button, Badge, EmptyState, type BadgeVariant } from '../../../../shared/ui';
import { cn } from '../../../../shared/lib/cn';
import { useTasks, joshos, loadSampleDay } from '../../../../joshos/store';
import { FocusMode } from '../../../../joshos/focus/FocusMode';
import { PRIORITY_RANK, type Priority, type Task } from '../../../../joshos/primitives/types';

const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'critical'];
const PRIORITY_BADGE: Record<Priority, BadgeVariant> = {
  critical: 'red',
  high: 'amber',
  normal: 'gray',
  low: 'gray',
};

export default function TasksPage() {
  const tasks = useTasks();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [focusTask, setFocusTask] = useState<Task | null>(null);

  const life = useMemo(() => tasks.filter((t) => t.context === 'life'), [tasks]);
  const open = useMemo(
    () =>
      life
        .filter((t) => t.status !== 'done' && t.status !== 'cancelled')
        .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]),
    [life],
  );
  const done = useMemo(() => life.filter((t) => t.status === 'done'), [life]);

  function add(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    joshos.addTask({ title: t, context: 'life', priority });
    setTitle('');
    setPriority('normal');
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="font-display text-3xl tracking-wide">Tasks</h1>
      <p className="mt-1 text-xs text-muted">Personal to-dos. Complete or focus to grow your progress.</p>

      <form onSubmit={add} className="mt-4 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          className="flex-1 rounded-theme border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="rounded-theme border border-border bg-bg px-2 py-2 text-sm text-text focus:border-brand focus:outline-none"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <Button type="submit">Add</Button>
      </form>

      {open.length === 0 && done.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            headline="No tasks yet"
            description="Add one above, or load a sample day."
            cta={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  loadSampleDay();
                  toast.success('Loaded a sample day');
                }}
              >
                Load sample day
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-5 divide-y divide-border overflow-hidden rounded-theme border border-border">
            {open.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <button
                  onClick={() => {
                    joshos.completeTask(t.id);
                    toast.success(`Done: ${t.title}`);
                  }}
                  className="h-4 w-4 shrink-0 rounded-[4px] border border-border transition hover:border-success"
                  aria-label={`Complete ${t.title}`}
                />
                <span className="flex-1 truncate text-sm text-text">{t.title}</span>
                {t.priority !== 'normal' && <Badge variant={PRIORITY_BADGE[t.priority]}>{t.priority}</Badge>}
                <button
                  onClick={() => setFocusTask(t)}
                  className="shrink-0 rounded-theme border border-border p-1.5 text-muted transition hover:border-brand hover:text-brand"
                  aria-label={`Focus on ${t.title}`}
                >
                  <Play size={13} />
                </button>
                <button
                  onClick={() => joshos.deleteTask(t.id)}
                  className="shrink-0 rounded p-1 text-muted transition hover:text-danger"
                  aria-label={`Delete ${t.title}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {open.length === 0 && (
              <div className="px-4 py-3 text-sm text-dim">All personal tasks complete. Nice.</div>
            )}
          </div>

          {done.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-[11px] uppercase tracking-widest text-muted">Completed ({done.length})</div>
              <div className="space-y-1">
                {done.slice(0, 10).map((t) => (
                  <div key={t.id} className={cn('px-1 text-sm text-muted line-through')}>
                    {t.title}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {focusTask && <FocusMode task={focusTask} onClose={() => setFocusTask(null)} />}
    </div>
  );
}
