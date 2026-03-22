'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { RoleGuard } from '@/components/auth/RoleGuard';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  ArrowLeft, Paintbrush, Wrench, Loader2, CheckCircle, AlertCircle,
  Plus, X, Pencil, LayoutTemplate,
} from 'lucide-react';
import type { CabinetMaterialPreset, CabinetHardwarePreset, KitchenLayoutTemplate } from '@/types/finance';

// ── Main Page ────────────────────────────────────────────────────────────────

function KitchenPresetsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { profile } = useAuth();

  const [materialPresets, setMaterialPresets] = useState<CabinetMaterialPreset[]>([]);
  const [hardwarePresets, setHardwarePresets] = useState<CabinetHardwarePreset[]>([]);
  const [layouts, setLayouts] = useState<KitchenLayoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'materials' | 'hardware' | 'layouts'>('materials');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [matRes, hwRes, layRes] = await Promise.all([
      supabase.from('cabinet_material_presets').select('*').order('sort_order'),
      supabase.from('cabinet_hardware_presets').select('*').order('sort_order'),
      supabase.from('kitchen_layout_templates').select('*').order('sort_order'),
    ]);
    setMaterialPresets((matRes.data || []) as CabinetMaterialPreset[]);
    setHardwarePresets((hwRes.data || []) as CabinetHardwarePreset[]);
    setLayouts((layRes.data || []) as KitchenLayoutTemplate[]);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  const TABS = [
    { key: 'materials' as const, label: 'Matériaux', count: materialPresets.length, Icon: Paintbrush },
    { key: 'hardware' as const, label: 'Quincaillerie', count: hardwarePresets.length, Icon: Wrench },
    { key: 'layouts' as const, label: 'Layouts', count: layouts.length, Icon: LayoutTemplate },
  ];

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900">Presets Cuisine</h1>
            <p className="text-xs text-gray-500">Matériaux, quincaillerie et layouts préconfigurés</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <nav className="flex bg-white border-b border-gray-100 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <t.Icon size={14} />
            {t.label}
            <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded-full">{t.count}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 space-y-3">
        {success && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
            <CheckCircle size={16} /> {success}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Materials Tab */}
        {tab === 'materials' && (
          <div className="space-y-2">
            {materialPresets.map(mp => (
              <Card key={mp.id}>
                <CardContent>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900">{mp.name}</h3>
                        {!mp.is_active && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Inactif</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{mp.description}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-[10px] text-gray-400 uppercase">Caisson</p>
                      <p className="text-xs font-medium text-gray-700">{mp.carcass_material}</p>
                      <p className="text-[10px] text-gray-400">{mp.carcass_thickness_mm}mm</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-[10px] text-gray-400 uppercase">Façade</p>
                      <p className="text-xs font-medium text-gray-700">{mp.facade_material}</p>
                      <p className="text-[10px] text-gray-400">{mp.facade_thickness_mm}mm</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-[10px] text-gray-400 uppercase">Fond</p>
                      <p className="text-xs font-medium text-gray-700">{mp.back_panel_material}</p>
                      <p className="text-[10px] text-gray-400">{mp.back_panel_thickness_mm}mm</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-[10px] text-gray-400 uppercase">Chant</p>
                      <p className="text-xs font-medium text-gray-700">{mp.edge_band_type}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Hardware Tab */}
        {tab === 'hardware' && (
          <div className="space-y-2">
            {hardwarePresets.map(hp => (
              <Card key={hp.id}>
                <CardContent>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900">{hp.name}</h3>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                          hp.tier === 'premium' ? 'bg-yellow-100 text-yellow-700' :
                          hp.tier === 'budget' ? 'bg-gray-100 text-gray-600' :
                          'bg-blue-100 text-blue-700'
                        }`}>{hp.tier}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{hp.description}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-[10px] text-gray-400 uppercase">Charnières</p>
                      <p className="text-xs font-medium text-gray-700">{hp.hinge_type}</p>
                      <p className="text-[10px] text-gray-400">{hp.hinge_unit_price} MAD/u</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-[10px] text-gray-400 uppercase">Coulisses</p>
                      <p className="text-xs font-medium text-gray-700">{hp.drawer_slide_type}</p>
                      <p className="text-[10px] text-gray-400">{hp.drawer_slide_unit_price} MAD/paire</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-[10px] text-gray-400 uppercase">Poignées</p>
                      <p className="text-xs font-medium text-gray-700">{hp.handle_type}</p>
                      <p className="text-[10px] text-gray-400">{hp.handle_unit_price} MAD/u</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-[10px] text-gray-400 uppercase">Supports</p>
                      <p className="text-xs font-medium text-gray-700">Étagère</p>
                      <p className="text-[10px] text-gray-400">{hp.shelf_support_unit_price} MAD/u</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Layouts Tab */}
        {tab === 'layouts' && (
          <div className="space-y-2">
            {layouts.map(lt => {
              const rawSlots = lt.default_module_slots;
              const slots = (typeof rawSlots === 'string' ? JSON.parse(rawSlots) : (rawSlots || [])) as { position: number; category: string; label: string }[];
              return (
                <Card key={lt.id}>
                  <CardContent>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                          {lt.layout_type}
                        </span>
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">{lt.name}</h3>
                          <p className="text-xs text-gray-500">{lt.description}</p>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400">{slots.length} emplacements</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {slots.map(s => (
                        <span key={s.position} className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                          s.category === 'base_cabinet' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                          s.category === 'wall_cabinet' ? 'bg-purple-50 text-purple-600 border-purple-200' :
                          'bg-indigo-50 text-indigo-600 border-indigo-200'
                        }`}>
                          {s.label}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer'] as any[]}>
      <KitchenPresetsPage />
    </RoleGuard>
  );
}
