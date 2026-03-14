'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, Menu, ChevronDown, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/lib/hooks/useStockAlerts';
import { useAuth } from '@/lib/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import type { NotificationItem } from '@/lib/hooks/useStockAlerts';

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Returns a human-readable relative time string, e.g. "2m ago", "1h ago", "3d ago".
 * Falls back to a short date string for anything older than 7 days.
 */
function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Truncate a string to maxLen chars, appending ellipsis when cut. */
function truncate(text: string | null, maxLen = 80): string {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

// ─── Role display helpers ────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  ceo: 'CEO',
  commercial_manager: 'Commercial',
  designer: 'Designer',
  workshop_manager: 'Workshop Mgr',
  workshop_worker: 'Worker',
  installer: 'Installer',
  hr_manager: 'HR',
  community_manager: 'Community',
};

const ROLE_COLORS: Record<string, string> = {
  ceo: 'bg-[#1B2A4A] text-white',
  commercial_manager: 'bg-blue-100 text-blue-800',
  designer: 'bg-purple-100 text-purple-800',
  workshop_manager: 'bg-orange-100 text-orange-800',
  workshop_worker: 'bg-yellow-100 text-yellow-800',
  installer: 'bg-teal-100 text-teal-800',
  hr_manager: 'bg-pink-100 text-pink-800',
  community_manager: 'bg-indigo-100 text-indigo-800',
};

// ─── Component ───────────────────────────────────────────────────────────────

interface TopBarProps {
  /** Called when the hamburger/menu button is tapped (mobile sidebar toggle). */
  onMenuClick?: () => void;
  /** Optional page title displayed next to the menu button on mobile. */
  pageTitle?: string;
}

