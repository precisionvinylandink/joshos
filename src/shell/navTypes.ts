import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';

export type NavIcon = ComponentType<LucideProps>;

export interface NavItem {
  label: string;
  to: string;
  icon: NavIcon;
}

export interface NavGroup {
  /** Small uppercase group label (e.g. "JOBS", "SUPPLY"). */
  label: string;
  items: NavItem[];
}

/**
 * Shell-level master ids. Deliberately NOT the string 'lifeos' — keeping that
 * literal out of shared shell code is part of how the web bundle stays free of
 * any LifeOS reference. The LifeOS domain/nav (gated, desktop-only) may use
 * 'lifeos' freely since it is stripped from the web build.
 */
export type MasterId = 'today' | 'job' | 'life';

export interface MasterDef {
  id: MasterId;
  name: string;
  icon: NavIcon;
  /** Landing route when this master is activated. */
  home: string;
}
