import { NavLink } from 'react-router-dom';
import { cn } from '../shared/lib/cn';
import type { MasterDef, MasterId } from './navTypes';

/**
 * Vertical/row master switch (Today · JobOS · LifeOS). Presentational only — the
 * master definitions (names + home routes) are passed in from the desktop-only,
 * gated `desktopChrome` module, so this component carries no LifeOS literal and
 * is safe to keep in the shared shell.
 */
export function MasterSwitcher({
  masters,
  activeId,
}: {
  masters: MasterDef[];
  activeId: MasterId;
}) {
  return (
    <div className="flex items-center justify-around gap-1">
      {masters.map((m) => (
        <NavLink
          key={m.id}
          to={m.home}
          title={m.name}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-theme transition',
            m.id === activeId
              ? 'bg-brand/[0.12] text-brand'
              : 'text-muted hover:bg-white/5 hover:text-text',
          )}
        >
          <m.icon size={18} />
        </NavLink>
      ))}
    </div>
  );
}
