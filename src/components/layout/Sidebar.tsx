'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, FolderKanban, Factory, Wallet, Package,
  Calendar, CalendarOff, Wrench, UserCheck, Megaphone, Settings, FileText,
  ClipboardList, ScanLine, X, Truck, ShoppingCart, AlertTriangle, PieChart,
  Monitor, Star, LogOut, MessageCircle, Clock, BarChart2, BookOpen,
  Layers, BarChart3, Scissors, Upload, ChefHat, Receipt
} from 'lucide-react';
import { NAV_GROUPS } from '@/lib/constants';
import { useLocale } from '@/lib/hooks/useLocale';
import { useAuth } from '@/lib/hooks/useAuth';
import type { UserRole } from '@/types/database';

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Users, FolderKanban, Factory, Wallet, Package,
  Calendar, CalendarOff, Wrench, UserCheck, Megaphone, Settings, FileText,
  ClipboardList, ScanLine, Truck, ShoppingCart, AlertTriangle, PieChart,
  Monitor, Star, MessageCircle, Clock, BarChart2, BookOpen,
  Layers, BarChart3, Scissors, Upload, ChefHat, Receipt,
};

interface SidebarProps {
  role: UserRole;
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ role, open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useLocale();
  const { profile } = useAuth();
  const navGroups = NAV_GROUPS[role] || [];

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-[272px]
          bg-[#0C1222] text-white
          shadow-2xl shadow-black/30
          transform transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          lg:translate-x-0 lg:static lg:z-auto
          flex flex-col
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Header / Logo */}
        <div className="flex items-center justify-between h-[68px] px-5 shrink-0">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="w-10 h-10 bg-gradient-to-br from-[#C9956B] via-[#D4A574] to-[#B8845A] rounded-xl flex items-center justify-center font-bold text-base shadow-lg shadow-[#C9956B]/25 group-hover:shadow-[#C9956B]/40 transition-shadow duration-300">
              A
            </div>
            <div>
              <span className="text-[15px] font-semibold tracking-tight text-white">ArtMood</span>
              <span className="block text-[10px] text-white/35 font-medium tracking-[0.15em] uppercase">Factory OS</span>
            </div>
          </Link>
          <button onClick={onClose} className="lg:hidden p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X size={18} className="text-white/60" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-1 scrollbar-thin" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {/* Section header */}
              {group.label && (
                <div className="flex items-center gap-2 px-3 pt-5 pb-2">
                  <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-white/30">
                    {group.i18nKey ? t(group.i18nKey) : group.label}
                  </span>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>
              )}

              {/* Items */}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = ICON_MAP[item.icon] || LayoutDashboard;
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  const label = item.i18nKey ? t(item.i18nKey) : item.label;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={`
                        relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium
                        transition-all duration-200 group/item
                        ${isActive
                          ? 'bg-gradient-to-r from-[#C9956B]/20 to-[#C9956B]/5 text-white'
                          : 'text-white/50 hover:bg-white/[0.04] hover:text-white/80'}
                      `}
                    >
                      {/* Active indicator bar */}
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-gradient-to-b from-[#C9956B] to-[#D4A574] rounded-r-full" />
                      )}

                      {/* Icon container */}
                      <div className={`
                        w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200
                        ${isActive
                          ? 'bg-[#C9956B]/15 text-[#D4A574]'
                          : 'text-white/40 group-hover/item:text-white/60'}
                      `}>
                        <Icon size={17} strokeWidth={isActive ? 2 : 1.75} />
                      </div>

                      <span className="flex-1 truncate">{label}</span>

                      {/* Active dot */}
                      {isActive && (
                        <div className="w-1.5 h-1.5 rounded-full bg-[#C9956B]" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User profile footer */}
        {profile && (
          <div className="shrink-0 border-t border-white/[0.06] p-3">
            <div className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#1E2F52] to-[#2A3F6F] flex items-center justify-center text-[13px] font-semibold text-white/80 border border-white/[0.08]">
                {profile.full_name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-white/80 truncate">{profile.full_name}</p>
                <p className="text-[10px] text-white/30 truncate capitalize">{profile.role?.replace('_', ' ')}</p>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
