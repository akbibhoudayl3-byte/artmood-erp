'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLocale } from '@/lib/hooks/useLocale';
import { useAuth } from '@/lib/hooks/useAuth';
import { RoleGuard } from '@/components/auth/RoleGuard';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  Scissors, Layers, BarChart2, Trash2,
  CheckCircle, Circle, Plus, ChevronDown, AlertTriangle, Package
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────
interface Sheet { id: string; sheet_number: string; project?: { reference_code: string; client_name: string } }
interface Panel {
  id: string; panel_name: string; length: number; width: number; quantity: number;
  material: string; edge_top: boolean; edge_bottom: boolean; edge_left: boolean; edge_right: boolean;
  current_station: string; module?: { module_name: string; edge_band_type: string }
}
interface Consumption {
  id: string; stock_item_id: string | null; expected_quantity: number; actual_quantity: number | null;
  waste_quantity: number | null; waste_percent: number | null; status: string; notes: string | null;
  stock_item?: { item_name: string; unit: string }
}
interface WasteRecord {
  id: string; material: string; length_mm: number; width_mm: number; area_m2: number;
  is_reusable: boolean; notes: string | null; created_at: string
}

const MATERIAL_LABELS: Record<string, string> = {
  melamine_white: 'Mélaminé Blanc', melamine_oak: 'Mélaminé Chêne',
  melamine_walnut: 'Mélaminé Noyer', melamine_anthracite: 'Mélaminé Anthracite',
  mdf_raw: 'MDF Brut', mdf_lacquered: 'MDF Laqué',
  plywood: 'Contreplaqué', solid_wood: 'Bois Massif', hpl: 'HPL', other: 'Autre',
};
const EDGE_LABELS: Record<string, string> = {
  '0.4mm_pvc': 'PVC 0.4mm', '1mm_pvc': 'PVC 1mm', '2mm_pvc': 'PVC 2mm',
  '2mm_abs': 'ABS 2mm', '45mm_solid': 'Massif 45mm',
};

