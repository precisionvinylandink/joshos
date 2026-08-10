import { supabase } from '../../../../shared/lib/supabase';
import type { TimelogRow } from '../../../../shared/lib/database.types';
import type { TimelogEntry } from './types';

/**
 * Typed adapter over the shared `timelog` table. Row shape is kept byte-compatible
 * with the legacy apps: (date_key, hour, text, category, timestamp, source),
 * unique on (date_key, hour), upserted with merge-duplicates semantics.
 */

export async function fetchDay(dateKey: string): Promise<TimelogRow[]> {
  const { data, error } = await supabase
    .from('timelog')
    .select('*')
    .eq('date_key', dateKey)
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function pushEntry(dateKey: string, entry: TimelogEntry): Promise<void> {
  const { error } = await supabase
    .from('timelog')
    .upsert(
      {
        date_key: dateKey,
        hour: entry.hour,
        text: entry.text,
        category: entry.category ?? 'desktop',
        timestamp: entry.timestamp ?? new Date().toISOString(),
        source: entry.source ?? 'desktop',
      },
      { onConflict: 'date_key,hour' },
    );
  if (error) throw error;
}

export async function deleteEntry(dateKey: string, hour: number): Promise<void> {
  const { error } = await supabase
    .from('timelog')
    .delete()
    .eq('date_key', dateKey)
    .eq('hour', hour);
  if (error) throw error;
}
