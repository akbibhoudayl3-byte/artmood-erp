'use client';

import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import Card from './Card';
import EmptyState from './EmptyState';

interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  loading?: boolean;
}

type SortDirection = 'asc' | 'desc';

export default function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No data found',
  loading = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedData = useMemo(() => {
    if (!sortKey) return data;

    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey];
      const bVal = (b as Record<string, unknown>)[sortKey];

      // Handle nulls/undefined
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDirection === 'asc' ? 1 : -1;
      if (bVal == null) return sortDirection === 'asc' ? -1 : 1;

      // Numeric comparison
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      // String comparison
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      if (aStr < bStr) return sortDirection === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortDirection]);

  // Loading skeleton
  if (loading) {
    return (
      <>
        {/* Desktop skeleton */}
        <Card className="hidden md:block">
          <div className="space-y-3 p-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 skeleton rounded-lg" />
            ))}
          </div>
        </Card>
        {/* Mobile skeleton */}
        <div className="md:hidden space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 skeleton rounded-2xl" />
          ))}
        </div>
      </>
    );
  }

  // Empty state
  if (data.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  return (
    <>
      {/* Desktop table */}
      <Card className="hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F0EDE8] dark:border-white/10">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`text-left px-5 py-3.5 font-semibold text-[#64648B] dark:text-gray-400 text-xs uppercase tracking-wider ${
                      col.sortable ? 'cursor-pointer select-none hover:text-[#1a1a2e] dark:hover:text-white transition-colors' : ''
                    } ${col.className || ''}`}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {col.sortable && sortKey === col.key && (
                        sortDirection === 'asc'
                          ? <ChevronUp size={14} className="text-[#C9956B]" />
                          : <ChevronDown size={14} className="text-[#C9956B]" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EDE8] dark:divide-white/5">
              {sortedData.map((item) => (
                <tr
                  key={keyExtractor(item)}
                  className={`hover:bg-[#FAFAF8] dark:hover:bg-white/[0.02] transition-colors ${
                    onRowClick ? 'cursor-pointer' : ''
                  }`}
                  onClick={onRowClick ? () => onRowClick(item) : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-5 py-3.5 text-[#1a1a2e] dark:text-white ${col.className || ''}`}
                    >
                      {col.render
                        ? col.render(item)
                        : String((item as Record<string, unknown>)[col.key] ?? '-')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile card layout */}
      <div className="md:hidden space-y-2.5">
        {sortedData.map((item) => (
          <Card
            key={keyExtractor(item)}
            className="p-4"
            onClick={onRowClick ? () => onRowClick(item) : undefined}
          >
            <div className="space-y-2">
              {columns.map((col, idx) => (
                <div
                  key={col.key}
                  className={`flex items-start justify-between gap-2 ${
                    idx === 0 ? '' : 'text-sm'
                  }`}
                >
                  {idx === 0 ? (
                    // First column rendered as the card title
                    <div className="font-semibold text-[#1a1a2e] dark:text-white text-sm">
                      {col.render
                        ? col.render(item)
                        : String((item as Record<string, unknown>)[col.key] ?? '-')}
                    </div>
                  ) : (
                    <>
                      <span className="text-[#64648B] dark:text-gray-400 text-xs flex-shrink-0">
                        {col.label}
                      </span>
                      <span className="text-[#1a1a2e] dark:text-white text-xs text-right">
                        {col.render
                          ? col.render(item)
                          : String((item as Record<string, unknown>)[col.key] ?? '-')}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
