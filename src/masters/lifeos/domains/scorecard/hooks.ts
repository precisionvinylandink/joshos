import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePersistentSlice } from '../../../../shared/persistence';
import { dateKeyOf } from '../timelog/types';
import { fetchScorecard, saveScorecard } from './api';
import { EMPTY_SCORES, gradeFor, scorecardPct, type MetricKey, type Scores } from './scoring';

type ScorecardByDay = Record<string, Scores>;

/**
 * Today's scores live in the durable slice (instant + offline); the
 * `daily_scorecard` table is the sync channel. Adjustments autosave (debounced
 * 800ms, like the prototype); "Save Day" pushes immediately.
 */
export function useScorecard(dateKey: string = dateKeyOf()) {
  const [byDay, setByDay] = usePersistentSlice<ScorecardByDay>('scorecard', {});
  const scores = byDay[dateKey] ?? EMPTY_SCORES;

  const remote = useQuery({
    queryKey: ['scorecard', dateKey],
    queryFn: () => fetchScorecard(dateKey),
    staleTime: 30_000,
  });

  // Seed local from remote only if we have nothing local for the day yet.
  useEffect(() => {
    if (!remote.data) return;
    setByDay((prev) => (prev[dateKey] ? prev : { ...prev, [dateKey]: { ...EMPTY_SCORES, ...remote.data } }));
  }, [remote.data, dateKey, setByDay]);

  const scoresRef = useRef(scores);
  scoresRef.current = scores;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const adjust = useCallback(
    (key: MetricKey, delta: number) => {
      const cur = scoresRef.current;
      const next: Scores = { ...cur, [key]: Math.max(0, (cur[key] ?? 0) + delta) };
      scoresRef.current = next;
      setByDay((prev) => ({ ...prev, [dateKey]: next }));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void saveScorecard(dateKey, scoresRef.current).catch(() => {
          /* durable locally; retried by full-state sync */
        });
      }, 800);
    },
    [dateKey, setByDay],
  );

  const save = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await saveScorecard(dateKey, scoresRef.current);
  }, [dateKey]);

  const pct = useMemo(() => scorecardPct(scores), [scores]);
  const grade = useMemo(() => gradeFor(pct), [pct]);

  return { scores, adjust, save, pct, grade, isLoading: remote.isLoading };
}
