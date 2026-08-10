import { useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { appStore } from './store-instance';
import type { Updater } from './appStore';

/**
 * Installs the flush handlers for every exit path the prototype protected. Each
 * one exists because in-flight state could otherwise be lost:
 *   - beforeunload        : window/tab closing before the debounced Layer-2 write landed
 *   - pagehide            : Safari/iOS bfcache eviction (beforeunload is unreliable there)
 *   - visibilitychange→hidden : tab backgrounded / app hidden; the OS may kill it
 *   - window blur         : app switch / Electron window losing focus
 * The Electron main process flushes AGAIN on window close / before-quit /
 * window-all-closed (see electron/main.ts) — three more nets under the same wire.
 */
function installFlushHandlers(flush: () => void): () => void {
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  window.addEventListener('beforeunload', flush);
  window.addEventListener('pagehide', flush);
  window.addEventListener('blur', flush);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.removeEventListener('beforeunload', flush);
    window.removeEventListener('pagehide', flush);
    window.removeEventListener('blur', flush);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/**
 * Loads the durable doc, wires exit-path flushing, and exposes the manual flush
 * as `window.__flushSave` (the equivalent of the prototype's `window._flushSave`).
 * Renders children only after the initial load so slices hydrate from disk first.
 */
export function PersistenceProvider({ children }: { children: ReactNode }) {
  const ready = useSyncExternalStore(
    appStore.subscribe,
    () => appStore.isInitialized(),
    () => false,
  );

  useEffect(() => {
    void appStore.init();
    const flush = () => appStore.flush();
    window.__flushSave = flush;
    const cleanup = installFlushHandlers(flush);
    return () => {
      cleanup();
      flush(); // final flush when the provider unmounts (app teardown)
      if (window.__flushSave === flush) delete window.__flushSave;
    };
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}

/**
 * Read/write a namespaced slice of the durable app document. This is the ONLY
 * sanctioned way for feature code to persist — never call localStorage directly.
 */
export function usePersistentSlice<T>(
  namespace: string,
  initialValue: T,
): [T, (next: Updater<T>) => void] {
  const initialRef = useRef(initialValue);
  const getSnapshot = useCallback(
    () => appStore.getSlice<T>(namespace, initialRef.current),
    [namespace],
  );
  const value = useSyncExternalStore(appStore.subscribe, getSnapshot, getSnapshot);
  const setValue = useCallback(
    (next: Updater<T>) => appStore.setSlice<T>(namespace, next, initialRef.current),
    [namespace],
  );
  return [value, setValue];
}
