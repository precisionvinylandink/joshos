import { EmptyState } from '../../shared/ui';

/** Placeholder page for the JobOS domains (business logic lands in later prompts). */
export function JobPlaceholder({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="font-display text-3xl tracking-wide">{title}</h1>
      {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
      <div className="mt-6">
        <EmptyState headline={`${title} — coming soon`} description="This JobOS domain is scaffolded but not yet built." />
      </div>
    </div>
  );
}
