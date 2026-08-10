import { EmptyState } from '../../shared/ui';

/** Generic LifeOS placeholder for the not-yet-built domains. */
export function PlaceholderPage({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle?: string;
  items?: string[];
}) {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="font-display text-3xl tracking-wide">{title}</h1>
      {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
      <div className="mt-6">
        <EmptyState
          headline={`${title} — coming soon`}
          description={
            items?.length ? `Planned: ${items.join(' · ')}` : 'This LifeOS domain is not built yet.'
          }
        />
      </div>
    </div>
  );
}
