'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import ModuleForm from '@/components/production/ModuleForm';
import PanelTable from '@/components/production/PanelTable';
import AccessorySummary from '@/components/production/AccessorySummary';
import MaterialSummary from '@/components/production/MaterialSummary';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { generatePanels, calculatePanelSummary } from '@/lib/utils/panel-generator';
import { calculateAccessories, aggregateAccessories } from '@/lib/utils/accessory-calculator';
import { calculateMaterialUsage, calculateEdgeBandUsage } from '@/lib/utils/material-calculator';
import type { ProductionSheet, ProductionSheetModule, ProductionSheetPanel } from '@/types/database';
import { ArrowLeft, Plus, Package, Layers, Wrench, BarChart3, CheckCircle, Send, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

export default function ProductionSheetDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = createClient();
  const { t } = useLocale();

  const [sheet, setSheet] = useState<ProductionSheet | null>(null);
  const [modules, setModules] = useState<(ProductionSheetModule & { panels?: ProductionSheetPanel[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModuleForm, setShowModuleForm] = useState(false);
  const [editingModule, setEditingModule] = useState<string | null>(null);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'modules' | 'panels' | 'accessories' | 'materials'>('modules');

  useEffect(() => { loadSheet(); }, [id]);

  async function loadSheet() {
    const [sheetRes, modulesRes] = await Promise.all([
      supabase.from('production_sheets').select('*, project:projects(reference_code, client_name)').eq('id', id).single(),
      supabase.from('production_sheet_modules').select('*, panels:production_sheet_panels(*)').eq('sheet_id', id).order('sort_order'),
    ]);
    setSheet(sheetRes.data as ProductionSheet);
    setModules((modulesRes.data || []) as (ProductionSheetModule & { panels?: ProductionSheetPanel[] })[]);
    setLoading(false);
  }

  async function addModule(data: any) {
    // Generate panels for this module
    const panelSpecs = generatePanels(data);
    const accessorySpecs = calculateAccessories(data);
    const summary = calculatePanelSummary(panelSpecs);

    // Insert module
    const { data: newModule } = await supabase
      .from('production_sheet_modules')
      .insert({
        sheet_id: id,
        module_name: data.module_name,
        module_type: data.module_type,
        width: data.width,
        height: data.height,
        depth: data.depth,
        material: data.material,
        edge_band_type: data.edge_band_type,
        has_back_panel: data.has_back_panel,
        has_doors: data.has_doors,
        door_count: data.door_count,
        has_drawers: data.has_drawers,
        drawer_count: data.drawer_count,
        has_shelves: data.has_shelves,
        shelf_count: data.shelf_count,
        accessories: accessorySpecs,
        notes: data.notes || null,
        sort_order: modules.length,
      })
      .select()
      .single();

    if (newModule) {
      // Insert auto-generated panels
      const panelInserts = panelSpecs.map((p, i) => ({
        sheet_id: id,
        module_id: newModule.id,
        panel_name: p.panel_name,
        length: p.length,
        width: p.width,
        quantity: p.quantity,
        material: p.material,
        edge_top: p.edge_top,
        edge_bottom: p.edge_bottom,
        edge_left: p.edge_left,
        edge_right: p.edge_right,
        grain_direction: p.grain_direction,
        notes: p.notes,
        sort_order: i,
      }));

      if (panelInserts.length > 0) {
        await supabase.from('production_sheet_panels').insert(panelInserts);
      }

      // Insert accessories
      const accInserts = accessorySpecs.map(a => ({
        sheet_id: id,
        module_id: newModule.id,
        accessory_name: a.accessory_name,
        quantity: a.quantity,
        unit: a.unit,
      }));

      if (accInserts.length > 0) {
        await supabase.from('production_sheet_accessories').insert(accInserts);
      }

      // Update sheet totals
      await updateSheetTotals();
    }

    setShowModuleForm(false);
    loadSheet();
  }

  async function deleteModule(moduleId: string) {
    if (!confirm(t('sheets.confirm_delete_module'))) return;
    await supabase.from('production_sheet_modules').delete().eq('id', moduleId);
    await updateSheetTotals();
    loadSheet();
  }

  async function updateSheetTotals() {
    const { data: allPanels } = await supabase
      .from('production_sheet_panels')
      .select('*')
      .eq('sheet_id', id);

    if (allPanels) {
      const summary = calculatePanelSummary(allPanels as any);
      await supabase.from('production_sheets').update({
        total_panels: summary.totalPanels,
        total_area_m2: summary.totalAreaM2,
        total_edge_meters: summary.totalEdgeMeters,
      }).eq('id', id);
    }
  }

  async function submitForApproval() {
    if (modules.length === 0) {
      alert(t('sheets.add_modules_first'));
      return;
    }
    await supabase.from('production_sheets').update({ status: 'pending_approval' }).eq('id', id);
    loadSheet();
  }

  async function approveSheet() {
    await supabase.from('production_sheets').update({
      status: 'approved',
      approved_by: profile?.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id);
    loadSheet();
  }

  async function startProduction() {
    await supabase.from('production_sheets').update({ status: 'in_production' }).eq('id', id);
    loadSheet();
  }

  // Compute all panels and materials
  const allPanels = useMemo(() => modules.flatMap(m => m.panels || []), [modules]);
  const allAccessories = useMemo(() => {
    return aggregateAccessories(modules.map(m => (m.accessories || []) as any));
  }, [modules]);
  const materialUsage = useMemo(() => calculateMaterialUsage(allPanels as any), [allPanels]);
  const edgeBandUsage = useMemo(() => {
    const defaultEdge = modules[0]?.edge_band_type || '2mm_pvc';
    return calculateEdgeBandUsage(allPanels as any, defaultEdge);
  }, [allPanels, modules]);

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;
  if (!sheet) return <div className="text-center py-12"><p>{t('common.not_found')}</p></div>;

  const isDraft = sheet.status === 'draft';
  const canEdit = isDraft && (profile?.role === 'ceo' || profile?.role === 'workshop_manager' || profile?.role === 'designer' || profile?.role === 'commercial_manager');
  const canApprove = sheet.status === 'pending_approval' && (profile?.role === 'ceo' || profile?.role === 'workshop_manager');
  const canStartProduction = sheet.status === 'approved' && (profile?.role === 'ceo' || profile?.role === 'workshop_manager');

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'workshop_manager', 'designer', 'workshop_worker'] as any[]}>
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/production/sheets')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#1a1a2e]">{sheet.sheet_number || t('sheets.draft')}</h1>
          <p className="text-sm text-[#64648B]">{(sheet.project as any)?.reference_code} - {sheet.client_name}</p>
        </div>
        <StatusBadge status={sheet.status} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold text-[#1a1a2e]">{modules.length}</p>
          <p className="text-xs text-[#64648B]">{t('sheets.modules')}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold text-[#1a1a2e]">{sheet.total_panels}</p>
          <p className="text-xs text-[#64648B]">{t('sheets.panels')}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold text-[#1a1a2e]">{sheet.total_area_m2}</p>
          <p className="text-xs text-[#64648B]">m\u00B2</p>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {[
          { key: 'modules', icon: Package, label: t('sheets.modules') },
          { key: 'panels', icon: Layers, label: t('sheets.panels') },
          { key: 'accessories', icon: Wrench, label: t('sheets.accessories') },
          { key: 'materials', icon: BarChart3, label: t('sheets.materials') },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === tab.key ? 'bg-white shadow text-[#1a1a2e]' : 'text-gray-500'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'modules' && (
        <div className="space-y-3">
          {canEdit && !showModuleForm && (
            <Button variant="secondary" className="w-full" onClick={() => setShowModuleForm(true)}>
              <Plus size={14} /> {t('sheets.add_module')}
            </Button>
          )}

          {showModuleForm && (
            <Card className="border-blue-200">
              <CardContent>
                <ModuleForm onSubmit={addModule} onCancel={() => setShowModuleForm(false)} />
              </CardContent>
            </Card>
          )}

          {modules.map(module => (
            <Card key={module.id}>
              <div
                className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedModule(expandedModule === module.id ? null : module.id)}
              >
                <div className="flex items-center gap-3">
                  <Package size={18} className="text-[#C9956B]" />
                  <div>
                    <p className="text-sm font-semibold text-[#1a1a2e]">{module.module_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <StatusBadge status={module.module_type} />
                      <span className="text-xs text-[#64648B]">{module.width} x {module.height} x {module.depth} mm</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#64648B]">{module.panels?.length || 0} {t('sheets.panels')}</span>
                  {expandedModule === module.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>

              {expandedModule === module.id && (
                <CardContent className="border-t border-[#F0EDE8]">
                  <PanelTable panels={module.panels || []} showStation={sheet.status === 'in_production'} />
                  {canEdit && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <button onClick={() => deleteModule(module.id)} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                        <Trash2 size={12} /> {t('sheets.delete_module')}
                      </button>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))}

          {modules.length === 0 && !showModuleForm && (
            <div className="text-center py-12">
              <Package size={48} className="mx-auto text-[#E8E5E0] mb-3" />
              <p className="text-[#64648B]">{t('sheets.no_modules')}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'panels' && (
        <Card>
          <CardContent>
            <PanelTable panels={allPanels} showStation={sheet.status === 'in_production'} />
          </CardContent>
        </Card>
      )}

      {activeTab === 'accessories' && (
        <Card>
          <CardContent>
            <AccessorySummary accessories={allAccessories} />
          </CardContent>
        </Card>
      )}

      {activeTab === 'materials' && (
        <Card>
          <CardContent>
            <MaterialSummary materials={materialUsage} edgeBand={edgeBandUsage} />
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="space-y-2">
        {isDraft && modules.length > 0 && (
          <Button className="w-full" variant="accent" onClick={submitForApproval}>
            <Send size={16} /> {t('sheets.submit_approval')}
          </Button>
        )}
        {canApprove && (
          <Button className="w-full" variant="success" onClick={approveSheet}>
            <CheckCircle size={16} /> {t('sheets.approve')}
          </Button>
        )}
        {canStartProduction && (
          <Button className="w-full" onClick={startProduction}>
            {t('sheets.start_production')}
          </Button>
        )}
      </div>
    </div>
    </RoleGuard>
  );
}
