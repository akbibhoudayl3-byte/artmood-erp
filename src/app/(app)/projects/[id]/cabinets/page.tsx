'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import Input from '@/components/ui/Input';
import { CABINET_TYPES, MATERIAL_OPTIONS, EDGE_BAND_OPTIONS } from '@/lib/constants';
import type { CabinetSpec, PanelListItem } from '@/types/database';
import { ArrowLeft, Plus, Download, Trash2, ChevronDown, ChevronUp, Ruler } from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

// Standard panel calculation for common cabinet types
function generatePanels(spec: { cabinet_type: string; width: number; height: number; depth: number; material: string }): Omit<PanelListItem, 'id' | 'cabinet_spec_id' | 'sort_order'>[] {
  const { cabinet_type, width, height, depth, material } = spec;
  const panels: Omit<PanelListItem, 'id' | 'cabinet_spec_id' | 'sort_order'>[] = [];
  const panelThickness = 18; // 18mm standard

  if (cabinet_type === 'base_cabinet' || cabinet_type === 'drawer_unit') {
    // Side panels (2x)
    panels.push({ panel_name: 'Side Panel', length: height, width: depth, quantity: 2, material, edge_top: true, edge_bottom: false, edge_left: false, edge_right: false, grain_direction: 'length', notes: null });
    // Bottom
    panels.push({ panel_name: 'Bottom', length: width - panelThickness * 2, width: depth, quantity: 1, material, edge_top: false, edge_bottom: false, edge_left: false, edge_right: false, grain_direction: 'length', notes: null });
    // Back panel (usually thinner)
    panels.push({ panel_name: 'Back Panel', length: width - panelThickness * 2, width: height - panelThickness, quantity: 1, material: 'mdf_raw', edge_top: false, edge_bottom: false, edge_left: false, edge_right: false, grain_direction: 'none', notes: '3mm or 8mm' });
    // Shelf
    panels.push({ panel_name: 'Shelf', length: width - panelThickness * 2, width: depth - 20, quantity: 1, material, edge_top: true, edge_bottom: false, edge_left: false, edge_right: false, grain_direction: 'length', notes: null });
  } else if (cabinet_type === 'wall_cabinet') {
    panels.push({ panel_name: 'Side Panel', length: height, width: depth, quantity: 2, material, edge_top: false, edge_bottom: true, edge_left: false, edge_right: false, grain_direction: 'length', notes: null });
    panels.push({ panel_name: 'Top', length: width - panelThickness * 2, width: depth, quantity: 1, material, edge_top: false, edge_bottom: false, edge_left: false, edge_right: false, grain_direction: 'length', notes: null });
    panels.push({ panel_name: 'Bottom', length: width - panelThickness * 2, width: depth, quantity: 1, material, edge_top: true, edge_bottom: false, edge_left: false, edge_right: false, grain_direction: 'length', notes: null });
    panels.push({ panel_name: 'Back Panel', length: width - panelThickness * 2, width: height - panelThickness * 2, quantity: 1, material: 'mdf_raw', edge_top: false, edge_bottom: false, edge_left: false, edge_right: false, grain_direction: 'none', notes: '3mm' });
    panels.push({ panel_name: 'Shelf', length: width - panelThickness * 2, width: depth - 20, quantity: 1, material, edge_top: true, edge_bottom: false, edge_left: false, edge_right: false, grain_direction: 'length', notes: null });
  } else if (cabinet_type === 'tall_cabinet' || cabinet_type === 'wardrobe') {
    panels.push({ panel_name: 'Side Panel', length: height, width: depth, quantity: 2, material, edge_top: false, edge_bottom: false, edge_left: false, edge_right: true, grain_direction: 'length', notes: null });
    panels.push({ panel_name: 'Top', length: width - panelThickness * 2, width: depth, quantity: 1, material, edge_top: true, edge_bottom: false, edge_left: false, edge_right: false, grain_direction: 'length', notes: null });
    panels.push({ panel_name: 'Bottom', length: width - panelThickness * 2, width: depth, quantity: 1, material, edge_top: true, edge_bottom: false, edge_left: false, edge_right: false, grain_direction: 'length', notes: null });
    panels.push({ panel_name: 'Back Panel', length: width - panelThickness * 2, width: height - panelThickness * 2, quantity: 1, material: 'mdf_raw', edge_top: false, edge_bottom: false, edge_left: false, edge_right: false, grain_direction: 'none', notes: '8mm' });
    panels.push({ panel_name: 'Shelf', length: width - panelThickness * 2, width: depth - 20, quantity: 3, material, edge_top: true, edge_bottom: false, edge_left: false, edge_right: false, grain_direction: 'length', notes: null });
  } else {
    // Generic: sides + top + bottom + back
    panels.push({ panel_name: 'Side Panel', length: height, width: depth, quantity: 2, material, edge_top: true, edge_bottom: false, edge_left: false, edge_right: false, grain_direction: 'length', notes: null });
    panels.push({ panel_name: 'Top/Bottom', length: width - panelThickness * 2, width: depth, quantity: 2, material, edge_top: true, edge_bottom: false, edge_left: false, edge_right: false, grain_direction: 'length', notes: null });
    panels.push({ panel_name: 'Back Panel', length: width, width: height, quantity: 1, material: 'mdf_raw', edge_top: false, edge_bottom: false, edge_left: false, edge_right: false, grain_direction: 'none', notes: null });
  }

  return panels;
}

