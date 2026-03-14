'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import type { UserRole } from '@/types/database';
import { ShieldX } from 'lucide-react';

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children, fallback }: RoleGuardProps) {
  const { profile, loading } = useAuth();
  const { t } = useLocale();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-[#C9956B] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  // CEO always has access
  if (profile.role === 'ceo') {
    return <>{children}</>;
  }

  if (!allowedRoles.includes(profile.role)) {
    if (fallback) return <>{fallback}</>;
    
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
          <ShieldX className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {t('access_denied')}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-md">
          {t('access_denied_description')}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
