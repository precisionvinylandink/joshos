import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '../lib/cn';
import { EmptyState } from './EmptyState';
import { LoadingSkeleton } from './LoadingSkeleton';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  /** Value used for sorting and as the default cell content. */
  accessor?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  width?: string | number;
  align?: 'left' | 'right' | 'center';
}

export interface DataTableProps<T> {
  columns: Array<Column<T>>;
  data: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyState?: ReactNode;
}

type SortDir = 'asc' | 'desc';

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  loading,
  emptyState,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.accessor) return data;
    const accessor = col.accessor;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
      const av = accessor(a) ?? '';
      const bv = accessor(b) ?? '';
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [data, sort, columns]);

  if (loading) return <LoadingSkeleton variant="table" />;
  if (!data.length)
    return <>{emptyState ?? <EmptyState headline="Nothing here yet" />}</>;

  const toggleSort = (key: string) =>
    setSort((prev) =>
      prev?.key === key
        ? prev.dir === 'asc'
          ? { key, dir: 'desc' }
          : null
        : { key, dir: 'asc' },
    );

  const alignClass = (a?: Column<T>['align']) =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

  return (
    <div className="overflow-x-auto rounded-theme border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-surface2">
          <tr>
            {columns.map((col) => {
              const active = sort?.key === col.key;
              return (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={cn(
                    'border-b border-border px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted',
                    alignClass(col.align),
                    col.sortable && 'cursor-pointer select-none hover:text-dim',
                  )}
                  onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable &&
                      (active ? (
                        sort?.dir === 'asc' ? (
                          <ChevronUp size={12} />
                        ) : (
                          <ChevronDown size={12} />
                        )
                      ) : (
                        <ChevronsUpDown size={12} className="opacity-40" />
                      ))}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-b border-border last:border-0',
                onRowClick && 'cursor-pointer hover:bg-white/[0.03]',
              )}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn('px-3 py-2.5 text-text', alignClass(col.align))}>
                  {col.render ? col.render(row) : (col.accessor?.(row) ?? null)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
