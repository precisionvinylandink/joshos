import { useMemo, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { Button, EmptyState } from '../../../../shared/ui';
import { cn } from '../../../../shared/lib/cn';
import { useGoals, useMilestones, useProjects, joshos } from '../../../../joshos/store';
import type { Goal, Milestone, Project } from '../../../../joshos/primitives/types';

/** VISION → GOAL → PROJECT → MILESTONE. Completion rolls upward automatically. */
export default function GoalsPage() {
  const goals = useGoals();
  const projects = useProjects();
  const milestones = useMilestones();
  const [title, setTitle] = useState('');
  const [vision, setVision] = useState('');

  const lifeGoals = useMemo(
    () => goals.filter((g) => g.context === 'life' && !g.archivedAt),
    [goals],
  );

  function addGoal(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    joshos.addGoal({ title: t, context: 'life', vision: vision.trim() || undefined });
    setTitle('');
    setVision('');
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="font-display text-3xl tracking-wide">Goals</h1>
      <p className="mt-1 text-xs text-muted">Vision → Goal → Project → Milestone → Task. Progress rolls up.</p>

      <form onSubmit={addGoal} className="mt-4 space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New goal…"
          className="w-full rounded-theme border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
        />
        <div className="flex gap-2">
          <input
            value={vision}
            onChange={(e) => setVision(e.target.value)}
            placeholder="Why it matters (optional vision)…"
            className="flex-1 rounded-theme border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
          />
          <Button type="submit" leftIcon={<Plus size={15} />}>
            Add goal
          </Button>
        </div>
      </form>

      {lifeGoals.length === 0 ? (
        <div className="mt-6">
          <EmptyState headline="No goals yet" description="Name something you’re building toward." />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {lifeGoals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              projects={projects.filter((p) => p.goalId === g.id)}
              milestones={milestones}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalCard({ goal, projects, milestones }: { goal: Goal; projects: Project[]; milestones: Milestone[] }) {
  const [open, setOpen] = useState(true);
  const [proj, setProj] = useState('');

  return (
    <div className="rounded-theme border border-border bg-surface">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        {open ? <ChevronDown size={15} className="text-muted" /> : <ChevronRight size={15} className="text-muted" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-text">{goal.title}</div>
          {goal.vision && <div className="truncate text-xs text-muted">{goal.vision}</div>}
        </div>
        <span className="shrink-0 text-xs text-muted">{Math.round(goal.progress * 100)}%</span>
      </button>
      <div className="px-4 pb-2">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${goal.progress * 100}%` }} />
        </div>
      </div>

      {open && (
        <div className="space-y-2 px-4 pb-4 pt-1">
          {projects.map((p) => (
            <ProjectRow key={p.id} project={p} milestones={milestones.filter((m) => m.projectId === p.id)} />
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const t = proj.trim();
              if (!t) return;
              joshos.addProject({ title: t, context: 'life', goalId: goal.id });
              setProj('');
            }}
            className="flex gap-2"
          >
            <input
              value={proj}
              onChange={(e) => setProj(e.target.value)}
              placeholder="Add a project…"
              className="flex-1 rounded-theme border border-border bg-bg px-2.5 py-1.5 text-xs text-text placeholder:text-muted focus:border-brand focus:outline-none"
            />
            <button type="submit" className="rounded-theme border border-border px-2 text-xs text-dim transition hover:text-text">
              Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function ProjectRow({ project, milestones }: { project: Project; milestones: Milestone[] }) {
  const [ms, setMs] = useState('');
  return (
    <div className="rounded-theme border border-border bg-bg/40 p-3">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-sm text-text">{project.title}</div>
        <div className="text-xs text-muted">{Math.round(project.progress * 100)}%</div>
      </div>
      <div className="mb-2 h-1 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-accent2" style={{ width: `${project.progress * 100}%` }} />
      </div>
      <div className="space-y-1">
        {milestones.map((m) => (
          <button
            key={m.id}
            onClick={() => joshos.toggleMilestone(m.id)}
            className="flex w-full items-center gap-2 text-left text-xs"
          >
            <span
              className={cn(
                'flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border text-[9px]',
                m.done ? 'border-success bg-success text-black' : 'border-border',
              )}
            >
              {m.done ? '✓' : ''}
            </span>
            <span className={cn('text-dim', m.done && 'text-muted line-through')}>{m.title}</span>
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = ms.trim();
          if (!t) return;
          joshos.addMilestone({ title: t, projectId: project.id });
          setMs('');
        }}
        className="mt-2 flex gap-2"
      >
        <input
          value={ms}
          onChange={(e) => setMs(e.target.value)}
          placeholder="Add a milestone…"
          className="flex-1 rounded-theme border border-border bg-bg px-2.5 py-1 text-xs text-text placeholder:text-muted focus:border-brand focus:outline-none"
        />
        <button type="submit" className="rounded-theme border border-border px-2 text-xs text-dim transition hover:text-text">
          Add
        </button>
      </form>
    </div>
  );
}
