import { cn } from '../lib/cn';

type SkeletonVariant = 'table' | 'card' | 'detail' | 'list';

const Bar = ({ className }: { className?: string }) => (
  <div className={cn('animate-pulse rounded bg-white/5', className)} />
);

export function LoadingSkeleton({
  variant = 'list',
  rows = 5,
  className,
}: {
  variant?: SkeletonVariant;
  rows?: number;
  className?: string;
}) {
  if (variant === 'card') {
    return (
      <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-4', className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-theme border border-border bg-surface p-4">
            <Bar className="h-3 w-16" />
            <Bar className="mt-3 h-6 w-20" />
          </div>
        ))}
      </div>
    );
  }
  if (variant === 'detail') {
    return (
      <div className={cn('space-y-4', className)}>
        <Bar className="h-7 w-1/3" />
        <Bar className="h-4 w-2/3" />
        <Bar className="h-40 w-full" />
        <Bar className="h-4 w-1/2" />
      </div>
    );
  }
  if (variant === 'table') {
    return (
      <div className={cn('overflow-hidden rounded-theme border border-border', className)}>
        <div className="border-b border-border bg-surface2 p-3">
          <Bar className="h-3 w-24" />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border p-3 last:border-0">
            <Bar className="h-4 flex-1" />
            <Bar className="h-4 w-24" />
            <Bar className="h-4 w-16" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Bar key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
