import { format, formatDistanceToNow, isValid } from 'date-fns';

const toDate = (v: Date | string | number): Date =>
  v instanceof Date ? v : new Date(v);

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

/** `value` is a ratio (0.25 → "25%") unless `isPercent` is set (25 → "25%"). */
export function formatPercent(value: number, digits = 0, isPercent = false): string {
  const pct = isPercent ? value : value * 100;
  return `${pct.toFixed(digits)}%`;
}

export function formatDate(v: Date | string | number): string {
  const d = toDate(v);
  return isValid(d) ? format(d, 'MMM d, yyyy') : '—';
}

export function formatDateTime(v: Date | string | number): string {
  const d = toDate(v);
  return isValid(d) ? format(d, 'MMM d, yyyy h:mm a') : '—';
}

export function formatRelative(v: Date | string | number): string {
  const d = toDate(v);
  return isValid(d) ? formatDistanceToNow(d, { addSuffix: true }) : '—';
}

/** Clock time. Accepts a Date or an hour-of-day number (0–23). */
export function formatTime(v: Date | string | number): string {
  if (typeof v === 'number' && v >= 0 && v <= 23 && Number.isInteger(v)) {
    const period = v < 12 ? 'AM' : 'PM';
    const h12 = v % 12 === 0 ? 12 : v % 12;
    return `${h12} ${period}`;
  }
  const d = toDate(v);
  return isValid(d) ? format(d, 'h:mm a') : '—';
}

export function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return '—';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
