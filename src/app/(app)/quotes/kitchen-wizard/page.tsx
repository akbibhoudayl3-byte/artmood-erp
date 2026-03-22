'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { RoleGuard } from '@/components/auth/RoleGuard';
import Button from '@/components/ui/Button';
import Card, { CardContent } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Input';
import {
  ChefHat, ChevronRight, ChevronLeft, Check, AlertCircle, CheckCircle,
  X, Loader2, Sparkles, FileText, FolderKanban, RotateCcw,
  Plus, Minus, Trash2, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  getMaterialPresets,
  getHardwarePresets,
  getLayoutTemplates,
  saveKitchenConfig,
  generateKitchen,
} from '@/lib/services/kitchen-engine.service';
import type {
  CabinetMaterialPreset,
  CabinetHardwarePreset,
  KitchenLayoutTemplate,
  KitchenConfigModule,
  OpeningSystem,
  ModuleSlot,
  CostBreakdown,
} from '@/types/finance';

// ── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { key: 'client', label: 'Client', emoji: '👤' },
  { key: 'layout', label: 'Forme', emoji: '📐' },
  { key: 'modules', label: 'Modules', emoji: '🗄️' },
  { key: 'options', label: 'Options', emoji: '🎨' },
  { key: 'customize', label: 'Détails', emoji: '⚙️' },
  { key: 'fillers', label: 'Vérifier', emoji: '📏' },
  { key: 'price', label: 'Prix', emoji: '💰' },
  { key: 'done', label: 'Terminé', emoji: '✅' },
];

// ── Layout display helpers ───────────────────────────────────────────────────

const LAYOUT_SHAPES: Record<string, string> = {
  I: '━━━━━━',
  L: '━━━━┓\n         ┃',
  U: '┏━━━━┓\n┃          ┃',
  parallel: '━━━━━━\n━━━━━━',
  island: '━━◻━━',
};

const LAYOUT_LABELS: Record<string, string> = {
  I: 'Linéaire',
  L: 'En L',
  U: 'En U',
  parallel: 'Parallèle',
  island: 'Îlot',
};

const CATEGORY_LABELS: Record<string, string> = {
  base_cabinet: '🗄️ Bas',
  wall_cabinet: '🔲 Haut',
  tall_cabinet: '🚪 Colonne',
};

const CATEGORY_COLORS: Record<string, string> = {
  base_cabinet: 'bg-blue-50 border-blue-200 text-blue-700',
  wall_cabinet: 'bg-purple-50 border-purple-200 text-purple-700',
  tall_cabinet: 'bg-indigo-50 border-indigo-200 text-indigo-700',
};

const OPENING_OPTIONS: { value: OpeningSystem; label: string; emoji: string; desc: string }[] = [
  { value: 'handle', label: 'Poignées', emoji: '🔘', desc: 'Classique' },
  { value: 'gola', label: 'Gola', emoji: '➖', desc: 'Aluminium épuré' },
  { value: 'push_open', label: 'Push-Open', emoji: '👆', desc: 'Sans poignée' },
];

// ── Types ────────────────────────────────────────────────────────────────────

interface CatalogModule {
  id: string;
  code: string;
  name: string;
  category: string;
  width_mm: number | null;
  height_mm: number | null;
  depth_mm: number | null;
}

interface GenerationResult {
  parts_created: number;
  hardware_items: number;
  cost_breakdown: CostBreakdown | null;
  quote_id: string | null;
  quote_version: number | null;
}

// ── Currency formatter ───────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: 'MAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

// ── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center flex-1">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all duration-300 ${
              i < step
                ? 'bg-emerald-500 text-white shadow-sm'
                : i === step
                ? 'bg-[#1B2A4A] text-white shadow-md scale-110'
                : 'bg-[#E8E5E0] text-[#64648B]'
            }`}
          >
            {i < step ? <Check size={12} /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`flex-1 h-0.5 mx-0.5 transition-colors duration-300 ${
              i < step ? 'bg-emerald-400' : 'bg-[#E8E5E0]'
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main Wizard Component ────────────────────────────────────────────────────

function KitchenWizardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { profile } = useAuth();

  // ── Wizard state ──
  const [step, setStep] = useState(0);

  // ── Data loaded from DB ──
  const [layoutTemplates, setLayoutTemplates] = useState<KitchenLayoutTemplate[]>([]);
  const [materialPresets, setMaterialPresets] = useState<CabinetMaterialPreset[]>([]);
  const [hardwarePresets, setHardwarePresets] = useState<CabinetHardwarePreset[]>([]);
  const [catalog, setCatalog] = useState<CatalogModule[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  // ── Step 1: Client ──
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientCity, setClientCity] = useState('');
  const [projectNotes, setProjectNotes] = useState('');

  // ── Step 2: Layout ──
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);
  const [wallA, setWallA] = useState('');
  const [wallB, setWallB] = useState('');
  const [ceilingH, setCeilingH] = useState('2700');

  // ── Step 3+5: Modules ──
  const [slotModules, setSlotModules] = useState<Record<number, KitchenConfigModule>>({});
  const [showCustomize, setShowCustomize] = useState(false);

  // ── Step 4: Options ──
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [selectedHardwareId, setSelectedHardwareId] = useState<string | null>(null);
  const [openingSystem, setOpeningSystem] = useState<OpeningSystem>('handle');

  // ── Step 7: Generated result ──
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  // ── UI state ──
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── Load presets from DB ──
  const loadPresets = useCallback(async () => {
    setLoading(true);
    try {
      const [matRes, hwRes, layoutRes, catRes] = await Promise.all([
        getMaterialPresets(),
        getHardwarePresets(),
        getLayoutTemplates(),
        supabase
          .from('product_modules')
          .select('id, code, name, category, width_mm, height_mm, depth_mm')
          .eq('is_active', true)
          .order('category')
          .order('code'),
      ]);

      setMaterialPresets(matRes.data || []);
      setHardwarePresets(hwRes.data || []);
      setLayoutTemplates(layoutRes.data || []);
      setCatalog((catRes.data || []) as CatalogModule[]);
      setDataLoaded(true);
    } catch (e: any) {
      setError('Erreur de chargement: ' + e.message);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadPresets(); }, [loadPresets]);

  // ── Derived state ──
  const currentLayout = layoutTemplates.find(l => l.id === selectedLayoutId);
  const rawSlots = currentLayout?.default_module_slots;
  const slots: ModuleSlot[] = typeof rawSlots === 'string' ? JSON.parse(rawSlots) : (rawSlots || []);
  const needsWallB = currentLayout && ['L', 'U', 'parallel'].includes(currentLayout.layout_type);
  const selectedMaterial = materialPresets.find(p => p.id === selectedMaterialId);
  const selectedHardware = hardwarePresets.find(p => p.id === selectedHardwareId);

  // ── Auto-assign modules when layout changes ──
  useEffect(() => {
    if (!currentLayout || catalog.length === 0) return;

    const autoAssigned: Record<number, KitchenConfigModule> = {};
    for (const slot of slots) {
      const match = catalog.find(m => m.category === slot.category);
      if (match) {
        autoAssigned[slot.position] = {
          slot_position: slot.position,
          slot_label: slot.label,
          module_id: match.id,
          module_code: match.code,
          module_name: match.name,
          quantity: 1,
          custom_width_mm: null,
          custom_height_mm: null,
          custom_depth_mm: null,
        };
      }
    }
    setSlotModules(autoAssigned);
  }, [selectedLayoutId, catalog.length]);

  // ── Filler calculations ──
  const totalModuleWidth = Object.values(slotModules).reduce((sum, m) => {
    const catMod = catalog.find(c => c.id === m.module_id);
    return sum + (m.custom_width_mm ?? catMod?.width_mm ?? 600) * (m.quantity || 1);
  }, 0);
  const wallAmm = wallA ? Number(wallA) : 0;
  const gap = wallAmm > 0 ? wallAmm - totalModuleWidth : 0;

  // ── Validation per step ──
  function canProceed(): boolean {
    switch (step) {
      case 0: return clientName.trim().length >= 2 && clientPhone.trim().length >= 5;
      case 1: return !!selectedLayoutId;
      case 2: return Object.keys(slotModules).length > 0;
      case 3: return !!selectedMaterialId && !!selectedHardwareId;
      case 4: return true; // customize is optional
      case 5: return true; // filler warnings are advisory
      default: return true;
    }
  }

  // ── Create project (Step 1 → 2 transition) ──
  async function createProject(): Promise<string | null> {
    if (projectId) return projectId; // already created

    const refCode = 'KC-' + Date.now().toString(36).toUpperCase();
    const { data, error: err } = await supabase
      .from('projects')
      .insert({
        reference_code: refCode,
        client_name: clientName.trim(),
        client_phone: clientPhone.trim(),
        client_email: clientEmail.trim() || null,
        city: clientCity.trim() || null,
        status: 'measurements',
        priority: 'normal',
        project_type: 'kitchen',
        notes: projectNotes.trim() || null,
        created_by: profile?.id,
      })
      .select('id')
      .single();

    if (err) {
      setError('Erreur création projet: ' + err.message);
      return null;
    }
    setProjectId(data.id);
    return data.id;
  }

  // ── Handle "Next" button ──
  async function handleNext() {
    setError(null);
    setSuccess(null);

    if (!canProceed()) {
      if (step === 0) setError('Nom du client et téléphone requis.');
      if (step === 1) setError('Choisissez une forme de cuisine.');
      if (step === 2) setError('Au moins un module requis.');
      if (step === 3) setError('Choisissez matériaux et quincaillerie.');
      return;
    }

    // Step 0 → 1: Create project
    if (step === 0) {
      setSaving(true);
      const pid = await createProject();
      setSaving(false);
      if (!pid) return;
    }

    // Step 5 → 6: Save config + Generate kitchen
    if (step === 5) {
      if (!projectId) { setError('Projet non créé.'); return; }

      setSaving(true);
      setError(null);

      // Save kitchen config
      const assignedSlots = Object.values(slotModules);
      const saveRes = await saveKitchenConfig({
        project_id: projectId,
        layout_template_id: selectedLayoutId,
        material_preset_id: selectedMaterialId,
        hardware_preset_id: selectedHardwareId,
        opening_system: openingSystem,
        wall_length_mm: wallA ? Number(wallA) : null,
        wall_length_b_mm: wallB ? Number(wallB) : null,
        ceiling_height_mm: ceilingH ? Number(ceilingH) : null,
        notes: projectNotes || null,
        created_by: profile?.id || '',
        modules: assignedSlots,
      });

      if (!saveRes.success) {
        setError(saveRes.error || 'Erreur de sauvegarde config.');
        setSaving(false);
        return;
      }

      // Generate full kitchen → parts → BOM → cost → quote
      const genRes = await generateKitchen(projectId, profile?.id || '', assignedSlots);

      if (!genRes.success || !genRes.data) {
        setError(genRes.error || 'Erreur de génération. Vérifiez les modules.');
        setSaving(false);
        return;
      }

      setGenerationResult(genRes.data);
      setSaving(false);
    }

    setStep(s => s + 1);
  }

  function handleBack() {
    setError(null);
    setSuccess(null);
    setStep(s => Math.max(0, s - 1));
  }

  function handleReset() {
    setStep(0);
    setClientName('');
    setClientPhone('');
    setClientEmail('');
    setClientCity('');
    setProjectNotes('');
    setSelectedLayoutId(null);
    setWallA('');
    setWallB('');
    setCeilingH('2700');
    setSlotModules({});
    setSelectedMaterialId(null);
    setSelectedHardwareId(null);
    setOpeningSystem('handle');
    setGenerationResult(null);
    setProjectId(null);
    setShowCustomize(false);
    setError(null);
    setSuccess(null);
  }

  // ── Module slot helpers ──
  function assignModule(slotPos: number, slot: ModuleSlot, mod: CatalogModule) {
    setSlotModules(prev => ({
      ...prev,
      [slotPos]: {
        slot_position: slotPos,
        slot_label: slot.label,
        module_id: mod.id,
        module_code: mod.code,
        module_name: mod.name,
        quantity: 1,
        custom_width_mm: null,
        custom_height_mm: null,
        custom_depth_mm: null,
      },
    }));
  }

  function removeModule(slotPos: number) {
    setSlotModules(prev => {
      const next = { ...prev };
      delete next[slotPos];
      return next;
    });
  }

  function updateModuleDim(slotPos: number, field: string, value: number | null) {
    setSlotModules(prev => ({
      ...prev,
      [slotPos]: { ...prev[slotPos], [field]: value },
    }));
  }

  // ── Loading screen ──
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F3F0] flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin text-[#C9956B] mx-auto mb-3" />
          <p className="text-sm text-[#64648B]">Chargement du configurateur...</p>
        </div>
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="min-h-screen bg-[#F5F3F0]">
      {/* Header */}
      <div className="bg-white border-b border-[#E8E5E0] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#C9956B] to-[#B8845A] flex items-center justify-center shadow-sm">
            <ChefHat size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-[#1a1a2e]">Nouvelle Cuisine</h1>
            <p className="text-xs text-[#64648B]">{STEPS[step].emoji} {STEPS[step].label}</p>
          </div>
          {step > 0 && step < 7 && (
            <span className="text-xs text-[#64648B] bg-[#F5F3F0] px-2 py-1 rounded-lg">
              {step + 1}/8
            </span>
          )}
        </div>
      </div>

      {/* Progress */}
      {step < 7 && <ProgressBar step={step} total={8} />}

      {/* Content */}
      <div className="p-4 pb-32 max-w-lg mx-auto space-y-4">
        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="shrink-0" /> {error}
            <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
          </div>
        )}

        {/* Success banner */}
        {success && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
            <CheckCircle size={16} className="shrink-0" /> {success}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* STEP 0: Client + Project Info                            */}
        {/* ══════════════════════════════════════════════════════════ */}
        {step === 0 && (
          <Card>
            <CardContent>
              <div className="space-y-3">
                <div className="text-center mb-4">
                  <span className="text-3xl">👤</span>
                  <h2 className="text-base font-bold text-[#1a1a2e] mt-1">Informations client</h2>
                  <p className="text-xs text-[#64648B]">Qui est le client ?</p>
                </div>
                <Input
                  label="Nom du client *"
                  placeholder="Ex: Mohamed Alami"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                />
                <Input
                  label="Téléphone *"
                  placeholder="+212 6XX XX XX XX"
                  type="tel"
                  value={clientPhone}
                  onChange={e => setClientPhone(e.target.value)}
                />
                <Input
                  label="Email"
                  placeholder="client@email.com"
                  type="email"
                  value={clientEmail}
                  onChange={e => setClientEmail(e.target.value)}
                />
                <Input
                  label="Ville"
                  placeholder="Casablanca"
                  value={clientCity}
                  onChange={e => setClientCity(e.target.value)}
                />
                <Textarea
                  label="Notes"
                  placeholder="Détails du projet..."
                  value={projectNotes}
                  onChange={e => setProjectNotes(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* STEP 1: Layout + Wall Lengths                            */}
        {/* ══════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <>
            <Card>
              <CardContent>
                <div className="text-center mb-4">
                  <span className="text-3xl">📐</span>
                  <h2 className="text-base font-bold text-[#1a1a2e] mt-1">Forme de la cuisine</h2>
                  <p className="text-xs text-[#64648B]">Quelle disposition ?</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {layoutTemplates.map(lt => {
                    const slotCount = (typeof lt.default_module_slots === 'string'
                      ? JSON.parse(lt.default_module_slots)
                      : (lt.default_module_slots || [])
                    ).length;
                    return (
                      <button
                        key={lt.id}
                        onClick={() => setSelectedLayoutId(lt.id)}
                        className={`border-2 rounded-xl p-4 text-center transition-all ${
                          selectedLayoutId === lt.id
                            ? 'border-[#C9956B] bg-[#C9956B]/5 ring-2 ring-[#C9956B]/20'
                            : 'border-[#E8E5E0] hover:border-[#C9956B]/50 bg-white'
                        }`}
                      >
                        <div className="text-xl font-mono text-[#64648B] whitespace-pre mb-2 leading-tight">
                          {LAYOUT_SHAPES[lt.layout_type] || lt.layout_type}
                        </div>
                        <p className="text-sm font-semibold text-[#1a1a2e]">
                          {LAYOUT_LABELS[lt.layout_type] || lt.name}
                        </p>
                        <p className="text-xs text-[#64648B]">{slotCount} modules</p>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {selectedLayoutId && (
              <Card>
                <CardContent>
                  <h3 className="text-sm font-semibold text-[#1a1a2e] mb-3">📏 Dimensions (mm)</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Mur A"
                      type="number"
                      placeholder="3600"
                      value={wallA}
                      onChange={e => setWallA(e.target.value)}
                    />
                    {needsWallB && (
                      <Input
                        label="Mur B"
                        type="number"
                        placeholder="2400"
                        value={wallB}
                        onChange={e => setWallB(e.target.value)}
                      />
                    )}
                    <Input
                      label="Hauteur plafond"
                      type="number"
                      value={ceilingH}
                      onChange={e => setCeilingH(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* STEP 2: Auto-Generated Modules                           */}
        {/* ══════════════════════════════════════════════════════════ */}
        {step === 2 && (
          <Card>
            <CardContent>
              <div className="text-center mb-4">
                <span className="text-3xl">🗄️</span>
                <h2 className="text-base font-bold text-[#1a1a2e] mt-1">Modules proposés</h2>
                <p className="text-xs text-[#64648B]">
                  {Object.keys(slotModules).length} / {slots.length} emplacements remplis
                </p>
              </div>

              <div className="space-y-2">
                {slots.map((slot, i) => {
                  const assigned = slotModules[slot.position];
                  const catMod = assigned ? catalog.find(c => c.id === assigned.module_id) : null;

                  return (
                    <div
                      key={slot.position}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                        assigned
                          ? 'border-emerald-200 bg-emerald-50/50'
                          : 'border-[#E8E5E0] bg-white'
                      }`}
                    >
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                        CATEGORY_COLORS[slot.category] || 'bg-gray-50 border-gray-200 text-gray-600'
                      }`}>
                        {CATEGORY_LABELS[slot.category] || slot.category}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1a1a2e] truncate">
                          {slot.label}
                        </p>
                        {assigned && catMod && (
                          <p className="text-xs text-[#64648B]">
                            {assigned.module_name} — {catMod.width_mm}×{catMod.height_mm}mm
                          </p>
                        )}
                      </div>
                      {assigned ? (
                        <Check size={16} className="text-emerald-500 shrink-0" />
                      ) : (
                        <span className="text-xs text-[#64648B]">Vide</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {Object.keys(slotModules).length > 0 && totalModuleWidth > 0 && (
                <div className="mt-3 pt-3 border-t border-[#E8E5E0]">
                  <p className="text-xs text-[#64648B]">
                    Largeur totale: <span className="font-semibold text-[#1a1a2e]">{totalModuleWidth}mm</span>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* STEP 3: Global Options                                   */}
        {/* ══════════════════════════════════════════════════════════ */}
        {step === 3 && (
          <>
            {/* Materials */}
            <Card>
              <CardContent>
                <div className="text-center mb-3">
                  <span className="text-3xl">🎨</span>
                  <h2 className="text-base font-bold text-[#1a1a2e] mt-1">Matériaux</h2>
                </div>
                <div className="space-y-2">
                  {materialPresets.map(mp => (
                    <button
                      key={mp.id}
                      onClick={() => setSelectedMaterialId(mp.id)}
                      className={`w-full border-2 rounded-xl p-3 text-left transition-all ${
                        selectedMaterialId === mp.id
                          ? 'border-[#C9956B] bg-[#C9956B]/5 ring-2 ring-[#C9956B]/20'
                          : 'border-[#E8E5E0] hover:border-[#C9956B]/50 bg-white'
                      }`}
                    >
                      <p className="text-sm font-semibold text-[#1a1a2e]">{mp.name}</p>
                      <p className="text-xs text-[#64648B] mt-0.5">{mp.description}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Hardware */}
            <Card>
              <CardContent>
                <h3 className="text-sm font-semibold text-[#1a1a2e] mb-3 text-center">🔩 Quincaillerie</h3>
                <div className="grid grid-cols-3 gap-2">
                  {hardwarePresets.map(hp => (
                    <button
                      key={hp.id}
                      onClick={() => setSelectedHardwareId(hp.id)}
                      className={`border-2 rounded-xl p-3 text-center transition-all ${
                        selectedHardwareId === hp.id
                          ? 'border-[#C9956B] bg-[#C9956B]/5 ring-2 ring-[#C9956B]/20'
                          : 'border-[#E8E5E0] hover:border-[#C9956B]/50 bg-white'
                      }`}
                    >
                      <p className="text-sm font-semibold text-[#1a1a2e]">{hp.name}</p>
                      <span className={`inline-block text-[10px] mt-1 px-1.5 py-0.5 rounded-full ${
                        hp.tier === 'premium' ? 'bg-yellow-100 text-yellow-700' :
                        hp.tier === 'budget' ? 'bg-gray-100 text-gray-600' :
                        'bg-blue-100 text-blue-700'
                      }`}>{hp.tier}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Opening system */}
            <Card>
              <CardContent>
                <h3 className="text-sm font-semibold text-[#1a1a2e] mb-3 text-center">🚪 Ouverture</h3>
                <div className="grid grid-cols-3 gap-2">
                  {OPENING_OPTIONS.map(os => (
                    <button
                      key={os.value}
                      onClick={() => setOpeningSystem(os.value)}
                      className={`border-2 rounded-xl p-3 text-center transition-all ${
                        openingSystem === os.value
                          ? 'border-[#C9956B] bg-[#C9956B]/5 ring-2 ring-[#C9956B]/20'
                          : 'border-[#E8E5E0] hover:border-[#C9956B]/50 bg-white'
                      }`}
                    >
                      <div className="text-xl mb-1">{os.emoji}</div>
                      <p className="text-sm font-semibold text-[#1a1a2e]">{os.label}</p>
                      <p className="text-[10px] text-[#64648B]">{os.desc}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* STEP 4: Optional Module Customization                    */}
        {/* ══════════════════════════════════════════════════════════ */}
        {step === 4 && (
          <Card>
            <CardContent>
              <div className="text-center mb-4">
                <span className="text-3xl">⚙️</span>
                <h2 className="text-base font-bold text-[#1a1a2e] mt-1">Personnalisation</h2>
                <p className="text-xs text-[#64648B]">Tout est bon ? Ajustez si besoin.</p>
              </div>

              <button
                onClick={() => setShowCustomize(!showCustomize)}
                className="w-full flex items-center justify-between p-3 bg-[#F5F3F0] rounded-xl mb-3 hover:bg-[#E8E5E0] transition-colors"
              >
                <span className="text-sm font-medium text-[#1a1a2e]">
                  {showCustomize ? 'Masquer les détails' : 'Modifier les modules'}
                </span>
                {showCustomize ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showCustomize && (
                <div className="space-y-3">
                  {slots.map(slot => {
                    const assigned = slotModules[slot.position];
                    const filtered = catalog.filter(m => m.category === slot.category);

                    return (
                      <div key={slot.position} className="border border-[#E8E5E0] rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                            CATEGORY_COLORS[slot.category] || 'bg-gray-50 border-gray-200 text-gray-600'
                          }`}>
                            {CATEGORY_LABELS[slot.category] || slot.category} — {slot.label}
                          </span>
                          {assigned && (
                            <button onClick={() => removeModule(slot.position)} className="text-red-400 hover:text-red-600 p-1">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>

                        {/* Module selector */}
                        <select
                          value={assigned?.module_id || ''}
                          onChange={e => {
                            const mod = catalog.find(c => c.id === e.target.value);
                            if (mod) assignModule(slot.position, slot, mod);
                          }}
                          className="w-full px-3 py-2 border border-[#E8E5E0] rounded-xl text-sm bg-white"
                        >
                          <option value="">— Choisir —</option>
                          {filtered.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.code} — {m.name} ({m.width_mm}×{m.height_mm})
                            </option>
                          ))}
                        </select>

                        {/* Custom dimensions */}
                        {assigned && (
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] text-[#64648B]">L (mm)</label>
                              <input
                                type="number"
                                className="w-full text-xs border border-[#E8E5E0] rounded-lg px-2 py-1.5"
                                value={assigned.custom_width_mm ?? ''}
                                onChange={e => updateModuleDim(slot.position, 'custom_width_mm', e.target.value ? Number(e.target.value) : null)}
                                placeholder={String(catalog.find(c => c.id === assigned.module_id)?.width_mm || '')}
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-[#64648B]">H (mm)</label>
                              <input
                                type="number"
                                className="w-full text-xs border border-[#E8E5E0] rounded-lg px-2 py-1.5"
                                value={assigned.custom_height_mm ?? ''}
                                onChange={e => updateModuleDim(slot.position, 'custom_height_mm', e.target.value ? Number(e.target.value) : null)}
                                placeholder={String(catalog.find(c => c.id === assigned.module_id)?.height_mm || '')}
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-[#64648B]">P (mm)</label>
                              <input
                                type="number"
                                className="w-full text-xs border border-[#E8E5E0] rounded-lg px-2 py-1.5"
                                value={assigned.custom_depth_mm ?? ''}
                                onChange={e => updateModuleDim(slot.position, 'custom_depth_mm', e.target.value ? Number(e.target.value) : null)}
                                placeholder={String(catalog.find(c => c.id === assigned.module_id)?.depth_mm || '')}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {!showCustomize && (
                <div className="space-y-1">
                  {Object.values(slotModules).map(m => (
                    <div key={m.slot_position} className="flex items-center gap-2 text-sm text-[#1a1a2e] bg-emerald-50 p-2 rounded-lg">
                      <Check size={14} className="text-emerald-500 shrink-0" />
                      <span className="truncate">{m.slot_label}: {m.module_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* STEP 5: Fillers + Validation                             */}
        {/* ══════════════════════════════════════════════════════════ */}
        {step === 5 && (
          <Card>
            <CardContent>
              <div className="text-center mb-4">
                <span className="text-3xl">📏</span>
                <h2 className="text-base font-bold text-[#1a1a2e] mt-1">Vérification</h2>
                <p className="text-xs text-[#64648B]">Tout est prêt pour générer le devis</p>
              </div>

              {/* Summary */}
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm p-2 bg-[#F5F3F0] rounded-lg">
                  <span className="text-[#64648B]">Client</span>
                  <span className="font-medium text-[#1a1a2e]">{clientName}</span>
                </div>
                <div className="flex justify-between text-sm p-2 bg-[#F5F3F0] rounded-lg">
                  <span className="text-[#64648B]">Layout</span>
                  <span className="font-medium text-[#1a1a2e]">
                    {currentLayout ? (LAYOUT_LABELS[currentLayout.layout_type] || currentLayout.name) : '—'}
                  </span>
                </div>
                <div className="flex justify-between text-sm p-2 bg-[#F5F3F0] rounded-lg">
                  <span className="text-[#64648B]">Modules</span>
                  <span className="font-medium text-[#1a1a2e]">{Object.keys(slotModules).length} modules</span>
                </div>
                <div className="flex justify-between text-sm p-2 bg-[#F5F3F0] rounded-lg">
                  <span className="text-[#64648B]">Matériaux</span>
                  <span className="font-medium text-[#1a1a2e]">{selectedMaterial?.name || '—'}</span>
                </div>
                <div className="flex justify-between text-sm p-2 bg-[#F5F3F0] rounded-lg">
                  <span className="text-[#64648B]">Quincaillerie</span>
                  <span className="font-medium text-[#1a1a2e]">{selectedHardware?.name || '—'} ({selectedHardware?.tier})</span>
                </div>
                <div className="flex justify-between text-sm p-2 bg-[#F5F3F0] rounded-lg">
                  <span className="text-[#64648B]">Ouverture</span>
                  <span className="font-medium text-[#1a1a2e]">
                    {OPENING_OPTIONS.find(o => o.value === openingSystem)?.label}
                  </span>
                </div>
              </div>

              {/* Filler gap check */}
              {wallAmm > 0 && (
                <div className={`p-3 rounded-xl border ${
                  gap === 0
                    ? 'bg-emerald-50 border-emerald-200'
                    : gap > 0 && gap >= 50
                    ? 'bg-amber-50 border-amber-200'
                    : gap > 0 && gap < 50
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    {gap === 0 ? (
                      <CheckCircle size={16} className="text-emerald-500" />
                    ) : gap < 0 ? (
                      <AlertCircle size={16} className="text-red-500" />
                    ) : (
                      <AlertCircle size={16} className="text-amber-500" />
                    )}
                    <span className="text-sm font-semibold">
                      {gap === 0
                        ? 'Parfait ! Les modules remplissent le mur.'
                        : gap > 0
                        ? `Espace restant: ${gap}mm`
                        : `Attention: ${Math.abs(gap)}mm de trop !`}
                    </span>
                  </div>
                  {gap > 0 && gap >= 50 && (
                    <p className="text-xs text-[#64648B] ml-6">
                      Ajoutez un panneau de remplissage ({gap}mm) ou ajustez les largeurs.
                    </p>
                  )}
                  {gap > 0 && gap < 50 && (
                    <p className="text-xs text-[#64648B] ml-6">
                      Petit écart — peut être absorbé par les joints.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4 text-center">
                <p className="text-xs text-[#64648B]">
                  Cliquer sur <span className="font-semibold">Générer le devis</span> lance le calcul complet:<br />
                  pièces, quincaillerie, coûts matière, main d'oeuvre, et devis automatique.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* STEP 6: Price Summary                                    */}
        {/* ══════════════════════════════════════════════════════════ */}
        {step === 6 && generationResult && (
          <Card>
            <CardContent>
              <div className="text-center mb-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mx-auto mb-2 shadow-lg">
                  <Sparkles size={28} className="text-white" />
                </div>
                <h2 className="text-lg font-bold text-[#1a1a2e]">Devis généré !</h2>
                {generationResult.quote_version && (
                  <p className="text-xs text-[#64648B]">Version {generationResult.quote_version}</p>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">{generationResult.parts_created}</p>
                  <p className="text-xs text-blue-600">Pièces</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-purple-700">{generationResult.hardware_items}</p>
                  <p className="text-xs text-purple-600">Quincailleries</p>
                </div>
              </div>

              {/* Cost breakdown */}
              {generationResult.cost_breakdown && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-[#1a1a2e]">Détail des coûts</h3>

                  {[
                    { label: 'Matériaux (MDF, stratifié, etc.)', value: generationResult.cost_breakdown.material_cost },
                    { label: 'Quincaillerie (charnières, coulisses)', value: generationResult.cost_breakdown.hardware_cost },
                    { label: 'Main d\'oeuvre', value: generationResult.cost_breakdown.labor_cost },
                    { label: 'Usinage CNC', value: generationResult.cost_breakdown.machine_cost },
                    { label: 'Transport', value: generationResult.cost_breakdown.transport_cost },
                  ].filter(r => r.value > 0).map((row, i) => (
                    <div key={i} className="flex justify-between text-sm p-2 bg-[#F5F3F0] rounded-lg">
                      <span className="text-[#64648B]">{row.label}</span>
                      <span className="font-medium text-[#1a1a2e]">{fmt(row.value)}</span>
                    </div>
                  ))}

                  <div className="flex justify-between text-sm p-3 bg-[#1B2A4A] rounded-xl mt-2">
                    <span className="text-white/70">Coût de revient</span>
                    <span className="font-bold text-white">{fmt(generationResult.cost_breakdown.total_cost)}</span>
                  </div>

                  {generationResult.cost_breakdown.recommended_margin_percent > 0 && (
                    <div className="flex justify-between text-sm p-3 bg-gradient-to-r from-[#C9956B] to-[#B8845A] rounded-xl">
                      <span className="text-white/80">Prix client (marge {generationResult.cost_breakdown.recommended_margin_percent}%)</span>
                      <span className="font-bold text-white text-lg">
                        {fmt(
                          generationResult.cost_breakdown.total_cost /
                          (1 - generationResult.cost_breakdown.recommended_margin_percent / 100)
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* STEP 7: Final Actions                                    */}
        {/* ══════════════════════════════════════════════════════════ */}
        {step === 7 && (
          <Card>
            <CardContent>
              <div className="text-center mb-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-lg">
                  <Check size={36} className="text-white" />
                </div>
                <h2 className="text-xl font-bold text-[#1a1a2e]">Cuisine créée !</h2>
                <p className="text-sm text-[#64648B] mt-1">
                  {clientName} — {currentLayout ? (LAYOUT_LABELS[currentLayout.layout_type] || currentLayout.name) : ''}
                </p>
                {generationResult && (
                  <p className="text-xs text-[#64648B] mt-1">
                    {generationResult.parts_created} pièces • {generationResult.hardware_items} quincailleries
                    {generationResult.cost_breakdown ? ` • ${fmt(generationResult.cost_breakdown.total_cost)} coût` : ''}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                {generationResult?.quote_id && (
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    onClick={() => router.push(`/quotes/${generationResult.quote_id}`)}
                  >
                    <FileText size={18} /> Voir le devis
                  </Button>
                )}

                {projectId && (
                  <Button
                    variant="secondary"
                    size="lg"
                    fullWidth
                    onClick={() => router.push(`/projects/${projectId}`)}
                  >
                    <FolderKanban size={18} /> Voir le projet
                  </Button>
                )}

                <Button
                  variant="accent"
                  size="lg"
                  fullWidth
                  onClick={handleReset}
                >
                  <RotateCcw size={18} /> Nouvelle cuisine
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* Bottom Navigation Bar                                    */}
      {/* ══════════════════════════════════════════════════════════ */}
      {step < 7 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E8E5E0] px-4 py-3 safe-area-bottom z-50">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            {step > 0 ? (
              <Button variant="ghost" size="lg" onClick={handleBack} disabled={saving}>
                <ChevronLeft size={18} /> Retour
              </Button>
            ) : (
              <div />
            )}

            <Button
              variant={step === 5 ? 'success' : 'primary'}
              size="lg"
              className="flex-1"
              loading={saving}
              onClick={handleNext}
              disabled={!canProceed()}
            >
              {step === 5 ? (
                <>
                  <Sparkles size={18} /> Générer le devis
                </>
              ) : step === 6 ? (
                <>
                  Terminer <ChevronRight size={18} />
                </>
              ) : (
                <>
                  Suivant <ChevronRight size={18} />
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Export with RoleGuard ─────────────────────────────────────────────────────

export default function KitchenWizardWrapper() {
  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager']}>
      <KitchenWizardPage />
    </RoleGuard>
  );
}
