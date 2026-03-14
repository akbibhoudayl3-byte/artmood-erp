'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import type { LedgerEntry } from '@/types/database';
import { useLocale } from '@/lib/hooks/useLocale';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';

export default function LedgerPage() {
  const { t } = useLocale();
  const supabase = createClient();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');

  useEffect(() => { loadLedger(); }, []);

  async function loadLedger() {
    const { data } = await supabase.from('ledger').select('*').order('created_at', { ascending: false }).limit(200);
    setEntries(data || []);
    setLoading(false);
  }

  const filtered = filterType === 'all' ? entries : entries.filter(e => e.type === filterType);

  if (loading) return <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 skeleton" />)}</div>;

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager'] as any[]}>
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">{t('finance.ledger')}</h1>
        <div className="flex gap-2">
          {['all', 'income', 'expense'].map(f => (
            <button
              key={f}
              onClick={() => setFilterType(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                filterType === f ? 'bg-[#1B2A4A] text-white border-[#1B2A4A]' : 'bg-white text-[#64648B] border-[#E8E5E0]'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F0EDE8]">
                <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('common.date')}</th>
                <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('common.type')}</th>
                <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('finance.category')}</th>
                <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('common.description')}</th>
                <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Source</th>
                <th className="text-right px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('common.amount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EDE8]">
              {filtered.map((entry) => (
                <tr key={entry.id} className="hover:bg-[#FAFAF8]">
                  <td className="px-5 py-3.5 text-[#64648B]">
                    {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${
                      entry.type === 'income' ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      {entry.type === 'income' ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                      {entry.type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5"><StatusBadge status={entry.category} /></td>
                  <td className="px-5 py-3.5 text-[#64648B]">{entry.description || '-'}</td>
                  <td className="px-5 py-3.5 text-xs text-[#64648B]">{entry.source_module}</td>
                  <td className={`px-5 py-3.5 text-right font-semibold ${
                    entry.type === 'income' ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    {entry.type === 'income' ? '+' : '-'}{Number(entry.amount).toLocaleString()} MAD
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2.5">
        {filtered.map((entry) => (
          <Card key={entry.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold ${
                    entry.type === 'income' ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    {entry.type === 'income' ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                    {entry.type}
                  </span>
                  <StatusBadge status={entry.category} />
                </div>
                {entry.description && <p className="text-sm text-[#1a1a2e] truncate">{entry.description}</p>}
                <p className="text-xs text-[#64648B] mt-1">
                  {new Date(entry.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {entry.source_module ? ` - ${entry.source_module}` : ''}
                </p>
              </div>
              <p className={`font-bold text-sm ml-3 ${entry.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                {entry.type === 'income' ? '+' : '-'}{Number(entry.amount).toLocaleString()} MAD
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
      </RoleGuard>
  );
}