export default function CabinetSpecsPage() {
  const { id: projectId } = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = createClient();
  const { t } = useLocale();

  const [specs, setSpecs] = useState<(CabinetSpec & { panels?: PanelListItem[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSpec, setExpandedSpec] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  // New cabinet form
  const [cabinetName, setCabinetName] = useState('');
  const [cabinetType, setCabinetType] = useState('base_cabinet');
  const [width, setWidth] = useState('600');
  const [height, setHeight] = useState('720');
  const [depth, setDepth] = useState('560');
  const [material, setMaterial] = useState('melamine_white');
  const [edgeBand, setEdgeBand] = useState('2mm_pvc');

  useEffect(() => { loadSpecs(); }, [projectId]);

  async function loadSpecs() {
    const { data } = await supabase
      .from('cabinet_specs')
      .select('*, panels:panel_list(*)')
      .eq('project_id', projectId)
      .order('sort_order');
    setSpecs((data as (CabinetSpec & { panels?: PanelListItem[] })[]) || []);
    setLoading(false);
  }

  async function addCabinet() {
    if (!cabinetName.trim()) return;

    const w = parseFloat(width);
    const h = parseFloat(height);
    const d = parseFloat(depth);

    // Insert cabinet spec
    const { data: newSpec } = await supabase.from('cabinet_specs').insert({
      project_id: projectId,
      cabinet_name: cabinetName.trim(),
      cabinet_type: cabinetType,
      width: w,
      height: h,
      depth: d,
      material,
      edge_band_type: edgeBand,
      sort_order: specs.length,
    }).select().single();

    if (newSpec) {
      // Generate panels
      const panels = generatePanels({ cabinet_type: cabinetType, width: w, height: h, depth: d, material });
      const panelInserts = panels.map((p, i) => ({
        cabinet_spec_id: newSpec.id,
        ...p,
        sort_order: i,
      }));

      if (panelInserts.length > 0) {
        await supabase.from('panel_list').insert(panelInserts);
      }
    }

    setShowNew(false);
    setCabinetName('');
    loadSpecs();
  }

  async function deleteCabinet(specId: string) {
    if (!confirm('Delete this cabinet and all its panels?')) return;
    await supabase.from('cabinet_specs').delete().eq('id', specId);
    loadSpecs();
  }

  // Calculate totals
  const totalPanels = specs.reduce((sum, s) => sum + (s.panels?.reduce((ps, p) => ps + p.quantity, 0) || 0), 0);
  const totalArea = specs.reduce((sum, s) => {
    return sum + (s.panels?.reduce((ps, p) => ps + (p.length * p.width * p.quantity / 1_000_000), 0) || 0);
  }, 0);
  const totalEdgeBand = specs.reduce((sum, s) => {
    return sum + (s.panels?.reduce((ps, p) => {
      let edge = 0;
      if (p.edge_top) edge += p.length * p.quantity;
      if (p.edge_bottom) edge += p.length * p.quantity;
      if (p.edge_left) edge += p.width * p.quantity;
      if (p.edge_right) edge += p.width * p.quantity;
      return ps + edge;
    }, 0) || 0);
  }, 0);

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(`/projects/${projectId}`)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#1a1a2e]">{t('cabinets.title')}</h1>
          <p className="text-sm text-[#64648B]">{specs.length} cabinets</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => window.open(`/api/export/panels-csv?project_id=${projectId}`, '_blank')}>
          <Download size={14} /> CSV
        </Button>
        <Button size="sm" onClick={() => setShowNew(true)}>
          <Plus size={14} /> {t('common.add')}
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold text-[#1a1a2e]">{totalPanels}</p>
          <p className="text-xs text-[#64648B]">{t('cabinets.total_panels')}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold text-[#1a1a2e]">{totalArea.toFixed(2)}</p>
          <p className="text-xs text-[#64648B]">{t('cabinets.material_area')}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold text-[#1a1a2e]">{(totalEdgeBand / 1000).toFixed(1)}</p>
          <p className="text-xs text-[#64648B]">{t('cabinets.edge_band')}</p>
        </Card>
      </div>

      {/* New Cabinet Form */}
      {showNew && (
        <Card className="border-blue-200">
          <CardContent>
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">{t('cabinets.add_cabinet')}</h3>
              <Input label="Cabinet Name" placeholder="e.g. Base Cabinet 1" value={cabinetName} onChange={(e) => setCabinetName(e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                  <select value={cabinetType} onChange={(e) => setCabinetType(e.target.value)}
                    className="w-full border border-[#E8E5E0] rounded-xl px-3 py-2 text-sm">
                    {CABINET_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('cabinets.material')}</label>
                  <select value={material} onChange={(e) => setMaterial(e.target.value)}
                    className="w-full border border-[#E8E5E0] rounded-xl px-3 py-2 text-sm">
                    {MATERIAL_OPTIONS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input label={`${t('cabinets.width')} (mm)`} type="number" value={width} onChange={(e) => setWidth(e.target.value)} />
                <Input label={`${t('cabinets.height')} (mm)`} type="number" value={height} onChange={(e) => setHeight(e.target.value)} />
                <Input label={`${t('cabinets.depth')} (mm)`} type="number" value={depth} onChange={(e) => setDepth(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('cabinets.edge_band')}</label>
                <select value={edgeBand} onChange={(e) => setEdgeBand(e.target.value)}
                  className="w-full border border-[#E8E5E0] rounded-xl px-3 py-2 text-sm">
                  {EDGE_BAND_OPTIONS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setShowNew(false)}>{t('common.cancel')}</Button>
                <Button className="flex-1" onClick={addCabinet}>{t('cabinets.add_cabinet')}</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cabinet List */}
      {specs.map(spec => (
        <Card key={spec.id}>
          <div
            className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
            onClick={() => setExpandedSpec(expandedSpec === spec.id ? null : spec.id)}
          >
            <div className="flex items-center gap-3">
              <Ruler size={18} className="text-[#C9956B]" />
              <div>
                <p className="text-sm font-semibold text-[#1a1a2e]">{spec.cabinet_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <StatusBadge status={spec.cabinet_type} />
                  <span className="text-xs text-[#64648B]">{spec.width} x {spec.height} x {spec.depth} mm</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#64648B]">{spec.panels?.length || 0} panels</span>
              {expandedSpec === spec.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>

          {expandedSpec === spec.id && (
            <CardContent className="border-t border-[#F0EDE8]">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-[#64648B] mb-2">
                  <span>Material: {MATERIAL_OPTIONS.find(m => m.key === spec.material)?.label || spec.material}</span>
                  <button onClick={() => deleteCabinet(spec.id)} className="text-red-500 hover:text-red-700">
                    <Trash2 size={14} />
                  </button>
                </div>
                {/* Panel table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 px-1 font-medium text-[#64648B]">Panel</th>
                        <th className="text-right py-2 px-1 font-medium text-[#64648B]">L</th>
                        <th className="text-right py-2 px-1 font-medium text-[#64648B]">W</th>
                        <th className="text-right py-2 px-1 font-medium text-[#64648B]">Qty</th>
                        <th className="text-center py-2 px-1 font-medium text-[#64648B]">Edge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {spec.panels?.map(panel => (
                        <tr key={panel.id} className="border-b border-gray-50">
                          <td className="py-1.5 px-1">{panel.panel_name}</td>
                          <td className="py-1.5 px-1 text-right">{panel.length}</td>
                          <td className="py-1.5 px-1 text-right">{panel.width}</td>
                          <td className="py-1.5 px-1 text-right font-medium">{panel.quantity}</td>
                          <td className="py-1.5 px-1 text-center">
                            {[panel.edge_top && 'T', panel.edge_bottom && 'B', panel.edge_left && 'L', panel.edge_right && 'R']
                              .filter(Boolean).join('') || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      ))}

      {specs.length === 0 && !showNew && (
        <div className="text-center py-12">
          <Ruler size={48} className="mx-auto text-[#E8E5E0] mb-3" />
          <p className="text-[#64648B]">{t('common.no_results')}</p>
          <Button variant="secondary" className="mt-3" onClick={() => setShowNew(true)}>
            <Plus size={14} /> {t('cabinets.add_cabinet')}
          </Button>
        </div>
      )}
    </div>
      </RoleGuard>
  );
}
