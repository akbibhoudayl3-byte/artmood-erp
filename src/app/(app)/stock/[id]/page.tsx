'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import Input from '@/components/ui/Input';
import { ArrowLeft, Package, MapPin, AlertTriangle, TrendingUp, TrendingDown, ArrowRightLeft, AlertCircle, CheckCircle } from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { recordStockMovement } from '@/lib/services/index';

interface StockItemDetail {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  unit: string;
  current_quantity: number;
  minimum_quantity: number;
  location: string | null;
  cost_per_unit: number | null;
  notes: string | null;
  is_active: boolean;
  supplier?: { name: string } | null;
}

interface StockMovement {
  id: string;
  movement_type: string;
  quantity: number;
  notes: string | null;
  created_at: string;
  creator?: { full_name: string } | null;
  project?: { reference_code: string } | null;
}

const MOVEMENT_ICONS: Record<string, React.ReactNode> = {
  in: <TrendingUp size={14} className="text-green-500" />,
  out: <TrendingDown size={14} className="text-red-500" />,
  adjust: <ArrowRightLeft size={14} className="text-blue-500" />,
  consume: <TrendingDown size={14} className="text-orange-500" />,
  transfer: <ArrowRightLeft size={14} className="text-purple-500" />,
  reserve: <Package size={14} className="text-yellow-500" />,
};

export default function StockItemDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { profile, canManageStock } = useAuth();
  const { t } = useLocale();
  const supabase = createClient();

  const [item, setItem] = useState<StockItemDetail | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddMovement, setShowAddMovement] = useState(false);
  const [moveType, setMoveType] = useState('in');
  const [moveQty, setMoveQty] = useState('');
  const [moveNotes, setMoveNotes] = useState('');
  const [moveError, setMoveError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    const [itemRes, movRes] = await Promise.all([
      supabase.from('stock_items')
        .select('*, supplier:suppliers(name)')
        .eq('id', id).single(),
      supabase.from('stock_movements')
        .select('*, creator:profiles!stock_movements_created_by_fkey(full_name), project:projects(reference_code)')
        .eq('stock_item_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    setItem(itemRes.data as StockItemDetail);
    setMovements((movRes.data as StockMovement[]) || []);
    setLoading(false);
  }

  async function addMovement() {
    const qty = parseFloat(moveQty);
    if (!qty || qty <= 0) { setMoveError('Quantity must be greater than zero.'); return; }
    setMoveError('');

    // Map UI type to service direction
    const directionMap: Record<string, 'in' | 'out' | 'adjust'> = {
      in: 'in', out: 'out', consume: 'out', adjust: 'adjust',
    };
    const direction = directionMap[moveType] || 'in';

    const result = await recordStockMovement({
      stock_item_id: id as string,
      direction,
      quantity: qty,
      target_quantity: direction === 'adjust' ? qty : undefined,
      notes: moveNotes || null,
      created_by: profile?.id,
      movement_type: moveType === 'consume' ? 'consume' : undefined,
    });

    if (!result.success) {
      setMoveError(result.error || 'Movement failed.');
      return;
    }
    setShowAddMovement(false);
    setMoveQty('');
    setMoveNotes('');
    setMoveError('');
    setSuccessMsg('Stock movement recorded.');
    setTimeout(() => setSuccessMsg(''), 3000);
    loadData();
  }

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;
  if (!item) return <div className="text-center py-12 text-gray-500">Stock item not found</div>;

  const isLow = item.current_quantity <= item.minimum_quantity;

  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager'] as any[]}>
    <div className="space-y-4">
      {successMsg && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm">
          <CheckCircle size={16} /> {successMsg}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/stock')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <p className="text-xs text-gray-400 font-mono">{item.sku}</p>
          <h1 className="text-xl font-bold text-gray-900">{item.name}</h1>
        </div>
        <StatusBadge status={item.category} />
      </div>

      {/* Stock Level */}
      <Card className={isLow ? 'border-red-200 bg-red-50' : ''}>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t('stock.current_stock')}</p>
              <p className={`text-3xl font-bold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>
                {item.current_quantity} <span className="text-base font-normal text-gray-400">{item.unit}</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">{t('stock.minimum')}: {item.minimum_quantity} {item.unit}</p>
            </div>
            {isLow && (
              <div className="flex items-center gap-1 text-red-600">
                <AlertTriangle size={20} />
                <span className="text-sm font-medium">{t('stock.low_stock')}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Details */}
      <Card>
        <CardContent>
          <div className="space-y-2 text-sm">
            {item.location && (
              <div className="flex items-center gap-2 text-gray-600">
                <MapPin size={15} className="text-gray-400" /> {item.location}
              </div>
            )}
            {item.supplier && (
              <div className="flex items-center gap-2 text-gray-600">
                <Package size={15} className="text-gray-400" /> Supplier: {item.supplier.name}
              </div>
            )}
            {item.cost_per_unit && (
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-gray-400 w-4 text-center">$</span> {item.cost_per_unit.toLocaleString()} MAD / {item.unit}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add Movement */}
      {canManageStock && (
        <>
          {!showAddMovement ? (
            <div className="flex gap-2">
              <Button variant="success" className="flex-1" onClick={() => { setMoveType('in'); setShowAddMovement(true); }}>
                <TrendingUp size={16} /> {t('stock.stock_in')}
              </Button>
              <Button variant="danger" className="flex-1" onClick={() => { setMoveType('out'); setShowAddMovement(true); }}>
                <TrendingDown size={16} /> {t('stock.stock_out')}
              </Button>
            </div>
          ) : (
            <Card>
              <CardContent>
                <div className="space-y-3">
                  <select value={moveType} onChange={(e) => setMoveType(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="in">Stock In (received)</option>
                    <option value="out">Stock Out (used)</option>
                    <option value="consume">Consumed</option>
                    <option value="adjust">Adjustment</option>
                  </select>
                  <Input type="number" placeholder="Quantity" value={moveQty} onChange={(e) => setMoveQty(e.target.value)} />
                  <Input placeholder="Notes (optional)" value={moveNotes} onChange={(e) => setMoveNotes(e.target.value)} />
                  {moveError && (
                    <div className="flex items-center gap-1.5 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                      <AlertCircle size={14} className="shrink-0" /> {moveError}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={() => setShowAddMovement(false)}>{t('common.cancel')}</Button>
                    <Button variant="primary" className="flex-1" onClick={addMovement}>{t('common.save')}</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Movement History */}
      <Card>
        <CardHeader><h2 className="font-semibold text-sm">{t('stock.movement_history')}</h2></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {movements.map(m => (
              <div key={m.id} className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-gray-50">
                <div className="flex items-center gap-2">
                  {MOVEMENT_ICONS[m.movement_type]}
                  <div>
                    <span className="font-medium">{m.movement_type}</span>
                    {m.notes && <p className="text-xs text-gray-400">{m.notes}</p>}
                    {m.project && <p className="text-xs text-gray-400">{m.project.reference_code}</p>}
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-medium ${m.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {m.quantity > 0 ? '+' : ''}{m.quantity} {item.unit}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(m.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            {movements.length === 0 && <p className="text-sm text-gray-400 text-center py-4">{t('common.no_results')}</p>}
          </div>
        </CardContent>
      </Card>
    </div>
      </RoleGuard>
  );
}
