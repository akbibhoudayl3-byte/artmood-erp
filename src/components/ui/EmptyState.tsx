'use client';

import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {/* Icon */}
      <div className="mb-4 text-[#E8E5E0] dark:text-white/20">
        {icon || <Inbox size={48} />}
      </div>

      {/* Title */}
      <h3 className="text-base font-semibold text-[#64648B] dark:text-gray-400 mb-1">
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className="text-sm text-[#64648B]/70 dark:text-gray-500 max-w-sm leading-relaxed mb-4">
          {description}
        </p>
      )}

      {/* Action */}
      {action && (
        <div className="mt-2">
          {action}
        </div>
      )}
    </div>
  );
}
