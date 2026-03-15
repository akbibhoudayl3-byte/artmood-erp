'use client';

import { useState, useCallback, useRef } from 'react';

interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  open: (opts: {
    title?: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  }) => void;
  close: () => void;
  confirm: () => Promise<void>;
  loading: boolean;
}

export function useConfirmDialog(): ConfirmDialogState {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const onConfirmRef = useRef<(() => void | Promise<void>) | null>(null);

  const open = useCallback(
    (opts: {
      title?: string;
      message: string;
      onConfirm: () => void | Promise<void>;
    }) => {
      setTitle(opts.title || 'Confirm');
      setMessage(opts.message);
      onConfirmRef.current = opts.onConfirm;
      setIsOpen(true);
      setLoading(false);
    },
    []
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setTitle('');
    setMessage('');
    setLoading(false);
    onConfirmRef.current = null;
  }, []);

  const confirm = useCallback(async () => {
    if (!onConfirmRef.current) return;

    setLoading(true);
    try {
      await onConfirmRef.current();
    } finally {
      setLoading(false);
      setIsOpen(false);
      onConfirmRef.current = null;
    }
  }, []);

  return { isOpen, title, message, open, close, confirm, loading };
}
