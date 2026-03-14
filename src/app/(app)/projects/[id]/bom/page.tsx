'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { RoleGuard } from '@/components/auth/RoleGuard';
import ProjectMfgTabs from '@/components/projects/ProjectMfgTabs';
import {
  ArrowLeft, Download, Package, Layers, Wrench,
  ChevronRight, AlertTriangle, CheckCircle, Clock, ShoppingCart,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  reference_code: string;
  client_name: string;
  status: string;
}

interface BomMaterial {
  id: string;
  project_id: string;
  material_type: string;
  stock_item_id: string | null;
  panel_width_mm: number;
  panel_height_mm: number;
  net_area_m2: number;
  panels_required: number;
  waste_factor: number;
  panels_with_waste: number;
  edge_banding_ml: number;
  unit_cost: number;
  total_cost: number;
  status: string;
}

interface ProductModule {
  name: string;
  code: string;
  category: string;
}

interface ProjectModuleInfo {
  id: string;
  position_label: string | null;
  quantity: number;
  custom_width_mm: number | null;
  custom_height_mm: number | null;
  custom_depth_mm: number | null;
  module_id: string | null;
  product_modules: ProductModule | null;
}

interface ProjectPart {
  id: string;
  project_id: string;
  project_module_id: string | null;
  part_code: string;
  part_name: string;
  material_type: string;
  thickness_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
  edge_top: boolean;
  edge_bottom: boolean;
  edge_left: boolean;
  edge_right: boolean;
  grain_direction: string;
  is_cut: boolean;
  is_edged: boolean;
  is_assembled: boolean;
  cut_by: string | null;
  qr_code: string | null;
  project_modules: ProjectModuleInfo | null;
}

