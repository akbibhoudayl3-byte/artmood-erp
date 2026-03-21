'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input, { Select, Textarea } from '@/components/ui/Input';
import { formatMAD, roundMoney } from '@/lib/utils/money';
import { PIPELINE_STEPS, MODULE_TYPE_LABELS, DEFAULT_DIMENSIONS, MARGIN_RULES } from '@/lib/config/kitchen';
import {
  ArrowLeft, ArrowRight, Check, ChefHat, Plus, Trash2,
  AlertTriangle, AlertCircle, CheckCircle, FileText, Save, Send,
} from 'lucide-react';
import type {
  KitchenProject, KitchenWall, KitchenModuleInstance, KitchenFiller,
  ProductModule, ModuleOption, BOMResult, CostBreakdown,
  ValidationResult, FillerSuggestion, ClientType, LayoutType, OpeningSystem,
  FacadeOverride,
} from '@/types/kitchen';

// ── Helpers ──

async function api<T = Record<string, unknown>>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : {});
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Network error' }));
    throw new Error(err.error || 'API error');
  }
  return res.json();
}

// ── Main Component ──

export default function KitchenPipelinePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Data
  const [kitchen, setKitchen] = useState<Partial<KitchenProject>>({
    client_name: '',
    client_type: 'standard',
    kitchen_type: 'modern',
    layout_type: 'I',
    full_height: false,
    opening_system: 'handles',
    structure_material: 'stratifie',
    facade_material: 'mdf_18_uv',
    back_thickness: 5,
    edge_caisson_mm: 0.8,
    edge_facade_mm: 1.0,
  });
  const [kitchenId, setKitchenId] = useState<string | null>(editId);
  const [walls, setWalls] = useState<KitchenWall[]>([]);
  const [wallInputs, setWallInputs] = useState<{ wall_name: string; wall_length_mm: number }[]>([{ wall_name: 'A', wall_length_mm: 3000 }]);
  const [availableModules, setAvailableModules] = useState<(ProductModule & { module_options?: ModuleOption[] })[]>([]);
  const [placedModules, setPlacedModules] = useState<{ wall_id: string; module_id: string; width_mm: number; height_mm: number; depth_mm: number; facade_override: FacadeOverride | null }[]>([]);
  const [savedModules, setSavedModules] = useState<KitchenModuleInstance[]>([]);
  const [fillerSuggestions, setFillerSuggestions] = useState<FillerSuggestion[]>([]);
  const [fillers, setFillers] = useState<KitchenFiller[]>([]);
  const [bom, setBom] = useState<BOMResult | null>(null);
  const [cost, setCost] = useState<CostBreakdown | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  // ── Load existing project ──

  useEffect(() => {
    if (editId) {
      setLoading(true);
      api<{ kitchen: KitchenProject; walls: KitchenWall[]; modules: KitchenModuleInstance[] }>(
        `/api/kitchen/project?id=${editId}`
      ).then(data => {
        setKitchen(data.kitchen);
        setKitchenId(data.kitchen.id);
        setWalls(data.walls);
        setWallInputs(data.walls.map(w => ({ wall_name: w.wall_name, wall_length_mm: w.wall_length_mm })));
        setSavedModules(data.modules);
      }).catch(e => setError(e.message)).finally(() => setLoading(false));
    }
  }, [editId]);

  // Load available modules on mount
  useEffect(() => {
    api<{ modules: ProductModule[] }>('/api/kitchen/modules')
      .then(d => setAvailableModules(d.modules))
      .catch(() => {});
  }, []);

  // ── Step Actions ──

  const saveProject = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<{ kitchen: KitchenProject }>('/api/kitchen/project', {
        ...(kitchenId ? { id: kitchenId } : {}),
        ...kitchen,
      });
      setKitchenId(data.kitchen.id);
      setKitchen(data.kitchen);
      setStep(2);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [kitchen, kitchenId]);

  const saveWalls = useCallback(async () => {
    if (!kitchenId) return;
    setLoading(true);
    setError('');
    try {
      const data = await api<{ walls: KitchenWall[] }>('/api/kitchen/walls', {
        kitchen_id: kitchenId,
        walls: wallInputs,
      });
      setWalls(data.walls);
      // Auto-generate modules
      autoPlaceModules(data.walls);
      setStep(3);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [kitchenId, wallInputs, availableModules]);

  const autoPlaceModules = (savedWalls: KitchenWall[]) => {
    const placed: typeof placedModules = [];
    const base600 = availableModules.find(m => m.code === 'BASE_600');
    const base400 = availableModules.find(m => m.code === 'BASE_400');
    const base300 = availableModules.find(m => m.code === 'BASE_300');
    const sink600 = availableModules.find(m => m.code === 'SINK_600');
    const wall600 = availableModules.find(m => m.code === 'WALL_600');

    for (const wall of savedWalls) {
      let remaining = wall.wall_length_mm;

      // Add a sink to first wall
      if (sink600 && remaining >= 600 && wall === savedWalls[0]) {
        placed.push({
          wall_id: wall.id,
          module_id: sink600.id,
          width_mm: 600,
          height_mm: DEFAULT_DIMENSIONS.sink.height,
          depth_mm: DEFAULT_DIMENSIONS.sink.depth,
          facade_override: null,
        });
        remaining -= 600;
      }

      // Fill rest with base 600
      while (remaining >= 600 && base600) {
        placed.push({
          wall_id: wall.id,
          module_id: base600.id,
          width_mm: 600,
          height_mm: DEFAULT_DIMENSIONS.base.height,
          depth_mm: DEFAULT_DIMENSIONS.base.depth,
          facade_override: null,
        });
        remaining -= 600;
      }

      // Try 400mm then 300mm for leftovers
      if (remaining >= 400 && base400) {
        placed.push({
          wall_id: wall.id, module_id: base400.id,
          width_mm: 400, height_mm: DEFAULT_DIMENSIONS.base.height,
          depth_mm: DEFAULT_DIMENSIONS.base.depth, facade_override: null,
        });
        remaining -= 400;
      } else if (remaining >= 300 && base300) {
        placed.push({
          wall_id: wall.id, module_id: base300.id,
          width_mm: 300, height_mm: DEFAULT_DIMENSIONS.base.height,
          depth_mm: DEFAULT_DIMENSIONS.base.depth, facade_override: null,
        });
        remaining -= 300;
      }

      // Auto-add wall cabinets if full-height mode
      if (kitchen.full_height && wall600) {
        let wallRemaining = wall.wall_length_mm;
        while (wallRemaining >= 600) {
          placed.push({
            wall_id: wall.id,
            module_id: wall600.id,
            width_mm: 600,
            height_mm: DEFAULT_DIMENSIONS.wall.height,
            depth_mm: DEFAULT_DIMENSIONS.wall.depth,
            facade_override: null,
          });
          wallRemaining -= 600;
        }
      }
    }

    setPlacedModules(placed);
  };

  const saveModules = useCallback(async () => {
    if (!kitchenId) return;
    setLoading(true);
    setError('');
    try {
      const data = await api<{ modules: KitchenModuleInstance[] }>('/api/kitchen/place-modules', {
        kitchen_id: kitchenId,
        modules: placedModules,
      });
      setSavedModules(data.modules);
      setStep(4);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [kitchenId, placedModules]);

  const saveOptions = () => setStep(5);

  const saveCustomization = useCallback(async () => {
    if (!kitchenId) { setStep(6); return; }
    // Save facade overrides back to the server
    const modsToSave = savedModules.map(m => ({
      wall_id: m.wall_id,
      module_id: m.module_id,
      width_mm: m.width_mm,
      height_mm: m.height_mm,
      depth_mm: m.depth_mm,
      facade_override: m.facade_override,
    }));
    setLoading(true);
    try {
      const data = await api<{ modules: KitchenModuleInstance[] }>('/api/kitchen/place-modules', {
        kitchen_id: kitchenId,
        modules: modsToSave,
      });
      setSavedModules(data.modules);
      setStep(6);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [kitchenId, savedModules]);

  const [detectionDone, setDetectionDone] = useState(false);
  const [pendingFillers, setPendingFillers] = useState<{ wall_id: string; wall_name: string; gap_mm: number; side: 'left' | 'right' }[]>([]);

  const runDetection = useCallback(async () => {
    if (!kitchenId) return;
    setLoading(true);
    setError('');
    try {
      const data = await api<{ validation: ValidationResult; fillerSuggestions: FillerSuggestion[] }>(
        '/api/kitchen/validate', { kitchen_id: kitchenId }
      );
      setValidation(data.validation);
      setFillerSuggestions(data.fillerSuggestions);

      // Prepare fillers for user confirmation (don't save yet)
      const pf = data.fillerSuggestions
        .filter(s => s.suggestion === 'filler_needed')
        .map(s => ({
          wall_id: s.wall_id,
          wall_name: s.wall_name,
          gap_mm: s.gap_mm,
          side: 'right' as const,
        }));
      setPendingFillers(pf);
      setDetectionDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [kitchenId]);

  const confirmFillers = useCallback(async () => {
    if (!kitchenId) return;
    setLoading(true);
    try {
      const fillersToSave = pendingFillers
        .filter(f => f.gap_mm > 0)
        .map(f => ({
          wall_id: f.wall_id,
          side: f.side,
          width_mm: f.gap_mm,
          height_mm: DEFAULT_DIMENSIONS.base.height,
          depth_mm: DEFAULT_DIMENSIONS.base.depth,
        }));
      if (fillersToSave.length > 0) {
        await api('/api/kitchen/fillers', { kitchen_id: kitchenId, fillers: fillersToSave });
      }
      setStep(7);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [kitchenId, pendingFillers]);

  const computePrice = useCallback(async () => {
    if (!kitchenId) return;
    setLoading(true);
    setError('');
    try {
      const data = await api<{ cost: CostBreakdown; bom: BOMResult }>(
        '/api/kitchen/cost', { kitchen_id: kitchenId }
      );
      setCost(data.cost);
      setBom(data.bom);
      setStep(8);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [kitchenId]);

  const runValidation = useCallback(async () => {
    if (!kitchenId) return;
    setLoading(true);
    try {
      const data = await api<{ validation: ValidationResult }>('/api/kitchen/validate', { kitchen_id: kitchenId });
      setValidation(data.validation);
      setStep(9);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [kitchenId]);

  const saveDraft = useCallback(async () => {
    if (!kitchenId) return;
    setLoading(true);
    try {
      await api('/api/kitchen/project', { id: kitchenId, ...kitchen, status: 'draft' });
      router.push('/kitchen');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [kitchenId, kitchen, router]);

  const markValidated = useCallback(async () => {
    if (!kitchenId) return;
    setLoading(true);
    try {
      await api('/api/kitchen/project', { id: kitchenId, ...kitchen, status: 'validated' });
      router.push('/kitchen');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [kitchenId, kitchen, router]);

  // ── Module Manipulation ──

  const addModule = (wallId: string, moduleId: string) => {
    const mod = availableModules.find(m => m.id === moduleId);
    if (!mod) return;
    const dims = DEFAULT_DIMENSIONS[mod.type] ?? DEFAULT_DIMENSIONS.base;
    setPlacedModules(prev => [...prev, {
      wall_id: wallId,
      module_id: moduleId,
      width_mm: mod.default_width,
      height_mm: dims.height,
      depth_mm: dims.depth,
      facade_override: null,
    }]);
  };

  const removeModule = (index: number) => {
    setPlacedModules(prev => prev.filter((_, i) => i !== index));
  };

  const updateModuleWidth = (index: number, width: number) => {
    setPlacedModules(prev => prev.map((m, i) => i === index ? { ...m, width_mm: width } : m));
  };

  const updateModuleFacade = (index: number, facade: FacadeOverride | null) => {
    setPlacedModules(prev => prev.map((m, i) => i === index ? { ...m, facade_override: facade } : m));
  };

  // ── Layout wall count sync ──

  useEffect(() => {
    const layoutWalls = kitchen.layout_type === 'U' ? 3 : kitchen.layout_type === 'L' ? 2 : 1;
    if (wallInputs.length !== layoutWalls) {
      const newWalls = Array.from({ length: layoutWalls }, (_, i) => ({
        wall_name: String.fromCharCode(65 + i),
        wall_length_mm: wallInputs[i]?.wall_length_mm ?? 3000,
      }));
      setWallInputs(newWalls);
    }
  }, [kitchen.layout_type]);

  // ── Render ──

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => step > 1 ? setStep(step - 1) : router.push('/kitchen')}
          className="w-9 h-9 rounded-xl bg-[#F5F3F0] flex items-center justify-center hover:bg-[#EBE8E3] transition-colors">
          <ArrowLeft className="w-4 h-4 text-[#1a1a2e]" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#1a1a2e]">
            {kitchenId ? `Cuisine — ${kitchen.client_name}` : 'Nouvelle Cuisine'}
          </h1>
          <p className="text-sm text-[#64648B]">
            Étape {step}/9 — {PIPELINE_STEPS[step - 1]?.label}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="flex gap-1">
        {PIPELINE_STEPS.map((s) => (
          <div key={s.step} className={`h-1.5 flex-1 rounded-full transition-colors ${
            s.step < step ? 'bg-[#C9956B]' : s.step === step ? 'bg-[#1B2A4A]' : 'bg-[#E8E5E0]'
          }`} />
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* ── STEP 1: Projet ── */}
      {step === 1 && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div>
              <h2 className="text-base font-bold text-[#1a1a2e]">Le client</h2>
              <p className="text-xs text-[#64648B]">Identifiez le projet en quelques champs</p>
            </div>

            <Input label="Nom du client" value={kitchen.client_name ?? ''} placeholder="Mme Amrani"
              onChange={e => setKitchen(p => ({ ...p, client_name: e.target.value }))} />

            <div className="grid grid-cols-2 gap-3">
              <Select label="Type client" value={kitchen.client_type ?? 'standard'}
                onChange={e => setKitchen(p => ({ ...p, client_type: e.target.value as ClientType }))}
                options={[
                  { value: 'standard', label: 'Standard' },
                  { value: 'promoteur', label: 'Promoteur' },
                  { value: 'revendeur', label: 'Revendeur' },
                  { value: 'architecte', label: 'Architecte' },
                  { value: 'urgent', label: 'Urgent' },
                ]} />
              <Select label="Style cuisine" value={kitchen.kitchen_type ?? 'modern'}
                onChange={e => setKitchen(p => ({ ...p, kitchen_type: e.target.value }))}
                options={[
                  { value: 'modern', label: 'Moderne' },
                  { value: 'classic', label: 'Classique' },
                  { value: 'semi_classic', label: 'Semi-Classique' },
                ]} />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={kitchen.full_height ?? false}
                onChange={e => setKitchen(p => ({ ...p, full_height: e.target.checked }))}
                className="w-4 h-4 rounded border-[#E2E0DC] text-[#C9956B] focus:ring-[#C9956B]" />
              <span className="text-sm text-[#4A4A6A]">Pleine hauteur</span>
            </label>

            <Button onClick={saveProject} loading={loading} fullWidth size="lg">
              Continuer <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2: Layout ── */}
      {step === 2 && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#1a1a2e]">Le plan</h2>
                <p className="text-xs text-[#64648B]">Choisissez la forme et les murs</p>
              </div>
              <button onClick={() => setStep(1)} className="text-xs text-[#C9956B] hover:underline">Modifier</button>
            </div>

            {/* Visual layout blocks */}
            <div className="grid grid-cols-3 gap-3">
              {(['I', 'L', 'U'] as LayoutType[]).map(layout => {
                const selected = kitchen.layout_type === layout;
                return (
                  <button key={layout} onClick={() => setKitchen(p => ({ ...p, layout_type: layout }))}
                    className={`relative py-5 rounded-xl border-2 transition-all ${
                      selected
                        ? 'border-[#C9956B] bg-[#C9956B]/5'
                        : 'border-[#E8E5E0] hover:border-[#C9956B]/30'
                    }`}>
                    <div className="flex items-end justify-center h-10 mb-2">
                      {layout === 'I' && (
                        <div className={`w-16 h-3 rounded-sm ${selected ? 'bg-[#C9956B]' : 'bg-[#D1CFC9]'}`} />
                      )}
                      {layout === 'L' && (
                        <div className="relative w-12 h-10">
                          <div className={`absolute bottom-0 left-0 w-full h-3 rounded-sm ${selected ? 'bg-[#C9956B]' : 'bg-[#D1CFC9]'}`} />
                          <div className={`absolute bottom-0 left-0 w-3 h-full rounded-sm ${selected ? 'bg-[#C9956B]' : 'bg-[#D1CFC9]'}`} />
                        </div>
                      )}
                      {layout === 'U' && (
                        <div className="relative w-12 h-10">
                          <div className={`absolute bottom-0 left-0 w-full h-3 rounded-sm ${selected ? 'bg-[#C9956B]' : 'bg-[#D1CFC9]'}`} />
                          <div className={`absolute bottom-0 left-0 w-3 h-full rounded-sm ${selected ? 'bg-[#C9956B]' : 'bg-[#D1CFC9]'}`} />
                          <div className={`absolute bottom-0 right-0 w-3 h-full rounded-sm ${selected ? 'bg-[#C9956B]' : 'bg-[#D1CFC9]'}`} />
                        </div>
                      )}
                    </div>
                    <span className={`text-sm font-semibold ${selected ? 'text-[#C9956B]' : 'text-[#64648B]'}`}>
                      {layout === 'I' ? 'Linéaire' : layout === 'L' ? 'Angle' : 'U'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Wall dimensions */}
            {wallInputs.map((w, i) => (
              <Input key={i} label={`Longueur mur ${w.wall_name} (mm)`} type="number"
                value={w.wall_length_mm}
                onChange={e => {
                  const val = parseInt(e.target.value) || 0;
                  setWallInputs(prev => prev.map((ww, ii) => ii === i ? { ...ww, wall_length_mm: val } : ww));
                }} />
            ))}

            <Button onClick={saveWalls} loading={loading} fullWidth size="lg">
              Continuer <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 3: Modules ── */}
      {step === 3 && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#1a1a2e]">Choix cuisine</h2>
                <p className="text-xs text-[#64648B]">Composez votre cuisine</p>
              </div>
              <button onClick={() => setStep(2)} className="text-xs text-[#C9956B] hover:underline">Modifier</button>
            </div>
            {walls.map(wall => {
              const wallMods = placedModules.filter(m => m.wall_id === wall.id);
              const totalW = wallMods.reduce((s, m) => s + m.width_mm, 0);
              const diff = wall.wall_length_mm - totalW;

              return (
                <div key={wall.id} className="border border-[#E8E5E0] rounded-xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#1a1a2e]">Mur {wall.wall_name} — {wall.wall_length_mm}mm</span>
                    <span className={`text-xs font-medium ${diff === 0 ? 'text-emerald-600' : diff > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                      {diff === 0 ? 'OK' : diff > 0 ? `+${diff}mm libre` : `${diff}mm dépassement`}
                    </span>
                  </div>

                  {/* Module list */}
                  {wallMods.map((m, idx) => {
                    const globalIdx = placedModules.indexOf(m);
                    const mod = availableModules.find(am => am.id === m.module_id);
                    return (
                      <div key={idx} className="flex items-center gap-2 bg-[#FAFAF8] rounded-lg p-2">
                        <span className="text-xs font-medium text-[#1a1a2e] flex-1">{mod?.label ?? 'Module'}</span>
                        <Input type="number" className="w-20 !py-1.5 !px-2 text-xs" value={m.width_mm}
                          onChange={e => updateModuleWidth(globalIdx, parseInt(e.target.value) || 0)} />
                        <span className="text-xs text-[#64648B]">mm</span>
                        <button onClick={() => removeModule(globalIdx)}
                          className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}

                  {/* Add module */}
                  <select onChange={e => { if (e.target.value) { addModule(wall.id, e.target.value); e.target.value = ''; } }}
                    className="w-full px-3 py-2 border border-dashed border-[#C9956B]/30 rounded-lg text-sm text-[#C9956B] bg-transparent cursor-pointer">
                    <option value="">+ Ajouter un module...</option>
                    {Object.entries(
                      availableModules.reduce((acc, m) => {
                        const type = MODULE_TYPE_LABELS[m.type] ?? m.type;
                        if (!acc[type]) acc[type] = [];
                        acc[type].push(m);
                        return acc;
                      }, {} as Record<string, typeof availableModules>)
                    ).map(([type, mods]) => (
                      <optgroup key={type} label={type}>
                        {mods.map(m => (
                          <option key={m.id} value={m.id}>{m.label} ({m.default_width}mm)</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              );
            })}

            <Button onClick={saveModules} loading={loading} fullWidth size="lg">
              Confirmer les modules <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 4: Options Globales ── */}
      {step === 4 && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#1a1a2e]">Style</h2>
                <p className="text-xs text-[#64648B]">Choisissez ouverture et finitions</p>
              </div>
              <button onClick={() => setStep(3)} className="text-xs text-[#C9956B] hover:underline">Modifier</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['handles', 'gola', 'push'] as OpeningSystem[]).map(os => (
                <button key={os} onClick={() => setKitchen(p => ({ ...p, opening_system: os }))}
                  className={`py-3 rounded-xl border-2 text-center text-sm font-medium transition-all ${
                    kitchen.opening_system === os
                      ? 'border-[#C9956B] bg-[#C9956B]/5 text-[#C9956B]'
                      : 'border-[#E8E5E0] text-[#64648B] hover:border-[#C9956B]/30'
                  }`}>
                  {os === 'handles' ? 'Poignées' : os === 'gola' ? 'Gola Alu' : 'Push'}
                </button>
              ))}
            </div>

            <Select label="Matériau structure" value={kitchen.structure_material ?? 'stratifie'}
              onChange={e => setKitchen(p => ({ ...p, structure_material: e.target.value }))}
              options={[
                { value: 'stratifie', label: 'Stratifié' },
                { value: 'latte', label: 'Latte' },
              ]} />

            <Select label="Façade par défaut" value={kitchen.facade_material ?? 'mdf_18_uv'}
              onChange={e => setKitchen(p => ({ ...p, facade_material: e.target.value }))}
              options={[
                { value: 'mdf_18_uv', label: 'MDF 18 UV' },
              ]} />

            <Select label="Dos" value={String(kitchen.back_thickness ?? 5)}
              onChange={e => setKitchen(p => ({ ...p, back_thickness: parseInt(e.target.value) }))}
              options={[
                { value: '5', label: '5mm' },
                { value: '8', label: '8mm' },
              ]} />

            <Button onClick={async () => {
              if (kitchenId) {
                setLoading(true);
                await api('/api/kitchen/project', { id: kitchenId, ...kitchen }).catch(() => {});
                setLoading(false);
              }
              saveOptions();
            }} loading={loading} fullWidth size="lg">
              Continuer <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 5: Customization par module ── */}
      {step === 5 && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#1a1a2e]">Portes</h2>
                <p className="text-xs text-[#64648B]">Personnalisez chaque porte</p>
              </div>
              <button onClick={() => setStep(4)} className="text-xs text-[#C9956B] hover:underline">Modifier</button>
            </div>

            {savedModules.map((m, i) => {
              const mod = availableModules.find(am => am.id === m.module_id);
              return (
                <div key={m.id || i} className="flex items-center gap-3 bg-[#FAFAF8] rounded-lg p-3">
                  <span className="text-sm font-medium text-[#1a1a2e] flex-1">
                    {mod?.label ?? 'Module'} ({m.width_mm}mm)
                  </span>
                  <select value={m.facade_override ?? ''}
                    onChange={e => {
                      const val = e.target.value as FacadeOverride | '';
                      setSavedModules(prev => prev.map((mm, ii) =>
                        ii === i ? { ...mm, facade_override: val || null } : mm
                      ));
                    }}
                    className="px-3 py-1.5 border border-[#E2E0DC] rounded-lg text-sm bg-white">
                    <option value="">MDF (défaut)</option>
                    <option value="glass">Verre</option>
                    <option value="semi_glass">Semi-verre</option>
                  </select>
                </div>
              );
            })}

            <Button onClick={saveCustomization} fullWidth size="lg">
              Continuer <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 6: Validation ── */}
      {step === 6 && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#1a1a2e]">Validation</h2>
                <p className="text-xs text-[#64648B]">On vérifie tout pour vous</p>
              </div>
              <button onClick={() => setStep(5)} className="text-xs text-[#C9956B] hover:underline">Modifier</button>
            </div>

            {!detectionDone ? (
              <Button onClick={runDetection} loading={loading} fullWidth size="lg" variant="accent">
                Vérifier ma cuisine <CheckCircle className="w-4 h-4" />
              </Button>
            ) : (
              <>
                {/* Status banner */}
                {(() => {
                  const hasRed = fillerSuggestions.some(f => f.suggestion === 'overflow');
                  const hasNonOk = fillerSuggestions.filter(f => f.suggestion !== 'ok');
                  const onlySmallGaps = hasNonOk.length > 0 && !hasRed && hasNonOk.every(f => Math.abs(f.gap_mm) <= 100);
                  const isPerfect = hasNonOk.length === 0;

                  const label = isPerfect
                    ? 'Cuisine validée \u2705'
                    : onlySmallGaps
                    ? 'Cuisine prête avec ajustements mineurs \u2705'
                    : hasRed
                    ? 'Ajustement requis avant validation'
                    : 'À ajuster';

                  const style = isPerfect || onlySmallGaps
                    ? 'bg-emerald-50 border border-emerald-200'
                    : hasRed
                    ? 'bg-[#FFF8F0] border border-[#E8D5C0]'
                    : 'bg-[#FAFAF8] border border-[#E8E5E0]';

                  return (
                    <div className={`p-4 rounded-xl text-center ${style}`}>
                      <span className="text-lg">{label}</span>
                    </div>
                  );
                })()}

                {/* Single flat list: wall status + issues + filler fix inline */}
                <div className="rounded-xl border border-[#E8E5E0] divide-y divide-[#E8E5E0]">
                  {fillerSuggestions.map((f, i) => {
                    const pf = pendingFillers.find(p => p.wall_id === f.wall_id);
                    return (
                      <div key={i} className="p-3 space-y-1.5">
                        {/* Wall remaining space */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-[#1a1a2e]">Mur {f.wall_name}</span>
                          <span className={`text-sm font-semibold ${
                            f.gap_mm < 0 ? 'text-red-600' : f.gap_mm === 0 ? 'text-emerald-600' : 'text-amber-600'
                          }`}>
                            {f.gap_mm === 0 ? 'parfait' : f.gap_mm > 0 ? `+${f.gap_mm}mm` : `${f.gap_mm}mm`}
                          </span>
                        </div>

                        {/* Issue line (if any) */}
                        {f.suggestion !== 'ok' && (
                          <div className={`flex items-center gap-1.5 text-xs ${
                            f.suggestion === 'overflow' ? 'text-[#B8845A]' : 'text-[#64648B]'
                          }`}>
                            <ArrowRight className="w-3 h-3 flex-shrink-0" />
                            <span>
                              {f.suggestion === 'overflow' ? `Réduire un meuble de ${Math.abs(f.gap_mm)}mm` :
                               f.suggestion === 'filler_needed' ? `Ajouter joint de ${f.gap_mm}mm` :
                               f.suggestion === 'add_module' ? `Ajouter meuble de ${f.gap_mm}mm` :
                               f.suggestion === 'too_small' ? `Ajouter joint de ${f.gap_mm}mm` :
                               f.message}
                            </span>
                          </div>
                        )}

                        {/* Inline filler fix */}
                        {pf && (
                          <div className="flex items-center justify-between bg-[#FAFAF8] rounded-lg px-2.5 py-1.5">
                            <span className="text-xs text-[#4A4A6A]">joint {pf.gap_mm}mm</span>
                            <select value={pf.side}
                              onChange={e => setPendingFillers(prev => prev.map((ff, ii) =>
                                ff.wall_id === pf.wall_id ? { ...ff, side: e.target.value as 'left' | 'right' } : ff
                              ))}
                              className="px-2 py-1 border border-[#E2E0DC] rounded text-xs bg-white">
                              <option value="right">droite</option>
                              <option value="left">gauche</option>
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <Button
                  onClick={confirmFillers}
                  loading={loading}
                  fullWidth
                  size="lg"
                  disabled={fillerSuggestions.some(f => f.suggestion === 'overflow')}
                >
                  Continuer <ArrowRight className="w-4 h-4" />
                </Button>
                {fillerSuggestions.some(f => f.suggestion === 'overflow') && (
                  <p className="text-xs text-[#64648B] text-center">Ajustez les murs en trop pour continuer</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── STEP 7: Prix ── */}
      {step === 7 && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#1a1a2e]">Prix</h2>
                <p className="text-xs text-[#64648B]">Calcul automatique du prix</p>
              </div>
              <button onClick={() => setStep(6)} className="text-xs text-[#C9956B] hover:underline">Modifier</button>
            </div>
            <Button onClick={computePrice} loading={loading} fullWidth size="lg" variant="accent">
              Continuer <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 8: Validation ── */}
      {step === 8 && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#1a1a2e]">Récap</h2>
                <p className="text-xs text-[#64648B]">Vérifiez les coûts détaillés</p>
              </div>
              <button onClick={() => setStep(7)} className="text-xs text-[#C9956B] hover:underline">Modifier</button>
            </div>
            {cost && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-[#64648B]">Matériaux</span><span className="text-right font-medium">{formatMAD(cost.materials)}</span>
                  <span className="text-[#64648B]">Quincaillerie</span><span className="text-right font-medium">{formatMAD(cost.hardware)}</span>
                  <span className="text-[#64648B]">Accessoires</span><span className="text-right font-medium">{formatMAD(cost.accessories)}</span>
                  <span className="text-[#64648B]">Main d&apos;oeuvre</span><span className="text-right font-medium">{formatMAD(cost.labour)}</span>
                  <span className="text-[#64648B]">Charges fixes</span><span className="text-right font-medium">{formatMAD(cost.fixed_charges)}</span>
                  <span className="text-[#64648B]">Transport</span><span className="text-right font-medium">{formatMAD(cost.transport)}</span>
                  <span className="text-[#64648B]">Installation</span><span className="text-right font-medium">{formatMAD(cost.installation)}</span>
                </div>
                <div className="border-t border-[#E8E5E0] pt-2 grid grid-cols-2 gap-2 text-sm">
                  <span className="text-[#64648B]">Sous-total</span><span className="text-right font-medium">{formatMAD(cost.subtotal)}</span>
                  <span className="text-[#64648B]">Marge ({cost.margin_percent}%)</span><span className="text-right font-medium">{formatMAD(cost.margin_amount)}</span>
                  <span className="text-[#64648B]">Total HT</span><span className="text-right font-semibold">{formatMAD(cost.total_ht)}</span>
                  <span className="text-[#64648B]">TVA (20%)</span><span className="text-right font-medium">{formatMAD(cost.vat_amount)}</span>
                </div>
                <div className="border-t-2 border-[#1B2A4A] pt-2 grid grid-cols-2 text-base">
                  <span className="font-bold text-[#1a1a2e]">Total TTC</span>
                  <span className="text-right font-bold text-[#C9956B]">{formatMAD(cost.total_ttc)}</span>
                </div>
              </div>
            )}

            {bom && (
              <div className="text-xs text-[#64648B] grid grid-cols-3 gap-2 bg-[#FAFAF8] rounded-lg p-3">
                <div><strong>{bom.panels.length}</strong> panneaux</div>
                <div><strong>{roundMoney(bom.edge_banding.reduce((s, e) => s + e.length_m, 0))}m</strong> chant</div>
                <div><strong>{bom.hardware.reduce((s, h) => s + h.qty, 0)}</strong> quincaillerie</div>
              </div>
            )}

            <Button onClick={runValidation} loading={loading} fullWidth size="lg">
              Valider <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 9: Actions ── */}
      {step === 9 && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#1a1a2e]">Valider</h2>
                <p className="text-xs text-[#64648B]">Confirmez votre cuisine</p>
              </div>
              <button onClick={() => setStep(8)} className="text-xs text-[#C9956B] hover:underline">Modifier</button>
            </div>

            {validation && (
              <div className={`p-3 rounded-xl text-sm font-medium text-center ${
                validation.overall === 'green' ? 'bg-emerald-50 text-emerald-700' :
                'bg-amber-50 text-amber-700'
              }`}>
                {validation.overall === 'green' ? 'Votre cuisine est optimisée' : 'Ajustements nécessaires'}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              <Button onClick={saveDraft} loading={loading} variant="secondary" fullWidth size="lg">
                <Save className="w-4 h-4" /> Sauvegarder Brouillon
              </Button>

              {validation?.can_generate_quote !== false && (
                <Button onClick={markValidated} loading={loading} variant="accent" fullWidth size="lg">
                  <Send className="w-4 h-4" /> Valider & Générer Devis
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
