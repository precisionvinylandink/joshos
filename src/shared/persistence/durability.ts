/**
 * Layer-2 durable backends. Electron writes a JSON file via the main process
 * (synchronously on the last-chance path); the browser uses localStorage.
 *
 * HARD-WON (ported from the prototype's three-layer save — data loss actually
 * happened): every path is try/caught, and the Electron path falls back to
 * localStorage if the IPC bridge throws, so a durable write is never skipped.
 */
import { isElectron } from '../lib/buildTarget';

export interface DurableBackend {
  readonly label: string;
  load(): Promise<unknown>;
  /** Debounced async write (Layer 2, happy path). */
  save(value: unknown): void;
  /** Synchronous write for exit paths — MUST complete before the process dies. */
  saveSync(value: unknown): void;
}

function localStorageBackend(key: string): DurableBackend {
  const write = (value: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota / private-mode — nothing else we can do locally */
    }
  };
  return {
    label: 'localStorage',
    load: async () => {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    save: write,
    saveSync: write,
  };
}

function electronBackend(fallbackKey: string): DurableBackend {
  const fallback = localStorageBackend(fallbackKey);
  return {
    label: 'electron-file',
    load: async () => {
      try {
        const data = await window.joshOS!.loadData();
        // If the file was empty/missing, recover from the localStorage mirror.
        return data ?? (await fallback.load());
      } catch {
        return fallback.load();
      }
    },
    save: (value) => {
      try {
        // Mirror to localStorage too, so a crashed main process can't lose the doc.
        fallback.save(value);
        void window.joshOS!.saveData(value);
      } catch {
        fallback.save(value);
      }
    },
    saveSync: (value) => {
      try {
        fallback.saveSync(value);
        window.joshOS!.saveDataSync(value);
      } catch {
        fallback.saveSync(value);
      }
    },
  };
}

export function selectBackend(localStorageKey: string): DurableBackend {
  return isElectron ? electronBackend(localStorageKey) : localStorageBackend(localStorageKey);
}
