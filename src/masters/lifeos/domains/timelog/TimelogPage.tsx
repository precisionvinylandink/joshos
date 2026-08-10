import { useMemo, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Smartphone, Monitor, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '../../../../shared/ui/Button';
import { formatTime } from '../../../../shared/lib/formatters';
import { cn } from '../../../../shared/lib/cn';
import { useTimelogDay } from './hooks';
import { TIMELOG_HOURS } from './types';

export default function TimelogPage() {
  const { entries, logEntry, removeEntry, pullPhone, isSyncing } = useTimelogDay();
  const currentHour = new Date().getHours();
  const [targetHour, setTargetHour] = useState<number>(
    (TIMELOG_HOURS as readonly number[]).includes(currentHour) ? currentHour : TIMELOG_HOURS[0],
  );
  const [text, setText] = useState('');

  const loggedCount = useMemo(() => Object.keys(entries).length, [entries]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) {
      toast.error("Type what you're doing first");
      return;
    }
    await logEntry(targetHour, value);
    setText('');
    toast.success(`${formatTime(targetHour)} logged`);
  }

  function editHour(hour: number) {
    setTargetHour(hour);
    setText(entries[hour]?.text ?? '');
  }

  async function onPull() {
    try {
      const added = await pullPhone();
      toast.success(added > 0 ? `Synced ${added} entr${added === 1 ? 'y' : 'ies'}` : 'Up to date');
    } catch {
      toast.error('Sync failed — is the backend online?');
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-wide">Time Log</h1>
          <p className="mt-1 text-xs text-muted">
            Alerts fire at :15 past each hour — 7 AM to 8 PM. Syncs with your iPhone.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onPull} loading={isSyncing} leftIcon={<RefreshCw size={14} />}>
          Pull Phone
        </Button>
      </div>

      <form onSubmit={onSubmit} className="mb-5 flex gap-2">
        <select
          value={targetHour}
          onChange={(e) => setTargetHour(Number(e.target.value))}
          className="rounded-theme border border-border bg-bg px-2 py-2 text-sm text-text focus:border-brand focus:outline-none"
        >
          {TIMELOG_HOURS.map((h) => (
            <option key={h} value={h}>
              {formatTime(h)}
            </option>
          ))}
        </select>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`What were you doing at ${formatTime(targetHour)}?`}
          className="flex-1 rounded-theme border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
        />
        <Button type="submit">Log</Button>
      </form>

      <div className="text-[11px] uppercase tracking-wide text-muted">{loggedCount} logged today</div>

      <div className="mt-2 divide-y divide-border overflow-hidden rounded-theme border border-border">
        {TIMELOG_HOURS.map((h) => {
          const entry = entries[h];
          const isCurrent = h === currentHour;
          return (
            <div
              key={h}
              onClick={() => editHour(h)}
              className={cn(
                'flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.03]',
                isCurrent && 'bg-brand/[0.06]',
              )}
            >
              <div
                className={cn(
                  'w-16 shrink-0 font-mono text-xs',
                  isCurrent ? 'text-brand' : 'text-muted',
                )}
              >
                {formatTime(h)}
              </div>
              <div className="min-w-0 flex-1">
                {entry ? (
                  <div className="flex items-center gap-2">
                    {entry.source === 'ios' ? (
                      <Smartphone size={13} className="shrink-0 text-dim" />
                    ) : (
                      <Monitor size={13} className="shrink-0 text-dim" />
                    )}
                    <span className="truncate text-sm text-text">{entry.text}</span>
                  </div>
                ) : (
                  <span className="text-sm text-muted">
                    {isCurrent ? 'Current hour — log now' : 'Not logged'}
                  </span>
                )}
              </div>
              {entry && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void removeEntry(h);
                  }}
                  className="shrink-0 rounded p-1 text-muted transition hover:bg-white/5 hover:text-danger"
                  aria-label={`Delete ${formatTime(h)} entry`}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
