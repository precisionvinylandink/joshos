export type TodayItem = {
  id: string;
  master: 'jobos' | 'lifeos';
  domain: string;
  time?: string;
  sortTime: number; // minutes from midnight
  urgency: 'critical' | 'high' | 'normal' | 'low';
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionHref?: string;
  completed?: boolean;
};

export const URGENCY_RANK: Record<TodayItem['urgency'], number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};
