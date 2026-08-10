import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../lib/cn';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  subLabel?: ReactNode;
  trend?: { direction: 'up' | 'down'; value?: string; good?: boolean };
  className?: string;
}

export function StatCard({ label, value, subLabel, trend, className }: StatCardProps) {
  const up = trend?.direction === 'up';
  // A trend can be up-and-good or up-and-bad (e.g. overdue invoices rising).
  const positive = trend?.good ?? up;
  return (
    <div className={cn('rounded-theme border border-border bg-surface p-4', className)}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-medium text-text">{value}</span>
        {trend && (
          <span className={cn('inline-flex items-center gap-0.5 text-xs', positive ? 'text-success' : 'text-danger')}>
            {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {trend.value}
          </span>
        )}
      </div>
      {subLabel && <div className="mt-0.5 text-xs text-dim">{subLabel}</div>}
    </div>
  );
}
