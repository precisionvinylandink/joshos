import { Navigate, type RouteObject } from 'react-router-dom';
import { JobPlaceholder } from './JobPlaceholder';

/**
 * JobOS routes as a plain, RELATIVE-path array so both targets can mount them at
 * different bases: desktop under /job, web at the root. Paths have no leading
 * slash for exactly that reason. (The sidebar nav uses /job/* hrefs; on web the
 * shell rewrites the /job prefix away — see AppShell.)
 */
export const jobosRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="jobs" replace /> },
  { path: 'jobs', element: <JobPlaceholder title="Jobs" /> },
  { path: 'jobs/new', element: <JobPlaceholder title="New Job" /> },
  { path: 'jobs/:id', element: <JobPlaceholder title="Job Detail" /> },
  { path: 'estimates', element: <JobPlaceholder title="Estimates" /> },
  { path: 'estimates/:id', element: <JobPlaceholder title="Estimate Detail" /> },
  { path: 'production', element: <JobPlaceholder title="Production" /> },
  { path: 'inventory', element: <JobPlaceholder title="Inventory" /> },
  { path: 'procurement', element: <JobPlaceholder title="Procurement" /> },
  { path: 'fulfillment', element: <JobPlaceholder title="Fulfillment" /> },
  { path: 'accounting', element: <JobPlaceholder title="Accounting" /> },
  { path: 'accounting/reporting', element: <JobPlaceholder title="Reporting" /> },
  { path: 'clients', element: <JobPlaceholder title="Clients" /> },
  { path: 'clients/:id', element: <JobPlaceholder title="Client Detail" /> },
  { path: 'vendors', element: <JobPlaceholder title="Vendors" /> },
  { path: 'vendors/:id', element: <JobPlaceholder title="Vendor Detail" /> },
  { path: 'files', element: <JobPlaceholder title="Files" /> },
  { path: 'print-club', element: <JobPlaceholder title="Print Club" /> },
  { path: 'rfid', element: <JobPlaceholder title="RFID" /> },
  { path: 'ai', element: <JobPlaceholder title="AI Engine" /> },
  { path: 'settings', element: <JobPlaceholder title="Settings" /> },
];