export default function TopBar({ onMenuClick, pageTitle }: TopBarProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = createClient();

  // Notification bell hook — pass null when profile is not yet loaded
  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    useNotifications(profile?.id ?? null);

  const [showNotifs, setShowNotifs] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle notification click: mark read + navigate if link present
  async function handleNotifClick(notif: NotificationItem) {
    if (!notif.is_read) {
      await markAsRead(notif.id);
    }
    if (notif.link) {
      setShowNotifs(false);
      router.push(notif.link);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push('/auth/login');
  }

  const roleLabel = profile?.role ? (ROLE_LABELS[profile.role] ?? profile.role) : '';
  const roleColor = profile?.role ? (ROLE_COLORS[profile.role] ?? 'bg-gray-100 text-gray-700') : '';

  // User initials for the avatar circle
  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?';

  return (
    <header className="h-14 flex items-center px-4 gap-3 bg-white border-b border-[#F0EDE8] dark:bg-[#1a1a2e] dark:border-white/10 sticky top-0 z-40 shrink-0">

      {/* ── Left: hamburger + page title ── */}
      <button
        onClick={onMenuClick}
        className="p-2 -ml-1 rounded-xl text-[#64648B] hover:bg-[#F5F3F0] dark:hover:bg-white/10 transition-colors lg:hidden"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {pageTitle && (
        <span className="text-sm font-semibold text-[#1a1a2e] dark:text-white truncate lg:hidden">
          {pageTitle}
        </span>
      )}

      {/* ── Spacer pushes right-side items to the right ── */}
      <div className="flex-1" />

      {/* ── Right: Notification Bell ── */}
      <div ref={notifRef} className="relative">
        <button
          onClick={() => {
            setShowNotifs((v) => !v);
            setShowUserMenu(false);
          }}
          className="relative p-2 rounded-xl text-[#64648B] hover:bg-[#F5F3F0] dark:hover:bg-white/10 transition-colors"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span
              className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none"
              aria-hidden
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* ── Notification Dropdown ── */}
        {showNotifs && (
          <div className="absolute right-0 top-full mt-2 z-50 w-80 max-h-[400px] bg-white dark:bg-[#1E2030] rounded-xl shadow-xl border border-[#F0EDE8] dark:border-white/10 flex flex-col overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#F0EDE8] dark:border-white/10 shrink-0">
              <h3 className="text-sm font-semibold text-[#1a1a2e] dark:text-white">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsRead()}
                  className="text-xs text-[#C9956B] font-medium hover:text-[#B8845A] transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Scrollable list */}
            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                  <Bell size={28} className="text-[#D0CCC5] mb-2" />
                  <p className="text-sm text-[#64648B]">No notifications</p>
                </div>
              ) : (
                <ul>
                  {notifications.map((notif) => (
                    <li key={notif.id}>
                      <button
                        onClick={() => handleNotifClick(notif)}
                        className={[
                          'w-full text-left px-4 py-3 flex gap-3 hover:bg-[#FAFAF8] dark:hover:bg-white/5 transition-colors border-b border-[#F0EDE8]/60 dark:border-white/5 last:border-0',
                          !notif.is_read
                            ? 'bg-blue-50/70 dark:bg-blue-500/10'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {/* Unread indicator dot */}
                        <div className="shrink-0 pt-1">
                          <div
                            className={[
                              'w-2 h-2 rounded-full mt-0.5',
                              !notif.is_read
                                ? 'bg-blue-500'
                                : 'bg-transparent',
                            ].join(' ')}
                          />
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <p
                            className={[
                              'text-sm leading-tight truncate',
                              !notif.is_read
                                ? 'font-semibold text-[#1a1a2e] dark:text-white'
                                : 'font-medium text-[#3a3a5e] dark:text-white/80',
                            ].join(' ')}
                          >
                            {notif.title}
                          </p>
                          {notif.body && (
                            <p className="text-xs text-[#64648B] mt-0.5 line-clamp-2 leading-snug">
                              {truncate(notif.body, 90)}
                            </p>
                          )}
                          <p className="text-[11px] text-[#9999B0] mt-1">
                            {timeAgo(notif.created_at)}
                          </p>
                        </div>

                        {/* Right border accent for unread */}
                        {!notif.is_read && (
                          <div className="w-1 shrink-0 self-stretch bg-blue-400 rounded-full ml-1" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Right: User chip + dropdown ── */}
      <div ref={userMenuRef} className="relative">
        <button
          onClick={() => {
            setShowUserMenu((v) => !v);
            setShowNotifs(false);
          }}
          className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-[#F5F3F0] dark:hover:bg-white/10 transition-colors"
          aria-label="User menu"
        >
          {/* Avatar circle */}
          <div className="w-8 h-8 rounded-lg bg-[#C9956B] text-white flex items-center justify-center text-xs font-bold shrink-0">
            {initials}
          </div>

          {/* Name + role — hidden on small screens */}
          <div className="hidden sm:block text-left min-w-0">
            <p className="text-xs font-semibold text-[#1a1a2e] dark:text-white leading-tight truncate max-w-[100px]">
              {profile?.full_name?.split(' ')[0] ?? 'User'}
            </p>
            {roleLabel && (
              <p className="text-[10px] text-[#64648B] leading-tight">{roleLabel}</p>
            )}
          </div>

          <ChevronDown
            size={14}
            className={`text-[#64648B] transition-transform hidden sm:block ${showUserMenu ? 'rotate-180' : ''}`}
          />
        </button>

        {/* User dropdown */}
        {showUserMenu && (
          <div className="absolute right-0 top-full mt-2 z-50 w-56 bg-white dark:bg-[#1E2030] rounded-xl shadow-xl border border-[#F0EDE8] dark:border-white/10 overflow-hidden py-1">
            {/* Profile info header */}
            <div className="px-4 py-3 border-b border-[#F0EDE8] dark:border-white/10">
              <p className="text-sm font-semibold text-[#1a1a2e] dark:text-white truncate">
                {profile?.full_name ?? '—'}
              </p>
              {roleLabel && (
                <span
                  className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1 ${roleColor}`}
                >
                  {roleLabel}
                </span>
              )}
            </div>

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-60"
            >
              <LogOut size={15} />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
