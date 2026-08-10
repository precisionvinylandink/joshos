import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Play, Check, Sparkles, ExternalLink } from 'lucide-react';
import { Button, Badge, type BadgeVariant } from '../../shared/ui';
import { cn } from '../../shared/lib/cn';
import { TIMELINE_COLORS } from '../../shared/lib/constants';
import { useAuth } from '../../shared/auth';
import {
  useTasks,
  useEvents,
  useGoals,
  useProgressEvents,
  useMotivation,
  joshos,
  loadSampleDay,
} from '../store';
import { recommendNext } from '../scheduler/recommend';
import { summarize, startOfToday, startOfWeek, streakFromEvents } from '../progress/engine';
import { gardenStage, levelForXp } from '../motivation/engine';
import { PixelGarden } from '../motivation/PixelGarden';
import { useJobOSAttention } from '../integration/jobos';
import { FocusMode } from '../focus/FocusMode';
import type { Context, Priority, Task } from '../primitives/types';
import { PRIORITY_RANK } from '../primitives/types';

type Lens = 'all' | 'life' | 'work';

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const minutesOfDay = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

const PRIORITY_BADGE: Record<Priority, BadgeVariant> = {
  critical: 'red',
  high: 'amber',
  normal: 'gray',
  low: 'gray',
};

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function Section({ label, right, children }: { label: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-7">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-medium uppercase tracking-widest text-muted">{label}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

interface TimelineItem {
  id: string;
  sortTime: number;
  time: string;
  title: string;
  subtitle?: string;
  context: Context;
  kind: 'event' | 'meal' | 'break' | 'deadline' | 'jobos';
  urgency?: 'critical' | 'high' | 'normal' | 'low';
  href?: string;
}

function barColor(context: Context, urgency?: string): string {
  if (urgency === 'critical') return TIMELINE_COLORS.critical;
  return context === 'work' ? TIMELINE_COLORS.jobos : TIMELINE_COLORS.lifeos;
}

export default function CommandCenter() {
  const { user } = useAuth();
  const tasks = useTasks();
  const events = useEvents();
  const goals = useGoals();
  const progressEvents = useProgressEvents();
  const motivation = useMotivation();
  const jobosAttn = useJobOSAttention();

  const [now, setNow] = useState(() => new Date());
  const [lens, setLens] = useState<Lens>('all');
  const [focusTask, setFocusTask] = useState<Task | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const inLens = (c: Context) => lens === 'all' || c === lens;
  const name = (user?.email?.split('@')[0] ?? '').replace(/^\w/, (m) => m.toUpperCase());

  const openTasks = useMemo(
    () => tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled'),
    [tasks],
  );

  const recommendation = useMemo(
    () => recommendNext(openTasks.filter((t) => inLens(t.context)), events, goals, now),
    [openTasks, events, goals, now, lens],
  );

  const timeline = useMemo<TimelineItem[]>(() => {
    const fromEvents: TimelineItem[] = events
      .filter((e) => isToday(e.start) && inLens(e.context))
      .map((e) => ({
        id: e.id,
        sortTime: minutesOfDay(e.start),
        time: clock(e.start),
        title: e.title,
        subtitle: e.location,
        context: e.context,
        kind: e.kind,
      }));
    const fromJobos: TimelineItem[] =
      lens === 'life'
        ? []
        : (jobosAttn.data ?? [])
            .filter((r) => r.dueDate && isToday(r.dueDate))
            .map((r) => ({
              id: r.entityId,
              sortTime: minutesOfDay(r.dueDate!),
              time: clock(r.dueDate!),
              title: r.title,
              subtitle: 'JobOS',
              context: 'work' as Context,
              kind: 'jobos' as const,
              urgency: r.urgency,
            }));
    return [...fromEvents, ...fromJobos].sort((a, b) => a.sortTime - b.sortTime);
  }, [events, jobosAttn.data, lens]);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const upcoming = timeline.filter((i) => i.sortTime >= nowMin);
  const upNext = upcoming[0];
  const later = upcoming.slice(1, 7);

  const priorities = useMemo(
    () =>
      [...openTasks.filter((t) => inLens(t.context))]
        .sort(
          (a, b) =>
            PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
            (a.dueDate ?? '').localeCompare(b.dueDate ?? ''),
        )
        .slice(0, 6),
    [openTasks, lens],
  );

  const todaySummary = useMemo(() => summarize(progressEvents, startOfToday(now)), [progressEvents, now]);
  const weekSummary = useMemo(() => summarize(progressEvents, startOfWeek(now)), [progressEvents, now]);
  const streak = useMemo(() => streakFromEvents(progressEvents, now), [progressEvents, now]);

  const topGoals = useMemo(
    () =>
      goals
        .filter((g) => inLens(g.context) && !g.archivedAt)
        .sort((a, b) => b.progress - a.progress)
        .slice(0, 3),
    [goals, lens],
  );

  const lifeOpen = openTasks.filter((t) => t.context === 'life').length;
  const workOpen = openTasks.filter((t) => t.context === 'work').length;
  const stage = gardenStage(motivation.xp);

  const empty = tasks.length === 0 && events.length === 0;

  function addQuick(e: FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    joshos.addTask({ title, context: lens === 'work' ? 'work' : 'life', priority: 'normal' });
    setDraft('');
  }

  function complete(id: string, title: string) {
    joshos.completeTask(id);
    toast.success(`Done: ${title}`);
  }

  function sample() {
    loadSampleDay();
    toast.success('Loaded a sample day');
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      {/* Header + lens */}
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-wide">
            {greeting(now.getHours())}
            {name ? `, ${name}` : ''}
          </h1>
          <div className="mt-1 text-sm text-muted">
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} ·{' '}
            <span className="font-mono">{now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
          </div>
        </div>
        <div className="flex overflow-hidden rounded-theme border border-border text-xs">
          {(['all', 'life', 'work'] as Lens[]).map((l) => (
            <button
              key={l}
              onClick={() => setLens(l)}
              className={cn(
                'px-3 py-1.5 uppercase tracking-wide transition',
                lens === l ? 'bg-brand text-white' : 'text-dim hover:text-text',
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {empty ? (
        <div className="rounded-theme border border-dashed border-border bg-surface/40 px-6 py-12 text-center">
          <div className="text-sm font-medium text-text">You’re clear.</div>
          <p className="mx-auto mt-1 max-w-sm text-xs text-dim">
            Nothing scheduled yet. Add a task, or load a sample day to see the loop.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button onClick={sample} leftIcon={<Sparkles size={15} />}>
              Load sample day
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* NOW */}
          <Section label="Now">
            {recommendation ? (
              <div className="rounded-theme border border-brand/40 bg-brand/[0.06] p-4">
                <div className="text-[11px] uppercase tracking-widest text-brand">Do this now</div>
                <div className="mt-1 text-lg font-medium text-text">{recommendation.task.title}</div>
                <div className="mt-1 text-xs text-dim">
                  {recommendation.reasons.join(' · ')} · {recommendation.availableMinutes} min available
                </div>
                <div className="mt-3">
                  <Button onClick={() => setFocusTask(recommendation.task)} leftIcon={<Play size={15} />}>
                    Start
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-theme border border-border bg-surface p-4 text-sm text-dim">
                Nothing urgent right now. {upNext ? `Next: ${upNext.title} at ${upNext.time}.` : 'Your priorities are clear.'}
              </div>
            )}
          </Section>

          {/* UP NEXT */}
          {upNext && (
            <Section label="Up next">
              <div className="flex items-center gap-3 rounded-theme border border-border bg-surface px-4 py-2.5">
                <span className="w-16 shrink-0 font-mono text-xs text-muted">{upNext.time}</span>
                <span className="h-8 w-[3px] rounded" style={{ background: barColor(upNext.context, upNext.urgency) }} />
                <span className="flex-1 text-sm text-text">{upNext.title}</span>
                {upNext.subtitle && <Badge variant="gray">{upNext.subtitle}</Badge>}
              </div>
            </Section>
          )}

          {/* TODAY — priorities */}
          <Section label="Today · priorities">
            <form onSubmit={addQuick} className="mb-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a task and press Enter…"
                className="w-full rounded-theme border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
              />
            </form>
            {priorities.length === 0 ? (
              <div className="rounded-theme border border-border bg-surface px-4 py-3 text-sm text-dim">
                Your top priorities are complete. Nice.
              </div>
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-theme border border-border">
                {priorities.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <button
                      onClick={() => complete(t.id, t.title)}
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-border transition hover:border-success"
                      aria-label={`Complete ${t.title}`}
                    >
                      <Check size={11} className="opacity-0" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-text">{t.title}</div>
                      {(t.domain || t.estimatedMinutes) && (
                        <div className="text-xs text-muted">
                          {t.domain}
                          {t.domain && t.estimatedMinutes ? ' · ' : ''}
                          {t.estimatedMinutes ? `${t.estimatedMinutes}m` : ''}
                        </div>
                      )}
                    </div>
                    {t.priority !== 'normal' && <Badge variant={PRIORITY_BADGE[t.priority]}>{t.priority}</Badge>}
                    <button
                      onClick={() => setFocusTask(t)}
                      className="shrink-0 rounded-theme border border-border p-1.5 text-muted transition hover:border-brand hover:text-brand"
                      aria-label={`Focus on ${t.title}`}
                    >
                      <Play size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* LATER */}
          {later.length > 0 && (
            <Section label="Later today">
              <div className="space-y-1.5">
                {later.map((i) => (
                  <div key={i.id} className="flex items-center gap-3 px-1 text-sm">
                    <span className="w-16 shrink-0 font-mono text-xs text-muted">{i.time}</span>
                    <span className="h-4 w-[3px] rounded" style={{ background: barColor(i.context, i.urgency) }} />
                    <span className="flex-1 truncate text-dim">{i.title}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* PROGRESS */}
          <Section label="Progress">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Today" value={`${todaySummary.count}`} sub={`${todaySummary.weight} xp`} />
              <Stat label="This week" value={`${weekSummary.count}`} sub={`${weekSummary.weight} xp`} />
              <Stat label="Streak" value={streak ? `${streak}d` : '—'} sub={`Lvl ${levelForXp(motivation.xp)}`} />
            </div>
            {topGoals.length > 0 && (
              <div className="mt-3 space-y-2">
                {topGoals.map((g) => (
                  <div key={g.id}>
                    <div className="mb-0.5 flex justify-between text-xs">
                      <span className="text-dim">{g.title}</span>
                      <span className="text-muted">{Math.round(g.progress * 100)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${g.progress * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* LIFE / WORK */}
          <div className="mb-7 grid grid-cols-2 gap-3">
            <div className="rounded-theme border border-border bg-surface p-4">
              <div className="text-[11px] uppercase tracking-widest text-muted">Life</div>
              <div className="mt-1 text-2xl font-medium text-text">{lifeOpen}</div>
              <div className="text-xs text-dim">open personal items</div>
            </div>
            <div className="rounded-theme border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-widest text-muted">Work</div>
                {jobosAttn.data && <Badge variant="amber">JobOS: sample</Badge>}
              </div>
              <div className="mt-1 text-2xl font-medium text-text">{workOpen}</div>
              <div className="text-xs text-dim">open work items</div>
              {lens !== 'life' && (jobosAttn.data ?? []).length > 0 && (
                <div className="mt-2 space-y-1 border-t border-border pt-2">
                  {(jobosAttn.data ?? []).slice(0, 3).map((r) => (
                    <div key={r.entityId} className="flex items-center gap-1.5 text-xs text-dim">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: barColor('work', r.urgency) }} />
                      <span className="flex-1 truncate">{r.title}</span>
                      <ExternalLink size={11} className="shrink-0 text-muted" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* WORLD */}
          <Section label="World" right={<span className="text-xs text-muted">{stage.label}</span>}>
            <div className="rounded-theme border border-border bg-surface p-4">
              <PixelGarden xp={motivation.xp} todayCount={todaySummary.count} />
              <div className="mt-2 text-center text-xs text-dim">
                {todaySummary.count > 0 ? 'Your garden grew today.' : 'Complete something to grow your garden.'}
              </div>
            </div>
          </Section>

          <div className="flex justify-center gap-4 pt-1 text-center">
            <Link to="/life/calendar" className="text-xs text-muted underline-offset-2 hover:text-dim hover:underline">
              Open calendar →
            </Link>
            <Link to="/life/goals" className="text-xs text-muted underline-offset-2 hover:text-dim hover:underline">
              View all goals →
            </Link>
          </div>
        </>
      )}

      {focusTask && <FocusMode task={focusTask} onClose={() => setFocusTask(null)} />}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-theme border border-border bg-surface p-3 text-center">
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className="mt-0.5 text-xl font-medium text-text">{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
