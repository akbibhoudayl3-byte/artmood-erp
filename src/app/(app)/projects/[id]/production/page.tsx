'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import StatusBadge from '@/components/ui/StatusBadge';
import { RoleGuard } from '@/components/auth/RoleGuard';
import {
  ArrowLeft, Plus, Package, CheckCircle, AlertTriangle,
  Scissors, Layers, Hammer, CheckSquare, DollarSign, Trash2,
  ChevronDown, RefreshCw, X, LayoutGrid, Zap
} from 'lucide-react';

// ── BOM suggestion from cabinet structure ──────────────────────────────────
interface BomSuggestion {
  material: string;
  sheets_needed: number;
  area_m2: number;
  unit: string;
  stockItemId: string | null;
  stockItemName: string;
  available: number;
}

// ── Types ──────────────────────────────────────────────────────────────────

interface ProductionOrderItem {
  id: string;
  name: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  notes: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  req_count?: number;
  usage_count?: number;
  material_cost?: number;
}

interface MaterialRequirement {
  id: string;
  production_order_id: string;
  material_id: string | null;
  planned_qty: number;
  unit: string;
  status: 'planned' | 'reserved' | 'consumed' | 'cancelled';
  notes: string | null;
  created_at: string;
  material?: {
    name: string;
    unit: string;
    current_quantity: number;
    reserved_quantity: number;
    cost_per_unit: number | null;
    category: string;
  };
  usage?: MaterialUsageItem[];
}

interface MaterialUsageItem {
  id: string;
  used_qty: number;
  waste_qty: number;
  unit: string;
  stage: string | null;
  notes: string | null;
  created_at: string;
  worker?: { full_name: string };
}

interface StockOption {
  id: string;
  name: string;
  unit: string;
  current_quantity: number;
  reserved_quantity: number;
  cost_per_unit: number | null;
  category: string;
}

type TabKey = 'orders' | 'materials' | 'waste' | 'cost';

const STAGE_ICONS: Record<string, React.ReactNode> = {
  cutting:      <Scissors size={12} />,
  edge_banding: <Layers size={12} />,
  assembly:     <Hammer size={12} />,
  ready:        <CheckSquare size={12} />,
};

const STAGE_COLORS: Record<string, string> = {
  cutting:      'bg-blue-100 text-blue-700',
  edge_banding: 'bg-orange-100 text-orange-700',
  assembly:     'bg-green-100 text-green-700',
  ready:        'bg-teal-100 text-teal-700',
};

// ── Component ───────────────────────────────────────────────────────────────

