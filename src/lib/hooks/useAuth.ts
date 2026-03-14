'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile, UserRole } from '@/types/database';

export function useAuth() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function getProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      setProfile(data);
      setLoading(false);
    }

    getProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      getProfile();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  };

  const hasRole = (roles: UserRole[]) => {
    if (!profile) return false;
    return roles.includes(profile.role);
  };

  const isCeo = profile?.role === 'ceo';
  const canViewFinance = hasRole(['ceo', 'commercial_manager']);
  const canManageLeads = hasRole(['ceo', 'commercial_manager', 'community_manager']);
  const canManageProduction = hasRole(['ceo', 'workshop_manager']);
  const canManageStock = hasRole(['ceo', 'workshop_manager']);

  return {
    profile,
    loading,
    signOut,
    hasRole,
    isCeo,
    canViewFinance,
    canManageLeads,
    canManageProduction,
    canManageStock,
  };
}
