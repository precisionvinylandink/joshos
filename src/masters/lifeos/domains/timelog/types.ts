/**
 * Time Log — ported LifeOS domain. Hourly check-ins, written to the shared
 * `timelog` table in a shape compatible with the legacy desktop app and the iOS
 * PWA (both still write the same rows during the transition).
 */
export type TimelogSource = 'desktop' | 'ios' | 'remote' | string;

export interface TimelogEntry {
  hour: number; // 0–23, local
  text: string;
  source: TimelogSource;
  category?: string;
  timestamp?: string; // ISO
}

/** hour → entry for a single day. */
export type DayEntries = Record<number, TimelogEntry>;

/** dateKey (YYYY-MM-DD local) → day entries. Mirrors the prototype's appData.timeLog. */
export type TimelogByDay = Record<string, DayEntries>;

/** Hours the hourly alert covers: 7 AM … 8 PM inclusive. */
export const TIMELOG_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as const;

/** Local date key, matching the legacy getTDK(): YYYY-MM-DD in local time. */
export function dateKeyOf(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}
