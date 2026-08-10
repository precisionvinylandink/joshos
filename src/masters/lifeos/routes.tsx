import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LoadingSkeleton } from '../../shared/ui';

// Real ported domains + placeholders. This whole module is imported ONLY behind
// __LIFEOS_ENABLED__ (see router.tsx), so nothing here reaches the web bundle.
const TimelogPage = lazy(() => import('./domains/timelog/TimelogPage'));
const ScorecardPage = lazy(() => import('./domains/scorecard/ScorecardPage'));
const TasksPage = lazy(() => import('./domains/tasks/TasksPage'));
const CalendarPage = lazy(() => import('../../joshos/calendar/CalendarPage'));
const HealthPage = lazy(() => import('./domains/health/HealthPage'));
const MoneyPage = lazy(() => import('./domains/money/MoneyPage'));
const HabitsPage = lazy(() => import('./domains/habits/HabitsPage'));
const GoalsPage = lazy(() => import('./domains/goals/GoalsPage'));

export default function LifeOSRoutes() {
  return (
    <Suspense fallback={<div className="p-6"><LoadingSkeleton variant="detail" /></div>}>
      <Routes>
        <Route index element={<Navigate to="timelog" replace />} />
        <Route path="timelog" element={<TimelogPage />} />
        <Route path="scorecard" element={<ScorecardPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="health" element={<HealthPage />} />
        <Route path="money" element={<MoneyPage />} />
        <Route path="habits" element={<HabitsPage />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="*" element={<Navigate to="timelog" replace />} />
      </Routes>
    </Suspense>
  );
}
