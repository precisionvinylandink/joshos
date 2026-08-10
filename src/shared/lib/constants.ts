/**
 * JobOS domain constants. The Job is the central object; a Job moves through
 * JOB_STATUSES and is one of PRODUCT_TYPES. Label/color maps drive Badges & tables.
 */

export const JOB_STATUSES = [
  'intent',
  'estimating',
  'estimate_sent',
  'approved',
  'deposit_pending',
  'in_production',
  'outsourced',
  'qc',
  'ready_to_ship',
  'shipped',
  'delivered',
  'invoiced',
  'paid',
  'closed',
  'cancelled',
  'on_hold',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  intent: 'Intent',
  estimating: 'Estimating',
  estimate_sent: 'Estimate Sent',
  approved: 'Approved',
  deposit_pending: 'Deposit Pending',
  in_production: 'In Production',
  outsourced: 'Outsourced',
  qc: 'QC',
  ready_to_ship: 'Ready to Ship',
  shipped: 'Shipped',
  delivered: 'Delivered',
  invoiced: 'Invoiced',
  paid: 'Paid',
  closed: 'Closed',
  cancelled: 'Cancelled',
  on_hold: 'On Hold',
};

/** Maps a status to a Badge variant. */
export const JOB_STATUS_COLORS: Record<JobStatus, string> = {
  intent: 'gray',
  estimating: 'blue',
  estimate_sent: 'blue',
  approved: 'teal',
  deposit_pending: 'amber',
  in_production: 'purple',
  outsourced: 'purple',
  qc: 'amber',
  ready_to_ship: 'teal',
  shipped: 'teal',
  delivered: 'green',
  invoiced: 'blue',
  paid: 'green',
  closed: 'gray',
  cancelled: 'red',
  on_hold: 'amber',
};

export const PRODUCT_TYPES = [
  'vinyl_signage',
  'dtf',
  'screen_print',
  'banner',
  'rfid',
  'canvas',
  'wide_format',
  'vehicle_wrap',
  'window_graphic',
  'promotional',
  'apparel',
  'other',
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  vinyl_signage: 'Vinyl Signage',
  dtf: 'DTF',
  screen_print: 'Screen Print',
  banner: 'Banner',
  rfid: 'RFID',
  canvas: 'Canvas',
  wide_format: 'Wide Format',
  vehicle_wrap: 'Vehicle Wrap',
  window_graphic: 'Window Graphic',
  promotional: 'Promotional',
  apparel: 'Apparel',
  other: 'Other',
};

/** Gross-margin % thresholds used to color estimate/job profitability. */
export const MARGIN_THRESHOLDS = { danger: 25, warning: 35 } as const;

/** Fixed JoshOS shell chrome. Mirrors the CSS vars in globals.css. */
export const BRAND = {
  orange: '#D94F00',
  sidebarBg: '#0F0F0F',
  loginBg: '#0A0A0A',
} as const;

/** Today-timeline edge-bar colors (per master, with a critical override). */
export const TIMELINE_COLORS = {
  jobos: '#378ADD',
  lifeos: '#639922',
  critical: '#E24B4A',
} as const;
