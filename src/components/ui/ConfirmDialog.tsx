'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import Button from './Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
}

const VARIANT_CONFIG = {
  danger: {
    icon: AlertCircle,
    iconBg: 'bg-red-50 dark:bg-red-900/20',
    iconColor: 'text-red-500',
    buttonVariant: 'danger' as const,
    defaultTitle: 'Confirm Delete',
    defaultConfirm: 'Delete',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-50 dark:bg-amber-900/20',
    iconColor: 'text-amber-500',
    buttonVariant: 'accent' as const,
    defaultTitle: 'Are you sure?',
    defaultConfirm: 'Continue',
  },
  info: {
    icon: Info,
    iconBg: 'bg-blue-50 dark:bg-blue-900/20',
    iconColor: 'text-blue-500',
    buttonVariant: 'primary' as const,
    defaultTitle: 'Confirm',
    defaultConfirm: 'Confirm',
  },
};

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, loading]);

  // Prevent body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current && !loading) onClose();
      }}
    >
      <div
        className="bg-white dark:bg-[#1a1a2e] rounded-2xl w-full max-w-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 text-center">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-full ${config.iconBg} flex items-center justify-center mx-auto mb-4`}>
            <Icon size={24} className={config.iconColor} />
          </div>

          {/* Title */}
          <h3 className="font-bold text-[#1a1a2e] dark:text-white text-lg mb-2">
            {title || config.defaultTitle}
          </h3>

          {/* Message */}
          <p className="text-sm text-[#64648B] dark:text-gray-400 leading-relaxed">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-6">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={config.buttonVariant}
            className="flex-1"
            onClick={onConfirm}
            loading={loading}
            disabled={loading}
          >
            {confirmLabel || config.defaultConfirm}
          </Button>
        </div>
      </div>
    </div>
  );
}
