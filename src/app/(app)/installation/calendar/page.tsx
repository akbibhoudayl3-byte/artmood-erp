'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { useLocale } from '@/lib/hooks/useLocale';
import { ArrowLeft, ChevronLeft, ChevronRight, MapPin, Phone, Clock, Users } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';

interface Installation {
  id: string;
  project_id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  client_address: string | null;
  client_phone: string | null;
  notes: string | null;
  team_lead_id: string | null;
  project?: { client_name: string; reference_code: string };
  team_lead?: { full_name: string } | null;
}

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  completed: 'bg-emerald-500',
  issue_reported: 'bg-red-500',
  rescheduled: 'bg-orange-500',
};

export default function InstallationCalendarPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLocale();

  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => { loadInstallations(); }, [currentMonth]);

  async function loadInstallations() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const start = new Date(year, month, 1).toISOString().split('T')[0];
    const end = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const { data } = await supabase
      .from('installations')
      .select('*, project:projects(client_name, reference_code), team_lead:profiles!installations_team_lead_id_fkey(full_name)')
      .gte('scheduled_date', start)
      .lte('scheduled_date', end)
      .order('scheduled_date')
      .order('scheduled_time');

    setInstallations((data as Installation[]) || []);
    setLoading(false);
  }

  function prevMonth() {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    setSelectedDate(null);
  }

  function nextMonth() {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    setSelectedDate(null);
  }

  // Build calendar grid
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
  const totalDays = lastDay.getDate();
  const today = new Date().toISOString().split('T')[0];

  // Group installations by date
  const byDate: Record<string, Installation[]> = {};
  installations.forEach(inst => {
    if (!byDate[inst.scheduled_date]) byDate[inst.scheduled_date] = [];
    byDate[inst.scheduled_date].push(inst);
  });

  const selectedInstallations = selectedDate ? (byDate[selectedDate] || []) : [];

  // Stats
  const scheduledCount = installations.filter(i => i.status === 'scheduled').length;
  const inProgressCount = installations.filter(i => i.status === 'in_progress').length;
  const completedCount = installations.filter(i => i.status === 'completed').length;
  const issueCount = installations.filter(i => i.status === 'issue_reported').length;

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'installer'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/installation')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#1a1a2e]">{t('install.calendar')}</h1>
          <p className="text-sm text-[#64648B]">{installations.length} installations this month</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="p-2.5 text-center">
          <p className="text-lg font-bold text-blue-600">{scheduledCount}</p>
          <p className="text-[10px] text-[#64648B]">{t('install.scheduled')}</p>
        </Card>
        <Card className="p-2.5 text-center">
          <p className="text-lg font-bold text-amber-600">{inProgressCount}</p>
          <p className="text-[10px] text-[#64648B]">{t('install.in_progress')}</p>
        </Card>
        <Card className="p-2.5 text-center">
          <p className="text-lg font-bold text-emerald-600">{completedCount}</p>
          <p className="text-[10px] text-[#64648B]">{t('install.completed')}</p>
        </Card>
        <Card className="p-2.5 text-center">
          <p className="text-lg font-bold text-red-600">{issueCount}</p>
          <p className="text-[10px] text-[#64648B]">Issues</p>
        </Card>
      </div>

      {/* Calendar */}
      <Card>
        <div className="p-4">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronLeft size={20} />
            </button>
            <h2 className="text-lg font-bold text-[#1a1a2e]">
              {MONTHS_FR[month]} {year}
            </h2>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {DAYS_FR.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-[#64648B] py-1">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells before first day */}
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="h-16" />
            ))}
            {/* Day cells */}
            {Array.from({ length: totalDays }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayInstalls = byDate[dateStr] || [];
              const isToday = dateStr === today;
              const isSelected = dateStr === selectedDate;

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(dateStr === selectedDate ? null : dateStr)}
                  className={`h-16 rounded-xl text-left p-1.5 transition-colors relative ${
                    isSelected ? 'bg-[#1E2F52] text-white' :
                    isToday ? 'bg-[#C9956B]/10 border border-[#C9956B]' :
                    dayInstalls.length > 0 ? 'bg-blue-50 hover:bg-blue-100' :
                    'hover:bg-gray-50'
                  }`}
                >
                  <span className={`text-xs font-medium ${
                    isSelected ? 'text-white' : isToday ? 'text-[#C9956B] font-bold' : 'text-[#1a1a2e]'
                  }`}>
                    {day}
                  </span>
                  {dayInstalls.length > 0 && (
                    <div className="flex gap-0.5 mt-1 flex-wrap">
                      {dayInstalls.slice(0, 3).map(inst => (
                        <div
                          key={inst.id}
                          className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white/70' : STATUS_COLORS[inst.status] || 'bg-gray-400'}`}
                        />
                      ))}
                      {dayInstalls.length > 3 && (
                        <span className={`text-[9px] ${isSelected ? 'text-white/70' : 'text-[#64648B]'}`}>
                          +{dayInstalls.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-1">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
            <span className="text-[11px] text-[#64648B] capitalize">{status.replace(/_/g, ' ')}</span>
          </div>
        ))}
      </div>

      {/* Selected Date Details */}
      {selectedDate && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-sm">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              <span className="text-[#64648B] font-normal ml-2">({selectedInstallations.length} installation{selectedInstallations.length !== 1 ? 's' : ''})</span>
            </h2>
          </CardHeader>
          <CardContent>
            {selectedInstallations.length === 0 ? (
              <p className="text-sm text-[#64648B] text-center py-4">No installations on this date</p>
            ) : (
              <div className="space-y-3">
                {selectedInstallations.map(inst => (
                  <div
                    key={inst.id}
                    className="p-3 rounded-xl border border-[#E8E5E0] hover:border-[#C9956B] cursor-pointer transition-colors"
                    onClick={() => router.push(`/installation/${inst.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#1a1a2e]">{inst.project?.client_name}</p>
                        <p className="text-xs text-[#64648B] font-mono">{inst.project?.reference_code}</p>
                      </div>
                      <StatusBadge status={inst.status} />
                    </div>

                    <div className="mt-2 space-y-1">
                      {inst.scheduled_time && (
                        <div className="flex items-center gap-1.5 text-xs text-[#64648B]">
                          <Clock size={12} /> {inst.scheduled_time}
                        </div>
                      )}
                      {inst.client_address && (
                        <div className="flex items-center gap-1.5 text-xs text-[#64648B]">
                          <MapPin size={12} /> <span className="truncate">{inst.client_address}</span>
                        </div>
                      )}
                      {inst.client_phone && (
                        <div className="flex items-center gap-1.5 text-xs text-[#64648B]">
                          <Phone size={12} />
                          <a href={`tel:${inst.client_phone}`} className="text-blue-600 hover:underline" onClick={e => e.stopPropagation()}>
                            {inst.client_phone}
                          </a>
                        </div>
                      )}
                      {inst.team_lead && (
                        <div className="flex items-center gap-1.5 text-xs text-[#64648B]">
                          <Users size={12} /> {inst.team_lead.full_name}
                        </div>
                      )}
                    </div>

                    {inst.notes && (
                      <p className="text-xs text-[#64648B] mt-2 bg-[#F5F3F0] p-2 rounded-lg">{inst.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
      </RoleGuard>
  );
}
