'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { RoleGuard } from '@/components/auth/RoleGuard';
import type { ProductionSheet } from '@/types/database';
import { Plus, FileText, Search, ArrowLeft } from 'lucide-react';

export default function ProductionSheetsPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLocale();

  const [sheets, setSheets] = useState<ProductionSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => { loadSheets(); }, []);

  async function loadSheets() {
    const { data } = await supabase
      .from('production_sheets')
      .select('*, project:projects(reference_code, client_name), filler:profiles!production_sheets_filled_by_fkey(full_name)')
      .order('created_at', { ascending: false });
    setSheets((data as ProductionSheet[]) || []);
    setLoading(false);
  }

  const statuses = ['all', 'draft', 'pending_approval', 'approved', 'in_production', 'completed'];
  const filtered = sheets.filter(s => {
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.sheet_number?.toLowerCase().includes(q) ||
        s.client_name?.toLowerCase().includes(q) ||
        (s.project as any)?.reference_code?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'workshop_manager', 'designer'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/production')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#1a1a2e]">{t('sheets.title')}</h1>
          <p className="text-sm text-[#64648B]">{sheets.length} {t('sheets.sheets')}</p>
        </div>
        <Button size="sm" onClick={() => router.push('/production/sheets/new')}>
          <Plus size={14} /> {t('sheets.new_sheet')}
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('common.search')}
          className="w-full pl-9 pr-3 py-2.5 border border-[#E8E5E0] rounded-xl text-sm"
        />
      </div>

      {/* Status Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filterStatus === s ? 'bg-[#1a1a2e] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'all' ? t('common.all') : t('sheets.status_' + s)}
          </button>
        ))}
      </div>

      {/* Sheet List */}
      {filtered.map(sheet => (
        <Card key={sheet.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`/production/sheets/${sheet.id}`)}>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <FileText size={18} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1a1a2e]">{sheet.sheet_number || 'Draft'}</p>
                  <p className="text-xs text-[#64648B]">{(sheet.project as any)?.reference_code} - {sheet.client_name || (sheet.project as any)?.client_name}</p>
                </div>
              </div>
              <div className="text-right">
                <StatusBadge status={sheet.status} />
                <p className="text-xs text-[#64648B] mt-1">{sheet.total_panels} {t('sheets.panels')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <FileText size={48} className="mx-auto text-[#E8E5E0] mb-3" />
          <p className="text-[#64648B]">{t('common.no_results')}</p>
        </div>
      )}
    </div>
    </RoleGuard>
  );
}
