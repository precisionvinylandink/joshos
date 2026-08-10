import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePersistentSlice } from '../../../../shared/persistence';
import { formatTime } from '../../../../shared/lib/formatters';
import { dateKeyOf, type TimelogByDay } from './types';
import { fireTimelogNotification, pickAlertHour } from './alerts';

/**
 * Runs the :15-past-the-hour timelog alert scheduler for the whole desktop
 * session (mounted app-wide, gated behind __LIFEOS_ENABLED__, so it is active on
 * every screen — not just the Time Log page). Renders nothing.
 */
export function HourlyAlerts() {
  const navigate = useNavigate();
  const [byDay] = usePersistentSlice<TimelogByDay>('timelog', {});

  // Latest logged-hours snapshot for the interval closure, without resubscribing.
  const byDayRef = useRef(byDay);
  byDayRef.current = byDay;
  const lastAlertHour = useRef<number | null>(null);

  useEffect(() => {
    if (
      !window.joshOS &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default'
    ) {
      void Notification.requestPermission();
    }
    const off = window.joshOS?.onNotificationClick?.((route) => navigate(route));
    return () => off?.();
  }, [navigate]);

  useEffect(() => {
    const check = () => {
      const today = dateKeyOf();
      const logged = new Set(Object.keys(byDayRef.current[today] ?? {}).map(Number));
      const hour = pickAlertHour(new Date(), logged, lastAlertHour.current);
      if (hour == null) return;
      lastAlertHour.current = hour;
      fireTimelogNotification(hour, `${formatTime(hour)} — What are you doing right now?`);
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  return null;
}
