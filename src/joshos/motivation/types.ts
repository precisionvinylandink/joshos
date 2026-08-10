/**
 * Motivation is a calm, non-punishing feedback layer — premium productivity with
 * subtle retro mechanics, never a childish game. State is small and derived from
 * real progress; the productivity system is fully functional without any of it.
 */
export interface MotivationState {
  xp: number;
  /** Garden stage keys the user has reached (never removed — no regression). */
  unlocked: string[];
  lastGrowthAt?: string; // ISO
}

export interface GardenStage {
  level: number;
  key: string;
  label: string;
  min: number; // xp threshold
}
