import {
  Clock,
  ClipboardCheck,
  ListChecks,
  Pill,
  Dumbbell,
  UtensilsCrossed,
  Droplet,
  Wallet,
  PiggyBank,
  Languages,
  Target,
  Flame,
} from 'lucide-react';
import type { NavGroup } from '../../shell/navTypes';

/**
 * LifeOS sidebar navigation. DESKTOP ONLY — this module is reached exclusively
 * through the __LIFEOS_ENABLED__-gated dynamic import in the shell, so its
 * personal labels (Scorecard, Rochester Fund, …) never reach the web bundle.
 */
export const lifeosNav: NavGroup[] = [
  {
    label: 'Track',
    items: [
      { label: 'Time Log', to: '/life/timelog', icon: Clock },
      { label: 'Scorecard', to: '/life/scorecard', icon: ClipboardCheck },
      { label: 'Tasks', to: '/life/tasks', icon: ListChecks },
    ],
  },
  {
    label: 'Body',
    items: [
      { label: 'Meds', to: '/life/health', icon: Pill },
      { label: 'Gym', to: '/life/health', icon: Dumbbell },
      { label: 'Nutrition', to: '/life/health', icon: UtensilsCrossed },
      { label: 'Water', to: '/life/health', icon: Droplet },
    ],
  },
  {
    label: 'Money',
    items: [
      { label: 'Debt', to: '/life/money', icon: Wallet },
      { label: 'Rochester Fund', to: '/life/money', icon: PiggyBank },
    ],
  },
  {
    label: 'Growth',
    items: [
      { label: 'Spanish', to: '/life/habits', icon: Languages },
      { label: 'Goals', to: '/life/goals', icon: Target },
      { label: 'Streaks', to: '/life/habits', icon: Flame },
    ],
  },
];
