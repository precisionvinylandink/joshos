import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';
import { MasterSwitcher } from './MasterSwitcher';
import { jobosNav } from '../masters/jobos/nav';
import type { MasterDef, MasterId, NavGroup } from './navTypes';
import { useAuth } from '../shared/auth';
import { usePersistentSlice } from '../shared/persistence';
import { isWeb } from '../shared/lib/buildTarget';

interface DesktopChrome {
  masters: MasterDef[];
  lifeNav: NavGroup[];
}

// Always-on hourly timelog alert scheduler — desktop only. The gate lets Rollup
// drop this (and the timelog domain it pulls) from the web bundle.
const HourlyAlerts = __LIFEOS_ENABLED__
  ? lazy(() =>
      import('../masters/lifeos/domains/timelog/HourlyAlerts').then((m) => ({
        default: m.HourlyAlerts,
      })),
    )
  : null;

function activeMasterFromPath(pathname: string): MasterId {
  if (pathname.startsWith('/life')) return 'life';
  if (pathname.startsWith('/today')) return 'today';
  return 'job';
}

function deriveTitle(pathname: string, groups: NavGroup[], fallback: string): string {
  let best = '';
  let bestLen = -1;
  for (const g of groups) {
    for (const it of g.items) {
      if (pathname.startsWith(it.to) && it.to.length > bestLen) {
        best = it.label;
        bestLen = it.to.length;
      }
    }
  }
  return best || fallback;
}

/** Placeholder summary shown in the sidebar when the Today master is active. */
function TodaySidebarSummary() {
  return (
    <div className="space-y-2 px-4 py-3 text-xs text-dim">
      <div className="text-[10px] font-medium uppercase tracking-wider text-faint">At a glance</div>
      <div className="flex justify-between">
        <span>Items due</span>
        <span className="text-text">—</span>
      </div>
      <div className="flex justify-between">
        <span>Open jobs</span>
        <span className="text-text">—</span>
      </div>
      <div className="flex justify-between">
        <span>Pending</span>
        <span className="text-text">—</span>
      </div>
    </div>
  );
}

export function AppShell() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [collapsed, setCollapsed] = usePersistentSlice<boolean>('shell.collapsed', false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [chrome, setChrome] = useState<DesktopChrome | null>(null);

  // Desktop-only shell chrome (masters + LifeOS nav). The guard makes Rollup drop
  // this import — and everything it pulls in — from the web bundle.
  useEffect(() => {
    if (__LIFEOS_ENABLED__) {
      void import('./desktopChrome').then((m) => setChrome(m.desktopChrome));
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const email = user?.email ?? '';
  const initials = (email.split('@')[0] ?? '').slice(0, 2).toUpperCase() || 'J';
  const activeMaster = activeMasterFromPath(location.pathname);

  const composed = useMemo(() => {
    // JobOS nav is defined with /job/* hrefs; on the web target JobOS lives at
    // the root, so strip the /job base there so links match the routes.
    const jobNav = isWeb
      ? jobosNav.map((g) => ({
          ...g,
          items: g.items.map((it) => ({ ...it, to: it.to.replace(/^\/job/, '') || '/' })),
        }))
      : jobosNav;

    if (isWeb) {
      return {
        header: { title: 'JobOS', subtitle: 'Precision Vinyl & Ink' },
        navGroups: jobNav,
        switcher: undefined as ReactNode,
        bodyOverride: undefined as ReactNode,
      };
    }
    // Desktop pre-hydration (chrome not loaded yet): JobOS nav, no switcher.
    if (!chrome) {
      return {
        header: { title: 'JoshOS', subtitle: '' },
        navGroups: jobNav,
        switcher: undefined as ReactNode,
        bodyOverride: undefined as ReactNode,
      };
    }
    const masterName = chrome.masters.find((m) => m.id === activeMaster)?.name ?? '';
    const navGroups =
      activeMaster === 'life' ? chrome.lifeNav : activeMaster === 'job' ? jobNav : [];
    return {
      header: { title: 'JoshOS', subtitle: masterName },
      navGroups,
      switcher: <MasterSwitcher masters={chrome.masters} activeId={activeMaster} />,
      bodyOverride: activeMaster === 'today' ? <TodaySidebarSummary /> : undefined,
    };
  }, [chrome, activeMaster]);

  const title = deriveTitle(
    location.pathname,
    composed.navGroups,
    activeMaster === 'today' ? 'Today' : composed.header.subtitle || composed.header.title,
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-text">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        header={composed.header}
        switcher={composed.switcher}
        navGroups={composed.navGroups}
        bodyOverride={composed.bodyOverride}
        userEmail={email}
        onSignOut={signOut}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} onOpenPalette={() => setPaletteOpen(true)} userInitials={initials} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {HourlyAlerts && (
        <Suspense fallback={null}>
          <HourlyAlerts />
        </Suspense>
      )}
    </div>
  );
}