export default function ProjectProductionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = createClient();

  const [tab, setTab] = useState<TabKey>('orders');
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<ProductionOrderItem[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<ProductionOrderItem | null>(null);
  const [requirements, setRequirements] = useState<MaterialRequirement[]>([]);
  const [stockOptions, setStockOptions] = useState<StockOption[]>([]);
  const [projectName, setProjectName] = useState('');

  // Modals
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [newOrderName, setNewOrderName] = useState('');
  const [newOrderNotes, setNewOrderNotes] = useState('');
  const [savingOrder, setSavingOrder] = useState(false);

  const [showAddReq, setShowAddReq] = useState(false);
  const [reqMaterialId, setReqMaterialId] = useState('');
  const [reqQty, setReqQty] = useState('');
  const [reqUnit, setReqUnit] = useState('');
  const [reqNotes, setReqNotes] = useState('');
  const [savingReq, setSavingReq] = useState(false);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmUsed, setConfirmUsed] = useState('');
  const [confirmWaste, setConfirmWaste] = useState('0');
  const [confirmStage, setConfirmStage] = useState('assembly');
  const [confirmNotes, setConfirmNotes] = useState('');
  const [confirming, setConfirming] = useState(false);

  // From Structure (BOM import)
  const [showBomImport, setShowBomImport] = useState(false);
  const [bomSuggestions, setBomSuggestions] = useState<BomSuggestion[]>([]);
  const [loadingBom, setLoadingBom] = useState(false);
  const [importingBom, setImportingBom] = useState(false);

  const canWrite = ['ceo', 'workshop_manager', 'workshop_worker'].includes(profile?.role || '');

  // ── Load data ─────────────────────────────────────────────────────────────

  const loadOrders = useCallback(async () => {
    const [projRes, ordersRes] = await Promise.all([
      supabase.from('projects').select('client_name, reference_code').eq('id', id).single(),
      supabase.from('production_orders').select('*').eq('project_id', id).order('created_at', { ascending: false }),
    ]);

    if (projRes.data) {
      setProjectName(`${projRes.data.reference_code} — ${projRes.data.client_name}`);
    }

    const rawOrders = (ordersRes.data || []) as ProductionOrderItem[];
    setOrders(rawOrders);
    setLoading(false);
  }, [id]);

  const loadRequirements = useCallback(async (orderId: string) => {
    const reqRes = await supabase
      .from('production_material_requirements')
      .select(`
        *,
        material:stock_items(name, unit, current_quantity, reserved_quantity, cost_per_unit, category),
        usage:production_material_usage(id, used_qty, waste_qty, unit, stage, notes, created_at, worker:profiles!production_material_usage_worker_id_fkey(full_name))
      `)
      .eq('production_order_id', orderId)
      .order('created_at');
    setRequirements((reqRes.data as MaterialRequirement[]) || []);
  }, []);

  const loadStock = useCallback(async () => {
    const res = await supabase
      .from('stock_items')
      .select('id, name, unit, current_quantity, reserved_quantity, cost_per_unit, category')
      .eq('is_active', true)
      .eq('stock_tracking', true)
      .order('name');
    setStockOptions((res.data as StockOption[]) || []);
  }, []);

  useEffect(() => { loadOrders(); loadStock(); }, [loadOrders, loadStock]);

  useEffect(() => {
    if (selectedOrder) {
      loadRequirements(selectedOrder.id);
    }
  }, [selectedOrder, loadRequirements]);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function createOrder() {
    if (!newOrderName.trim()) return;
    setSavingOrder(true);
    const { data, error } = await supabase.from('production_orders').insert({
      project_id: id,
      name: newOrderName.trim(),
      notes: newOrderNotes || null,
      status: 'pending',
      created_at: new Date().toISOString(),
    }).select().single();

    if (!error && data) {
      setOrders(prev => [data as ProductionOrderItem, ...prev]);
      setSelectedOrder(data as ProductionOrderItem);
      setTab('materials');
      setShowNewOrder(false);
      setNewOrderName('');
      setNewOrderNotes('');
    } else {
      alert('Error: ' + (error?.message || 'Unknown'));
    }
    setSavingOrder(false);
  }

  async function addRequirement() {
    if (!reqMaterialId || !reqQty || !selectedOrder) return;
    const mat = stockOptions.find(s => s.id === reqMaterialId);
    if (!mat) return;

    const qty = parseFloat(reqQty);
    const available = mat.current_quantity - mat.reserved_quantity;

    if (qty > available) {
      if (!confirm(`⚠️ Stock insuffisant!\n\nDisponible: ${available} ${mat.unit}\nDemandé: ${qty} ${mat.unit}\n\nContinuer quand même?`)) {
        setSavingReq(false);
        return;
      }
    }

    setSavingReq(true);

    // Reserve stock
    const { error: reserveErr } = await supabase
      .from('stock_items')
      .update({ reserved_quantity: mat.reserved_quantity + qty })
      .eq('id', reqMaterialId);

    if (reserveErr) {
      alert('Erreur réservation stock: ' + reserveErr.message);
      setSavingReq(false);
      return;
    }

    // Create requirement
    const { error: reqErr } = await supabase
      .from('production_material_requirements')
      .insert({
        production_order_id: selectedOrder.id,
        material_id: reqMaterialId,
        planned_qty: qty,
        unit: reqUnit || mat.unit,
        status: 'reserved',
        notes: reqNotes || null,
      });

    if (!reqErr) {
      await loadRequirements(selectedOrder.id);
      await loadStock();
      setShowAddReq(false);
      setReqMaterialId('');
      setReqQty('');
      setReqUnit('');
      setReqNotes('');
    } else {
      alert('Erreur: ' + reqErr.message);
    }
    setSavingReq(false);
  }

  // ── Load BOM suggestions from cabinet structure ─────────────────────────

  async function loadBomFromStructure() {
    setLoadingBom(true);
    setShowBomImport(true);

    // Load cabinet_specs + panel_list for this project
    const specRes = await supabase
      .from('cabinet_specs')
      .select('material, edge_band_type, panels:panel_list(length, width, quantity, material)')
      .eq('project_id', id);

    if (!specRes.data || specRes.data.length === 0) {
      setBomSuggestions([]);
      setLoadingBom(false);
      return;
    }

    // Aggregate panels by material → compute area_m2 → sheets_needed
    const matMap: Record<string, { area_m2: number }> = {};
    const edgeMap: Record<string, { meters: number }> = {};
    const SHEET_YIELD = 2.88;

    for (const spec of specRes.data as any[]) {
      const panels = (spec.panels || []) as Array<{length:number;width:number;quantity:number;material:string;edge_top?:boolean;edge_bottom?:boolean;edge_left?:boolean;edge_right?:boolean}>;
      for (const p of panels) {
        const mat = p.material || spec.material || 'Inconnu';
        if (!matMap[mat]) matMap[mat] = { area_m2: 0 };
        matMap[mat].area_m2 += (p.length * p.width * p.quantity) / 1e6;
      }
      // Edge banding per cabinet
      if (spec.edge_band_type) {
        let m = 0;
        for (const p of panels) {
          const l = p.length / 1000;
          const w = p.width / 1000;
          if ((p as any).edge_top)    m += l * p.quantity;
          if ((p as any).edge_bottom) m += l * p.quantity;
          if ((p as any).edge_left)   m += w * p.quantity;
          if ((p as any).edge_right)  m += w * p.quantity;
        }
        edgeMap[spec.edge_band_type] = { meters: (edgeMap[spec.edge_band_type]?.meters || 0) + m };
      }
    }

    // Match each material to a stock_item
    const suggestions: BomSuggestion[] = [];

    for (const [mat, { area_m2 }] of Object.entries(matMap)) {
      const sheets = Math.ceil(area_m2 / SHEET_YIELD);
      const lower = mat.toLowerCase();
      const match = stockOptions.find(s => {
        const sn = s.name.toLowerCase();
        return sn.includes(lower.split(' ')[0]) || lower.includes(sn.split(' ')[0]) ||
          (lower.includes('hdf') && sn.includes('hdf')) ||
          (lower.includes('mdf') && !lower.includes('hdf') && sn.includes('mdf') && !sn.includes('hdf')) ||
          (lower.includes('stratifié') && sn.includes('stratif'));
      });
      suggestions.push({
        material: mat,
        sheets_needed: sheets,
        area_m2,
        unit: 'panel',
        stockItemId: match?.id || null,
        stockItemName: match?.name || '— Non trouvé —',
        available: match ? match.current_quantity - match.reserved_quantity : 0,
      });
    }

    // Edge banding
    for (const [type, { meters }] of Object.entries(edgeMap)) {
      const mWithMargin = Math.ceil(meters * 1.15);
      const lower = type.toLowerCase();
      const match = stockOptions.find(s =>
        s.category === 'edge_banding' && (
          s.name.toLowerCase().includes(lower.split(' ')[0]) ||
          lower.includes(s.name.toLowerCase().split(' ')[0])
        )
      ) ?? stockOptions.find(s => s.category === 'edge_banding');
      suggestions.push({
        material: `Chant: ${type}`,
        sheets_needed: mWithMargin,
        area_m2: 0,
        unit: 'meter',
        stockItemId: match?.id || null,
        stockItemName: match?.name || '— Non trouvé —',
        available: match ? match.current_quantity - match.reserved_quantity : 0,
      });
    }

    setBomSuggestions(suggestions);
    setLoadingBom(false);
  }

  async function importBomRequirements() {
    if (!selectedOrder || bomSuggestions.length === 0) return;
    setImportingBom(true);

    // Track running reserved_quantity per item within this batch to avoid stale reads
    // when the same stock item appears multiple times in the BOM.
    const reservedAccumulator: Record<string, number> = {};

    for (const sug of bomSuggestions) {
      if (!sug.stockItemId) continue;
      const mat = stockOptions.find(s => s.id === sug.stockItemId);
      if (!mat) continue;

      // Use accumulator to get correct current reserved total for this item
      const currentReserved = reservedAccumulator[sug.stockItemId] ?? mat.reserved_quantity;
      const newReserved = currentReserved + sug.sheets_needed;
      reservedAccumulator[sug.stockItemId] = newReserved;

      // Reserve stock
      await supabase
        .from('stock_items')
        .update({ reserved_quantity: newReserved })
        .eq('id', sug.stockItemId);

      // Create a reserve stock movement for audit trail
      await supabase.from('stock_movements').insert({
        stock_item_id: sug.stockItemId,
        movement_type: 'reserve',
        quantity: 0,
        reference_type: 'production_order',
        reference_id: selectedOrder.id,
        project_id: id,
        notes: `BOM réservation: ${sug.sheets_needed} ${sug.unit} ${mat.name} | Ordre: ${selectedOrder.name || ''}`,
        created_by: profile?.id,
      });

      // Create requirement
      await supabase.from('production_material_requirements').insert({
        production_order_id: selectedOrder.id,
        material_id: sug.stockItemId,
        planned_qty: sug.sheets_needed,
        unit: sug.unit,
        status: 'reserved',
        notes: `BOM: ${sug.material} — ${sug.area_m2 > 0 ? sug.area_m2.toFixed(2) + ' m²' : sug.sheets_needed + ' ' + sug.unit}`,
      });
    }

    await loadRequirements(selectedOrder.id);
    await loadStock();
    setShowBomImport(false);
    setTab('materials');
    setImportingBom(false);
  }

  async function confirmUsage(req: MaterialRequirement) {
    const usedQty = parseFloat(confirmUsed);
    const wasteQty = parseFloat(confirmWaste) || 0;
    if (!usedQty || usedQty <= 0) return;

    setConfirming(true);

    // 1. Check stock won't go negative (used - waste = net consumption)
    const mat = req.material;
    const netConsumption = usedQty; // total consumed (waste is part of used)

    if (mat && netConsumption > mat.current_quantity) {
      alert(`❌ Stock insuffisant!\nDisponible: ${mat.current_quantity} ${mat.unit}\nConsommé: ${netConsumption} ${mat.unit}`);
      setConfirming(false);
      return;
    }

    // 2. Insert stock_movement (negative quantity → triggers deduction)
    const { data: movement, error: movErr } = await supabase
      .from('stock_movements')
      .insert({
        stock_item_id: req.material_id,
        movement_type: 'production_out',
        quantity: -netConsumption, // negative triggers stock deduction via trigger
        reference_type: 'production_order',
        reference_id: selectedOrder?.id,
        project_id: id,
        notes: `Production: ${selectedOrder?.name || ''} | Stage: ${confirmStage}${confirmNotes ? ' | ' + confirmNotes : ''}`,
        created_by: profile?.id,
      })
      .select('id')
      .single();

    if (movErr) {
      // Check if it's a negative stock error from trigger
      if (movErr.message.includes('negative')) {
        alert('❌ Stock insuffisant — opération annulée');
      } else {
        alert('Erreur mouvement stock: ' + movErr.message);
      }
      setConfirming(false);
      return;
    }

    // 3. Create usage record
    const { error: useErr } = await supabase
      .from('production_material_usage')
      .insert({
        production_order_id: selectedOrder?.id,
        requirement_id: req.id,
        material_id: req.material_id,
        used_qty: usedQty,
        waste_qty: wasteQty,
        unit: req.unit,
        stage: confirmStage,
        worker_id: profile?.id,
        movement_id: movement?.id || null,
        notes: confirmNotes || null,
      });

    if (useErr) {
      alert('Erreur usage: ' + useErr.message);
      setConfirming(false);
      return;
    }

    // 3b. Create waste_record for physical waste tracking (feeds into v_project_material_waste offcut_agg)
    if (wasteQty > 0 && req.material) {
      await supabase.from('waste_records').insert({
        sheet_id: null,
        production_order_id: selectedOrder?.id,
        project_id: id,
        material: req.material.name,
        length_mm: 1000,
        width_mm: Math.round(wasteQty * 1000),
        is_reusable: false,
        notes: `Production waste: ${wasteQty} ${req.unit} | Order: ${selectedOrder?.name || ''} | Stage: ${confirmStage}`,
        created_by: profile?.id,
      });
    }

    // 3c. Audit marker for waste in stock_movements (no additional deduction — already in production_out)
    if (wasteQty > 0) {
      await supabase.from('stock_movements').insert({
        stock_item_id: req.material_id,
        movement_type: 'production_waste',
        quantity: 0,
        reference_type: 'production_order',
        reference_id: selectedOrder?.id,
        project_id: id,
        notes: `Waste: ${wasteQty} ${req.unit} from ${req.material?.name || 'unknown'} | Stage: ${confirmStage}`,
        created_by: profile?.id,
      });
    }

    // 4. Update requirement status + release reservation
    if (mat) {
      await Promise.all([
        supabase.from('production_material_requirements')
          .update({ status: 'consumed' })
          .eq('id', req.id),
        supabase.from('stock_items')
          .update({ reserved_quantity: Math.max(0, mat.reserved_quantity - req.planned_qty) })
          .eq('id', req.material_id),
      ]);
    }

    await loadRequirements(selectedOrder!.id);
    await loadStock();
    setConfirmingId(null);
    setConfirmUsed('');
    setConfirmWaste('0');
    setConfirmNotes('');
    setConfirming(false);
  }

  async function updateOrderStatus(orderId: string, status: string) {
    const updates: Record<string, unknown> = { status };
    if (status === 'in_progress' && !selectedOrder?.started_at) updates.started_at = new Date().toISOString();
    if (status === 'completed') updates.completed_at = new Date().toISOString();

    await supabase.from('production_orders').update(updates).eq('id', orderId);
    await loadOrders();
    setSelectedOrder(prev => prev?.id === orderId ? { ...prev, ...updates } as ProductionOrderItem : prev);
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const costSummary = orders.map(o => {
    // We'll compute this from loaded requirements if selectedOrder matches
    return { ...o };
  });

  const totalMaterialCost = requirements.reduce((sum, r) => {
    const usages = r.usage || [];
    const totalUsed = usages.reduce((s, u) => s + u.used_qty, 0);
    const cost = (r.material?.cost_per_unit || 0) * totalUsed;
    return sum + cost;
  }, 0);

  const wasteItems = requirements.flatMap(r =>
    (r.usage || []).filter(u => u.waste_qty > 0).map(u => ({ ...u, material: r.material, req: r }))
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager', 'workshop_worker', 'commercial_manager', 'designer']}>
      <div className="space-y-4 pb-24">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 rounded-xl bg-white shadow-sm border border-gray-100">
            <ArrowLeft size={18} className="text-[#1a1a2e]" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-[#1a1a2e]">Consommation Matières</h1>
            <p className="text-xs text-[#64648B]">{projectName}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {([
            ['orders',    'Ordres',     Package],
            ['materials', 'Matières',   Layers],
            ['waste',     'Chutes',     Scissors],
            ['cost',      'Coûts',      DollarSign],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key as TabKey)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-all ${
                tab === key ? 'bg-white shadow text-[#1a1a2e]' : 'text-gray-500'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab: Orders ─────────────────────────────────────────────────── */}
        {tab === 'orders' && (
          <div className="space-y-3">
            {canWrite && (
              <Button onClick={() => setShowNewOrder(true)} size="sm" className="w-full">
                <Plus size={14} /> Nouvel Ordre de Production
              </Button>
            )}

            {loading ? (
              <div className="text-center py-8 text-sm text-gray-400">Chargement…</div>
            ) : orders.length === 0 ? (
              <Card><CardContent>
                <p className="text-center text-sm text-gray-400 py-6">Aucun ordre de production pour ce projet.</p>
              </CardContent></Card>
            ) : (
              orders.map(order => (
                <Card key={order.id} className={`cursor-pointer transition-all hover:shadow-md ${selectedOrder?.id === order.id ? 'ring-2 ring-[#1E2F52]' : ''}`}
                  onClick={() => { setSelectedOrder(order); setTab('materials'); }}>
                  <CardContent>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="font-semibold text-sm text-[#1a1a2e] truncate">
                          {order.name || `Ordre #${order.id.slice(-6)}`}
                        </p>
                        <p className="text-xs text-[#64648B] mt-0.5">
                          {new Date(order.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        {order.notes && (
                          <p className="text-xs text-gray-400 mt-1 truncate">{order.notes}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <StatusBadge status={order.status} />
                        {canWrite && order.status === 'pending' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); updateOrderStatus(order.id, 'in_progress'); }}
                            className="text-xs text-blue-600 hover:underline"
                          >Démarrer</button>
                        )}
                        {canWrite && order.status === 'in_progress' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); updateOrderStatus(order.id, 'completed'); }}
                            className="text-xs text-green-600 hover:underline"
                          >Terminer</button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* ── Tab: Materials ──────────────────────────────────────────────── */}
        {tab === 'materials' && (
          <div className="space-y-3">
            {/* Order selector */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2 flex items-center gap-2">
              <Package size={16} className="text-[#64648B]" />
              <select
                value={selectedOrder?.id || ''}
                onChange={e => {
                  const o = orders.find(x => x.id === e.target.value);
                  setSelectedOrder(o || null);
                }}
                className="flex-1 text-sm text-[#1a1a2e] bg-transparent outline-none"
              >
                <option value="">— Sélectionner un ordre —</option>
                {orders.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.name || `Ordre #${o.id.slice(-6)}`} ({o.status})
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="text-gray-400" />
            </div>

            {!selectedOrder ? (
              <Card><CardContent>
                <p className="text-center text-sm text-gray-400 py-6">Sélectionnez un ordre ci-dessus.</p>
              </CardContent></Card>
            ) : (
              <>
                {canWrite && selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                  <div className="flex gap-2">
                    <Button onClick={() => setShowAddReq(true)} variant="secondary" size="sm" className="flex-1">
                      <Plus size={14} /> Ajouter matière requise
                    </Button>
                    <Button
                      onClick={loadBomFromStructure}
                      variant="secondary"
                      size="sm"
                      className="flex-1 border-dashed border-[#1E2F52] text-[#1E2F52]"
                      disabled={loadingBom}
                    >
                      <LayoutGrid size={14} />
                      {loadingBom ? 'Chargement…' : 'Depuis Structure'}
                    </Button>
                  </div>
                )}

                {requirements.length === 0 ? (
                  <Card><CardContent>
                    <p className="text-center text-sm text-gray-400 py-6">Aucune matière définie pour cet ordre.</p>
                  </CardContent></Card>
                ) : (
                  requirements.map(req => {
                    const avail = req.material
                      ? req.material.current_quantity - req.material.reserved_quantity
                      : 0;
                    const totalUsed = (req.usage || []).reduce((s, u) => s + u.used_qty, 0);
                    const insufficientStock = avail < 0;
                    const isConsumed = req.status === 'consumed';

                    return (
                      <Card key={req.id} className={isConsumed ? 'opacity-75' : ''}>
                        <CardContent>
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1 min-w-0 mr-2">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-sm text-[#1a1a2e]">
                                  {req.material?.name || 'Matière inconnue'}
                                </p>
                                {insufficientStock && !isConsumed && (
                                  <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
                                )}
                                {isConsumed && <CheckCircle size={14} className="text-green-500 flex-shrink-0" />}
                              </div>
                              <div className="flex gap-3 text-xs text-[#64648B] mt-1">
                                <span>Prévu: <b>{req.planned_qty} {req.unit}</b></span>
                                {totalUsed > 0 && (
                                  <span>Consommé: <b className="text-green-600">{totalUsed} {req.unit}</b></span>
                                )}
                                <span>Stock dispo: <b className={insufficientStock ? 'text-red-500' : ''}>{avail} {req.material?.unit}</b></span>
                              </div>
                              {req.material?.cost_per_unit && totalUsed > 0 && (
                                <p className="text-xs text-[#64648B] mt-0.5">
                                  Coût: <b>{(req.material.cost_per_unit * totalUsed).toLocaleString('fr-MA')} MAD</b>
                                </p>
                              )}
                            </div>
                            <div className="flex-shrink-0">
                              <StatusBadge status={req.status} />
                            </div>
                          </div>

                          {/* Usage history */}
                          {(req.usage || []).length > 0 && (
                            <div className="mt-2 space-y-1">
                              {(req.usage || []).map(u => (
                                <div key={u.id} className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-2 py-1">
                                  {u.stage && (
                                    <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${STAGE_COLORS[u.stage] || 'bg-gray-100'}`}>
                                      {STAGE_ICONS[u.stage]}
                                      {u.stage}
                                    </span>
                                  )}
                                  <span className="text-gray-600">
                                    {u.used_qty} {u.unit}
                                    {u.waste_qty > 0 && <span className="text-amber-600"> (+{u.waste_qty} chute)</span>}
                                  </span>
                                  <span className="text-gray-400 ml-auto">
                                    {new Date(u.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Confirm usage form */}
                          {canWrite && !isConsumed && confirmingId === req.id && (
                            <div className="mt-3 p-3 bg-blue-50 rounded-xl space-y-2 border border-blue-100">
                              <p className="text-xs font-semibold text-blue-800">Confirmer consommation</p>
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  label={`Utilisé (${req.unit})`}
                                  type="number"
                                  value={confirmUsed}
                                  onChange={e => setConfirmUsed(e.target.value)}
                                  placeholder={String(req.planned_qty)}
                                />
                                <Input
                                  label={`Chutes (${req.unit})`}
                                  type="number"
                                  value={confirmWaste}
                                  onChange={e => setConfirmWaste(e.target.value)}
                                  placeholder="0"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 mb-1 block">Étape</label>
                                <select
                                  value={confirmStage}
                                  onChange={e => setConfirmStage(e.target.value)}
                                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                                >
                                  <option value="cutting">Découpe</option>
                                  <option value="edge_banding">Chantage</option>
                                  <option value="assembly">Assemblage</option>
                                  <option value="ready">Prêt</option>
                                </select>
                              </div>
                              <Input
                                label="Notes (optionnel)"
                                value={confirmNotes}
                                onChange={e => setConfirmNotes(e.target.value)}
                                placeholder="Remarques…"
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm" className="flex-1"
                                  disabled={!confirmUsed || confirming}
                                  onClick={() => confirmUsage(req)}
                                >
                                  {confirming ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                                  {confirming ? 'Enregistrement…' : 'Confirmer'}
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => setConfirmingId(null)}>
                                  <X size={13} />
                                </Button>
                              </div>
                            </div>
                          )}

                          {canWrite && !isConsumed && confirmingId !== req.id && (
                            <button
                              onClick={() => {
                                setConfirmingId(req.id);
                                setConfirmUsed(String(req.planned_qty));
                              }}
                              className="mt-2 w-full py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                            >
                              ✓ Confirmer la consommation
                            </button>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </>
            )}
          </div>
        )}

        {/* ── Tab: Waste ─────────────────────────────────────────────────── */}
        {tab === 'waste' && (
          <div className="space-y-3">
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Scissors size={16} /> Chutes & Déchets
                </h2>
              </CardHeader>
              <CardContent>
                {wasteItems.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Aucune chute enregistrée.</p>
                ) : (
                  <div className="space-y-2">
                    {wasteItems.map(w => (
                      <div key={w.id} className="flex justify-between items-start text-sm py-2 border-b border-gray-50 last:border-0">
                        <div>
                          <p className="font-medium text-[#1a1a2e]">{(w as any).material?.name}</p>
                          <p className="text-xs text-[#64648B]">
                            {w.waste_qty} {w.unit}
                            {w.stage && (
                              <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${STAGE_COLORS[w.stage] || 'bg-gray-100'}`}>
                                {w.stage}
                              </span>
                            )}
                          </p>
                          {w.notes && <p className="text-xs text-gray-400 mt-0.5">{w.notes}</p>}
                        </div>
                        <p className="text-xs text-gray-400 flex-shrink-0">
                          {new Date(w.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                    ))}
                    <div className="pt-2 flex justify-between text-sm font-semibold">
                      <span>Total chutes</span>
                      <span className="text-amber-600">
                        {wasteItems.reduce((s, w) => s + w.waste_qty, 0).toFixed(2)} unités
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Tab: Cost ──────────────────────────────────────────────────── */}
        {tab === 'cost' && (
          <div className="space-y-3">
            {/* Order selector */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2 flex items-center gap-2">
              <DollarSign size={16} className="text-[#64648B]" />
              <select
                value={selectedOrder?.id || ''}
                onChange={e => {
                  const o = orders.find(x => x.id === e.target.value);
                  setSelectedOrder(o || null);
                }}
                className="flex-1 text-sm text-[#1a1a2e] bg-transparent outline-none"
              >
                <option value="">— Tous les ordres —</option>
                {orders.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.name || `Ordre #${o.id.slice(-6)}`}
                  </option>
                ))}
              </select>
            </div>

            {selectedOrder && (
              <Card>
                <CardHeader>
                  <h2 className="font-semibold text-sm">
                    {selectedOrder.name || `Ordre #${selectedOrder.id.slice(-6)}`}
                  </h2>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {requirements.map(req => {
                      const usages = req.usage || [];
                      const totalUsed = usages.reduce((s, u) => s + u.used_qty, 0);
                      const totalWaste = usages.reduce((s, u) => s + u.waste_qty, 0);
                      const unitCost = req.material?.cost_per_unit || 0;
                      const plannedCost = unitCost * req.planned_qty;
                      const actualCost = unitCost * totalUsed;
                      const wasteCost = unitCost * totalWaste;

                      return (
                        <div key={req.id} className="text-sm border-b border-gray-50 pb-3 last:border-0">
                          <div className="flex justify-between mb-1">
                            <p className="font-medium text-[#1a1a2e]">{req.material?.name}</p>
                            <StatusBadge status={req.status} />
                          </div>
                          <div className="grid grid-cols-3 gap-1 text-xs text-[#64648B]">
                            <div>
                              <p>Prévu</p>
                              <p className="font-semibold text-[#1a1a2e]">{plannedCost.toLocaleString('fr-MA')} MAD</p>
                              <p className="text-[10px]">{req.planned_qty} {req.unit}</p>
                            </div>
                            <div>
                              <p>Réel</p>
                              <p className={`font-semibold ${actualCost > plannedCost ? 'text-red-500' : 'text-green-600'}`}>
                                {actualCost.toLocaleString('fr-MA')} MAD
                              </p>
                              <p className="text-[10px]">{totalUsed} {req.unit}</p>
                            </div>
                            <div>
                              <p>Chutes</p>
                              <p className="font-semibold text-amber-600">{wasteCost.toLocaleString('fr-MA')} MAD</p>
                              <p className="text-[10px]">{totalWaste} {req.unit}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <div className="pt-2 flex justify-between text-base font-bold">
                      <span>Total Matières</span>
                      <span className="text-[#1E2F52]">{totalMaterialCost.toLocaleString('fr-MA')} MAD</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── Modal: New Order ─────────────────────────────────────────────── */}
        {showNewOrder && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-[#1a1a2e]">Nouvel Ordre de Production</h3>
                <button onClick={() => setShowNewOrder(false)}><X size={20} /></button>
              </div>
              <Input
                label="Nom de l'ordre"
                value={newOrderName}
                onChange={e => setNewOrderName(e.target.value)}
                placeholder="ex: Cuisine Malabata — Phase 1"
              />
              <Input
                label="Notes (optionnel)"
                value={newOrderNotes}
                onChange={e => setNewOrderNotes(e.target.value)}
                placeholder="ex: 28 panneaux MDF 18mm, 6 caissons…"
              />
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setShowNewOrder(false)}>Annuler</Button>
                <Button className="flex-1" disabled={!newOrderName || savingOrder} onClick={createOrder}>
                  {savingOrder ? 'Création…' : 'Créer'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal: BOM Import from Structure ─────────────────────────────── */}
        {showBomImport && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[80vh] flex flex-col">
              <div className="flex justify-between items-center flex-shrink-0">
                <div className="flex items-center gap-2">
                  <LayoutGrid size={18} className="text-[#1E2F52]" />
                  <h3 className="font-bold text-[#1a1a2e]">Importer depuis la Structure</h3>
                </div>
                <button onClick={() => setShowBomImport(false)}><X size={20} /></button>
              </div>

              {loadingBom ? (
                <div className="flex items-center justify-center py-10 gap-2 text-sm text-gray-400">
                  <RefreshCw size={16} className="animate-spin" />
                  Analyse de la structure…
                </div>
              ) : bomSuggestions.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <LayoutGrid size={32} className="mx-auto text-gray-300" />
                  <p className="text-sm text-gray-500">Aucune structure trouvée pour ce projet.</p>
                  <p className="text-xs text-gray-400">Créez d'abord des modules dans l'onglet Structure.</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-500 flex-shrink-0">
                    <Zap size={12} className="inline mr-1 text-amber-500" />
                    {bomSuggestions.length} matière(s) détectée(s) depuis la structure cabinet
                  </p>

                  <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                    {bomSuggestions.map((sug, i) => {
                      const hasStock = sug.stockItemId !== null;
                      const sufficient = sug.available >= sug.sheets_needed;
                      return (
                        <div
                          key={i}
                          className={`rounded-xl border px-3 py-2.5 ${
                            !hasStock
                              ? 'border-gray-200 bg-gray-50'
                              : sufficient
                              ? 'border-green-200 bg-green-50'
                              : 'border-amber-200 bg-amber-50'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0 mr-2">
                              <p className="text-sm font-semibold text-[#1a1a2e] truncate">{sug.material}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {sug.area_m2 > 0
                                  ? `${sug.area_m2.toFixed(2)} m² → ${sug.sheets_needed} panneaux`
                                  : `${sug.sheets_needed} ${sug.unit}`}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              {hasStock ? (
                                <>
                                  <p className={`text-xs font-semibold ${sufficient ? 'text-green-700' : 'text-amber-700'}`}>
                                    {sufficient ? '✓' : '⚠'} {sug.available} dispo
                                  </p>
                                  <p className="text-[10px] text-gray-400 truncate max-w-[100px]">{sug.stockItemName}</p>
                                </>
                              ) : (
                                <p className="text-xs text-gray-400 italic">Non trouvé</p>
                              )}
                            </div>
                          </div>
                          {!sufficient && hasStock && (
                            <p className="text-[10px] text-amber-700 mt-1">
                              Besoin: {sug.sheets_needed} — Stock: {sug.available}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex-shrink-0 space-y-2">
                    <div className="text-xs text-gray-400 flex justify-between px-1">
                      <span>{bomSuggestions.filter(s => s.stockItemId).length} matchées</span>
                      <span>{bomSuggestions.filter(s => !s.stockItemId).length} non trouvées (ignorées)</span>
                    </div>
                    <div className="flex gap-3">
                      <Button variant="secondary" className="flex-1" onClick={() => setShowBomImport(false)}>
                        Annuler
                      </Button>
                      <Button
                        className="flex-1"
                        disabled={importingBom || bomSuggestions.filter(s => s.stockItemId).length === 0}
                        onClick={importBomRequirements}
                      >
                        {importingBom ? (
                          <><RefreshCw size={13} className="animate-spin" /> Import…</>
                        ) : (
                          <><Zap size={13} /> Importer {bomSuggestions.filter(s => s.stockItemId).length} besoins</>
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Modal: Add Requirement ───────────────────────────────────────── */}
        {showAddReq && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-[#1a1a2e]">Ajouter une matière</h3>
                <button onClick={() => setShowAddReq(false)}><X size={20} /></button>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Matière *</label>
                <select
                  value={reqMaterialId}
                  onChange={e => {
                    setReqMaterialId(e.target.value);
                    const s = stockOptions.find(x => x.id === e.target.value);
                    if (s) setReqUnit(s.unit);
                  }}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white"
                >
                  <option value="">— Choisir une matière —</option>
                  {stockOptions.map(s => {
                    const avail = s.current_quantity - s.reserved_quantity;
                    return (
                      <option key={s.id} value={s.id}>
                        {s.name} — {avail} {s.unit} dispo {avail < 5 ? '⚠️' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Quantité prévue *"
                  type="number"
                  value={reqQty}
                  onChange={e => setReqQty(e.target.value)}
                  placeholder="ex: 12"
                />
                <Input
                  label="Unité"
                  value={reqUnit}
                  onChange={e => setReqUnit(e.target.value)}
                  placeholder="panel / m / pcs"
                />
              </div>
              {reqMaterialId && reqQty && (() => {
                const mat = stockOptions.find(s => s.id === reqMaterialId);
                if (!mat) return null;
                const avail = mat.current_quantity - mat.reserved_quantity;
                const qty = parseFloat(reqQty);
                if (qty > avail) {
                  return (
                    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
                      <AlertTriangle size={14} />
                      Stock insuffisant: {avail} {mat.unit} disponible
                    </div>
                  );
                }
                return null;
              })()}
              <Input
                label="Notes (optionnel)"
                value={reqNotes}
                onChange={e => setReqNotes(e.target.value)}
                placeholder="ex: Corps caissons bas cuisine"
              />
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setShowAddReq(false)}>Annuler</Button>
                <Button className="flex-1" disabled={!reqMaterialId || !reqQty || savingReq} onClick={addRequirement}>
                  {savingReq ? 'Ajout…' : 'Ajouter + Réserver'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
