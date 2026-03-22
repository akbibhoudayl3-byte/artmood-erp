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
import { LEAD_STAGES } from '@/lib/constants';
import type { Lead } from '@/types/database';
import { Plus, Search, Phone, MapPin, LayoutGrid, List, Users } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { loadLeads as loadLeadsSvc } from '@/lib/services/lead.service';

export default function LeadsPage() {
  const { profile, canManageLeads } = useAuth();
  const router = useRouter();
  const { t } = useLocale();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [view, setView] = useState<'list' | 'kanban'>('kanban');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const res = await loadLeadsSvc({
      role: profile?.role,
      userId: profile?.id,
    });
    if (res.success) {
      setLeads(res.data || []);
    } else {
      setErrorMsg(res.error || 'Failed to load leads');
    }
    setLoading(false);
  }, [profile?.role, profile?.id]);

  useEffect(() => {
    if (profile) fetchLeads();
  }, [fetchLeads, profile]);

  const filtered = leads.filter(l => {
    const matchSearch = !search ||
      l.full_name.toLowerCase().includes(search.toLowerCase()) ||
      l.phone.includes(search) ||
      l.city?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || l.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const leadsByStatus = LEAD_STAGES.reduce((acc, stage) => {
    acc[stage.key] = filtered.filter(l => l.status === stage.key);
    return acc;
  }, {} as Record<string, Lead[]>);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-12 skeleton" />
        <div className="h-12 skeleton" />
        <div className="h-96 skeleton" />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'community_manager'] as any[]}>
    <div className="space-y-5">
      {/* Banners */}
      <ErrorBanner message={errorMsg} type="error" onDismiss={() => setErrorMsg(null)} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">{t('leads.title')}</h1>
          <p className="text-sm text-[#64648B] mt-0.5">{leads.length} total leads</p>
        </div>
        {canManageLeads && (
          <Button onClick={() => router.push('/leads/new')}>
            <Plus size={18} /> {t('leads.new_lead')}
          </Button>
        )}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64648B]" />
          <input
            type="text"
            placeholder={`${t('common.search')}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20 focus:border-[#C9956B] placeholder:text-gray-400"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3.5 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20 focus:border-[#C9956B]"
          >
            <option value="all">{t('common.all')}</option>
            {LEAD_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <div className="flex border border-[#E8E5E0] rounded-xl overflow-hidden">
            <button
              onClick={() => setView('kanban')}
              className={`px-3 py-2.5 ${view === 'kanban' ? 'bg-[#1B2A4A] text-white' : 'bg-white text-[#64648B] hover:bg-[#F5F3F0]'}`}
            >
              <LayoutGrid size={18} />
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-2.5 ${view === 'list' ? 'bg-[#1B2A4A] text-white' : 'bg-white text-[#64648B] hover:bg-[#F5F3F0]'}`}
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Kanban View */}
      {view === 'kanban' ? (
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
          {LEAD_STAGES.map((stage) => (
            <div key={stage.key} className="flex-shrink-0 w-72">
              <div className="flex items-center gap-2.5 mb-3">
                <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                <h3 className="text-sm font-semibold text-[#1a1a2e]">{stage.label}</h3>
                <span className="text-[11px] text-[#64648B] bg-[#F0EDE8] px-2 py-0.5 rounded-md font-semibold">
                  {leadsByStatus[stage.key]?.length || 0}
                </span>
              </div>
              <div className="space-y-2.5">
                {(leadsByStatus[stage.key] || []).map((lead) => (
                  <Card
                    key={lead.id}
                    className="p-3.5"
                    onClick={() => router.push(`/leads/${lead.id}`)}
                  >
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-[#F5F3F0] flex items-center justify-center text-[10px] font-bold text-[#64648B]">
                        {lead.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <p className="text-sm font-semibold text-[#1a1a2e] flex-1 truncate">{lead.full_name}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#64648B]">
                      <Phone size={12} /> {lead.phone}
                    </div>
                    {lead.city && (
                      <div className="flex items-center gap-2 mt-1 text-xs text-[#64648B]">
                        <MapPin size={12} /> {lead.city}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-[#F0EDE8]">
                      {lead.source ? <StatusBadge status={lead.source} /> : <span />}
                      <span className="text-[11px] text-[#64648B]">
                        {new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </Card>
                ))}
                {(leadsByStatus[stage.key] || []).length === 0 && (
                  <div className="border-2 border-dashed border-[#E8E5E0] rounded-2xl p-6 text-center text-xs text-[#64648B]">
                    {t('common.no_results')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F0EDE8]">
                  <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('common.name')}</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('common.phone')}</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('common.city')}</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('leads.source')}</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EDE8]">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon={<Users size={32} className="opacity-30" />}
                        title={t('common.no_results') || 'No leads found'}
                      />
                    </td>
                  </tr>
                ) : filtered.map((lead) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-[#FAFAF8] cursor-pointer"
                    onClick={() => router.push(`/leads/${lead.id}`)}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#F5F3F0] flex items-center justify-center text-[10px] font-bold text-[#64648B]">
                          {lead.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <span className="font-medium text-[#1a1a2e]">{lead.full_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-[#64648B]">{lead.phone}</td>
                    <td className="px-5 py-3.5 text-[#64648B]">{lead.city || '-'}</td>
                    <td className="px-5 py-3.5">{lead.source ? <StatusBadge status={lead.source} /> : '-'}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={lead.status} /></td>
                    <td className="px-5 py-3.5 text-[#64648B] text-xs">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
      </RoleGuard>
  );
}
