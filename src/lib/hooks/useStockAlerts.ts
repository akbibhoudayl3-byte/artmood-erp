'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { StockAvailability } from '@/types/database';

/**
 * useStockAlerts — Enhanced stock alert hook with real-time updates.
 *
 * Features:
 * - Initial fetch from `stock_availability` view
 * - Real-time Supabase subscription on `stock_items` table changes
 * - Auto-refresh every 60 seconds as fallback
 * - Computed counts: criticalCount (out_of_stock) + lowCount (low_stock)
 * - totalAlertValue: stock_value of all understocked items
 * - Used in Sidebar/TopBar for notification badge
 */

export interface StockAlertCounts {
  criticalCount: number; // out_of_stock items
  lowCount: number;      // low_stock items
  totalCount: number;    // all alerts
  totalAlertValue: number; // MAD value of understocked items
}

export function useStockAlerts() {
  const [alerts, setAlerts] = useState<StockAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const supabase = createClient();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadAlerts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('stock_availability')
        .select('*')
        .in('stock_status', ['low_stock', 'out_of_stock'])
        .order('stock_status', { ascending: true }) // out_of_stock first (alphabetically before low_stock? no — sort by severity)
        .order('name', { ascending: true });

      if (!error && data) {
        // Sort: out_of_stock first, then low_stock
        const sorted = [...data].sort((a, b) => {
          if (a.stock_status === 'out_of_stock' && b.stock_status !== 'out_of_stock') return -1;
          if (a.stock_status !== 'out_of_stock' && b.stock_status === 'out_of_stock') return 1;
          return (a.name || '').localeCompare(b.name || '');
        });
        setAlerts(sorted as StockAvailability[]);
        setLastRefreshed(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    // Initial load
    loadAlerts();

    // Auto-refresh every 60 seconds
    intervalRef.current = setInterval(loadAlerts, 60_000);

    // Real-time subscription — any change to stock_items triggers a refresh
    const channel = supabase
      .channel('stock-alerts-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_items' },
        () => {
          // Small delay to let DB triggers settle (e.g. stock movement trigger)
          setTimeout(loadAlerts, 500);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stock_movements' },
        () => {
          setTimeout(loadAlerts, 800);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      supabase.removeChannel(channel);
    };
  }, [loadAlerts]);

  // Computed values
  const outOfStock = alerts.filter(a => a.stock_status === 'out_of_stock');
  const lowStock = alerts.filter(a => a.stock_status === 'low_stock');

  const criticalCount = outOfStock.length;
  const lowCount = lowStock.length;
  const totalCount = alerts.length;

  const totalAlertValue = alerts.reduce((sum, a) => {
    // stock_value is the total value of current stock for that item
    // If out_of_stock, it contributes 0 actual value but represents a gap
    return sum + (typeof a.stock_value === 'number' ? a.stock_value : 0);
  }, 0);

  return {
    alerts,
    loading,
    lastRefreshed,
    refresh: loadAlerts,
    // Computed counts for badges
    criticalCount,
    lowCount,
    totalCount,
    totalAlertValue,
    // Convenience boolean
    hasAlerts: totalCount > 0,
    hasCritical: criticalCount > 0,
  };
}

/**
 * useNotifications — Real-time notification bell hook.
 *
 * Fetches unread notifications for the current user.
 * Real-time subscription on `notifications` table for instant badge updates.
 */
export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('notifications')
        .select('id, type, title, body, is_read, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(30);

      if (data) {
        setNotifications(data as NotificationItem[]);
        setUnreadCount(data.filter((n: NotificationItem) => !n.is_read).length);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, supabase]);

  const markAsRead = useCallback(async (notificationId: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, [supabase]);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [userId, supabase]);

  useEffect(() => {
    if (!userId) return;
    loadNotifications();

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotif = payload.new as NotificationItem;
          setNotifications(prev => [newNotif, ...prev].slice(0, 30));
          if (!newNotif.is_read) setUnreadCount(prev => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Re-fetch on any update to keep counts accurate
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, loadNotifications, supabase]);

  return {
    notifications,
    unreadCount,
    loading,
    refresh: loadNotifications,
    markAsRead,
    markAllAsRead,
  };
}
