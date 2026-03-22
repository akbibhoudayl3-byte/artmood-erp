'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { RoleGuard } from '@/components/auth/RoleGuard';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import {
  ArrowLeft, Search, Package, ChevronDown, ChevronRight,
  Loader2, Box, Layers, Eye, EyeOff,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface CatalogModule {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string | null;
  width_mm: number | null;
  height_mm: number | null;
  depth_mm: number | null;
  is_active: boolean;
}

interface ModulePart {
  id: string;
  module_id: string;
  code: string;
  name: string;
  part_type: string;
  material_type: string | null;
  thickness_mm: number | null;
  width_formula: string | null;
  height_formula: string | null;
  quantity_formula: string | null;
  edge_top: boolean;
  edge_bottom: boolean;
  edge_left: boolean;
  edge_right: boolean;
  grain_direction: string | null;
  sort_order: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  base_cabinet: 'Caissons bas',
  wall_cabinet: 'Caissons hauts',
  tall_cabinet: 'Colonnes',
};

const CATEGORY_COLORS: Record<string, string> = {
  base_cabinet: 'bg-blue-100 text-blue-700 border-blue-200',
  wall_cabinet: 'bg-purple-100 text-purple-700 border-purple-200',
  tall_cabinet: 'bg-indigo-100 text-indigo-700 border-indigo-200',
};

const MATERIAL_LABELS: Record<string, string> = {
  carcass: 'Caisson (preset)',
  facade: 'Façade (preset)',
  back_panel: 'Fond (preset)',
  mdf_18: 'MDF 18mm',
  mdf_16: 'MDF 16mm',
  hardware: 'Quincaillerie',
};

// ── Main Page ────────────────────────────────────────────────────────────────

function KitchenModulesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [modules, setModules] = useState<CatalogModule[]>([]);
  const [parts, setParts] = useState<Record<string, ModulePart[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [modRes, partsRes] = await Promise.all([
      supabase.from('product_modules').select('*').order('category').order('code'),
      supabase.from('module_parts').select('*').order('sort_order'),
    ]);
    setModules((modRes.data || []) as CatalogModule[]);

    // Group parts by module_id
    const map: Record<string, ModulePart[]> = {};
    for (const p of (partsRes.data || []) as ModulePart[]) {
      if (!map[p.module_id]) map[p.module_id] = [];
      map[p.module_id].push(p);
    }
    setParts(map);
    setLoading(false);
  }

  const filtered = modules.filter(m => {
    if (filterCategory !== 'all' && m.category !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q);
    }
    return true;
  });

  const categories = [...new Set(modules.map(m => m.category))];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Package size={18} className="text-blue-500" /> Bibliothèque de Modules
            </h1>
            <p className="text-xs text-gray-500">{modules.length} modules · {Object.values(parts).flat().length} pièces</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Search + Filter */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg"
              placeholder="Chercher un module..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
          >
            <option value="all">Tous</option>
            {categories.map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
            ))}
          </select>
        </div>

        {/* Module List */}
        <div className="space-y-2">
          {filtered.map(mod => {
            const isExpanded = expandedModule === mod.id;
            const modParts = parts[mod.id] || [];

            return (
              <Card key={mod.id}>
                <button
                  onClick={() => setExpandedModule(isExpanded ? null : mod.id)}
                  className="w-full text-left"
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[mod.category] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          {CATEGORY_LABELS[mod.category] || mod.category}
                        </span>
                        <span className="font-mono text-xs text-gray-400">{mod.code}</span>
                        <span className="text-sm font-medium text-gray-900 truncate">{mod.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-gray-400">
                          {mod.width_mm}×{mod.height_mm}×{mod.depth_mm}
                        </span>
                        <span className="text-xs text-gray-400">{modParts.length} pièces</span>
                        {!mod.is_active && (
                          <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Inactif</span>
                        )}
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </div>
                    </div>
                  </CardHeader>
                </button>

                {isExpanded && (
                  <CardContent>
                    {mod.description && (
                      <p className="text-sm text-gray-500 mb-3">{mod.description}</p>
                    )}
                    {modParts.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-100 text-gray-500">
                              <th className="text-left py-1.5 px-2">Code</th>
                              <th className="text-left py-1.5 px-2">Nom</th>
                              <th className="text-left py-1.5 px-2">Matériau</th>
                              <th className="text-left py-1.5 px-2">Ép.</th>
                              <th className="text-left py-1.5 px-2">L (formule)</th>
                              <th className="text-left py-1.5 px-2">H (formule)</th>
                              <th className="text-left py-1.5 px-2">Qté</th>
                              <th className="text-center py-1.5 px-2">Chants</th>
                            </tr>
                          </thead>
                          <tbody>
                            {modParts.map(part => (
                              <tr key={part.id} className="border-b border-gray-50 hover:bg-gray-50">
                                <td className="py-1.5 px-2 font-mono text-gray-400">{part.code}</td>
                                <td className="py-1.5 px-2 text-gray-800">{part.name}</td>
                                <td className="py-1.5 px-2 text-gray-500">{MATERIAL_LABELS[part.material_type || ''] || part.material_type}</td>
                                <td className="py-1.5 px-2 text-gray-500">{part.thickness_mm}mm</td>
                                <td className="py-1.5 px-2 font-mono text-gray-400 text-[10px]">{part.width_formula || '—'}</td>
                                <td className="py-1.5 px-2 font-mono text-gray-400 text-[10px]">{part.height_formula || '—'}</td>
                                <td className="py-1.5 px-2 font-mono text-gray-400">{part.quantity_formula || '1'}</td>
                                <td className="py-1.5 px-2 text-center">
                                  <span className="text-[10px]">
                                    {[part.edge_top && 'T', part.edge_bottom && 'B', part.edge_left && 'L', part.edge_right && 'R'].filter(Boolean).join('') || '—'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-4">Aucune pièce définie</p>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Package size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Aucun module trouvé</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager'] as any[]}>
      <KitchenModulesPage />
    </RoleGuard>
  );
}
