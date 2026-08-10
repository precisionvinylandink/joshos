import type { TimelogRow } from '../../../../shared/lib/database.types';
import type { DayEntries } from './types';

/**
 * The EXACT conflict rule ported from the prototype's Pull-Phone sync
 * (sbPullTimelog): merge remote rows into the local day, taking a remote row
 * only when
 *   - there is no local entry for that hour, OR
 *   - the remote entry came from iPhone and the local one did not (iOS wins), OR
 *   - the local entry has no text (an empty slot gets filled).
 * This preserves the "phone captures beat stale desktop rows, but a desktop edit
 * you already made is not clobbered" behavior the prototype settled on.
 */
export function mergeRemoteIntoLocal(
  local: DayEntries,
  remoteRows: TimelogRow[],
): { entries: DayEntries; added: number } {
  const merged: DayEntries = { ...local };
  let added = 0;
  for (const row of remoteRows) {
    if (row.hour == null) continue;
    const existing = merged[row.hour];
    const remoteIsIos = row.source === 'ios';
    const take =
      !existing || (remoteIsIos && existing.source !== 'ios') || !existing.text;
    if (take) {
      merged[row.hour] = {
        hour: row.hour,
        text: row.text ?? '',
        timestamp: row.timestamp ?? undefined,
        source: row.source ?? 'remote',
        category: row.category ?? 'remote',
      };
      added++;
    }
  }
  return { entries: merged, added };
}
