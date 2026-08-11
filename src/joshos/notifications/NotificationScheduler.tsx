import { useEffect, useRef } from 'react';
import { useEvents, useTasks, joshos } from '../store';
import { candidates } from './scheduler';

/**
 * Runs the notification scheduler for the whole desktop session (mounted app-wide,
 * gated behind __LIFEOS_ENABLED__). Emits in-app + native notifications, once each.
 * Renders nothing.
 */
export function NotificationScheduler() {
  const events = useEvents();
  const tasks = useTasks();
  const ref = useRef({ events, tasks });
  ref.current = { events, tasks };

  useEffect(() => {
    const tick = () => {
      const { events, tasks } = ref.current;
      for (const c of candidates(new Date(), events, tasks)) {
        joshos.emitOnce(c.key, {
          category: c.category,
          title: c.title,
          body: c.body,
          actionLabel: c.actionLabel,
          actionHref: c.actionHref,
        });
      }
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  return null;
}