export default function CuttingPage() {
  const supabase = createClient();
  const { t } = useLocale();
  const { profile } = useAuth();

  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetId, setSheetId] = useState('');
  const [tab, setTab] = useState<'cut' | 'edge' | 'consumption' | 'waste'>('cut');

  // Tab data
  const [panels, setPanels] = useState<Panel[]>([]);
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [wastes, setWastes] = useState<WasteRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Waste form
  const [showWasteForm, setShowWasteForm] = useState(false);
  const [wMaterial, setWMaterial] = useState('melamine_white');
  const [wLength, setWLength] = useState('');
  const [wWidth, setWWidth] = useState('');
  const [wReusable, setWReusable] = useState(false);
  const [wNotes, setWNotes] = useState('');
  const [savingWaste, setSavingWaste] = useState(false);

  // Consumption edit
  const [editConsId, setEditConsId] = useState<string | null>(null);
  const [editActual, setEditActual] = useState('');
  const [savingCons, setSavingCons] = useState(false);

  // ─── Load sheets ───────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('production_sheets')
      .select('id, sheet_number, project:projects(reference_code, client_name)')
      .in('status', ['approved', 'in_production'])
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        setSheets((data || []) as any);
        if (data?.[0]) setSheetId(data[0].id);
      });
  }, []);

  // ─── Load tab data ─────────────────────────────────────────
  const load = useCallback(async () => {
    if (!sheetId) return;
    setLoading(true);

    if (tab === 'cut' || tab === 'edge') {
      const { data } = await supabase
        .from('production_sheet_panels')
        .select('*, module:production_sheet_modules(module_name, edge_band_type)')
        .eq('sheet_id', sheetId)
        .order('sort_order');
      setPanels(data || []);
    }

    if (tab === 'consumption') {
      const { data } = await supabase
        .from('production_consumption')
        .select('*, stock_item:stock_items(item_name, unit)')
        .eq('sheet_id', sheetId)
        .order('created_at');
      setConsumptions(data || []);
    }

    if (tab === 'waste') {
      const { data } = await supabase
        .from('waste_records')
        .select('*')
        .eq('sheet_id', sheetId)
        .order('created_at', { ascending: false });
      setWastes(data || []);
    }

    setLoading(false);
  }, [sheetId, tab]);

  useEffect(() => { load(); }, [load]);

  // ─── Mark panel as cut / edge-banded ───────────────────────
  async function markPanel(panelId: string, station: 'saw' | 'edge') {
    await supabase.from('station_scans').insert({
      panel_id: panelId, station, scanned_by: profile?.id, scanned_at: new Date().toISOString(),
    });
    await supabase
      .from('production_sheet_panels')
      .update({ current_station: station })
      .eq('id', panelId);
    setPanels(prev => prev.map(p => p.id === panelId ? { ...p, current_station: station } : p));
  }

  // ─── Mark all visible panels ───────────────────────────────
  async function markAll(station: 'saw' | 'edge') {
    const targets = station === 'saw'
      ? panels.filter(p => p.current_station === 'pending')
      : panels.filter(p => (p.edge_top || p.edge_bottom || p.edge_left || p.edge_right) && p.current_station !== 'edge');
    for (const p of targets) await markPanel(p.id, station);
  }

  // ─── Save actual consumption ────────────────────────────────
  async function saveActual(id: string) {
    if (!editActual) return;
    setSavingCons(true);
    await supabase
      .from('production_consumption')
      .update({
        actual_quantity: parseFloat(editActual),
        status: 'consumed',
        recorded_by: profile?.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    setEditConsId(null);
    setSavingCons(false);
    load();
  }

  // ─── Add waste record ───────────────────────────────────────
  async function addWaste() {
    if (!wLength || !wWidth || !sheetId) return;
    setSavingWaste(true);
    const selectedSheet = sheets.find(s => s.id === sheetId);
    await supabase.from('waste_records').insert({
      sheet_id: sheetId,
      project_id: selectedSheet?.project ? null : null,
      material: wMaterial,
      length_mm: parseInt(wLength),
      width_mm: parseInt(wWidth),
      is_reusable: wReusable,
      notes: wNotes || null,
      created_by: profile?.id,
    });
    setWLength(''); setWWidth(''); setWNotes(''); setWReusable(false);
    setShowWasteForm(false);
    setSavingWaste(false);
    load();
  }

  // ─── Derived data for cutting tab ──────────────────────────
  const cutPanels = panels;
  const cutByMaterial = cutPanels.reduce<Record<string, Panel[]>>((acc, p) => {
    (acc[p.material] = acc[p.material] || []).push(p); return acc;
  }, {});
  const cutDone = cutPanels.filter(p => p.current_station !== 'pending').length;

  // ─── Derived data for edge tab ──────────────────────────────
  const edgePanels = panels.filter(p => p.edge_top || p.edge_bottom || p.edge_left || p.edge_right);
  const edgeDone = edgePanels.filter(p => p.current_station === 'edge' || p.current_station === 'assembly' || p.current_station === 'qc' || p.current_station === 'packing').length;

  // ─── Edge meter calculation ─────────────────────────────────
  function edgeMeters(p: Panel): number {
    let m = 0;
    if (p.edge_top) m += p.length;
    if (p.edge_bottom) m += p.length;
    if (p.edge_left) m += p.width;
    if (p.edge_right) m += p.width;
    return (m / 1000) * p.quantity;
  }

  // ─── Waste summary ──────────────────────────────────────────
  const wasteTotalM2 = wastes.reduce((s, w) => s + w.area_m2, 0);
  const wasteByMaterial = wastes.reduce<Record<string, number>>((acc, w) => {
    acc[w.material] = (acc[w.material] || 0) + w.area_m2; return acc;
  }, {});

  const TABS = [
    { id: 'cut', label: t('cutting.cutting_tab'), icon: Scissors },
    { id: 'edge', label: t('cutting.edge_tab'), icon: Layers },
    { id: 'consumption', label: t('cutting.consumption_tab'), icon: BarChart2 },
    { id: 'waste', label: t('cutting.waste_tab'), icon: Trash2 },
  ] as const;

  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager', 'workshop_worker']}>
      <div className="min-h-screen bg-[#FDF9F6]">
        {/* Header */}
        <div className="bg-white border-b border-[#E8E5E0] px-4 py-3 sticky top-0 z-10">
          <div className="max-w-4xl mx-auto flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold text-[#1a1a2e] flex items-center gap-2">
                <Scissors size={20} className="text-[#C9956B]" />
                {t('cutting.title')}
              </h1>
              {/* Sheet selector */}
              <div className="relative">
                <select
                  value={sheetId}
                  onChange={e => setSheetId(e.target.value)}
                  className="appearance-none text-sm border border-[#E8E5E0] rounded-xl px-3 py-1.5 pr-7 bg-white text-[#1a1a2e] focus:outline-none focus:border-[#C9956B]"
                >
                  {sheets.length === 0 && <option value="">{t('cutting.no_sheets')}</option>}
                  {sheets.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.sheet_number} — {s.project?.client_name || ''}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-2.5 text-[#64648B] pointer-events-none" />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id as typeof tab)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                    tab === id
                      ? 'bg-[#1a1a2e] text-white'
                      : 'bg-[#F5F3F0] text-[#64648B] hover:bg-[#E8E5E0]'
                  }`}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-4 space-y-3">
          {!sheetId ? (
            <div className="text-center py-12 text-[#64648B]">
              <Package size={40} className="mx-auto mb-2 opacity-30" />
              <p>{t('cutting.select_sheet')}</p>
            </div>
          ) : loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-16 bg-[#F0EDE8] rounded-2xl animate-pulse" />)}
            </div>
          ) : (

            // ── TAB: DÉCOUPE ─────────────────────────────────────
            tab === 'cut' ? (
              <div className="space-y-3">
                {/* Progress bar */}
                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="font-medium text-[#1a1a2e]">{t('cutting.progress')}</span>
                      <span className="text-[#64648B]">{cutDone}/{cutPanels.length} {t('cutting.panels')}</span>
                    </div>
                    <div className="h-2 bg-[#F0EDE8] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#C9956B] rounded-full transition-all"
                        style={{ width: `${cutPanels.length ? (cutDone / cutPanels.length) * 100 : 0}%` }}
                      />
                    </div>
                    {cutDone < cutPanels.length && (
                      <Button onClick={() => markAll('saw')} className="mt-2 w-full text-xs py-1.5">
                        ✓ {t('cutting.mark_all_cut')}
                      </Button>
                    )}
                  </CardContent>
                </Card>

                {/* Panels by material */}
                {Object.entries(cutByMaterial).map(([mat, mPanels]) => {
                  const totalM2 = mPanels.reduce((s, p) => s + (p.length * p.width * p.quantity / 1e6), 0);
                  return (
                    <Card key={mat}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-[#1a1a2e] text-sm">
                            {MATERIAL_LABELS[mat] || mat}
                          </span>
                          <span className="text-xs text-[#64648B]">{totalM2.toFixed(2)} m²</span>
                        </div>
                        <div className="space-y-1.5">
                          {mPanels.map(p => {
                            const done = p.current_station !== 'pending';
                            return (
                              <div
                                key={p.id}
                                className={`flex items-center gap-2 p-2 rounded-xl transition-all ${
                                  done ? 'bg-green-50 opacity-60' : 'bg-[#F5F3F0]'
                                }`}
                              >
                                <button onClick={() => !done && markPanel(p.id, 'saw')} className="shrink-0">
                                  {done
                                    ? <CheckCircle size={18} className="text-green-500" />
                                    : <Circle size={18} className="text-[#C9956B]" />
                                  }
                                </button>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-[#1a1a2e] truncate">
                                    {p.module?.module_name} — {p.panel_name}
                                  </p>
                                  <p className="text-xs text-[#64648B]">
                                    {p.length} × {p.width} mm × {p.quantity} pc
                                    &nbsp;·&nbsp; {((p.length * p.width * p.quantity) / 1e6).toFixed(3)} m²
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                {cutPanels.length === 0 && (
                  <div className="text-center py-10 text-[#64648B] text-sm">{t('cutting.no_panels')}</div>
                )}
              </div>
            )

            // ── TAB: CHANT ────────────────────────────────────────
            : tab === 'edge' ? (
              <div className="space-y-3">
                {/* Progress */}
                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="font-medium text-[#1a1a2e]">{t('cutting.progress')}</span>
                      <span className="text-[#64648B]">{edgeDone}/{edgePanels.length} {t('cutting.panels')}</span>
                    </div>
                    <div className="h-2 bg-[#F0EDE8] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#F97316] rounded-full transition-all"
                        style={{ width: `${edgePanels.length ? (edgeDone / edgePanels.length) * 100 : 0}%` }}
                      />
                    </div>
                    {edgeDone < edgePanels.length && (
                      <Button onClick={() => markAll('edge')} className="mt-2 w-full text-xs py-1.5">
                        ✓ {t('cutting.mark_all_banded')}
                      </Button>
                    )}
                  </CardContent>
                </Card>

                {/* Group by edge type */}
                {(() => {
                  const byType = edgePanels.reduce<Record<string, Panel[]>>((acc, p) => {
                    const et = p.module?.edge_band_type || 'other';
                    (acc[et] = acc[et] || []).push(p); return acc;
                  }, {});
                  return Object.entries(byType).map(([et, ePanels]) => {
                    const totalM = ePanels.reduce((s, p) => s + edgeMeters(p), 0);
                    return (
                      <Card key={et}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-[#1a1a2e] text-sm">
                              {EDGE_LABELS[et] || et}
                            </span>
                            <span className="text-xs text-[#64648B]">{totalM.toFixed(1)} m</span>
                          </div>
                          <div className="space-y-1.5">
                            {ePanels.map(p => {
                              const done = ['edge','assembly','qc','packing'].includes(p.current_station);
                              const edges = [p.edge_top && 'H', p.edge_bottom && 'B', p.edge_left && 'G', p.edge_right && 'D'].filter(Boolean);
                              return (
                                <div
                                  key={p.id}
                                  className={`flex items-center gap-2 p-2 rounded-xl ${
                                    done ? 'bg-orange-50 opacity-60' : 'bg-[#F5F3F0]'
                                  }`}
                                >
                                  <button onClick={() => !done && markPanel(p.id, 'edge')} className="shrink-0">
                                    {done
                                      ? <CheckCircle size={18} className="text-orange-500" />
                                      : <Circle size={18} className="text-[#F97316]" />
                                    }
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-[#1a1a2e] truncate">
                                      {p.module?.module_name} — {p.panel_name}
                                    </p>
                                    <p className="text-xs text-[#64648B]">
                                      {p.length}×{p.width}mm ×{p.quantity} · Chants: {edges.join(',')}
                                      &nbsp;· {edgeMeters(p).toFixed(1)}m
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  });
                })()}
                {edgePanels.length === 0 && (
                  <div className="text-center py-10 text-[#64648B] text-sm">{t('cutting.no_edge_panels')}</div>
                )}
              </div>
            )

            // ── TAB: CONSOMMATION ─────────────────────────────────
            : tab === 'consumption' ? (
              <div className="space-y-2">
                {consumptions.length === 0 && (
                  <div className="text-center py-10 text-[#64648B] text-sm">
                    <AlertTriangle size={32} className="mx-auto mb-2 opacity-30" />
                    {t('cutting.no_consumption')}
                  </div>
                )}
                {consumptions.map(c => {
                  const wasteOk = c.waste_percent !== null && c.waste_percent > 0;
                  return (
                    <Card key={c.id}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-[#1a1a2e] text-sm truncate">
                              {c.stock_item?.item_name || '—'}
                            </p>
                            <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <p className="text-[#64648B]">{t('cutting.expected')}</p>
                                <p className="font-semibold">{c.expected_quantity} {c.stock_item?.unit}</p>
                              </div>
                              <div>
                                <p className="text-[#64648B]">{t('cutting.actual')}</p>
                                {editConsId === c.id ? (
                                  <input
                                    autoFocus
                                    type="number"
                                    step="0.01"
                                    value={editActual}
                                    onChange={e => setEditActual(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') saveActual(c.id); if (e.key === 'Escape') setEditConsId(null); }}
                                    className="w-16 border border-[#C9956B] rounded-lg px-1.5 py-0.5 text-xs"
                                  />
                                ) : (
                                  <p
                                    className="font-semibold cursor-pointer underline decoration-dotted"
                                    onClick={() => { setEditConsId(c.id); setEditActual(String(c.actual_quantity ?? '')); }}
                                  >
                                    {c.actual_quantity ?? <span className="text-[#C9956B]">{t('cutting.tap_to_enter')}</span>}
                                  </p>
                                )}
                              </div>
                              <div>
                                <p className="text-[#64648B]">{t('cutting.waste_pct')}</p>
                                <p className={`font-semibold ${wasteOk ? 'text-red-500' : 'text-green-600'}`}>
                                  {c.waste_percent !== null ? `${c.waste_percent.toFixed(1)}%` : '—'}
                                </p>
                              </div>
                            </div>
                          </div>
                          {editConsId === c.id && (
                            <Button
                              onClick={() => saveActual(c.id)}
                              disabled={savingCons}
                              className="text-xs py-1 px-2 mt-1 shrink-0"
                            >
                              ✓
                            </Button>
                          )}
                        </div>
                        <div className="mt-2 h-1.5 bg-[#F0EDE8] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${wasteOk ? 'bg-red-400' : 'bg-green-400'}`}
                            style={{ width: `${Math.min((c.actual_quantity || 0) / c.expected_quantity * 100, 120)}%` }}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )

            // ── TAB: CHUTES ───────────────────────────────────────
            : (
              <div className="space-y-3">
                {/* Summary */}
                {wastes.length > 0 && (
                  <Card>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-[#1a1a2e] text-sm">{t('cutting.waste_summary')}</span>
                        <span className="text-sm font-bold text-red-500">{wasteTotalM2.toFixed(3)} m²</span>
                      </div>
                      <div className="space-y-1">
                        {Object.entries(wasteByMaterial).map(([mat, m2]) => (
                          <div key={mat} className="flex justify-between text-xs text-[#64648B]">
                            <span>{MATERIAL_LABELS[mat] || mat}</span>
                            <span>{m2.toFixed(3)} m²</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Add waste button */}
                <Button onClick={() => setShowWasteForm(true)} className="w-full flex items-center justify-center gap-2">
                  <Plus size={16} /> {t('cutting.add_waste')}
                </Button>

                {/* Waste list */}
                {wastes.map(w => (
                  <Card key={w.id}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className={`w-2 h-10 rounded-full shrink-0 ${w.is_reusable ? 'bg-green-400' : 'bg-red-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-[#1a1a2e]">{MATERIAL_LABELS[w.material] || w.material}</p>
                        <p className="text-xs text-[#64648B]">
                          {w.length_mm} × {w.width_mm} mm = {w.area_m2} m²
                          {w.is_reusable && <span className="ml-2 text-green-600">✓ {t('cutting.reusable')}</span>}
                        </p>
                        {w.notes && <p className="text-xs text-[#64648B] italic mt-0.5">{w.notes}</p>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {wastes.length === 0 && (
                  <div className="text-center py-8 text-[#64648B] text-sm">{t('cutting.no_waste')}</div>
                )}
              </div>
            )
          )}
        </div>

        {/* Add Waste Modal */}
        {showWasteForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowWasteForm(false)} />
            <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 space-y-3">
              <h3 className="font-bold text-[#1a1a2e]">{t('cutting.add_waste')}</h3>

              <div>
                <label className="text-xs text-[#64648B] mb-1 block">{t('cutting.material')}</label>
                <select
                  value={wMaterial}
                  onChange={e => setWMaterial(e.target.value)}
                  className="w-full border border-[#E8E5E0] rounded-xl px-3 py-2 text-sm"
                >
                  {Object.entries(MATERIAL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#64648B] mb-1 block">{t('cutting.length_mm')}</label>
                  <input
                    type="number" value={wLength} onChange={e => setWLength(e.target.value)}
                    placeholder="ex: 600"
                    className="w-full border border-[#E8E5E0] rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#64648B] mb-1 block">{t('cutting.width_mm')}</label>
                  <input
                    type="number" value={wWidth} onChange={e => setWWidth(e.target.value)}
                    placeholder="ex: 400"
                    className="w-full border border-[#E8E5E0] rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {wLength && wWidth && (
                <p className="text-xs text-[#64648B]">
                  Surface: {(parseInt(wLength||'0') * parseInt(wWidth||'0') / 1e6).toFixed(4)} m²
                </p>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={wReusable} onChange={e => setWReusable(e.target.checked)} className="rounded" />
                <span className="text-sm text-[#1a1a2e]">{t('cutting.reusable')}</span>
              </label>

              <div>
                <label className="text-xs text-[#64648B] mb-1 block">{t('common.notes')} ({t('common.optional')})</label>
                <input
                  type="text" value={wNotes} onChange={e => setWNotes(e.target.value)}
                  placeholder="..."
                  className="w-full border border-[#E8E5E0] rounded-xl px-3 py-2 text-sm"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  onClick={addWaste}
                  disabled={savingWaste || !wLength || !wWidth}
                  className="flex-1"
                >
                  {savingWaste ? '...' : t('common.save')}
                </Button>
                <Button
                  onClick={() => setShowWasteForm(false)}
                  className="flex-1 bg-[#F5F3F0] text-[#64648B] hover:bg-[#E8E5E0]"
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
