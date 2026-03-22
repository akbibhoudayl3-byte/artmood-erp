'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';
import Card, { CardContent } from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  AlertTriangle, Clock, CheckCircle2, TicketCheck,
  ArrowRight, AlertCircle,
} from 'lucide-react';
import { getDashboardStats, listTickets } from '@/lib/services/sav.service';
import type { SavDashboardStats, SavTicket } from '@/types/sav';

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export default function SavDashboardPage() {
  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'operations_manager', 'owner_admin']}>
      <DashboardContent />
    </RoleGuard>
  );
}

function DashboardContent() {
  const router = useRouter();
  const { t } = useLocale();

  const [stats, setStats] = useState<SavDashboardStats | null>(null);
  const [urgentTickets, setUrgentTickets] = useState<SavTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [statsRes, ticketsRes] = await Promise.all([
        getDashboardStats(),
        listTickets({ priority: 'urgent' }),
      ]);

      if (statsRes.success && statsRes.data) setStats(statsRes.data);
      if (ticketsRes.success && ticketsRes.data) {
        // Filter out closed, take last 5
        const filtered = ticketsRes.data
          .filter(t => t.status !== 'closed')
          .slice(0, 5);
        setUrgentTickets(filtered);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-[#C9956B] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const statCards = [
    {
      label: 'Open Tickets',
      value: stats?.open_tickets ?? 0,
      icon: TicketCheck,
      color: 'blue',
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
      pulse: false,
    },
    {
      label: 'Urgent Tickets',
      value: stats?.urgent_tickets ?? 0,
      icon: AlertTriangle,
      color: 'red',
      bg: 'bg-red-100 dark:bg-red-900/30',
      iconColor: 'text-red-600 dark:text-red-400',
      pulse: (stats?.urgent_tickets ?? 0) > 0,
    },
    {
      label: 'Avg Resolution',
      value: stats?.avg_resolution_hours != null
        ? `${Math.round(stats.avg_resolution_hours)}h`
        : '—',
      icon: Clock,
      color: 'amber',
      bg: 'bg-amber-100 dark:bg-amber-900/30',
      iconColor: 'text-amber-600 dark:text-amber-400',
      pulse: false,
    },
    {
      label: 'Resolved',
      value: stats?.resolved_tickets ?? 0,
      icon: CheckCircle2,
      color: 'emerald',
      bg: 'bg-emerald-100 dark:bg-emerald-900/30',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      pulse: false,
    },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAF8] dark:bg-[#0f0f23]">
      {/* Header */}
      <div className="bg-white dark:bg-[#1a1a2e] border-b border-[#E8E5E0] dark:border-white/10 px-4 py-5">
        <h1 className="text-xl font-bold text-[#1a1a2e] dark:text-white">SAV Dashboard</h1>
        <p className="text-sm text-[#64648B] dark:text-white/50 mt-0.5">After-sales service overview</p>
      </div>

      <div className="p-4 space-y-5">
        {/* ── Stat Cards (2x2) ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-medium text-[#64648B] dark:text-white/50 uppercase tracking-wider">
                        {card.label}
                      </p>
                      <p className="text-2xl font-bold text-[#1a1a2e] dark:text-white mt-1">
                        {card.value}
                      </p>
                    </div>
                    <div className={`w-10 h-10 ${card.bg} rounded-xl flex items-center justify-center ${card.pulse ? 'animate-pulse' : ''}`}>
                      <Icon size={20} className={card.iconColor} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ── Recent Urgent Tickets ───────────────────────────────────────── */}
        <Card>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-[#64648B] dark:text-white/50 uppercase tracking-wider flex items-center gap-2">
                <AlertCircle size={14} className="text-red-500" />
                Recent Urgent Tickets
              </h3>
              <button
                onClick={() => router.push('/sav')}
                className="text-xs text-[#C9956B] font-medium flex items-center gap-1 hover:underline"
              >
                View all <ArrowRight size={12} />
              </button>
            </div>

            {urgentTickets.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 size={24} className="text-emerald-500" />
                </div>
                <p className="text-sm text-[#64648B] dark:text-white/50">No urgent tickets</p>
              </div>
            ) : (
              <div className="space-y-2">
                {urgentTickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    onClick={() => router.push(`/sav/${ticket.id}`)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#F5F3F0] dark:hover:bg-white/5 transition-colors text-left"
                  >
                    <div className="w-9 h-9 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <AlertTriangle size={16} className="text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#1a1a2e] dark:text-white truncate">
                          {ticket.ticket_number || 'SAV'}
                        </span>
                        <StatusBadge status={ticket.status} />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-[#64648B] dark:text-white/50 truncate">
                          {ticket.project?.client_name || 'Unknown client'}
                        </span>
                        <span className="text-[10px] text-[#64648B]/60 dark:text-white/30">
                          {ticket.issue_type.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-[#64648B]/60 dark:text-white/30 flex-shrink-0">
                      {timeAgo(ticket.created_at)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
