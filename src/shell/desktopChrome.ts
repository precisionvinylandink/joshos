import { Sun, Briefcase, Heart } from 'lucide-react';
import type { MasterDef, NavGroup } from './navTypes';
import { lifeosNav } from '../masters/lifeos/nav';

/**
 * Desktop-only shell chrome. Reached ONLY through the __LIFEOS_ENABLED__-gated
 * dynamic import in AppShell, so everything here — the "LifeOS" master name, the
 * /life/timelog home route, and the imported LifeOS nav (Scorecard, Rochester
 * Fund, …) — is stripped from the web bundle by Rollup.
 */
export interface DesktopChrome {
  masters: MasterDef[];
  lifeNav: NavGroup[];
}

export const desktopChrome: DesktopChrome = {
  masters: [
    { id: 'today', name: 'Today', icon: Sun, home: '/today' },
    { id: 'job', name: 'JobOS', icon: Briefcase, home: '/job/jobs' },
    { id: 'life', name: 'LifeOS', icon: Heart, home: '/life/timelog' },
  ],
  lifeNav: lifeosNav,
};
