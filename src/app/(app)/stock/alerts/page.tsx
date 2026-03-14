'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { RoleGuard } from '@/components/auth/RoleGuard';
import type { StockAvailability } from '@/types/database';
import {
  ArrowLeft, AlertTriangle, AlertCircle, Package, Bell,
  ShoppingCart, Plus, CheckCircle, X
} from 'lucide-react';

type FilterTab = 'all' | 'out_of_stock' | 'low_stock';

interface ReorderForm {
  supplier_id: string;
  quantity: string;
  unit: string;
  notes: string;
}

export default function StockAlertsPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLocale();

  const [items, setItems] = useState<StockAvailability[]>([]);
  const [loading, setLoading] = useState(true);

  // New state
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [showReorderModal, setShowReorderModal] = useState<StockAvailability | null>(null);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [workshopManagers, setWorkshopManagers] = useState<string[]>([]);
  const [reorderForm, setReorderForm] = useState<ReorderForm>({
    supplier_id: '',
    quantity: '',
    unit: '',
    notes: '',
  });
  const [creatingPO, setCreatingPO] = useState(false);
  const [sendingNotification, setSendingNotification] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [quickAddLoading, setQuickAddLoading] = useState<string | null>(null);

  useEffect(() => {
    loadAlerts();

    supabase
      .from('suppliers')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setSuppliers(data || []));

    supabase
      .from('profiles')
      .select('id')
      .eq('role', 'workshop_manager')
      .eq('is_active', true)
      .then(({ data }) => setWorkshopManagers((data || []).map((p: any) => p.id)));
  }, []);

  async function loadAlerts() {
    const { data } = await supabase
      .from('stock_availability')
      .select('*')
      .order('stock_status, item_name');
    setItems((data as StockAvailability[]) || []);
    setLoading(false);
  }

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setErrorMsg('');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  function showError(msg: string) {
    setErrorMsg(msg);
    setSuccessMsg('');
    setTimeout(() => setErrorMsg(''), 5000);
  }

  function openReorderModal(item: StockAvailability) {
    setShowReorderModal(item);
    setReorderForm({
      supplier_id: (item as any).supplier_id || '',
      quantity: item.minimum_quantity ? String(item.minimum_quantity * 2) : '10',
      unit: item.unit || '',
      notes: '',
    });
  }

  async function handleCreatePO() {
    if (!showReorderModal) return;
    if (!reorderForm.supplier_id) { showError('Please select a supplier'); return; }
    if (!reorderForm.quantity || Number(reorderForm.quantity) <= 0) { showError('Enter a valid quantity'); return; }

    setCreatingPO(true);
    try {
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .insert({
          supplier_id: reorderForm.supplier_id,
          status: 'draft',
          total_amount: 0,
          created_by: profile?.id,
          notes: reorderForm.notes || null,
        })
        .select('id')
        .single();

      if (poError || !po) throw poError || new Error('Failed to create PO');

      const { error: lineError } = await supabase
        .from('purchase_order_lines')
        .insert({
          purchase_order_id: po.id,
          item_name: showReorderModal.item_name,
          quantity: Number(reorderForm.quantity),
          unit: reorderForm.unit || showReorderModal.unit,
          unit_price: 0,
          stock_item_id: showReorderModal.id,
        });

      if (lineError) throw lineError;

      setShowReorderModal(null);
      showSuccess('Draft PO created');
      setTimeout(() => router.push(`/purchase-orders/${po.id}`), 1200);
    } catch (err: any) {
      showError(err?.message || 'Failed to create PO');
    } finally {
      setCreatingPO(false);
    }
  }

  async function handleNotifyWorkshopManagers() {
    const outOfStock = items.filter(i => i.stock_status === 'out_of_stock');
    const lowStock = items.filter(i => i.stock_status === 'low_stock');

    if (workshopManagers.length === 0) {
      showError('No active workshop managers found');
      return;
    }

    setSendingNotification(true);
    try {
      const outNames = outOfStock.map(i => i.item_name).join(', ') || 'none';
      const lowNames = lowStock.map(i => i.item_name).join(', ') || 'none';

      const notifications = workshopManagers.map(userId => ({
        user_id: userId,
        title: `Stock Alert: ${outOfStock.length + lowStock.length} items need restocking`,
        message: `Out of stock: ${outNames}. Low stock: ${lowNames}.`,
        type: 'stock_alert',
        is_read: false,
        created_by: profile?.id,
      }));

      const { error } = await supabase.from('notifications').insert(notifications);
      if (error) throw error;

      showSuccess(`Notification sent to ${workshopManagers.length} workshop manager(s)`);
    } catch (err: any) {
      showError(err?.message || 'Failed to send notification');
    } finally {
      setSendingNotification(false);
    }
  }

  async function handleQuickAdd(item: StockAvailability, qty: number) {
    setQuickAddLoading(`${item.id}-${qty}`);
    try {
      const { error } = await supabase.from('stock_movements').insert({
        stock_item_id: item.id,
        movement_type: 'adjustment',
        quantity: qty,
        unit: item.unit,
        notes: `Quick adjustment +${qty} from stock alerts`,
        created_by: profile?.id,
      });
      if (error) throw error;
      showSuccess(`+${qty} ${item.unit} added to ${item.item_name}`);
      loadAlerts();
    } catch (err: any) {
      showError(err?.message || 'Failed to add stock');
    } finally {
      setQuickAddLoading(null);
    }
  }

  const outOfStock = items.filter(i => i.stock_status === 'out_of_stock');
  const lowStock = items.filter(i => i.stock_status === 'low_stock');

  const filteredOutOfStock = filterTab === 'low_stock' ? [] : outOfStock;
  const filteredLowStock = filterTab === 'out_of_stock' ? [] : lowStock;

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;

  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager'] as any[]}>
      <div className="space-y-4">

        {/* Toast Messages */}
        {successMsg && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
            <CheckCircle size={16} className="shrink-0" />
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            <AlertCircle size={16} className="shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/stock')} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-[#1a1a2e]">{t('stock.alerts')}</h1>
            <p className="text-sm text-[#64648B]">
              {outOfStock.length + lowStock.length} {t('stock.items_need_attention')}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNotifyWorkshopManagers}
            disabled={sendingNotification || (outOfStock.length + lowStock.length) === 0}
            className="flex items-center gap-1.5 text-xs"
          >
            <Bell size={14} />
            {sendingNotification ? 'Sending...' : 'Notify Workshop'}
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3 text-center border-red-200 bg-red-50">
            <AlertCircle size={20} className="mx-auto text-red-500 mb-1" />
            <p className="text-2xl font-bold text-red-600">{outOfStock.length}</p>
            <p className="text-xs text-red-500">{t('stock.out_of_stock')}</p>
          </Card>
          <Card className="p-3 text-center border-yellow-200 bg-yellow-50">
            <AlertTriangle size={20} className="mx-auto text-yellow-500 mb-1" />
            <p className="text-2xl font-bold text-yellow-600">{lowStock.length}</p>
            <p className="text-xs text-yellow-500">{t('stock.low_stock')}</p>
          </Card>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {(['all', 'out_of_stock', 'low_stock'] as FilterTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
              className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors ${
                filterTab === tab
                  ? 'bg-white text-[#1a1a2e] shadow-sm'
                  : 'text-[#64648B] hover:text-[#1a1a2e]'
              }`}
            >
              {tab === 'all' ? 'All' : tab === 'out_of_stock' ? 'Out of Stock' : 'Low Stock'}
            </button>
          ))}
        </div>

        {/* Out of Stock */}
        {filteredOutOfStock.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-red-600 mb-2 flex items-center gap-1">
              <AlertCircle size={14} /> {t('stock.out_of_stock')}
            </h2>
            {filteredOutOfStock.map(item => (
              <Card key={item.id} className="mb-2 border-red-100">
                <CardContent>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1a1a2e] truncate">{item.item_name}</p>
                      <p className="text-xs text-[#64648B]">
                        {item.sku} &middot; {item.available_quantity} {item.unit} {t('stock.available')}
                      </p>
                      {(item as any).total_area_m2 != null && (
                        <p className="text-xs text-[#64648B]">
                          Area: {Number((item as any).total_area_m2).toFixed(2)} m²
                        </p>
                      )}
                      {(item as any).stock_value != null && (
                        <p className="text-xs text-[#64648B]">
                          Value: {Number((item as any).stock_value).toLocaleString()} MAD
                        </p>
                      )}
                      {(item as any).supplier_name && (
                        <p className="text-xs text-[#64648B]">
                          Supplier: {(item as any).supplier_name}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-medium">
                        {t('stock.out_of_stock')}
                      </span>
                      <p className="text-xs text-[#64648B] mt-1">{item.reserved_quantity} {t('stock.reserved')}</p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-gray-100">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => openReorderModal(item)}
                      className="flex items-center gap-1 text-xs"
                    >
                      <ShoppingCart size={12} />
                      Reorder
                    </Button>
                    <button
                      onClick={() => handleQuickAdd(item, 10)}
                      disabled={quickAddLoading === `${item.id}-10`}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-[#1a1a2e] rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Plus size={11} />
                      {quickAddLoading === `${item.id}-10` ? '...' : '+10'}
                    </button>
                    <button
                      onClick={() => handleQuickAdd(item, 50)}
                      disabled={quickAddLoading === `${item.id}-50`}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-[#1a1a2e] rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Plus size={11} />
                      {quickAddLoading === `${item.id}-50` ? '...' : '+50'}
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Low Stock */}
        {filteredLowStock.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-yellow-600 mb-2 flex items-center gap-1">
              <AlertTriangle size={14} /> {t('stock.low_stock')}
            </h2>
            {filteredLowStock.map(item => (
              <Card key={item.id} className="mb-2 border-yellow-100">
                <CardContent>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1a1a2e] truncate">{item.item_name}</p>
                      <p className="text-xs text-[#64648B]">
                        {item.sku} &middot; {item.available_quantity}/{item.low_stock_threshold} {item.unit}
                      </p>
                      {(item as any).total_area_m2 != null && (
                        <p className="text-xs text-[#64648B]">
                          Area: {Number((item as any).total_area_m2).toFixed(2)} m²
                        </p>
                      )}
                      {(item as any).stock_value != null && (
                        <p className="text-xs text-[#64648B]">
                          Value: {Number((item as any).stock_value).toLocaleString()} MAD
                        </p>
                      )}
                      {(item as any).supplier_name && (
                        <p className="text-xs text-[#64648B]">
                          Supplier: {(item as any).supplier_name}
                        </p>
                      )}
                    </div>
                    <span className="px-2 py-0.5 bg-yellow-100 text-yellow-600 rounded-full text-xs font-medium shrink-0">
                      {t('stock.low_stock')}
                    </span>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-gray-100">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openReorderModal(item)}
                      className="flex items-center gap-1 text-xs"
                    >
                      <ShoppingCart size={12} />
                      Reorder
                    </Button>
                    <button
                      onClick={() => handleQuickAdd(item, 10)}
                      disabled={quickAddLoading === `${item.id}-10`}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-[#1a1a2e] rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Plus size={11} />
                      {quickAddLoading === `${item.id}-10` ? '...' : '+10'}
                    </button>
                    <button
                      onClick={() => handleQuickAdd(item, 50)}
                      disabled={quickAddLoading === `${item.id}-50`}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-[#1a1a2e] rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Plus size={11} />
                      {quickAddLoading === `${item.id}-50` ? '...' : '+50'}
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty State */}
        {filteredOutOfStock.length === 0 && filteredLowStock.length === 0 && (
          <div className="text-center py-12">
            <Bell size={48} className="mx-auto text-green-300 mb-3" />
            <p className="text-[#64648B]">{t('stock.all_good')}</p>
          </div>
        )}

        {/* Quick Reorder Modal */}
        {showReorderModal && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h3 className="font-semibold text-[#1a1a2e]">Quick Purchase Order</h3>
                  <p className="text-xs text-[#64648B] mt-0.5 truncate max-w-xs">{showReorderModal.item_name}</p>
                </div>
                <button
                  onClick={() => setShowReorderModal(null)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-4 space-y-3">
                {/* Supplier */}
                <div>
                  <label className="block text-xs font-medium text-[#64648B] mb-1">Supplier *</label>
                  <select
                    value={reorderForm.supplier_id}
                    onChange={e => setReorderForm(f => ({ ...f, supplier_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8630a]/20 focus:border-[#e8630a]"
                  >
                    <option value="">Select supplier...</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Quantity + Unit */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-[#64648B] mb-1">Quantity *</label>
                    <input
                      type="number"
                      min="1"
                      value={reorderForm.quantity}
                      onChange={e => setReorderForm(f => ({ ...f, quantity: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8630a]/20 focus:border-[#e8630a]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#64648B] mb-1">Unit</label>
                    <input
                      type="text"
                      value={reorderForm.unit}
                      onChange={e => setReorderForm(f => ({ ...f, unit: e.target.value }))}
                      placeholder={showReorderModal.unit || 'pcs'}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8630a]/20 focus:border-[#e8630a]"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-[#64648B] mb-1">Notes</label>
                  <textarea
                    value={reorderForm.notes}
                    onChange={e => setReorderForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    placeholder="Urgency, specs, etc."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8630a]/20 focus:border-[#e8630a] resize-none"
                  />
                </div>

                <p className="text-xs text-[#64648B] bg-gray-50 rounded-lg p-2">
                  A draft PO will be created with unit price = 0. You can edit pricing after creation.
                </p>
              </div>

              <div className="flex gap-2 p-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setShowReorderModal(null)}
                  disabled={creatingPO}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1 flex items-center justify-center gap-1"
                  onClick={handleCreatePO}
                  disabled={creatingPO}
                >
                  <ShoppingCart size={14} />
                  {creatingPO ? 'Creating...' : 'Create PO'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
