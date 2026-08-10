import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, useRoutes, type RouteObject } from 'react-router-dom';
import { AppShell } from './shell/AppShell';
import { ProtectedRoute, LoginPage } from './shared/auth';
import { jobosRoutes } from './masters/jobos/routes';
import { isWeb } from './shared/lib/buildTarget';
import { EmptyState } from './shared/ui';

function Loading() {
  return <div className="p-6 text-sm text-muted">Loading…</div>;
}
function wrap(node: ReactNode) {
  return <Suspense fallback={<Loading />}>{node}</Suspense>;
}

function NotFound() {
  return (
    <div className="flex h-full items-center justify-center p-10">
      <EmptyState headline="404 — Not found" description="That page doesn’t exist." />
    </div>
  );
}

// DESKTOP-ONLY routes. Gated so Rollup drops Today + LifeOS (and everything they
// import) from the web bundle. This is the enforcement point for the hard rule.
const desktopRoutes: RouteObject[] = [];
if (__LIFEOS_ENABLED__) {
  const TodayPage = lazy(() => import('./shell/today/TodayPage'));
  const LifeOSRoutes = lazy(() => import('./masters/lifeos/routes'));
  desktopRoutes.push(
    { path: 'today', element: wrap(<TodayPage />) },
    { path: 'life/*', element: wrap(<LifeOSRoutes />) },
  );
}

const protectedChildren: RouteObject[] = [
  { index: true, element: <Navigate to={isWeb ? '/jobs' : '/today'} replace /> },
  // Desktop mounts JobOS under /job; web mounts it at the root.
  ...(isWeb ? jobosRoutes : [{ path: 'job', children: jobosRoutes }]),
  ...desktopRoutes,
  { path: '*', element: <NotFound /> },
];

const tree: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: protectedChildren,
  },
];

export function AppRoutes() {
  return useRoutes(tree);
}
