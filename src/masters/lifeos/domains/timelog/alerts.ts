import { TIMELOG_HOURS } from './types';

export const ALERT_ROUTE = '/life/timelog';

/**
 * Pure decision for the hourly nag, ported from checkTLAlert():
 *   - only 7 AM … 8 PM
 *   - only in the :15–:17 window (a 3-minute catch net, because the check runs
 *     once a minute and we must not miss the tick)
 *   - never if the hour is already logged (no nagging once you've captured)
 *   - never twice for the same hour (dedup via lastAlertHour)
 * Returns the hour to alert for, or null.
 */
export function pickAlertHour(
  now: Date,
  loggedHours: Set<number>,
  lastAlertHour: number | null,
): number | null {
  const h = now.getHours();
  const m = now.getMinutes();
  if (!(TIMELOG_HOURS as readonly number[]).includes(h)) return null;
  if (m < 15 || m > 17) return null;
  if (loggedHours.has(h)) return null;
  if (lastAlertHour === h) return null;
  return h;
}

/**
 * Fire the alert. In Electron it is a NATIVE OS notification (persistent thanks
 * to NSUserNotificationAlertStyle=alert in the builder config); in a browser it
 * falls back to the Web Notification API with requireInteraction, like the PWA.
 */
export function fireTimelogNotification(hour: number, body: string): void {
  const bridge = window.joshOS;
  if (bridge?.showNotification) {
    bridge.showNotification('JoshOS', body, { route: ALERT_ROUTE });
    return;
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    const n = new Notification('JoshOS', {
      body,
      tag: 'joshos-timelog',
      requireInteraction: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  }
}