interface Hardware {
  id: string;
  project_id: string;
  hardware_type: string;
  name: string;
  stock_item_id: string | null;
  quantity_required: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  status: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MATERIAL_LABELS: Record<string, string> = {
  mdf_18: 'MDF 18mm',
  mdf_16: 'MDF 16mm',
  mdf_12: 'MDF 12mm',
  stratifie_18: 'Stratifié 18mm',
  stratifie_16: 'Stratifié 16mm',
  back_hdf_5: 'Fond HDF 5mm',
  back_mdf_8: 'Fond MDF 8mm',
  solid_wood: 'Bois Massif',
  plywood: 'Contreplaqué',
};

const MAT_LABEL = (key: string) => MATERIAL_LABELS[key] ?? key;

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft:     { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Brouillon' },
  confirmed: { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Confirmé'  },
  ordered:   { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Commandé'  },
  received:  { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Reçu'      },
};

const GRAIN_ICON: Record<string, string> = {
  horizontal: '↔',
  vertical:   '↕',
  none:       '—',
};

const fmt = (n: number | null | undefined) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD' }).format(n);

const fmtNum = (n: number | null | undefined, digits = 2) =>
  n == null ? '—' : new Intl.NumberFormat('fr-MA', { maximumFractionDigits: digits }).format(n);

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      {icon}
      {label}
      {count != null && (
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
            active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3 py-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-gray-100 rounded-lg" />
      ))}
    </div>
  );
}

// ── Tab 1: Matériaux ──────────────────────────────────────────────────────────

function MateriauTab({ materials, loading }: { materials: BomMaterial[]; loading: boolean }) {
  if (loading) return <Skeleton />;
  if (!materials.length) {
    return (
      <div className="py-16 text-center">
        <Package className="mx-auto h-10 w-10 text-gray-300 mb-3" />
        <p className="text-gray-500 text-sm">Aucun matériau renseigné pour ce projet.</p>
      </div>
    );
  }

  const totalPanels = materials.reduce((s, m) => s + Math.ceil(m.panels_with_waste), 0);
  const totalArea   = materials.reduce((s, m) => s + (m.net_area_m2 ?? 0), 0);
  const totalCost   = materials.reduce((s, m) => s + (m.total_cost ?? 0), 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type matériau</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Panneau (mm)</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Surface nette</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Chute</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Panneaux requis</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Lisière (ml)</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Coût unitaire</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Coût total</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Statut</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {materials.map((m) => (
            <tr key={m.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 font-medium text-gray-900">{MAT_LABEL(m.material_type)}</td>
              <td className="px-4 py-3 text-gray-600">
                {fmtNum(m.panel_width_mm, 0)} × {fmtNum(m.panel_height_mm, 0)}
              </td>
              <td className="px-4 py-3 text-right text-gray-700">{fmtNum(m.net_area_m2)} m²</td>
              <td className="px-4 py-3 text-right">
                <span className="text-amber-600 font-medium">
                  +{fmtNum((m.waste_factor - 1) * 100, 0)}%
                </span>
              </td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900">
                {Math.ceil(m.panels_with_waste)}
              </td>
              <td className="px-4 py-3 text-right text-gray-700">
                {m.edge_banding_ml ? fmtNum(m.edge_banding_ml) : '—'}
              </td>
              <td className="px-4 py-3 text-right text-gray-700">{fmt(m.unit_cost)}</td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(m.total_cost)}</td>
              <td className="px-4 py-3 text-center">
                <StatusBadge status={m.status} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-blue-50 border-t-2 border-blue-100">
            <td className="px-4 py-3 font-bold text-gray-900 text-sm" colSpan={2}>Total</td>
            <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtNum(totalArea)} m²</td>
            <td />
            <td className="px-4 py-3 text-right font-bold text-gray-900">{totalPanels} panneaux</td>
            <td />
            <td />
            <td className="px-4 py-3 text-right font-bold text-blue-700">{fmt(totalCost)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Tab 2: Pièces ─────────────────────────────────────────────────────────────

function EdgeBadges({ part }: { part: ProjectPart }) {
  const edges: { key: boolean; label: string }[] = [
    { key: part.edge_top,    label: 'H' },
    { key: part.edge_bottom, label: 'B' },
    { key: part.edge_left,   label: 'G' },
    { key: part.edge_right,  label: 'D' },
  ];
  const active = edges.filter((e) => e.key);
  if (!active.length) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <span className="flex gap-1 flex-wrap">
      {active.map((e) => (
        <span
          key={e.label}
          className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700"
        >
          {e.label}
        </span>
      ))}
    </span>
  );
}

function StatusIcons({ part }: { part: ProjectPart }) {
  return (
    <span className="flex gap-2 items-center">
      <span title="Débité" className={`text-base ${part.is_cut ? 'text-green-500' : 'text-gray-300'}`}>✂</span>
      <span title="Chant posé" className={`text-base ${part.is_edged ? 'text-green-500' : 'text-gray-300'}`}>⬡</span>
      <span title="Assemblé" className={`text-base ${part.is_assembled ? 'text-green-500' : 'text-gray-300'}`}>🔧</span>
    </span>
  );
}

function PiecesTab({ parts, loading }: { parts: ProjectPart[]; loading: boolean }) {
  if (loading) return <Skeleton />;
  if (!parts.length) {
    return (
      <div className="py-16 text-center">
        <Layers className="mx-auto h-10 w-10 text-gray-300 mb-3" />
        <p className="text-gray-500 text-sm">Aucune pièce générée pour ce projet.</p>
      </div>
    );
  }

  // Group by project_module_id
  const groups = new Map<string, { moduleLabel: string; parts: ProjectPart[] }>();
  const NO_MODULE = '__no_module__';

  for (const part of parts) {
    const key = part.project_module_id ?? NO_MODULE;
    if (!groups.has(key)) {
      let moduleLabel = 'Sans module';
      if (part.project_modules) {
        const pm = part.project_modules;
        const moduleName = pm.product_modules?.name ?? `Module ${pm.id.slice(0, 6)}`;
        const position = pm.position_label ? ` — ${pm.position_label}` : '';
        moduleLabel = `${moduleName}${position}`;
      }
      groups.set(key, { moduleLabel, parts: [] });
    }
    groups.get(key)!.parts.push(part);
  }

  const totalParts = parts.reduce((s, p) => s + p.quantity, 0);

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([key, group]) => (
        <div key={key}>
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-y border-gray-100 mb-0">
            <ChevronRight className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-700">{group.moduleLabel}</span>
            <span className="ml-auto text-xs text-gray-400">{group.parts.length} pièce{group.parts.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase">Code</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase">Nom</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase">Matériau</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-400 uppercase">Ép.</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-400 uppercase">Larg.</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-400 uppercase">Haut.</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-400 uppercase">Qté</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 uppercase">Chants</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 uppercase">Fil</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-400 uppercase">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {group.parts.map((part) => (
                  <tr key={part.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{part.part_code}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{part.part_name}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{MAT_LABEL(part.material_type)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{part.thickness_mm}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{part.width_mm}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{part.height_mm}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{part.quantity}</td>
                    <td className="px-4 py-2.5 text-center">
                      <EdgeBadges part={part} />
                    </td>
                    <td className="px-4 py-2.5 text-center text-base text-gray-600">
                      {GRAIN_ICON[part.grain_direction] ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <StatusIcons part={part} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-end px-4 py-3 bg-blue-50 border-t border-blue-100 rounded-b-2xl">
        <span className="text-sm font-bold text-gray-900">
          Total : {parts.length} référence{parts.length !== 1 ? 's' : ''} · {totalParts} pièce{totalParts !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

// ── Tab 3: Quincaillerie ──────────────────────────────────────────────────────

function QuincaillerieTab({ hardware, loading }: { hardware: Hardware[]; loading: boolean }) {
  if (loading) return <Skeleton />;
  if (!hardware.length) {
    return (
      <div className="py-16 text-center">
        <Wrench className="mx-auto h-10 w-10 text-gray-300 mb-3" />
        <p className="text-gray-500 text-sm">Aucune quincaillerie renseignée pour ce projet.</p>
      </div>
    );
  }

  const totalCost = hardware.reduce((s, h) => s + (h.total_cost ?? 0), 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Désignation</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantité</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Coût unitaire</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Coût total</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Statut</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {hardware.map((h) => (
            <tr key={h.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 text-gray-500 text-xs capitalize">{h.hardware_type.replace(/_/g, ' ')}</td>
              <td className="px-4 py-3 font-medium text-gray-900">{h.name}</td>
              <td className="px-4 py-3 text-right text-gray-700">
                {fmtNum(h.quantity_required, 2)} {h.unit}
              </td>
              <td className="px-4 py-3 text-right text-gray-700">{fmt(h.unit_cost)}</td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(h.total_cost)}</td>
              <td className="px-4 py-3 text-center">
                <StatusBadge status={h.status} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-blue-50 border-t-2 border-blue-100">
            <td className="px-4 py-3 font-bold text-gray-900" colSpan={4}>Total quincaillerie</td>
            <td className="px-4 py-3 text-right font-bold text-blue-700">{fmt(totalCost)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── CSV Export ────────────────────────────────────────────────────────────────

function exportCSV(parts: ProjectPart[], referenceCode: string) {
  const headers = ['Code', 'Nom', 'Matériau', 'Épaisseur', 'Largeur', 'Hauteur', 'Qté', 'ChantH', 'ChantB', 'ChantG', 'ChantD', 'Fil'];
  const rows = parts.map((p) => [
    p.part_code,
    p.part_name,
    MAT_LABEL(p.material_type),
    p.thickness_mm,
    p.width_mm,
    p.height_mm,
    p.quantity,
    p.edge_top ? 'Oui' : 'Non',
    p.edge_bottom ? 'Oui' : 'Non',
    p.edge_left ? 'Oui' : 'Non',
    p.edge_right ? 'Oui' : 'Non',
    p.grain_direction,
  ]);

  const csvContent = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BOM_${referenceCode}_pieces.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type TabKey = 'materiaux' | 'pieces' | 'quincaillerie';

function BomViewerContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const supabase = createClient();

  const [project, setProject]     = useState<Project | null>(null);
  const [materials, setMaterials] = useState<BomMaterial[]>([]);
  const [parts, setParts]         = useState<ProjectPart[]>([]);
  const [hardware, setHardware]   = useState<Hardware[]>([]);

  const [loadingProject,   setLoadingProject]   = useState(true);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [loadingParts,     setLoadingParts]     = useState(true);
  const [loadingHardware,  setLoadingHardware]  = useState(true);

  const [activeTab, setActiveTab] = useState<TabKey>('materiaux');
  const [error, setError]         = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    setError(null);

    // Project
    setLoadingProject(true);
    const { data: proj, error: projErr } = await supabase
      .from('projects')
      .select('id, reference_code, client_name, status')
      .eq('id', id)
      .single();
    setLoadingProject(false);
    if (projErr || !proj) {
      setError('Projet introuvable.');
      return;
    }
    setProject(proj);

    // Materials
    setLoadingMaterials(true);
    const { data: mats } = await supabase
      .from('project_material_requirements_bom')
      .select('*')
      .eq('project_id', id)
      .order('material_type');
    setMaterials(mats ?? []);
    setLoadingMaterials(false);

    // Parts with module info
    setLoadingParts(true);
    const { data: partsData } = await supabase
      .from('project_parts')
      .select(`
        *,
        project_modules(
          id, position_label, quantity,
          custom_width_mm, custom_height_mm, custom_depth_mm,
          module_id,
          product_modules(name, code, category)
        )
      `)
      .eq('project_id', id)
      .order('project_module_id, part_code');
    setParts((partsData ?? []) as ProjectPart[]);
    setLoadingParts(false);

    // Hardware
    setLoadingHardware(true);
    const { data: hw } = await supabase
      .from('project_hardware_requirements')
      .select('*')
      .eq('project_id', id)
      .order('hardware_type, name');
    setHardware(hw ?? []);
    setLoadingHardware(false);
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (loadingProject) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-8 w-64 bg-gray-200 rounded-lg" />
        <div className="h-4 w-48 bg-gray-100 rounded" />
        <div className="h-12 bg-gray-100 rounded-xl" />
        <div className="h-64 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-red-800">Erreur</p>
            <p className="text-red-600 text-sm mt-1">{error ?? 'Projet introuvable.'}</p>
          </div>
        </div>
        <button
          onClick={() => router.back()}
          className="mt-4 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </button>
      </div>
    );
  }

  const totalMaterialCost  = materials.reduce((s, m) => s + (m.total_cost ?? 0), 0);
  const totalHardwareCost  = hardware.reduce((s, h) => s + (h.total_cost ?? 0), 0);
  const grandTotal         = totalMaterialCost + totalHardwareCost;
  const totalPartsQty      = parts.reduce((s, p) => s + p.quantity, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.push(`/projects/${id}`)}
              className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-800 flex-shrink-0"
              title="Retour au projet"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-gray-900">Nomenclature (BOM)</h1>
                <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  {project.reference_code}
                </span>
              </div>
              <p className="text-sm text-gray-500 truncate">{project.client_name}</p>
            </div>
          </div>

          <button
            onClick={() => exportCSV(parts, project.reference_code)}
            disabled={!parts.length}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-medium rounded-xl transition-colors flex-shrink-0"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Exporter CSV</span>
            <span className="sm:hidden">CSV</span>
          </button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <ProjectMfgTabs projectId={id as string} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Coût matériaux',
            value: fmt(totalMaterialCost),
            color: 'text-blue-700',
            bg: 'bg-blue-50',
            border: 'border-blue-100',
          },
          {
            label: 'Coût quincaillerie',
            value: fmt(totalHardwareCost),
            color: 'text-indigo-700',
            bg: 'bg-indigo-50',
            border: 'border-indigo-100',
          },
          {
            label: 'Coût total BOM',
            value: fmt(grandTotal),
            color: 'text-emerald-700',
            bg: 'bg-emerald-50',
            border: 'border-emerald-100',
          },
          {
            label: 'Pièces totales',
            value: String(totalPartsQty),
            color: 'text-gray-800',
            bg: 'bg-gray-50',
            border: 'border-gray-100',
          },
        ].map((card) => (
          <div
            key={card.label}
            className={`${card.bg} border ${card.border} rounded-2xl p-4`}
          >
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs + Content ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-gray-100 overflow-x-auto">
            <TabButton
              active={activeTab === 'materiaux'}
              onClick={() => setActiveTab('materiaux')}
              icon={<Package className="h-4 w-4" />}
              label="Matériaux"
              count={materials.length}
            />
            <TabButton
              active={activeTab === 'pieces'}
              onClick={() => setActiveTab('pieces')}
              icon={<Layers className="h-4 w-4" />}
              label="Pièces"
              count={parts.length}
            />
            <TabButton
              active={activeTab === 'quincaillerie'}
              onClick={() => setActiveTab('quincaillerie')}
              icon={<Wrench className="h-4 w-4" />}
              label="Quincaillerie"
              count={hardware.length}
            />
          </div>

          {/* Tab content */}
          {activeTab === 'materiaux' && (
            <MateriauTab materials={materials} loading={loadingMaterials} />
          )}
          {activeTab === 'pieces' && (
            <PiecesTab parts={parts} loading={loadingParts} />
          )}
          {activeTab === 'quincaillerie' && (
            <QuincaillerieTab hardware={hardware} loading={loadingHardware} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function BomViewerPage() {
  return (
    <RoleGuard roles={['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker']}>
      <BomViewerContent />
    </RoleGuard>
  );
}
