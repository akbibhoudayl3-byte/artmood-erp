'use client';

import { useEffect } from 'react';
import { AlertCircle, CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

interface ErrorBannerProps {
  message: string | null;
  type?: 'error' | 'success' | 'warning' | 'info';
  onDismiss?: () => void;
  autoDismiss?: number;
}

const BANNER_CONFIG = {
  error: {
    icon: AlertCircle,
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-700 dark:text-red-300',
    iconColor: 'text-red-500',
    dismissColor: 'text-red-400 hover:text-red-600',
  },
  success: {
    icon: CheckCircle,
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-800 dark:text-green-300',
    iconColor: 'text-green-500',
    dismissColor: 'text-green-400 hover:text-green-600',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-800 dark:text-amber-300',
    iconColor: 'text-amber-500',
    dismissColor: 'text-amber-400 hover:text-amber-600',
  },
  info: {
    icon: Info,
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-800 dark:text-blue-300',
    iconColor: 'text-blue-500',
    dismissColor: 'text-blue-400 hover:text-blue-600',
  },
};

export default function ErrorBanner({ message, type = 'error', onDismiss, autoDismiss }: ErrorBannerProps) {
  // Auto-dismiss timer
  useEffect(() => {
    if (!message || !autoDismiss || !onDismiss) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, autoDismiss);
    return () => clearTimeout(timer);
  }, [message, autoDismiss, onDismiss]);

  if (!message) return null;

  const config = BANNER_CONFIG[type];
  const Icon = config.icon;

  return (
    <div
      className={`flex items-center gap-2 ${config.bg} border ${config.border} ${config.text} rounded-xl px-4 py-3 text-sm animate-in fade-in duration-200`}
    >
      <Icon size={16} className={`${config.iconColor} flex-shrink-0`} />
      <span className="flex-1 min-w-0">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={`flex-shrink-0 p-0.5 rounded transition-colors ${config.dismissColor}`}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
