/**
 * Daily Scorecard — scoring logic ported EXACTLY from the prototype.
 *
 * Two blocks:
 *   Nick's Block (9 AM–1 PM): Dials 60 · Connects 15 · Follow-Ups 5 · Closes 1
 *   PVI Block  (1:30–3:30 PM): PVI Touches 10 · Print Club Signups 6 · Quotes 3
 *
 * Overall = mean over the 7 metrics of min(score/goal, 1).
 * Grade:  S ≥ .90 · A ≥ .75 · B ≥ .55 · C ≥ .35 · D < .35   (colors preserved).
 */
export type Block = 'nick' | 'pvi';

export interface MetricDef {
  key: MetricKey;
  label: string;
  goal: number;
  block: Block;
}

export const SCORECARD_METRICS = [
  { key: 'dials', label: 'Dials', goal: 60, block: 'nick' },
  { key: 'connects', label: 'Connects', goal: 15, block: 'nick' },
  { key: 'followups', label: 'Follow-Ups Set', goal: 5, block: 'nick' },
  { key: 'closes', label: 'Closes', goal: 1, block: 'nick' },
  { key: 'touches', label: 'PVI Touches', goal: 10, block: 'pvi' },
  { key: 'signups', label: 'Print Club Signups', goal: 6, block: 'pvi' },
  { key: 'quotes', label: 'Quotes Sent', goal: 3, block: 'pvi' },
] as const satisfies readonly MetricDef[];

export type MetricKey =
  | 'dials'
  | 'connects'
  | 'followups'
  | 'closes'
  | 'touches'
  | 'signups'
  | 'quotes';

export type Scores = Record<MetricKey, number>;

export const EMPTY_SCORES: Scores = {
  dials: 0,
  connects: 0,
  followups: 0,
  closes: 0,
  touches: 0,
  signups: 0,
  quotes: 0,
};

export const BLOCK_LABELS: Record<Block, string> = {
  nick: "Nick's Block · 9 AM–1 PM",
  pvi: 'PVI Block · 1:30–3:30 PM',
};

/** Fraction 0–1 = mean of capped per-metric ratios. */
export function scorecardPct(scores: Scores): number {
  const sum = SCORECARD_METRICS.reduce(
    (acc, m) => acc + Math.min((scores[m.key] ?? 0) / m.goal, 1),
    0,
  );
  return sum / SCORECARD_METRICS.length;
}

export interface Grade {
  letter: 'S' | 'A' | 'B' | 'C' | 'D';
  label: string;
  color: string;
}

export function gradeFor(pct: number): Grade {
  if (pct >= 0.9) return { letter: 'S', label: 'ELITE', color: '#FFD600' };
  if (pct >= 0.75) return { letter: 'A', label: 'LOCKED IN', color: '#00FF94' };
  if (pct >= 0.55) return { letter: 'B', label: 'SOLID', color: '#00BFFF' };
  if (pct >= 0.35) return { letter: 'C', label: 'BUILDING', color: '#FF6B35' };
  return { letter: 'D', label: 'PUSH HARDER', color: '#FF3B3B' };
}

/** Coerce arbitrary jsonb into a full Scores object. */
export function coerceScores(raw: unknown): Scores {
  const out = { ...EMPTY_SCORES };
  if (raw && typeof raw === 'object') {
    for (const m of SCORECARD_METRICS) {
      const v = (raw as Record<string, unknown>)[m.key];
      if (typeof v === 'number' && Number.isFinite(v)) out[m.key] = v;
    }
  }
  return out;
}
