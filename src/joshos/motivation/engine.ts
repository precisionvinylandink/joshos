import type { GardenStage, MotivationState } from './types';

export const GARDEN_STAGES: GardenStage[] = [
  { level: 0, key: 'soil', label: 'Soil', min: 0 },
  { level: 1, key: 'seed', label: 'Seed', min: 20 },
  { level: 2, key: 'sprout', label: 'Sprout', min: 60 },
  { level: 3, key: 'plant', label: 'Plant', min: 140 },
  { level: 4, key: 'flower', label: 'Flower', min: 280 },
  { level: 5, key: 'garden', label: 'Garden', min: 500 },
  { level: 6, key: 'grove', label: 'Grove', min: 900 },
];

export const EMPTY_MOTIVATION: MotivationState = { xp: 0, unlocked: ['soil'] };

export function gardenStage(xp: number): GardenStage {
  let current = GARDEN_STAGES[0]!;
  for (const s of GARDEN_STAGES) if (xp >= s.min) current = s;
  return current;
}

export function nextStage(xp: number): GardenStage | null {
  return GARDEN_STAGES.find((s) => s.min > xp) ?? null;
}

/** 0..1 toward the next stage (1 when maxed). */
export function progressToNext(xp: number): number {
  const cur = gardenStage(xp);
  const nxt = nextStage(xp);
  if (!nxt) return 1;
  return (xp - cur.min) / (nxt.min - cur.min);
}

/** Simple level: one per 100 xp. Purely cosmetic. */
export function levelForXp(xp: number): number {
  return Math.floor(xp / 100) + 1;
}

/** Add earned xp; never decreases. Records the growth moment. */
export function applyProgress(state: MotivationState, weight: number, at: string): MotivationState {
  const xp = state.xp + Math.max(0, weight);
  const stage = gardenStage(xp);
  const unlocked = state.unlocked.includes(stage.key)
    ? state.unlocked
    : [...state.unlocked, stage.key];
  return { xp, unlocked, lastGrowthAt: at };
}
