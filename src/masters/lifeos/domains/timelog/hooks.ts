import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePersistentSlice } from '../../../../shared/persistence';
import { fetchDay, pushEntry, deleteEntry as apiDelete } from './api';
import { mergeRemoteIntoLocal } from './conflict';
import { dateKeyOf, type DayEntries, type TimelogByDay, type TimelogEntry } from './types';

const EMPTY: DayEntries = {};

/**
 * The durable local slice (appData.timeLog equivalent) is the UI source of truth;
 * the `timelog` table is the cross-device sync channel. Remote rows are merged in
 * with the ported conflict rule, and every write is persisted locally first
 * (three-layer save) then pushed to the table.
 */
export function useTimelogDay(dateKey: string = dateKeyOf()) {
  const qc = useQueryClient();
  const [byDay, setByDay] = usePersistentSlice<TimelogByDay>('timelog', {});
  const entries = byDay[dateKey] ?? EMPTY;

  const remote = useQuery({
    queryKey: ['timelog', dateKey],
    queryFn: () => fetchDay(dateKey),
    staleTime: 30_000,
  });

  // Merge remote → durable local slice (conflict rule). Returning prev on no-op
  // makes setSlice bail via Object.is, so this effect can't loop.
  useEffect(() => {
    const rows = remote.data;
    if (!rows) return;
    setByDay((prev) => {
      const { entries: merged, added } = mergeRemoteIntoLocal(prev[dateKey] ?? EMPTY, rows);
      return added === 0 ? prev : { ...prev, [dateKey]: merged };
    });
  }, [remote.data, dateKey, setByDay]);

  const logEntry = useCallback(
    async (hour: number, text: string) => {
      const entry: TimelogEntry = {
        hour,
        text: text.trim(),
        source: 'desktop',
        category: 'desktop',
        timestamp: new Date().toISOString(),
      };
      setByDay((prev) => ({ ...prev, [dateKey]: { ...(prev[dateKey] ?? EMPTY), [hour]: entry } }));
      try {
        await pushEntry(dateKey, entry);
      } catch {
        /* durable locally; full-state sync + next Pull Phone reconcile it */
      }
      void qc.invalidateQueries({ queryKey: ['timelog', dateKey] });
    },
    [dateKey, setByDay, qc],
  );

  const removeEntry = useCallback(
    async (hour: number) => {
      setByDay((prev) => {
        const day = { ...(prev[dateKey] ?? EMPTY) };
        delete day[hour];
        return { ...prev, [dateKey]: day };
      });
      try {
        await apiDelete(dateKey, hour);
      } catch {
        /* ignore — table catches up on next sync */
      }
      void qc.invalidateQueries({ queryKey: ['timelog', dateKey] });
    },
    [dateKey, setByDay, qc],
  );

  /** Pull Phone: fetch the day's rows and merge iPhone captures in (conflict rule). */
  const pullPhone = useCallback(async (): Promise<number> => {
    const rows = await fetchDay(dateKey);
    let added = 0;
    setByDay((prev) => {
      const r = mergeRemoteIntoLocal(prev[dateKey] ?? EMPTY, rows);
      added = r.added;
      return added === 0 ? prev : { ...prev, [dateKey]: r.entries };
    });
    return added;
  }, [dateKey, setByDay]);

  return {
    entries,
    logEntry,
    removeEntry,
    pullPhone,
    isSyncing: remote.isFetching,
    error: remote.error as Error | null,
  };
}
