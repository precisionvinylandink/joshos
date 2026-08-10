import { Calendar, Utensils, Coffee, Flag, Crosshair, CheckSquare, Briefcase, type LucideProps } from 'lucide-react';
import type { ComponentType } from 'react';
import { TIMELINE_COLORS } from '../../shared/lib/constants';
import type { CalItem, CalKind } from './model';

/** Context color, with a critical override — distinguishes lenses without clutter. */
export function itemColor(i: CalItem): string {
  if (i.urgency === 'critical') return TIMELINE_COLORS.critical;
  return i.context === 'work' ? TIMELINE_COLORS.jobos : TIMELINE_COLORS.lifeos;
}

/** Subtle context-tinted fill over the surface. */
export function itemFill(i: CalItem): string {
  return `color-mix(in srgb, ${itemColor(i)} 14%, var(--surface))`;
}

export const KIND_ICON: Record<CalKind, ComponentType<LucideProps>> = {
  event: Calendar,
  meal: Utensils,
  break: Coffee,
  deadline: Flag,
  block: Crosshair,
  task: CheckSquare,
  jobos: Briefcase,
};

export const clock = (d: Date) =>
  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
