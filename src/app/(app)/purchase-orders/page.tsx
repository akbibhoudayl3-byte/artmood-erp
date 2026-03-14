'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { useLocale } from '@/lib/hooks/useLocale';
import { ShoppingCart, Plus } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';

interface PurchaseOrder {
  id: string;
  status: string;
  total_amount: number;
  notes: string | null;
  created_at: string;
  supplier?: { name: string } | null;
}

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLocale();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => { loadOrders(); }, [filter]);

  async function loadOrders() {
    let query = supabase.from('purchase_orders')
      .select('*, supplier:suppliers(name)')
      .order('created_at', { ascending: false });

    if (filter !== 'all') query = query.eq('status', filter);

    const { data } = await query;
    setOrders((data as PurchaseOrder[]) || []);
    setLoading(false);
  }

  if (loading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 skeleton" />)}</div>;

  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">{t('po.title')}</h1>
          <p className="text-sm text-[#64648B]">{orders.length} orders</p>
        </div>
        <Button onClick={() => router.push('/purchase-orders/new')}>
          <Plus size={18} /> {t('po.new_order')}
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {['all', 'draft', 'sent', 'confirmed', 'received', 'cancelled'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              filter === f ? 'bg-[#1E2F52] text-white' : 'bg-[#F5F3F0] text-[#64648B] hover:bg-[#EBE8E3]'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* PO List */}
      <div className="space-y-2.5">
        {orders.map(po => (
          <Card key={po.id} className="p-4 cursor-pointer" onClick={() => router.push(`/purchase-orders/${po.id}`)}>
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#1a1a2e]">{po.supplier?.name || 'No supplier'}</p>
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge status={po.status} />
                  <span className="text-xs text-[#64648B]">
                    {new Date(po.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                {po.notes && <p className="text-xs text-[#64648B] mt-1 truncate">{po.notes}</p>}
              </div>
              <p className="text-sm font-bold text-[#1a1a2e] ml-3">{po.total_amount.toLocaleString()} MAD</p>
            </div>
          </Card>
        ))}
      </div>

      {orders.length === 0 && (
        <div className="text-center py-12">
          <ShoppingCart size={48} className="mx-auto text-[#E8E5E0] mb-3" />
          <p className="text-[#64648B]">{t('common.no_results')}</p>
        </div>
      )}
    </div>
      </RoleGuard>
  );
}
