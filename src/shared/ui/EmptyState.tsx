import type { ComponentType, ReactNode } from 'react';
import { Inbox, type LucideProps } from 'lucide-react';

export interface EmptyStateProps {
  icon?: ComponentType<LucideProps>;
  headline: string;
  description?: ReactNode;
  cta?: ReactNode;
}

export function EmptyState({ icon: Icon = Inbox, headline, description, cta }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-theme border border-dashed border-border bg-surface/40 px-6 py-12 text-center">
      <div className="rounded-full bg-white/5 p-3 text-muted">
        <Icon size={22} />
      </div>
      <div className="text-sm font-medium text-text">{headline}</div>
      {description && <div className="max-w-sm text-xs text-dim">{description}</div>}
      {cta && <div className="mt-1">{cta}</div>}
    </div>
  );
}
