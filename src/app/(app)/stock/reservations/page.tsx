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
import type { StockReservation } from '@/types/database';
import { ArrowLeft, Lock, Unlock, Package } from 'lucide-react';

export default function StockReservationsPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLocale();

  const [reservations, setReservations] = useState<StockReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('reserved');

  useEffect(() => { loadReservations(); }, []);

  async function loadReservations() {
    const { data } = await supabase
      .from('stock_reservations')
      .select('*, stock_item:stock_items(item_name, sku, unit), sheet:production_sheets(sheet_number), reserver:profiles!stock_reservations_reserved_by_fkey(full_name)')
      .order('reserved_at', { ascending: false });
    setReservations((data as StockReservation[]) || []);
    setLoading(false);
  }

  async function releaseReservation(id: string, stockItemId: string, qty: number) {
    await supabase.from('stock_reservations').update({ status: 'released', released_at: new Date().toISOString() }).eq('id', id);
    // Decrease reserved_quantity directly
    const { data: item } = await supabase.from('stock_items').select('reserved_quantity').eq('id', stockItemId).single();
    if (item) {
      await supabase.from('stock_items').update({ reserved_quantity: Math.max(0, (item.reserved_quantity || 0) - qty) }).eq('id', stockItemId);
    }
    loadReservations();
  }

  const filtered = reservations.filter(r => filterStatus === 'all' || r.status === filterStatus);
  const statuses = ['all', 'reserved', 'consumed', 'released'];

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;

  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/stock')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#1a1a2e]">{t('stock.reservations')}</h1>
          <p className="text-sm text-[#64648B]">{reservations.filter(r => r.status === 'reserved').length} {t('stock.active_reservations')}</p>
        </div>
      </div>

      {/* Status Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {statuses.map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filterStatus === s ? 'bg-[#1a1a2e] text-white' : 'bg-gray-100 text-gray-600'
            }`}>
            {s === 'all' ? t('common.all') : t('stock.status_' + s)}
          </button>
        ))}
      </div>

      {/* Reservation List */}
      {filtered.map(res => (
        <Card key={res.id}>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  res.status === 'reserved' ? 'bg-yellow-50' : res.status === 'consumed' ? 'bg-green-50' : 'bg-gray-50'
                }`}>
                  {res.status === 'reserved' ? <Lock size={18} className="text-yellow-600" /> :
                   res.status === 'consumed' ? <Package size={18} className="text-green-600" /> :
                   <Unlock size={18} className="text-gray-400" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1a1a2e]">{(res.stock_item as any)?.item_name}</p>
                  <p className="text-xs text-[#64648B]">{(res.sheet as any)?.sheet_number} - {res.quantity} {(res.stock_item as any)?.unit}</p>
                </div>
              </div>
              <div className="text-right">
                <StatusBadge status={res.status} />
                {res.status === 'reserved' && (profile?.role === 'ceo' || profile?.role === 'workshop_manager') && (
                  <button
                    onClick={() => releaseReservation(res.id, res.stock_item_id, res.quantity)}
                    className="mt-1 text-xs text-red-500 hover:text-red-700"
                  >
                    {t('stock.release')}
                  </button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Package size={48} className="mx-auto text-[#E8E5E0] mb-3" />
          <p className="text-[#64648B]">{t('common.no_results')}</p>
        </div>
      )}
    </div>
    </RoleGuard>
  );
}
