'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLocale } from '@/lib/hooks/useLocale';
import Card, { CardContent } from '@/components/ui/Card';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { Shield, User, Clock, Database, Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface AuditEntry {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  notes: string | null;
  created_at: string;
  profile?: { full_name: string; role: string } | null;
}

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
  financial_edit: 'bg-orange-100 text-orange-700',
  print: 'bg-purple-100 text-purple-700',
  export: 'bg-indigo-100 text-indigo-700',
  login: 'bg-gray-100 text-gray-600',
  user_management: 'bg-yellow-100 text-yellow-700',
  stock_change: 'bg-teal-100 text-teal-700',
  view_sensitive: 'bg-pink-100 text-pink-700',
};

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const { t } = useLocale();
  const supabase = createClient();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => { loadAuditLog(); }, [page]);

  async function loadAuditLog() {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const [{ data }, { count }] = await Promise.all([
      supabase
        .from('audit_log')
        .select('*, profile:profiles!audit_log_user_id_fkey(full_name, role)')
        .order('created_at', { ascending: false })
        .range(from, to),
      supabase
        .from('audit_log')
        .select('*', { count: 'exact', head: true }),
    ]);
    setEntries((data as AuditEntry[]) || []);
    setTotalCount(count ?? 0);
    setLoading(false);
  }

  const actions = ['all', ...Array.from(new Set(entries.map(e => e.action)))];
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const filtered = entries.filter(e => {
    const matchSearch = !search ||
      e.profile?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      e.entity_type?.toLowerCase().includes(search.toLowerCase()) ||
      e.notes?.toLowerCase().includes(search.toLowerCase());
    const matchAction = filterAction === 'all' || e.action === filterAction;
    return matchSearch && matchAction;
  });

  if (loading && entries.length === 0) return <div className="space-y-2">{[...Array(8)].map((_, i) => <div key={i} className="h-14 skeleton rounded-xl" />)}</div>;

  return (
    <RoleGuard allowedRoles={['ceo'] as any[]}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a2e] flex items-center gap-2">
            <Shield size={22} className="text-[#C9956B]" /> Audit Log
          </h1>
          <p className="text-sm text-[#64648B]">{totalCount} events tracked</p>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-col sm:flex-row">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64648B]" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search user, entity, notes..."
              className="w-full pl-9 pr-4 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20 focus:border-[#C9956B]"
            />
          </div>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
            className="px-3 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white focus:outline-none"
          >
            {actions.map(a => <option key={a} value={a}>{a === 'all' ? 'All actions' : a}</option>)}
          </select>
        </div>

        {/* Log table */}
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F0EDE8] bg-[#FAFAF8]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64648B] uppercase tracking-wider">Time</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64648B] uppercase tracking-wider">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64648B] uppercase tracking-wider">Action</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64648B] uppercase tracking-wider">Entity</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64648B] uppercase tracking-wider">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EDE8]">
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-[#64648B]">No entries found</td></tr>
                ) : filtered.map(e => (
                  <tr key={e.id} className="hover:bg-[#FAFAF8]">
                    <td className="px-4 py-2.5 text-xs text-[#64648B] whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Clock size={11} />
                        {new Date(e.created_at).toLocaleString('fr-MA', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <User size={12} className="text-[#C9956B]" />
                        <div>
                          <p className="text-xs font-medium text-[#1a1a2e]">{e.profile?.full_name || '—'}</p>
                          <p className="text-[10px] text-[#64648B]">{e.profile?.role}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACTION_COLORS[e.action] || 'bg-gray-100 text-gray-600'}`}>
                        {e.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <Database size={11} className="text-[#64648B]" />
                        <span className="text-xs text-[#1a1a2e]">{e.entity_type}</span>
                        {e.entity_id && <span className="text-[10px] text-[#9CA3AF] font-mono">{e.entity_id.slice(0, 8)}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[#64648B] max-w-xs truncate">{e.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[#F0EDE8]">
              <p className="text-xs text-[#64648B]">
                Page {page + 1} of {totalPages} ({totalCount} total)
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded-lg hover:bg-[#F5F3F0] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-lg hover:bg-[#F5F3F0] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </RoleGuard>
  );
}
