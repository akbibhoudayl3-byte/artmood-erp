'use client';

import { useState, useCallback, useRef } from 'react';

interface AsyncActionState<T = void> {
  loading: boolean;
  error: string | null;
  data: T | null;
  execute: (...args: any[]) => Promise<T | undefined>;
  reset: () => void;
  clearError: () => void;
}

export function useAsyncAction<T = void>(
  action: (...args: any[]) => Promise<T>,
  options?: {
    onSuccess?: (data: T) => void;
    onError?: (error: string) => void;
  }
): AsyncActionState<T> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);
  const mountedRef = useRef(true);

  const execute = useCallback(
    async (...args: any[]): Promise<T | undefined> => {
      setLoading(true);
      setError(null);

      try {
        const result = await action(...args);

        if (mountedRef.current) {
          setData(result);
          setLoading(false);
          options?.onSuccess?.(result);
        }

        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred';

        if (mountedRef.current) {
          setError(message);
          setLoading(false);
          options?.onError?.(message);
        }

        return undefined;
      }
    },
    [action, options]
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return { loading, error, data, execute, reset, clearError };
}
