'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, FolderKanban, Factory, Wallet, MoreHorizontal, Package, Calendar, CalendarOff, Wrench, UserCheck, Megaphone, Settings, FileText, ClipboardList, ScanLine, Truck, ShoppingCart, AlertTriangle, PieChart, Monitor, Star, ChefHat } from 'lucide-react';
import { useState } from 'react';
import { NAV_ITEMS } from '@/lib/constants';
import { useLocale } from '@/lib/hooks/useLocale';
import type { UserRole } from '@/types/database';

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Users, FolderKanban, Factory, Wallet, Package,
  Calendar, CalendarOff, Wrench, UserCheck, Megaphone, Settings, FileText,
  ClipboardList, ScanLine, Truck, ShoppingCart, AlertTriangle, PieChart,
  Monitor, Star, ChefHat,
};

interface BottomNavProps {
  role: UserRole;
}

export default function BottomNav({ role }: BottomNavProps) {
  const pathname = usePathname();
  const { t } = useLocale();
  const [showMore, setShowMore] = useState(false);
  const navItems = NAV_ITEMS[role] || [];

  // Show first 4 items + "More" button
  const mainItems = navItems.slice(0, 4);
  const moreItems = navItems.slice(4);

  return (
    <>
      {/* More menu overlay */}
      {showMore && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setShowMore(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div
            className="absolute bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] left-3 right-3 bg-white dark:bg-[#1a1a2e] rounded-3xl shadow-2xl border border-[#E8E5E0] dark:border-white/10 p-3 animate-fade-scale"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-3 gap-1.5">
              {moreItems.map((item) => {
                const Icon = ICON_MAP[item.icon] || LayoutDashboard;
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                const label = item.i18nKey ? t(item.i18nKey) : item.label;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMore(false)}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl text-center transition-all ${
                      isActive ? 'bg-[#C9956B]/10 text-[#C9956B]' : 'text-[#9CA3AF] active:bg-[#F5F3F0] dark:active:bg-white/10'
                    }`}
                  >
                    <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                    <span className={`text-[11px] ${isActive ? 'font-semibold text-[#1B2A4A] dark:text-white' : 'font-medium'}`}>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 lg:hidden bg-white/90 dark:bg-[#1a1a2e]/90 backdrop-blur-xl shadow-[0_-4px_20px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-16">
          {mainItems.map((item) => {
            const Icon = ICON_MAP[item.icon] || LayoutDashboard;
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const label = item.i18nKey ? t(item.i18nKey) : item.label;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl min-w-[56px] transition-all ${
                  isActive ? 'bg-[#C9956B]/10 text-[#C9956B]' : 'text-[#9CA3AF] active:text-[#1B2A4A]'
                }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span className={`text-[10px] ${isActive ? 'font-semibold text-[#1B2A4A] dark:text-white' : 'font-medium'}`}>
                  {label.split(' ')[0]}
                </span>
              </Link>
            );
          })}
          {moreItems.length > 0 && (
            <button
              onClick={() => setShowMore(!showMore)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl min-w-[56px] transition-all ${
                showMore ? 'bg-[#C9956B]/10 text-[#C9956B]' : 'text-[#9CA3AF]'
              }`}
            >
              <MoreHorizontal size={20} />
              <span className="text-[10px] font-medium">{t('common.more') || 'More'}</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
