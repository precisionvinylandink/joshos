import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Heart,
  LayoutGrid,
  Folder,
  Receipt,
  Users,
  Flame,
  Wallet,
  ClipboardCheck,
  Clock,
  Circle,
  type LucideProps,
} from 'lucide-react';
import { StatCard, EmptyState, LoadingSkeleton } from '../../shared/ui';
import { TIMELINE_COLORS } from '../../shared/lib/constants';
import { cn } from '../../shared/lib/cn';
import { getTodayItems } from './aggregator';
import type { TodayItem } from './types';

const DOMAIN_ICONS: Record<string, ComponentType<LucideProps>> = {
  health: Heart,
  production: LayoutGrid,
  files: Folder,
  accounting: Receipt,
  crm: Users,
  habits: Flame,
  money: Wallet,
  scorecard: ClipboardCheck,
  timelog: Clock,
};

function barColor(item: TodayItem): string {
  if (item.urgency === 'critical') return TIMELINE_COLORS.critical;
  return item.master === 'jobos' ? TIMELINE_COLORS.jobos : TIMELINE_COLORS.lifeos;
}

export default function TodayPage() {
  const today = useMemo(() => new Date(), []);
  const [now, setNow] = useState(() => new Date());
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const { data: items, isLoading } = useQuery({
    queryKey: ['today', today.toDateString()],
    queryFn: () => getTodayItems(today),
  });

  // Seed completion from item flags once loaded.
  useEffect(() => {
    if (items) setDone(new Set(items.filter((i) => i.completed).map((i) => i.id)));
  }, [items]);

  const list = items ?? [];
  const isDone = (i: TodayItem) => done.has(i.id);
  const toggle = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pendingLife = list.filter((i) => i.master === 'lifeos' && !isDone(i)).length;
  const openJobs = list.filter((i) => i.master === 'jobos').length;
  const overdue = list.filter((i) => i.master === 'jobos' && i.domain === 'accounting').length;
  const criticalCount = list.filter((i) => i.urgency === 'critical' && !isDone(i)).length;

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-4xl tracking-wide">
          {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </h1>
        <div className="mt-1 flex items-center gap-3 text-sm text-muted">
          <span className="font-mono">{now.toLocaleTimeString('en-US')}</span>
          <span>·</span>
          <span>
            {list.length} scheduled
            {criticalCount > 0 && <span className="text-danger"> · {criticalCount} critical</span>}
          </span>
        </div>
      </div>

      {/* Stat chips */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Open Jobs" value={openJobs} />
        <StatCard label="Due Today" value={list.length} />
        <StatCard label="Overdue Invoices" value={overdue} />
        <StatCard label="Life Items Pending" value={pendingLife} />
      </div>

      {/* Unified timeline */}
      {isLoading ? (
        <LoadingSkeleton variant="list" rows={6} />
      ) : list.length === 0 ? (
        <EmptyState headline="Nothing scheduled today" description="Enjoy the quiet." />
      ) : (
        <div className="space-y-2">
          {list.map((item) => {
            const Icon = DOMAIN_ICONS[item.domain] ?? Circle;
            const completed = isDone(item);
            return (
              <div
                key={item.id}
                className={cn(
                  'flex items-stretch gap-3 transition',
                  completed && 'opacity-40',
                )}
              >
                <div className="w-16 shrink-0 pt-3 text-right font-mono text-xs text-muted">
                  {item.time}
                </div>
                <div className="relative flex flex-1 items-center gap-3 overflow-hidden rounded-theme border border-border bg-surface py-2.5 pl-4 pr-3">
                  <span
                    className="absolute inset-y-0 left-0 w-[3px]"
                    style={{ background: barColor(item) }}
                  />
                  <button
                    onClick={() => toggle(item.id)}
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition',
                      completed ? 'border-success bg-success text-black' : 'border-border hover:border-white/40',
                    )}
                    aria-label={completed ? 'Mark not done' : 'Mark done'}
                  >
                    {completed && '✓'}
                  </button>
                  <Icon size={16} className="shrink-0 text-dim" />
                  <div className="min-w-0 flex-1">
                    <div className={cn('truncate text-sm text-text', completed && 'line-through')}>
                      {item.title}
                    </div>
                    {item.subtitle && <div className="truncate text-xs text-muted">{item.subtitle}</div>}
                  </div>
                  {item.actionHref && (
                    <Link
                      to={item.actionHref}
                      className="shrink-0 rounded-theme border border-border px-2.5 py-1 text-xs text-dim transition hover:border-white/20 hover:text-text"
                    >
                      {item.actionLabel ?? 'Open'}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
