import { supabase } from '../../../../shared/lib/supabase';
import type { Json } from '../../../../shared/lib/database.types';
import { coerceScores, type Scores } from './scoring';

/** Typed adapter over the shared `daily_scorecard` table (date PK, scores jsonb). */

export async function fetchScorecard(dateKey: string): Promise<Scores | null> {
  const { data, error } = await supabase
    .from('daily_scorecard')
    .select('scores')
    .eq('date', dateKey)
    .maybeSingle();
  if (error) throw error;
  return data ? coerceScores(data.scores) : null;
}

export async function saveScorecard(dateKey: string, scores: Scores): Promise<void> {
  const { error } = await supabase.from('daily_scorecard').upsert(
    {
      date: dateKey,
      scores: scores as unknown as Json,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'date' },
  );
  if (error) throw error;
}
