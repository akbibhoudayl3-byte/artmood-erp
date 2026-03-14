'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import BottomNav from './BottomNav';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F8F6F3] via-[#F5F3F0] to-[#F0EDE8]">
        <div className="flex flex-col items-center gap-5 animate-pulse">
          <div className="w-16 h-16 bg-gradient-to-br from-[#C9956B] to-[#B8845A] rounded-2xl flex items-center justify-center shadow-xl shadow-[#C9956B]/20">
            <span className="text-white font-bold text-2xl">A</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-xl font-semibold text-[#1B2A4A]">ArtMood</span>
            <span className="text-xs text-[#9CA3AF] uppercase tracking-widest">Factory OS</span>
          </div>
          <div className="w-32 h-1 bg-[#E8E5E0] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#C9956B] to-[#D4A574] rounded-full animate-shimmer" />
          </div>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-[#F5F3F0] dark:bg-[#0f0f17] flex">
      <Sidebar
        role={profile.role}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 md:p-6 lg:px-8 lg:py-6 pb-20 lg:pb-8 overflow-auto">
          <div className="max-w-7xl mx-auto animate-in">
            {children}
          </div>
        </main>
      </div>
      <BottomNav role={profile.role} />
    </div>
  );
}
