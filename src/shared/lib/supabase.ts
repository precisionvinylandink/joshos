import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fail loud in dev; the app cannot authenticate or sync without these.
  // eslint-disable-next-line no-console
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example → .env.',
  );
}

/**
 * Single shared Supabase client (auth + REST). Points at the "joshos-sync"
 * project shared with the legacy prototype, so the new app and the legacy apps
 * read/write the same rows during the transition.
 */
export const supabase = createClient<Database>(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'joshos.auth',
  },
});

export const SUPABASE_URL = url ?? '';
export const SUPABASE_ANON_KEY = anonKey ?? '';
