/**
 * Compile-time build flag injected by Vite's `define` (see vite.config.ts).
 * `true` for desktop builds, `false` for the web build. Guarding a dynamic
 * `import()` with `if (__LIFEOS_ENABLED__)` lets Rollup dead-code-eliminate the
 * entire LifeOS subtree from the web bundle — the hard "LifeOS never ships to
 * web" rule is enforced at build time, not hidden at runtime.
 */
declare const __LIFEOS_ENABLED__: boolean;

/** Options for a native OS notification (timelog hourly alerts). */
interface JoshOSNotificationOptions {
  /** Route the app here when the notification is clicked (e.g. '/life/timelog'). */
  route?: string;
  silent?: boolean;
}

/**
 * The typed bridge the Electron preload exposes on `window`. Undefined in the
 * browser (web target / plain `npm run dev` in a tab). Keep this in structural
 * sync with electron/preload.ts.
 */
interface JoshOSBridge {
  isElectron: true;
  isMac: boolean;
  platform: NodeJS.Platform | string;
  getVersion(): Promise<string>;

  /** Layer-3 durable persistence handed to the Electron main process. */
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<boolean>;
  /** Synchronous flush used on the last-chance exit paths (beforeunload). */
  saveDataSync(data: unknown): boolean;

  /** Native OS notification — persists thanks to NSUserNotificationAlertStyle=alert. */
  showNotification(title: string, body: string, options?: JoshOSNotificationOptions): void;
  setBadge(count: number): void;
  openExternal(url: string): void;

  /** main → renderer events. Each returns an unsubscribe fn. */
  onNavigate(cb: (route: string) => void): () => void;
  onDeepLink(cb: (url: string) => void): () => void;
  onNotificationClick(cb: (route: string) => void): () => void;
}

interface Window {
  joshOS?: JoshOSBridge;
  /** Manual persistence flush (equivalent of the prototype's window._flushSave). */
  __flushSave?: () => void;
}
