/**
 * The single app-wide persistence store (one namespaced durable document, like
 * the prototype's global `appData`).
 *
 * Layer-3 remote sync mirrors the prototype's multi-device full-state push: the
 * whole doc is upserted to `joshos_data` (id=2), debounced + retried. Wired only
 * on desktop — personal full-state must never be pushed from the web bundle, and
 * LifeOS (the only writer of personal slices) isn't present on web anyway.
 */
import { AppStore, type AppDoc } from './appStore';
import { supabase } from '../lib/supabase';
import type { Json } from '../lib/database.types';
import { isDesktop } from '../lib/buildTarget';

async function pushFullState(doc: AppDoc): Promise<void> {
  const { error } = await supabase
    .from('joshos_data')
    .upsert({ id: 2, data: doc as unknown as Json, updated_at: new Date().toISOString() });
  if (error) throw error; // triggers AppStore retry/backoff
}

export const appStore = new AppStore({
  localStorageKey: 'joshos.v2',
  saveDebounceMs: 600,
  syncDebounceMs: 2000,
  ...(isDesktop ? { remoteSync: pushFullState } : {}),
});
