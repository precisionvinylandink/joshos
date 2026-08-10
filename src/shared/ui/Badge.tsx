import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export type BadgeVariant = 'gray' | 'blue' | 'amber' | 'green' | 'red' | 'purple' | 'teal';

// Tinted pills — subtle bg + saturated text/ring, readable on the dark shell.
const VARIANTS: Record<BadgeVariant, string> = {
  gray: 'bg-white/5 text-dim ring-white/10',
  blue: 'bg-blue-500/10 text-blue-300 ring-blue-500/20',
  amber: 'bg-amber-500/10 text-amber-300 ring-amber-500/20',
  green: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20',
  red: 'bg-red-500/10 text-red-300 ring-red-500/20',
  purple: 'bg-violet-500/10 text-violet-300 ring-violet-500/20',
  teal: 'bg-teal-500/10 text-teal-300 ring-teal-500/20',
};

export function Badge({
  variant = 'gray',
  children,
  className,
}: {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none ring-1 ring-inset',
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
