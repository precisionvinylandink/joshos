import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, LogOut } from 'lucide-react';
import { cn } from '../shared/lib/cn';
import type { NavGroup } from './navTypes';

export interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  header: { title: string; subtitle: string };
  switcher?: ReactNode;
  navGroups: NavGroup[];
  /** Replaces the nav list entirely (used for the Today master's summary block). */
  bodyOverride?: ReactNode;
  userEmail: string;
  onSignOut: () => void;
}

function initialsOf(email: string): string {
  const local = email.split('@')[0] ?? '';
  return (local.slice(0, 2) || 'J').toUpperCase();
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
  header,
  switcher,
  navGroups,
  bodyOverride,
  userEmail,
  onSignOut,
}: SidebarProps) {
  return (
    <aside
      style={{ width: collapsed ? 64 : 240 }}
      className="flex h-full shrink-0 flex-col border-r border-border bg-sidebar-bg transition-[width] duration-200"
    >
      {switcher && <div className="border-b border-border p-2">{switcher}</div>}

      {/* Header */}
      <div className="px-4 py-4">
        {collapsed ? (
          <div className="text-center text-[15px] font-medium text-white">{header.title.slice(0, 1)}</div>
        ) : (
          <>
            <div className="text-[15px] font-medium leading-tight text-white">{header.title}</div>
            <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted">
              {header.subtitle}
            </div>
          </>
        )}
      </div>

      {/* Nav (or override, e.g. the Today summary block) */}
      <nav className="flex-1 overflow-y-auto pb-2">
        {bodyOverride}
        {!bodyOverride &&
          navGroups.map((group) => (
          <div key={group.label} className="mb-1.5">
            {!collapsed && (
              <div className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider text-faint">
                {group.label}
              </div>
            )}
            {group.items.map((item) => (
              <NavLink
                key={`${group.label}-${item.label}`}
                to={item.to}
                end={item.to.split('/').length <= 3}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'relative flex items-center gap-3 border-l-[3px] px-3 py-2 text-sm transition',
                    collapsed && 'justify-center',
                    isActive
                      ? 'border-brand bg-brand/[0.08] text-white'
                      : 'border-transparent text-[#A3A3A3] hover:bg-white/[0.03] hover:text-[#E5E5E5]',
                  )
                }
              >
                <item.icon size={17} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-muted transition hover:text-text"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        {!collapsed && <span>Collapse</span>}
      </button>

      {/* User block */}
      <div className="flex items-center gap-2.5 border-t border-border px-3 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
          {initialsOf(userEmail)}
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 truncate text-xs text-dim">{userEmail}</div>
            <button
              onClick={onSignOut}
              className="shrink-0 rounded-theme p-1 text-muted transition hover:bg-white/5 hover:text-text"
              aria-label="Sign out"
            >
              <LogOut size={15} />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
