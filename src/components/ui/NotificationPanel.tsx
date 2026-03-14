'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import type { Notification } from '@/types/database';
import { X, Bell, Check, CheckCheck, AlertTriangle, Info, AlertCircle } from 'lucide-react';

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

const SEVERITY_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50' },
  warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
  critical: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
};

export default function NotificationPanel({ open, onClose }: NotificationPanelProps) {
  const { profile } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && profile) loadNotifications();
  }, [open, profile]);

  async function loadNotifications() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile!.id)
      .order('created_at', { ascending: false })
      .limit(30);
    setNotifications(data || []);
    setLoading(false);
  }

  async function markAsRead(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  async function markAllRead() {
    if (!profile) return;
    await supabase.from('notifications').update({ is_read: true })
      .eq('user_id', profile.id).eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  function handleClick(notification: Notification) {
    markAsRead(notification.id);
    if (notification.reference_type && notification.reference_id) {
      const routes: Record<string, string> = {
        project: '/projects/',
        lead: '/leads/',
        installation: '/installation/',
        quote: '/quotes/',
        production: '/production/',
      };
      const base = routes[notification.reference_type];
      if (base) {
        router.push(base + notification.reference_id);
        onClose();
      }
    }
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:absolute lg:inset-auto lg:right-0 lg:top-full lg:mt-2" onClick={onClose}>
      {/* Mobile: full backdrop; Desktop: just click-away */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none" />

      <div
        className="absolute bottom-0 left-0 right-0 max-h-[80vh] lg:bottom-auto lg:left-auto lg:right-0 lg:top-0 lg:w-[380px] lg:max-h-[500px] bg-white rounded-t-3xl lg:rounded-2xl shadow-2xl border border-[#E8E5E0] overflow-hidden animate-fade-scale"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E5E0]">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-[#1a1a2e]" />
            <h2 className="font-semibold text-[#1a1a2e]">Notifications</h2>
            {unreadCount > 0 && (
              <span className="bg-[#C9956B] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="p-2 hover:bg-[#F5F3F0] rounded-xl" title="Mark all read">
                <CheckCheck size={16} className="text-[#64648B]" />
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-[#F5F3F0] rounded-xl">
              <X size={16} className="text-[#64648B]" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto max-h-[60vh] lg:max-h-[420px]">
          {loading && (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-16 skeleton" />)}
            </div>
          )}

          {!loading && notifications.length === 0 && (
            <div className="p-12 text-center">
              <Bell size={32} className="text-[#E8E5E0] mx-auto mb-3" />
              <p className="text-sm text-[#64648B]">No notifications yet</p>
            </div>
          )}

          {notifications.map(notification => {
            const config = SEVERITY_CONFIG[notification.severity] || SEVERITY_CONFIG.info;
            const Icon = config.icon;
            const timeAgo = getTimeAgo(notification.created_at);

            return (
              <button
                key={notification.id}
                onClick={() => handleClick(notification)}
                className={`w-full flex items-start gap-3 px-5 py-3.5 text-left border-b border-[#F0EDE8] hover:bg-[#FAFAF8] ${
                  !notification.is_read ? 'bg-[#FAFAF8]' : ''
                }`}
              >
                <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <Icon size={16} className={config.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm ${!notification.is_read ? 'font-semibold text-[#1a1a2e]' : 'font-medium text-[#64648B]'} line-clamp-1`}>
                      {notification.title}
                    </p>
                    {!notification.is_read && (
                      <div className="w-2 h-2 bg-[#C9956B] rounded-full flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                  {notification.body && (
                    <p className="text-xs text-[#64648B] mt-0.5 line-clamp-2">{notification.body}</p>
                  )}
                  <p className="text-[11px] text-[#64648B]/60 mt-1">{timeAgo}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
