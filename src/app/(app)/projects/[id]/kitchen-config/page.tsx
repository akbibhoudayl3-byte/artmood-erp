'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { RoleGuard } from '@/components/auth/RoleGuard';
import ProjectMfgTabs from '@/components/projects/ProjectMfgTabs';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  ArrowLeft, ChefHat, Loader2, AlertCircle, CheckCircle,
  Plus, Minus, X, Trash2, Sparkles, FileText, DollarSign,
  LayoutGrid, Paintbrush, Wrench, Settings2, ChevronDown,
} from 'lucide-react';
import {
  getMaterialPresets,
  getHardwarePresets,
  getLayoutTemplates,
  getKitchenConfig,
  saveKitchenConfig,
  generateKitchen,
} from '@/lib/services/kitchen-engine.service';
import type {
  CabinetMaterialPreset,
  CabinetHardwarePreset,
  KitchenLayoutTemplate,
  KitchenConfiguration,
  KitchenConfigModule,
  OpeningSystem,
  ModuleSlot,
} from '@/types/finance';

// ── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  reference_code: string;
  client_name: string;
  project_type: string;
}

interface CatalogModule {
  id: string;
  code: string;
  name: string;
  category: string;
  width_mm: number | null;
  height_mm: number | null;
  depth_mm: number | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const LAYOUT_ICONS: Record<string, string> = {
  I: '━━━━',
  L: '━━━┓',
  U: '┏━━━┓',
  parallel: '━━━━\n━━━━',
  island: '━◻━',
};

const OPENING_SYSTEMS: { value: OpeningSystem; label: string; desc: string }[] = [
  { value: 'handle', label: 'Poignées', desc: 'Poignées classiques (barre, bouton, shell)' },
  { value: 'gola', label: 'Profil Gola', desc: 'Profil aluminium intégré — design épuré' },
  { value: 'push_open', label: 'Push-Open', desc: 'Ouverture par pression — sans poignée' },
];

const CATEGORY_LABELS: Record<string, string> = {
  base_cabinet: 'Bas',
  wall_cabinet: 'Haut',
  tall_cabinet: 'Colonne',
};

const CATEGORY_COLORS: Record<string, string> = {
  base_cabinet: 'bg-blue-100 text-blue-700',
  wall_cabinet: 'bg-purple-100 text-purple-700',
  tall_cabinet: 'bg-indigo-100 text-indigo-700',
};

// ── Slot Editor ──────────────────────────────────────────────────────────────

interface SlotEditorProps {
  slot: ModuleSlot;
  assigned: KitchenConfigModule | undefined;
  catalog: CatalogModule[];
  onAssign: (module: KitchenConfigModule) => void;
  onRemove: () => void;
  onUpdateDim: (field: string, value: number | null) => void;
}

function SlotEditor({ slot, assigned, catalog, onAssign, onRemove, onUpdateDim }: SlotEditorProps) {
  const [showPicker, setShowPicker] = useState(false);
  const filtered = catalog.filter(m => m.category === slot.category);

  return (
    <div className={`border rounded-xl p-3 ${assigned ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[slot.category] || 'bg-gray-100 text-gray-600'}`}>
            {CATEGORY_LABELS[slot.category] || slot.category}
          </span>
          <span className="text-sm font-medium text-gray-700">{slot.label}</span>
        </div>
        {assigned && (
          <button onClick={onRemove} className="text-red-400 hover:text-red-600 p-1">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {assigned ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-gray-500">{assigned.module_code}</span>
            <span className="text-sm font-medium text-gray-900">{assigned.module_name}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] text-gray-500">L (mm)</label>
              <input
                type="number"
                className="w-full text-xs border border-gray-200 rounded px-2 py-1"
                value={assigned.custom_width_mm ?? ''}
                onChange={e => onUpdateDim('custom_width_mm', e.target.value ? Number(e.target.value) : null)}
                placeholder={String(catalog.find(c => c.id === assigned.module_id)?.width_mm || '')}
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500">H (mm)</label>
              <input
                type="number"
                className="w-full text-xs border border-gray-200 rounded px-2 py-1"
                value={assigned.custom_height_mm ?? ''}
                onChange={e => onUpdateDim('custom_height_mm', e.target.value ? Number(e.target.value) : null)}
                placeholder={String(catalog.find(c => c.id === assigned.module_id)?.height_mm || '')}
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500">P (mm)</label>
              <input
                type="number"
                className="w-full text-xs border border-gray-200 rounded px-2 py-1"
                value={assigned.custom_depth_mm ?? ''}
                onChange={e => onUpdateDim('custom_depth_mm', e.target.value ? Number(e.target.value) : null)}
                placeholder={String(catalog.find(c => c.id === assigned.module_id)?.depth_mm || '')}
              />
            </div>
          </div>
        </div>
      ) : (
        <div>
          {showPicker ? (
            <div className="space-y-1">
              {filtered.map(m => (
                <button
                  key={m.id}
                  onClick={() => {
                    onAssign({
                      slot_position: slot.position,
                      slot_label: slot.label,
                      module_id: m.id,
                      module_code: m.code,
                      module_name: m.name,
                      quantity: 1,
                      custom_width_mm: null,
                      custom_height_mm: null,
                      custom_depth_mm: null,
                    });
                    setShowPicker(false);
                  }}
                  className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-50 transition-colors text-sm"
                >
                  <span className="font-mono text-xs text-gray-400">{m.code}</span>
                  <span className="text-gray-800">{m.name}</span>
                  <span className="text-xs text-gray-400 ml-auto">{m.width_mm}×{m.height_mm}×{m.depth_mm}</span>
                </button>
              ))}
              <button onClick={() => setShowPicker(false)} className="text-xs text-gray-400 hover:text-gray-600 mt-1">
                Annuler
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowPicker(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-gray-400 hover:text-blue-600 hover:bg-blue-50/50 rounded-lg border border-dashed border-gray-200 transition-colors"
            >
              <Plus size={14} /> Choisir un module
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

function KitchenConfigPage() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const { profile } = useAuth();

  // Data state
  const [project, setProject] = useState<Project | null>(null);
  const [materialPresets, setMaterialPresets] = useState<CabinetMaterialPreset[]>([]);
  const [hardwarePresets, setHardwarePresets] = useState<CabinetHardwarePreset[]>([]);
  const [layoutTemplates, setLayoutTemplates] = useState<KitchenLayoutTemplate[]>([]);
  const [catalog, setCatalog] = useState<CatalogModule[]>([]);
  const [existingConfig, setExistingConfig] = useState<KitchenConfiguration | null>(null);

  // Form state
  const [selectedLayout, setSelectedLayout] = useState<string | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<string | null>(null);
  const [selectedHardware, setSelectedHardware] = useState<string | null>(null);
  const [openingSystem, setOpeningSystem] = useState<OpeningSystem>('handle');
  const [wallLength, setWallLength] = useState('');
  const [wallLengthB, setWallLengthB] = useState('');
  const [ceilingHeight, setCeilingHeight] = useState('2700');
  const [notes, setNotes] = useState('');
  const [slotModules, setSlotModules] = useState<Record<number, KitchenConfigModule>>({});

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [projRes, matRes, hwRes, layoutRes, catRes, configRes] = await Promise.all([
        supabase.from('projects').select('id, reference_code, client_name, project_type').eq('id', id).single(),
        getMaterialPresets(),
        getHardwarePresets(),
        getLayoutTemplates(),
        supabase.from('product_modules').select('id, code, name, category, width_mm, height_mm, depth_mm').eq('is_active', true).order('category').order('code'),
        getKitchenConfig(id as string),
      ]);

      if (projRes.error) throw new Error(projRes.error.message);
      setProject(projRes.data as Project);
      setMaterialPresets(matRes.data || []);
      setHardwarePresets(hwRes.data || []);
      setLayoutTemplates(layoutRes.data || []);
      setCatalog((catRes.data || []) as CatalogModule[]);

      // Restore existing config
      if (configRes.data) {
        const cfg = configRes.data;
        setExistingConfig(cfg);
        setSelectedLayout(cfg.layout_template_id || null);
        setSelectedMaterial(cfg.material_preset_id || null);
        setSelectedHardware(cfg.hardware_preset_id || null);
        setOpeningSystem(cfg.opening_system as OpeningSystem);
        setWallLength(cfg.wall_length_mm ? String(cfg.wall_length_mm) : '');
        setWallLengthB(cfg.wall_length_b_mm ? String(cfg.wall_length_b_mm) : '');
        setCeilingHeight(cfg.ceiling_height_mm ? String(cfg.ceiling_height_mm) : '2700');
        setNotes(cfg.notes || '');
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Selected layout details ──
  const currentLayout = layoutTemplates.find(l => l.id === selectedLayout);
  const rawSlots = currentLayout?.default_module_slots;
  const slots: ModuleSlot[] = typeof rawSlots === 'string' ? JSON.parse(rawSlots) : (rawSlots || []);

  // When layout changes, reset slot assignments
  useEffect(() => {
    setSlotModules({});
  }, [selectedLayout]);

  // ── Save config ──
  const handleSave = async () => {
    if (!selectedLayout || !selectedMaterial || !selectedHardware) {
      setError('Veuillez sélectionner le layout, matériau et quincaillerie.');
      return;
    }
    setSaving(true);
    setError(null);
    const result = await saveKitchenConfig({
      project_id: id as string,
      layout_template_id: selectedLayout,
      material_preset_id: selectedMaterial,
      hardware_preset_id: selectedHardware,
      opening_system: openingSystem,
      wall_length_mm: wallLength ? Number(wallLength) : null,
      wall_length_b_mm: wallLengthB ? Number(wallLengthB) : null,
      ceiling_height_mm: ceilingHeight ? Number(ceilingHeight) : null,
      notes: notes || null,
      created_by: profile?.id || '',
    });
    if (result.success) {
      setSuccess('Configuration sauvegardée.');
      setExistingConfig(result.data || null);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(result.error || 'Erreur de sauvegarde');
    }
    setSaving(false);
  };

  // ── Generate kitchen ──
  const handleGenerate = async () => {
    const assignedSlots = Object.values(slotModules);
    if (assignedSlots.length === 0) {
      setError('Veuillez assigner au moins un module aux emplacements.');
      return;
    }
    if (!selectedLayout || !selectedMaterial || !selectedHardware) {
      setError('Veuillez sauvegarder la configuration d\'abord.');
      return;
    }

    setGenerating(true);
    setError(null);
    setSuccess(null);

    // Save config first (including module assignments)
    await saveKitchenConfig({
      project_id: id as string,
      layout_template_id: selectedLayout,
      material_preset_id: selectedMaterial,
      hardware_preset_id: selectedHardware,
      opening_system: openingSystem,
      wall_length_mm: wallLength ? Number(wallLength) : null,
      wall_length_b_mm: wallLengthB ? Number(wallLengthB) : null,
      ceiling_height_mm: ceilingHeight ? Number(ceilingHeight) : null,
      notes: notes || null,
      created_by: profile?.id || '',
      modules: assignedSlots,
    });

    console.log('[kitchen-config] assignedSlots:', assignedSlots.length, assignedSlots.map(s => s.module_code).join(','));

    // Generate
    const result = await generateKitchen(id as string, profile?.id || '', assignedSlots);

    if (result.success && result.data) {
      const d = result.data;
      let msg = `Cuisine générée : ${d.parts_created} pièces, ${d.hardware_items} quincailleries.`;
      if (d.cost_breakdown) {
        msg += ` Coût total: ${d.cost_breakdown.total_cost.toLocaleString()} MAD.`;
      }
      if (d.quote_version) {
        msg += ` Devis v${d.quote_version} créé.`;
      }
      setSuccess(msg);
    } else {
      setError(result.error || 'Erreur de génération');
    }
    setGenerating(false);
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
          <p className="font-semibold text-gray-800">Projet introuvable</p>
          <button onClick={() => router.back()} className="mt-3 text-sm text-blue-600 hover:underline">Retour</button>
        </div>
      </div>
    );
  }

  const selectedMaterialPreset = materialPresets.find(p => p.id === selectedMaterial);
  const selectedHardwarePreset = hardwarePresets.find(p => p.id === selectedHardware);
  const assignedCount = Object.keys(slotModules).length;

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/projects/${id}`)} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate flex items-center gap-2">
              <ChefHat size={18} className="text-orange-500" /> Kitchen Configurator
            </h1>
            <p className="text-xs text-gray-500 truncate">{project.reference_code} — {project.client_name}</p>
          </div>
        </div>
      </div>

      <ProjectMfgTabs projectId={id as string} />

      <div className="p-4 space-y-4">
        {/* Banners */}
        {success && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
            <CheckCircle size={16} className="shrink-0" /> {success}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="shrink-0" /> {error}
            <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
          </div>
        )}

        {existingConfig?.generation_status === 'generated' && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
            <Sparkles size={16} className="shrink-0" />
            Cuisine déjà générée. Vous pouvez re-générer pour mettre à jour les pièces et le devis.
          </div>
        )}

        {/* ── Step 1: Layout ── */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-sm flex items-center gap-1.5">
              <LayoutGrid size={14} /> 1. Layout de cuisine
            </h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {layoutTemplates.map(lt => (
                <button
                  key={lt.id}
                  onClick={() => setSelectedLayout(lt.id)}
                  className={`border rounded-xl p-3 text-left transition-all ${
                    selectedLayout === lt.id
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="text-2xl text-center mb-1 font-mono text-gray-400">
                    {LAYOUT_ICONS[lt.layout_type] || lt.layout_type}
                  </div>
                  <p className="text-sm font-medium text-gray-800">{lt.name}</p>
                  <p className="text-xs text-gray-500">{lt.description}</p>
                  <p className="text-xs text-gray-400 mt-1">{(typeof lt.default_module_slots === 'string' ? JSON.parse(lt.default_module_slots) : (lt.default_module_slots || [])).length} emplacements</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Step 2: Material Preset ── */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-sm flex items-center gap-1.5">
              <Paintbrush size={14} /> 2. Matériaux
            </h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {materialPresets.map(mp => (
                <button
                  key={mp.id}
                  onClick={() => setSelectedMaterial(mp.id)}
                  className={`w-full border rounded-xl p-3 text-left transition-all ${
                    selectedMaterial === mp.id
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-800">{mp.name}</p>
                    <span className="text-xs text-gray-400">{mp.edge_band_type}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{mp.description}</p>
                  <div className="flex gap-3 mt-1.5 text-[10px] text-gray-400">
                    <span>Caisson: {mp.carcass_material} ({mp.carcass_thickness_mm}mm)</span>
                    <span>Façade: {mp.facade_material} ({mp.facade_thickness_mm}mm)</span>
                    <span>Fond: {mp.back_panel_material} ({mp.back_panel_thickness_mm}mm)</span>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Step 3: Hardware Preset ── */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-sm flex items-center gap-1.5">
              <Wrench size={14} /> 3. Quincaillerie
            </h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {hardwarePresets.map(hp => (
                <button
                  key={hp.id}
                  onClick={() => setSelectedHardware(hp.id)}
                  className={`border rounded-xl p-3 text-left transition-all ${
                    selectedHardware === hp.id
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-800">{hp.name}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      hp.tier === 'premium' ? 'bg-yellow-100 text-yellow-700' :
                      hp.tier === 'budget' ? 'bg-gray-100 text-gray-600' :
                      'bg-blue-100 text-blue-700'
                    }`}>{hp.tier}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{hp.description}</p>
                  <div className="mt-2 space-y-0.5 text-[10px] text-gray-400">
                    <p>Charnières: {hp.hinge_unit_price} MAD — Coulisses: {hp.drawer_slide_unit_price} MAD</p>
                    <p>Poignées: {hp.handle_unit_price} MAD</p>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Step 4: Opening System ── */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-sm flex items-center gap-1.5">
              <Settings2 size={14} /> 4. Système d'ouverture
            </h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {OPENING_SYSTEMS.map(os => (
                <button
                  key={os.value}
                  onClick={() => setOpeningSystem(os.value)}
                  className={`border rounded-xl p-3 text-left transition-all ${
                    openingSystem === os.value
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-800">{os.label}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{os.desc}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Step 5: Dimensions ── */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-sm">5. Dimensions (optionnel)</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Mur A (mm)</label>
                <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={wallLength} onChange={e => setWallLength(e.target.value)} placeholder="3600" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Mur B (mm)</label>
                <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={wallLengthB} onChange={e => setWallLengthB(e.target.value)} placeholder="2400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Hauteur plafond</label>
                <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={ceilingHeight} onChange={e => setCeilingHeight(e.target.value)} />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs text-gray-500 mb-1">Notes</label>
              <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes supplémentaires..." />
            </div>
          </CardContent>
        </Card>

        {/* Save config button */}
        <Button variant="secondary" className="w-full" loading={saving} onClick={handleSave}>
          Sauvegarder la configuration
        </Button>

        {/* ── Step 6: Module Slots ── */}
        {currentLayout && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm flex items-center gap-1.5">
                  <LayoutGrid size={14} /> 6. Modules — {currentLayout.name}
                </h2>
                <span className="text-xs text-gray-400">{assignedCount}/{slots.length} assignés</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {slots.map(slot => (
                  <SlotEditor
                    key={slot.position}
                    slot={slot}
                    assigned={slotModules[slot.position]}
                    catalog={catalog}
                    onAssign={(mod) => {
                      setSlotModules(prev => ({ ...prev, [slot.position]: mod }));
                    }}
                    onRemove={() => {
                      setSlotModules(prev => {
                        const next = { ...prev };
                        delete next[slot.position];
                        return next;
                      });
                    }}
                    onUpdateDim={(field, value) => {
                      setSlotModules(prev => ({
                        ...prev,
                        [slot.position]: { ...prev[slot.position], [field]: value },
                      }));
                    }}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Generate Button ── */}
        <Button
          variant="primary"
          className="w-full"
          loading={generating}
          onClick={handleGenerate}
          disabled={assignedCount === 0 || !selectedLayout || !selectedMaterial || !selectedHardware}
        >
          <Sparkles size={16} className="mr-1" />
          Générer Cuisine → Pièces → BOM → Coût → Devis
        </Button>

        {/* Quick links */}
        {existingConfig?.generation_status === 'generated' && (
          <div className="flex gap-2">
            <button
              onClick={() => router.push(`/projects/${id}/parts`)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
            >
              <FileText size={14} /> Voir pièces
            </button>
            <button
              onClick={() => router.push(`/projects/${id}/bom`)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors"
            >
              <DollarSign size={14} /> Voir BOM
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer'] as any[]}>
      <KitchenConfigPage />
    </RoleGuard>
  );
}
