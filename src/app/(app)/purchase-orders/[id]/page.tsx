'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { ArrowLeft, Truck, Calendar, FileText, Phone, Package, CheckCircle, X, AlertTriangle } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';

interface PODetail {
  id: string; status: string; total_amount: number; notes: string | null;
  created_at: string; updated_at: string; received_at?: string | null;
  supplier?: { id: string; name: string; phone: string | null; email: string | null } | null;
  creator?: { full_name: string } | null;
}
interface POLine {
  id: string; item_name: string; quantity: number; unit: string;
  unit_price: number; total_price: number; sort_order: number;
}
interface StockItemOption {
  id: string; name: string; sku: string | null; unit: string; category: string;
}

export default function PurchaseOrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = createClient();
  const { t } = useLocale();
  const canManage = ['ceo', 'workshop_manager'].includes(profile?.role || '');

  const [po, setPo] = useState<PODetail | null>(null);
  const [lines, setLines] = useState<POLine[]>([]);
  const [loading, setLoading] = useState(true);

  // Receive modal state
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [stockItems, setStockItems] = useState<StockItemOption[]>([]);
  const [lineMapping, setLineMapping] = useState<Record<string, string>>({});
  const [receiving, setReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loadingStock, setLoadingStock] = useState(false);

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    const [poRes, linesRes] = await Promise.all([
      supabase.from('purchase_orders')
        .select('*, supplier:suppliers(id, name, phone, email), creator:profiles!purchase_orders_created_by_fkey(full_name)')
        .eq('id', id).single(),
      supabase.from('purchase_order_lines').select('*').eq('purchase_order_id', id).order('sort_order'),
    ]);
    setPo(poRes.data as PODetail);
    setLines((linesRes.data as POLine[]) || []);
    setLoading(false);
  }

  async function updateStatus(status: string) {
    await supabase.from('purchase_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    loadData();
  }

  async function openReceiveModal() {
    setLoadingStock(true);
    setReceiveError('');
    setShowReceiveModal(true);

    const { data: items } = await supabase
      .from('stock_items')
      .select('id, name, sku, unit, category')
      .eq('is_active', true)
      .order('name');

    const fetchedItems: StockItemOption[] = (items as StockItemOption[]) || [];
    setStockItems(fetchedItems);

    // Pre-select by name similarity
    const initialMapping: Record<string, string> = {};
    for (const line of lines) {
      const normalizedLine = line.item_name.toLowerCase().trim();
      const match = fetchedItems.find(si => {
        const normalizedItem = si.name.toLowerCase().trim();
        return normalizedItem === normalizedLine ||
          normalizedItem.includes(normalizedLine) ||
          normalizedLine.includes(normalizedItem);
      });
      initialMapping[line.id] = match ? match.id : 'new';
    }
    setLineMapping(initialMapping);
    setLoadingStock(false);
  }

  function closeReceiveModal() {
    setShowReceiveModal(false);
    setReceiveError('');
    setLineMapping({});
  }

  async function handleReceiveItems() {
    setReceiving(true);
    setReceiveError('');
    let movementsCreated = 0;
    const errors: string[] = [];

    for (const line of lines) {
      const mapped = lineMapping[line.id];
      if (!mapped || mapped === 'skip') continue;

      let stockItemId = mapped;

      // If 'new', create the stock item first
      if (mapped === 'new') {
        const { data: newItem, error: insertErr } = await supabase
          .from('stock_items')
          .insert({
            name: line.item_name,
            sku: null,
            category: 'raw_materials',
            unit: line.unit || 'unit',
            current_quantity: 0,
            minimum_quantity: 0,
            cost_per_unit: line.unit_price,
            is_active: true,
            stock_tracking: true,
            created_by: profile?.id,
          })
          .select('id')
          .single();

        if (insertErr || !newItem) {
          errors.push(`Failed to create stock item for: ${line.item_name}`);
          continue;
        }
        stockItemId = newItem.id;
      }

      // Create stock movement
      const { error: movErr } = await supabase.from('stock_movements').insert({
        stock_item_id: stockItemId,
        movement_type: 'purchase_in',
        quantity: line.quantity,
        reference_type: 'purchase_order',
        reference_id: id,
        notes: `PO Receipt: ${line.item_name} | Supplier: ${po?.supplier?.name || 'Unknown'}`,
        created_by: profile?.id,
        unit: line.unit || 'unit',
      });

      if (movErr) {
        errors.push(`Failed to record movement for: ${line.item_name}`);
      } else {
        movementsCreated++;
      }
    }

    if (errors.length > 0 && movementsCreated === 0) {
      setReceiveError(errors.join('; '));
      setReceiving(false);
      return;
    }

    // Update PO status to received
    const { error: poErr } = await supabase
      .from('purchase_orders')
      .update({
        status: 'received',
        received_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (poErr) {
      setReceiveError('Stock movements created but failed to update PO status. Refresh and check.');
      setReceiving(false);
      return;
    }

    setReceiving(false);
    setShowReceiveModal(false);
    setLineMapping({});

    const msg = errors.length > 0
      ? `Receipt confirmed: ${movementsCreated} stock movement(s) created. ${errors.length} item(s) skipped due to errors.`
      : `Receipt confirmed: ${movementsCreated} stock movement(s) created`;
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 5000);
    loadData();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!po) {
    return (
      <div className="p-6 text-center text-gray-500">Purchase order not found.</div>
    );
  }

  const statusFlow = ['draft', 'sent', 'confirmed', 'received'];
  const currentIdx = statusFlow.indexOf(po.status);

  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager', 'commercial_manager']}>
      <div className="max-w-4xl mx-auto p-4 space-y-4">

        {/* Success toast */}
        {successMsg && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 text-sm font-medium">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {successMsg}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push('/purchase-orders')}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Purchase Orders
          </button>
          <StatusBadge status={po.status} />
        </div>

        {/* Supplier Info Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-semibold">
                {po.supplier?.name || 'Unknown Supplier'}
              </h2>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">PO ID</span>
                <p className="font-mono text-xs mt-1">{po.id}</p>
              </div>
              <div>
                <span className="text-gray-500">Total Amount</span>
                <p className="font-semibold mt-1">
                  {po.total_amount?.toLocaleString('fr-MA', { style: 'currency', currency: 'MAD' })}
                </p>
              </div>
              {po.supplier?.phone && (
                <div className="flex items-center gap-1 text-gray-600">
                  <Phone className="w-3 h-3" />
                  <span>{po.supplier.phone}</span>
                </div>
              )}
              {po.supplier?.email && (
                <div className="text-gray-600 text-xs">{po.supplier.email}</div>
              )}
              <div>
                <span className="text-gray-500 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Created
                </span>
                <p className="mt-1">{new Date(po.created_at).toLocaleDateString('fr-MA')}</p>
              </div>
              {po.received_at && (
                <div>
                  <span className="text-gray-500 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-green-500" /> Received
                  </span>
                  <p className="mt-1">{new Date(po.received_at).toLocaleDateString('fr-MA')}</p>
                </div>
              )}
              {po.creator?.full_name && (
                <div>
                  <span className="text-gray-500">Created by</span>
                  <p className="mt-1">{po.creator.full_name}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Line Items Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-500" />
              <h3 className="font-semibold">Line Items</h3>
            </div>
          </CardHeader>
          <CardContent>
            {lines.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">No line items</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-gray-500 text-left">
                      <th className="pb-2 pr-4">#</th>
                      <th className="pb-2 pr-4">Item</th>
                      <th className="pb-2 pr-4 text-right">Qty</th>
                      <th className="pb-2 pr-4">Unit</th>
                      <th className="pb-2 pr-4 text-right">Unit Price</th>
                      <th className="pb-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={line.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 text-gray-400">{idx + 1}</td>
                        <td className="py-2 pr-4 font-medium">{line.item_name}</td>
                        <td className="py-2 pr-4 text-right">{line.quantity}</td>
                        <td className="py-2 pr-4 text-gray-500">{line.unit}</td>
                        <td className="py-2 pr-4 text-right">
                          {line.unit_price?.toLocaleString('fr-MA', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 text-right font-semibold">
                          {line.total_price?.toLocaleString('fr-MA', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold">
                      <td colSpan={5} className="pt-3 text-right text-gray-600">Total:</td>
                      <td className="pt-3 text-right text-blue-700">
                        {po.total_amount?.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        {po.notes && (
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-sm text-gray-600">Notes</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap text-gray-700">{po.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Status Actions */}
        {canManage && po.status !== 'received' && (
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-sm text-gray-600">Update Status</h3>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {po.status === 'draft' && (
                  <Button variant="secondary" onClick={() => updateStatus('sent')}>
                    Mark as Sent
                  </Button>
                )}
                {po.status === 'sent' && (
                  <Button variant="secondary" onClick={() => updateStatus('confirmed')}>
                    Mark as Confirmed
                  </Button>
                )}
                {po.status === 'confirmed' && (
                  <Button
                    variant="primary"
                    onClick={openReceiveModal}
                    className="flex items-center gap-2"
                  >
                    <Package className="w-4 h-4" />
                    Receive Items
                  </Button>
                )}
                {po.status === 'draft' && (
                  <Button variant="danger" onClick={() => updateStatus('cancelled')}>
                    Cancel
                  </Button>
                )}
              </div>
              {/* Allow receive from any non-received status as fallback */}
              {po.status !== 'confirmed' && po.status !== 'received' && po.status !== 'cancelled' && (
                <div className="mt-3">
                  <button
                    onClick={openReceiveModal}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <Package className="w-3 h-3" /> Skip to Receive Items
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {po.status === 'received' && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-green-700 text-sm">
            <CheckCircle className="w-4 h-4" />
            This purchase order has been received and stock movements have been recorded.
          </div>
        )}

        {po.status === 'cancelled' && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
            <X className="w-4 h-4" />
            This purchase order has been cancelled.
          </div>
        )}
      </div>

      {/* ===== RECEIVE ITEMS MODAL ===== */}
      {showReceiveModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-6 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">

            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-600" />
                  Receive Purchase Order
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {po.supplier?.name} &mdash;{' '}
                  <span className="font-medium text-gray-700">
                    {po.total_amount?.toLocaleString('fr-MA', { style: 'currency', currency: 'MAD' })}
                  </span>
                </p>
              </div>
              <button
                onClick={closeReceiveModal}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">

              {loadingStock ? (
                <div className="flex items-center justify-center py-10">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                  <span className="ml-3 text-sm text-gray-500">Loading stock items...</span>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                    Map each PO line to an existing stock item, create a new one, or skip it.
                    Only non-skipped lines will create inventory movements.
                  </p>

                  {receiveError && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700 text-sm">
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      {receiveError}
                    </div>
                  )}

                  <div className="space-y-3">
                    {lines.map((line, idx) => {
                      const currentMapping = lineMapping[line.id] || 'skip';
                      const isSkipped = currentMapping === 'skip';
                      const isNew = currentMapping === 'new';

                      return (
                        <div
                          key={line.id}
                          className={`rounded-lg border p-3 transition-colors ${
                            isSkipped
                              ? 'border-gray-200 bg-gray-50 opacity-60'
                              : 'border-blue-200 bg-white'
                          }`}
                        >
                          {/* Line description */}
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <span className="text-xs text-gray-400 mr-1">#{idx + 1}</span>
                              <span className="font-medium text-sm text-gray-800">{line.item_name}</span>
                            </div>
                            <div className="text-right text-xs text-gray-500 ml-4 flex-shrink-0">
                              <span className="font-semibold text-gray-700">{line.quantity} {line.unit}</span>
                              <span className="mx-1">&times;</span>
                              <span>{line.unit_price?.toLocaleString('fr-MA', { minimumFractionDigits: 2 })}</span>
                              <span className="ml-1 font-semibold text-blue-700">
                                = {line.total_price?.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD
                              </span>
                            </div>
                          </div>

                          {/* Mapping SELECT */}
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500 flex-shrink-0 w-16">Map to:</label>
                            <select
                              value={currentMapping}
                              onChange={e => setLineMapping(prev => ({
                                ...prev,
                                [line.id]: e.target.value,
                              }))}
                              className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="skip">— Skip this item —</option>
                              <option value="new">+ Create New Stock Item</option>
                              {stockItems.length > 0 && (
                                <optgroup label="Existing Stock Items">
                                  {stockItems.map(si => (
                                    <option key={si.id} value={si.id}>
                                      {si.name}{si.sku ? ` (${si.sku})` : ''} [{si.unit}]
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          </div>

                          {/* Hint for 'new' */}
                          {isNew && (
                            <p className="text-xs text-blue-600 mt-1.5 pl-[4.5rem]">
                              A new stock item "{line.item_name}" (category: raw_materials, unit: {line.unit || 'unit'}) will be created automatically.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary */}
                  <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                    {Object.values(lineMapping).filter(v => v && v !== 'skip').length} of {lines.length} line(s) will be added to inventory.
                    {Object.values(lineMapping).filter(v => v === 'skip').length > 0 && (
                      <span className="ml-1 text-orange-600">
                        ({Object.values(lineMapping).filter(v => v === 'skip').length} skipped)
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
              <Button
                variant="secondary"
                onClick={closeReceiveModal}
                disabled={receiving}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleReceiveItems}
                disabled={receiving || loadingStock || Object.values(lineMapping).every(v => !v || v === 'skip')}
                className="flex items-center gap-2 min-w-[160px] justify-center"
              >
                {receiving ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Confirm Receipt
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </RoleGuard>
  );
}
