'use client';

import { useState, useCallback } from 'react';

type ModalMode = 'create' | 'edit' | null;

interface FormModalState<T> {
  isOpen: boolean;
  mode: ModalMode;
  formData: T;
  openCreate: (defaults?: Partial<T>) => void;
  openEdit: (data: T) => void;
  close: () => void;
  setField: <K extends keyof T>(key: K, value: T[K]) => void;
  setFormData: React.Dispatch<React.SetStateAction<T>>;
}

export function useFormModal<T extends Record<string, any>>(
  initialData: T
): FormModalState<T> {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<ModalMode>(null);
  const [formData, setFormData] = useState<T>(initialData);

  const openCreate = useCallback(
    (defaults?: Partial<T>) => {
      setFormData({ ...initialData, ...defaults });
      setMode('create');
      setIsOpen(true);
    },
    [initialData]
  );

  const openEdit = useCallback((data: T) => {
    setFormData(data);
    setMode('edit');
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setMode(null);
    setFormData(initialData);
  }, [initialData]);

  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }, []);

  return { isOpen, mode, formData, openCreate, openEdit, close, setField, setFormData };
}
