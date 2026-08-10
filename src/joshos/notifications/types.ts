/** Centralized notification model (Part XXI). Useful, not noisy. */
export type NotificationCategory =
  | 'now'
  | 'important'
  | 'reminder'
  | 'schedule'
  | 'life'
  | 'work'
  | 'jobos'
  | 'progress'
  | 'system';

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  body?: string;
  actionLabel?: string;
  actionHref?: string;
  read: boolean;
  createdAt: string; // ISO
  snoozedUntil?: string; // ISO
}
