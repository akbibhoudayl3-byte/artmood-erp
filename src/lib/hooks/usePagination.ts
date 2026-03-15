'use client';

import { useState, useMemo, useCallback } from 'react';

interface PaginationState<T> {
  page: number;
  totalPages: number;
  pageItems: T[];
  setPage: (p: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  canNext: boolean;
  canPrev: boolean;
}

export function usePagination<T>(
  items: T[],
  itemsPerPage: number
): PaginationState<T> {
  const [page, setPageRaw] = useState(0);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(items.length / itemsPerPage)),
    [items.length, itemsPerPage]
  );

  // Clamp page when items shrink (e.g. after filtering)
  const clampedPage = useMemo(
    () => Math.min(page, totalPages - 1),
    [page, totalPages]
  );

  const pageItems = useMemo(() => {
    const start = clampedPage * itemsPerPage;
    return items.slice(start, start + itemsPerPage);
  }, [items, clampedPage, itemsPerPage]);

  const setPage = useCallback(
    (p: number) => {
      setPageRaw(Math.max(0, Math.min(p, totalPages - 1)));
    },
    [totalPages]
  );

  const nextPage = useCallback(() => {
    setPageRaw((prev) => Math.min(prev + 1, totalPages - 1));
  }, [totalPages]);

  const prevPage = useCallback(() => {
    setPageRaw((prev) => Math.max(prev - 1, 0));
  }, []);

  const canNext = clampedPage < totalPages - 1;
  const canPrev = clampedPage > 0;

  return {
    page: clampedPage,
    totalPages,
    pageItems,
    setPage,
    nextPage,
    prevPage,
    canNext,
    canPrev,
  };
}
