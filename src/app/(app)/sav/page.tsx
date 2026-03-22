'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import ErrorBanner from '@/components/ui/ErrorBanner';
import EmptyState from '@/components/ui/EmptyState';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { listTickets } from '@/lib/services/sav.service';
import type { SavTicket, SavTicketStatus, SavPriority } from '@/types/sav';
import {
  Headset, Plus, Search, Clock, User, AlertTriangle,
} from 'lucide-react';

const STATUS_TABS: { key: SavTicketStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'planned', label: 'Planned' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
];

const PRIORITY_OPTIONS: { key: SavPriority | 'all'; label: string }[] = [
  { key: 'all', label: 'All Priorities' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'normal', label: 'Normal' },
  { key: 'low', label: 'Low' },
];

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SavPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const { t } = useLocale();

  const [tickets, setTickets] = useState<SavTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<SavTicketStatus | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<SavPriority | 'all'>('all');

  const isInstaller = profile?.role === 'installer';

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    const filters: Parameters<typeof listTickets>[0] = {};

    if (filterStatus !== 'all') filters.status = filterStatus;
    if (filterPriority !== 'all') filters.priority = filterPriority;
    if (isInstaller && profile?.id) filters.assignedTo = profile.id;
    if (search.trim()) filters.search = search.trim();

    const res = await listTickets(filters);
    if (res.success) {
      setTickets(res.data || []);
    } else {
      setErrorMsg(res.error || 'Failed to load tickets');
    }
    setLoading(false);
  }, [filterStatus, filterPriority, isInstaller, profile?.id, search]);

  useEffect(() => {
    if (profile) fetchTickets();
  }, [fetchTickets, profile]);

  // Client-side search filter (for project client_name which service can't filter)
  const filtered = tickets.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.ticket_number?.toLowerCase().includes(q) ||
      t.project?.client_name?.toLowerCase().includes(q) ||
      t.project?.reference_code?.toLowerCase().includes(q) ||
      t.issue_description?.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-12 skeleton rounded-xl" />
        <div className="h-10 skeleton rounded-xl" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-28 skeleton rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'installer', 'workshop_manager', 'operations_manager', 'owner_admin'] as any[]}>
      <div className="space-y-4">
        {/* Error Banner */}
        <ErrorBanner message={errorMsg} type="error" onDismiss={() => setErrorMsg(null)} />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#C9956B]/10 flex items-center justify-center">
              <Headset size={20} className="text-[#C9956B]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">SAV</h1>
              <p className="text-sm text-[#64648B] mt-0.5">
                {filtered.length} ticket{filtered.length !== 1 ? 's' : ''}
                {isInstaller && ' assigned to you'}
              </p>
            </div>
          </div>
          <Button onClick={() => router.push('/sav/new')} size="sm">
            <Plus size={16} />
            <span className="hidden sm:inline">New Ticket</span>
          </Button>
        </div>

        {/* Search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64648B]" />
            <input
              type="text"
              placeholder={`${t('common.search') || 'Search'}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20 focus:border-[#C9956B] placeholder:text-gray-400"
            />
          </div>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as SavPriority | 'all')}
            className="px-3.5 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20 focus:border-[#C9956B]"
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {STATUS_TABS.map((tab) => {
            const isActive = filterStatus === tab.key;
            const count = tab.key === 'all'
              ? tickets.length
              : tickets.filter((t) => t.status === tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => setFilterStatus(tab.key)}
                className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-[#1B2A4A] text-white shadow-sm'
                    : 'bg-[#F5F3F0] text-[#64648B] hover:bg-[#EDE9E3]'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-white text-[#64648B]'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Ticket List */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Headset size={48} className="opacity-30" />}
            title={search ? 'No tickets match your search' : 'No SAV tickets yet'}
            description={!search ? 'Create a new ticket when a client reports an issue.' : undefined}
          />
        ) : (
          <div className="space-y-2.5">
            {filtered.map((ticket) => (
              <Card
                key={ticket.id}
                className="p-4"
                onClick={() => router.push(`/sav/${ticket.id}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Ticket number + project ref */}
                    <div className="flex items-center gap-2 mb-1.5">
                      {ticket.ticket_number && (
                        <span className="text-xs font-mono font-semibold text-[#C9956B]">
                          {ticket.ticket_number}
                        </span>
                      )}
                      {ticket.project?.reference_code && (
                        <span className="text-[11px] text-[#64648B] bg-[#F5F3F0] px-1.5 py-0.5 rounded-md">
                          {ticket.project.reference_code}
                        </span>
                      )}
                    </div>

                    {/* Client name */}
                    <p className="text-sm font-semibold text-[#1a1a2e] truncate">
                      {ticket.project?.client_name || 'Unknown Client'}
                    </p>

                    {/* Description preview */}
                    <p className="text-xs text-[#64648B] mt-0.5 line-clamp-1">
                      {ticket.issue_description}
                    </p>

                    {/* Badges row */}
                    <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                      <StatusBadge status={ticket.issue_type} />
                      <StatusBadge status={ticket.priority} />
                      <StatusBadge status={ticket.status} />
                    </div>
                  </div>

                  {/* Right side: time + assigned */}
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className="text-[11px] text-[#64648B] flex items-center gap-1">
                      <Clock size={11} />
                      {timeAgo(ticket.created_at)}
                    </span>
                    {ticket.assigned_profile?.full_name && (
                      <span className="text-[11px] text-[#64648B] flex items-center gap-1">
                        <User size={11} />
                        {ticket.assigned_profile.full_name}
                      </span>
                    )}
                    {ticket.priority === 'urgent' && (
                      <AlertTriangle size={14} className="text-red-500" />
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
