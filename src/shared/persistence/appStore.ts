/**
 * The ported three-layer save system, generalized for React.
 *
 *   Layer 1 — in-memory state, updated immediately (synchronous, never lost mid-tick).
 *   Layer 2 — durable local write (Electron file / localStorage), debounced.
 *   Layer 3 — remote sync (Supabase), debounced + retried, always best-effort.
 *
 * The whole app persists as ONE namespaced document (like the prototype's single
 * `appData` blob) because the Electron backend is a single JSON file — per-domain
 * stores would clobber it. Each domain owns a namespaced slice.
 *
 * RULE (carried forward from the old CLAUDE.md): feature code must NEVER touch
 * localStorage directly. All persistence goes through this store.
 */
import { selectBackend, type DurableBackend } from './durability';

export type AppDoc = Record<string, unknown>;
type Listener = () => void;
export type Updater<T> = T | ((prev: T) => T);

export interface AppStoreOptions {
  localStorageKey: string;
  /** Layer-2 debounce. */
  saveDebounceMs?: number;
  /** Layer-3 debounce. */
  syncDebounceMs?: number;
  /** Layer-3 remote sync. Receives the full doc; throws on failure to trigger retry. */
  remoteSync?: (doc: AppDoc) => Promise<void>;
  syncRetries?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class AppStore {
  private doc: AppDoc = {};
  private readonly listeners = new Set<Listener>();
  private readonly backend: DurableBackend;
  private readonly opts: Required<Omit<AppStoreOptions, 'remoteSync'>> &
    Pick<AppStoreOptions, 'remoteSync'>;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private initialized = false;

  constructor(options: AppStoreOptions) {
    this.opts = {
      saveDebounceMs: 600,
      syncDebounceMs: 2000,
      syncRetries: 3,
      ...options,
    };
    this.backend = selectBackend(options.localStorageKey);
  }

  /** Load the durable doc into memory (Layer 1 seed). Idempotent. */
  async init(): Promise<void> {
    if (this.initialized) return;
    const loaded = await this.backend.load();
    if (loaded && typeof loaded === 'object') this.doc = { ...(loaded as AppDoc) };
    this.initialized = true;
    this.emit();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getSlice<T>(namespace: string, fallback: T): T {
    return (namespace in this.doc ? (this.doc[namespace] as T) : fallback);
  }

  /** Layer 1 (immediate) → schedule Layer 2 + Layer 3. */
  setSlice<T>(namespace: string, next: Updater<T>, fallback: T): void {
    const prev = this.getSlice<T>(namespace, fallback);
    const value = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
    if (Object.is(value, prev)) return;
    this.doc = { ...this.doc, [namespace]: value };
    this.emit();
    this.scheduleSave();
    this.scheduleSync();
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.backend.save(this.doc);
    }, this.opts.saveDebounceMs);
  }

  private scheduleSync(): void {
    if (!this.opts.remoteSync) return;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      void this.runRemoteSync();
    }, this.opts.syncDebounceMs);
  }

  /** Layer 3 with retry + backoff. Never throws — a failed sync must not lose local data. */
  private async runRemoteSync(): Promise<void> {
    const { remoteSync, syncRetries } = this.opts;
    if (!remoteSync) return;
    const snapshot = this.doc;
    for (let attempt = 0; ; attempt++) {
      try {
        await remoteSync(snapshot);
        return;
      } catch {
        if (attempt >= syncRetries) return; // give up quietly; local write already durable
        await sleep(800 * 2 ** attempt);
      }
    }
  }

  /**
   * Manual flush — the equivalent of the prototype's `window._flushSave`.
   * Cancels pending debounces, writes Layer 2 SYNCHRONOUSLY (so it lands before
   * the process/tab dies), and fires Layer 3 best-effort. Called on every exit
   * path (see PersistenceProvider): beforeunload, pagehide, visibilitychange→hidden,
   * window blur — plus the Electron main process flushes again on window close /
   * before-quit / window-all-closed. Belt and suspenders, because data loss on
   * close is the exact bug this system exists to prevent.
   */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.backend.saveSync(this.doc);
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.opts.remoteSync) void this.runRemoteSync();
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Stable snapshot getter for useSyncExternalStore. */
  getDoc = (): AppDoc => this.doc;

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
