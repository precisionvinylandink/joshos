import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Pause, Play, X } from 'lucide-react';
import { Button } from '../../shared/ui';
import { joshos } from '../store';
import type { Task } from '../primitives/types';

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/**
 * Focus Mode — the core feedback loop (Part XXVII). Start a task, reduce
 * distraction, and on completion fire the whole chain: complete task → progress
 * event → goal/project rollup → motivation/garden. Then surface the next action.
 */
export function FocusMode({ task, onClose }: { task: Task; onClose: () => void }) {
  const total = (task.estimatedMinutes ?? 25) * 60;
  const [remaining, setRemaining] = useState(total);
  const [running, setRunning] = useState(true);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!running || done) return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [running, done]);

  useEffect(() => {
    if (remaining === 0) setRunning(false);
  }, [remaining]);

  const complete = useCallback(() => {
    joshos.completeTask(task.id);
    joshos.recordFocusComplete({
      taskId: task.id,
      minutes: Math.max(1, Math.round((total - remaining) / 60)),
      context: task.context,
    });
    setDone(true);
    toast.success('Nice — that moved you forward');
    setTimeout(onClose, 1300);
  }, [task, total, remaining, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pct = total > 0 ? 1 - remaining / total : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg/95 backdrop-blur-md">
      <button
        onClick={onClose}
        className="absolute right-5 top-5 rounded-theme p-2 text-muted transition hover:bg-white/5 hover:text-text"
        aria-label="Exit focus"
      >
        <X size={20} />
      </button>

      {done ? (
        <div className="text-center">
          <div className="font-display text-6xl tracking-wide text-success">DONE</div>
          <div className="mt-2 text-sm text-dim">{task.title}</div>
        </div>
      ) : (
        <div className="flex w-full max-w-md flex-col items-center px-6 text-center">
          <div className="text-[11px] uppercase tracking-widest text-muted">Focus</div>
          <h2 className="mt-2 text-xl font-medium text-text">{task.title}</h2>

          <div className="my-8 font-mono text-7xl tabular-nums text-text">{mmss(remaining)}</div>

          <div className="mb-8 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct * 100}%` }} />
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setRunning((r) => !r)} leftIcon={running ? <Pause size={15} /> : <Play size={15} />}>
              {running ? 'Pause' : 'Resume'}
            </Button>
            <Button onClick={complete} leftIcon={<Check size={15} />}>
              Complete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
