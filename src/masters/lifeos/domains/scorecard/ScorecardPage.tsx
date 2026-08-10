import { useState } from 'react';
import toast from 'react-hot-toast';
import { Minus, Plus } from 'lucide-react';
import { Button } from '../../../../shared/ui/Button';
import { cn } from '../../../../shared/lib/cn';
import { useScorecard } from './hooks';
import { BLOCK_LABELS, SCORECARD_METRICS, type Block } from './scoring';

const BLOCK_ORDER: Block[] = ['nick', 'pvi'];

export default function ScorecardPage() {
  const { scores, adjust, save, pct, grade } = useScorecard();
  const [saving, setSaving] = useState(false);

  async function onSave() {
    setSaving(true);
    try {
      await save();
      toast.success('Scorecard saved');
    } catch {
      toast.error('Save failed — is the backend online?');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-wide">Scorecard</h1>
          <p className="mt-1 text-xs text-muted">Daily sales activity — {Math.round(pct * 100)}% to goal</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="font-display text-5xl leading-none" style={{ color: grade.color }}>
              {grade.letter}
            </div>
            <div className="text-[10px] uppercase tracking-widest" style={{ color: grade.color }}>
              {grade.label}
            </div>
          </div>
          <Button onClick={onSave} loading={saving}>
            Save Day
          </Button>
        </div>
      </div>

      <div className="space-y-5">
        {BLOCK_ORDER.map((block) => (
          <div key={block} className="rounded-theme border border-border bg-surface">
            <div className="border-b border-border px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted">
              {BLOCK_LABELS[block]}
            </div>
            <div className="divide-y divide-border">
              {SCORECARD_METRICS.filter((m) => m.block === block).map((m) => {
                const value = scores[m.key] ?? 0;
                const frac = Math.min(value / m.goal, 1);
                return (
                  <div key={m.key} className="flex items-center gap-4 px-4 py-3">
                    <div className="w-40 shrink-0">
                      <div className="text-sm text-text">{m.label}</div>
                      <div className="text-[11px] text-muted">
                        {value} / {m.goal}
                      </div>
                    </div>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className={cn('h-full rounded-full transition-all', frac >= 1 ? 'bg-success' : 'bg-brand')}
                        style={{ width: `${frac * 100}%` }}
                      />
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => adjust(m.key, -1)}
                        className="rounded-theme border border-border p-1 text-muted transition hover:text-text disabled:opacity-40"
                        disabled={value <= 0}
                        aria-label={`Decrease ${m.label}`}
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-8 text-center font-mono text-sm text-text">{value}</span>
                      <button
                        onClick={() => adjust(m.key, 1)}
                        className="rounded-theme border border-border p-1 text-muted transition hover:text-text"
                        aria-label={`Increase ${m.label}`}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
