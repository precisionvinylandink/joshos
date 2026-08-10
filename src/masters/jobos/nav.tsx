import {
  Briefcase,
  Calculator,
  LayoutGrid,
  Package,
  ShoppingCart,
  Truck,
  Receipt,
  TrendingUp,
  Users,
  Building2,
  Star,
  Folder,
  Cpu,
  Sparkles,
  Settings,
} from 'lucide-react';
import type { NavGroup } from '../../shell/navTypes';

/**
 * JobOS sidebar navigation. Mounted at /job on desktop and at the root on web.
 * Safe to import from shared shell code (no LifeOS references).
 */
export const jobosNav: NavGroup[] = [
  {
    label: 'Jobs',
    items: [
      { label: 'Jobs', to: '/job/jobs', icon: Briefcase },
      { label: 'Estimates', to: '/job/estimates', icon: Calculator },
      { label: 'Production', to: '/job/production', icon: LayoutGrid },
    ],
  },
  {
    label: 'Supply',
    items: [
      { label: 'Inventory', to: '/job/inventory', icon: Package },
      { label: 'Procurement', to: '/job/procurement', icon: ShoppingCart },
      { label: 'Fulfillment', to: '/job/fulfillment', icon: Truck },
    ],
  },
  {
    label: 'Money',
    items: [
      { label: 'Accounting', to: '/job/accounting', icon: Receipt },
      { label: 'Reporting', to: '/job/accounting/reporting', icon: TrendingUp },
    ],
  },
  {
    label: 'Relationships',
    items: [
      { label: 'Clients', to: '/job/clients', icon: Users },
      { label: 'Vendors', to: '/job/vendors', icon: Building2 },
      { label: 'Print Club', to: '/job/print-club', icon: Star },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Files', to: '/job/files', icon: Folder },
      { label: 'RFID', to: '/job/rfid', icon: Cpu },
      { label: 'AI Engine', to: '/job/ai', icon: Sparkles },
      { label: 'Settings', to: '/job/settings', icon: Settings },
    ],
  },
];
