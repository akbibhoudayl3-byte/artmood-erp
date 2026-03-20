'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { RoleGuard } from '@/components/auth/RoleGuard';
import ProjectMfgTabs from '@/components/projects/ProjectMfgTabs';
import {
  ArrowLeft, Download, Scissors, RefreshCw, CheckCircle,
  AlertTriangle, Package, LayoutGrid, Zap, ArrowRight,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  reference_code: string;
  client_name: string;
  status: string;
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
  qr_code: string | null;
}

interface CuttingEntry {
  id: string;
  project_id: string;
  project_part_id: string | null;
  panel_type: string;
  panel_width_mm: number;
  panel_height_mm: number;
  part_label: string;
  cut_width_mm: number;
  cut_height_mm: number;
  quantity: number;
  edges: string | null;
  grain_direction: string | null;
  sheet_number: number;
  position_x: number | null;
  position_y: number | null;
  cnc_program: string | null;
  is_exported: boolean;
  // joined from project_parts
  is_cut?: boolean;
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

function getSheetDims(materialType: string): [number, number] {
  const dims: Record<string, [number, number]> = {
    mdf_18:       [1220, 2800],
    mdf_16:       [1220, 2800],
    mdf_12:       [1220, 2800],
    stratifie_18: [1830, 2550],
    stratifie_16: [1830, 2550],
    back_hdf_5:   [1220, 2440],
    back_mdf_8:   [1220, 2440],
  };
  return dims[materialType] ?? [1220, 2440];
}

function buildEdgesString(
  edge_top: boolean,
  edge_bottom: boolean,
  edge_left: boolean,
  edge_right: boolean,
): string {
  const parts: string[] = [];
  if (edge_top)    parts.push('H');
  if (edge_bottom) parts.push('B');
  if (edge_left)   parts.push('G');
  if (edge_right)  parts.push('D');
  return parts.length ? parts.join(' ') : '-';
}

const GRAIN_ICON: Record<string, string> = {
  horizontal: '↔',
  vertical:   '↕',
  none:       '—',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const today = new Date().toLocaleDateString('fr-MA', {
  year: 'numeric', month: '2-digit', day: '2-digit',
});

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3 py-4 px-6">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-gray-100 rounded-lg" />
      ))}
    </div>
  );
}

// ── CSV Export ────────────────────────────────────────────────────────────────

function exportCSV(entries: CuttingEntry[], referenceCode: string) {
  const headers = ['Type panneau', 'Panneau N°', 'Étiquette', 'Largeur (mm)', 'Hauteur (mm)', 'Qté', 'Chants', 'Fil'];
  const rows = entries.map((e) => [
    MAT_LABEL(e.panel_type),
    e.sheet_number,
    e.part_label,
    e.cut_width_mm,
    e.cut_height_mm,
    e.quantity,
    e.edges ?? '-',
    e.grain_direction ?? '-',
  ]);

  const csvContent = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DEBIT_${referenceCode}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── CNC Export ────────────────────────────────────────────────────────────────

function exportCNC(entries: CuttingEntry[], referenceCode: string) {
  // Group by panel_type then sheet_number
  const byMat = new Map<string, Map<number, CuttingEntry[]>>();
  for (const e of entries) {
    if (!byMat.has(e.panel_type)) byMat.set(e.panel_type, new Map());
    const sheetMap = byMat.get(e.panel_type)!;
    if (!sheetMap.has(e.sheet_number)) sheetMap.set(e.sheet_number, []);
    sheetMap.get(e.sheet_number)!.push(e);
  }

  const lines: string[] = [
    `[PART LIST - ArtMood Factory OS]`,
    `Project: ${referenceCode}`,
    `Date: ${today}`,
    `---`,
  ];

  for (const [matType, sheetMap] of byMat.entries()) {
    const [w, h] = getSheetDims(matType);
    for (const [sheetNum, sheetEntries] of sheetMap.entries()) {
      lines.push(`${MAT_LABEL(matType)} | Sheet ${w}x${h}`);
      for (const e of sheetEntries) {
        const grainLabel = e.grain_direction === 'horizontal' ? 'H' : e.grain_direction === 'vertical' ? 'V' : '-';
        lines.push(`Part: ${e.part_label} | ${e.cut_width_mm}x${e.cut_height_mm} | Qty: ${e.quantity} | Edges: ${e.edges ?? '-'} | Grain: ${grainLabel}`);
      }
      lines.push(`---`);
    }
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `CNC_${referenceCode}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main Page Content ─────────────────────────────────────────────────────────

function CuttingListContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const supabase = createClient();

  const [project, setProject]         = useState<Project | null>(null);
  const [entries, setEntries]         = useState<CuttingEntry[]>([]);
  const [partsCutMap, setPartsCutMap] = useState<Map<string, boolean>>(new Map());

  const [loadingProject,  setLoadingProject]  = useState(true);
  const [loadingEntries,  setLoadingEntries]  = useState(true);
  const [generating,      setGenerating]      = useState(false);
  const [markingSheet,    setMarkingSheet]    = useState<string | null>(null);
  const [error,           setError]           = useState<string | null>(null);
  const [generateError,   setGenerateError]   = useState<string | null>(null);
  const [missingParts,    setMissingParts]    = useState(0);
  const [finishingCutting, setFinishingCutting] = useState(false);
  const [finishError,     setFinishError]     = useState<string | null>(null);

  // ── Fetch project ──
  const fetchProject = useCallback(async () => {
    setLoadingProject(true);
    const { data, error: err } = await supabase
      .from('projects')
      .select('id, reference_code, client_name, status')
      .eq('id', id)
      .single();
    setLoadingProject(false);
    if (err || !data) {
      setError('Projet introuvable.');
      return;
    }
    setProject(data);
  }, [id]);

  // ── Fetch cutting list ──
  const fetchEntries = useCallback(async () => {
    setLoadingEntries(true);
    const { data, error: err } = await supabase
      .from('cutting_list')
      .select('*')
      .eq('project_id', id)
      .order('panel_type, sheet_number, part_label');
    setLoadingEntries(false);
    if (err) {
      setError('Erreur lors du chargement de la liste de débit.');
      return;
    }
    setEntries(data ?? []);

    // Also fetch is_cut status from project_parts
    const partIds = (data ?? [])
      .map((e: CuttingEntry) => e.project_part_id)
      .filter(Boolean) as string[];
    if (partIds.length) {
      const { data: partsData } = await supabase
        .from('project_parts')
        .select('id, is_cut')
        .in('id', partIds);
      const map = new Map<string, boolean>();
      for (const p of partsData ?? []) {
        map.set(p.id, p.is_cut);
      }
      setPartsCutMap(map);
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
    fetchEntries();
  }, [fetchProject, fetchEntries]);

  // ── Generate cutting list via server-side nesting engine ──
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setGenerateError(null);

    try {
      const res = await fetch('/api/cutting/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: id }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 422 && data.validation) {
          // Parts could not be placed
          setMissingParts(data.validation.unplaced_count);
          setGenerateError(
            `${data.validation.unplaced_count} pièce(s) ne rentrent pas dans les panneaux standard. Vérifiez les dimensions.`,
          );
        } else {
          setGenerateError(data.error || 'Erreur lors de la génération.');
        }
        setGenerating(false);
        return;
      }

      // Success
      setMissingParts(0);
      if (data.validation && !data.validation.all_parts_placed) {
        setMissingParts(data.validation.unplaced_count);
        setGenerateError(
          `${data.validation.unplaced_count} pièce(s) non placées.`,
        );
      }
    } catch {
      setGenerateError('Erreur réseau lors de la génération.');
    }

    setGenerating(false);
    await fetchEntries();
  }, [id, fetchEntries]);

  // ── Auto-deduct stock when a sheet is fully cut (via server API) ──
  const deductStockForSheet = useCallback(async (panelType: string, sheetNumber: number, _sheetEntries: CuttingEntry[]) => {
    try {
      const res = await fetch('/api/cutting/consume-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: id,
          panel_type: panelType,
          sheet_index: sheetNumber,
        }),
      });

      if (res.status === 409) {
        // Already deducted — idempotency check passed, safe to ignore
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        console.error('Stock deduction failed:', data.error);
      }
    } catch {
      console.error('Network error during stock deduction');
    }
  }, [id]);

  // ── Mark single part cut ──
  const markPartCut = useCallback(async (entry: CuttingEntry, currentlyCut: boolean) => {
    if (!entry.project_part_id) return;
    const newValue = !currentlyCut;

    // Optimistic update
    setPartsCutMap((prev) => {
      const next = new Map(prev);
      next.set(entry.project_part_id!, newValue);
      return next;
    });

    await supabase
      .from('project_parts')
      .update({ is_cut: newValue })
      .eq('id', entry.project_part_id);

    // Check if entire sheet is now cut -> auto deduct stock
    if (newValue) {
      const sheetEntries = entries.filter(
        (e) => e.panel_type === entry.panel_type && e.sheet_number === entry.sheet_number,
      );
      const allNowCut = sheetEntries.every((e) => {
        if (e.project_part_id === entry.project_part_id) return true; // the one we just marked
        return e.project_part_id ? (partsCutMap.get(e.project_part_id) ?? false) : true;
      });
      if (allNowCut) {
        await deductStockForSheet(entry.panel_type, entry.sheet_number, sheetEntries);
      }
    }
  }, [entries, partsCutMap, deductStockForSheet]);

  // ── Mark all in sheet cut ──
  const markSheetAllCut = useCallback(
    async (panelType: string, sheetNumber: number) => {
      const key = `${panelType}__${sheetNumber}`;
      setMarkingSheet(key);

      const sheetEntries = entries.filter(
        (e) => e.panel_type === panelType && e.sheet_number === sheetNumber && e.project_part_id,
      );
      const partIds = sheetEntries.map((e) => e.project_part_id!).filter(Boolean);

      if (partIds.length) {
        await supabase.from('project_parts').update({ is_cut: true }).in('id', partIds);
        setPartsCutMap((prev) => {
          const next = new Map(prev);
          for (const pid of partIds) next.set(pid, true);
          return next;
        });
      }

      // Auto-deduct stock for this sheet
      await deductStockForSheet(panelType, sheetNumber, sheetEntries);

      setMarkingSheet(null);
    },
    [entries, deductStockForSheet],
  );

  // ── Finish Cutting: validate all cut, deduct remaining stock, mark production complete ──
  const handleFinishCutting = useCallback(async () => {
    setFinishingCutting(true);
    setFinishError(null);

    try {
      // 1. Check all parts are cut
      const uncutParts = entries.filter(
        (e) => e.project_part_id && !partsCutMap.get(e.project_part_id),
      );
      if (uncutParts.length > 0) {
        // Mark remaining parts as cut
        const uncutIds = [...new Set(uncutParts.map((e) => e.project_part_id!).filter(Boolean))];
        if (uncutIds.length > 0) {
          await supabase.from('project_parts').update({ is_cut: true }).in('id', uncutIds);
          setPartsCutMap((prev) => {
            const next = new Map(prev);
            for (const pid of uncutIds) next.set(pid, true);
            return next;
          });
        }
      }

      // 2. Deduct stock for any sheets not yet deducted
      const sheetKeys = new Set<string>();
      for (const e of entries) {
        sheetKeys.add(`${e.panel_type}__${e.sheet_number}`);
      }
      for (const key of sheetKeys) {
        const [panelType, sheetNumStr] = key.split('__');
        const sheetNumber = parseInt(sheetNumStr, 10);
        const sheetEntries = entries.filter(
          (e) => e.panel_type === panelType && e.sheet_number === sheetNumber,
        );
        await deductStockForSheet(panelType, sheetNumber, sheetEntries);
      }

      // 3. Mark production order as completed
      const { data: prodOrders } = await supabase
        .from('production_orders')
        .select('id')
        .eq('project_id', id)
        .in('status', ['pending', 'in_progress'])
        .limit(1);

      if (prodOrders && prodOrders.length > 0) {
        await supabase.from('production_orders').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', prodOrders[0].id);
      }

      // 4. Redirect to project page
      router.push(`/projects/${id}`);
    } catch {
      setFinishError('Erreur lors de la finalisation de la découpe.');
      setFinishingCutting(false);
    }
  }, [entries, partsCutMap, deductStockForSheet, id, router]);

  // ── Derived stats ──
  const totalSheets = entries.length
    ? Math.max(...entries.map((e) => e.sheet_number))
    : 0;
  const totalParts = entries.reduce((s, e) => s + e.quantity, 0);
  const cutCount = entries.filter((e) => e.project_part_id && partsCutMap.get(e.project_part_id)).reduce(
    (s, e) => s + e.quantity,
    0,
  );
  const cutPct = totalParts > 0 ? Math.round((cutCount / totalParts) * 100) : 0;
  const uncutCount = totalParts - cutCount;

  // ── Group entries ──
  const grouped = new Map<string, Map<number, CuttingEntry[]>>();
  for (const e of entries) {
    if (!grouped.has(e.panel_type)) grouped.set(e.panel_type, new Map());
    const sheetMap = grouped.get(e.panel_type)!;
    if (!sheetMap.has(e.sheet_number)) sheetMap.set(e.sheet_number, []);
    sheetMap.get(e.sheet_number)!.push(e);
  }

  // ── Loading state ──
  if (loadingProject) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-8 w-64 bg-gray-200 rounded-lg" />
        <div className="h-4 w-48 bg-gray-100 rounded" />
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

  // ── Empty state ──
  if (!loadingEntries && entries.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <button
              onClick={() => router.push(`/projects/${id}`)}
              className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-800"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-gray-900">Liste de Débit</h1>
                <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  {project.reference_code}
                </span>
              </div>
              <p className="text-sm text-gray-500">{project.client_name}</p>
            </div>
          </div>
        </div>

        {/* Empty state */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12">
            <LayoutGrid className="mx-auto h-14 w-14 text-gray-300 mb-4" />
            <h2 className="text-xl font-semibold text-gray-700 mb-2">
              Aucune liste de débit générée
            </h2>
            <p className="text-gray-400 text-sm max-w-md mx-auto mb-8">
              La liste de débit est générée automatiquement à partir des pièces du projet.
              Assurez-vous d&apos;avoir des pièces générées depuis l&apos;onglet Modules.
            </p>
            {generateError && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2 text-left max-w-md mx-auto">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-red-600 text-sm">{generateError}</p>
              </div>
            )}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-xl transition-colors"
            >
              {generating ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <Scissors className="h-5 w-5" />
              )}
              {generating ? 'Génération en cours...' : 'Générer liste de débit'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main view ──
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => router.push(`/projects/${id}`)}
                className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-800 flex-shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-bold text-gray-900">Liste de Débit</h1>
                  <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {project.reference_code}
                  </span>
                </div>
                <p className="text-sm text-gray-500 truncate">{project.client_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 text-sm font-medium rounded-xl transition-colors"
              >
                <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Regénérer</span>
              </button>
              <button
                onClick={() => exportCSV(entries, project.reference_code)}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium rounded-xl transition-colors"
              >
                <Download className="h-4 w-4" />
                CSV
              </button>
              <button
                onClick={() => exportCNC(entries, project.reference_code)}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-medium rounded-xl transition-colors"
              >
                <Zap className="h-4 w-4" />
                <span className="hidden sm:inline">Format CNC</span>
                <span className="sm:hidden">CNC</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <ProjectMfgTabs projectId={id as string} />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Panneaux total',
            value: loadingEntries ? '—' : String(totalSheets),
            icon: <Package className="h-4 w-4 text-blue-500" />,
            bg: 'bg-blue-50',
            border: 'border-blue-100',
          },
          {
            label: 'Pièces totales',
            value: loadingEntries ? '—' : String(totalParts),
            icon: <Scissors className="h-4 w-4 text-gray-500" />,
            bg: 'bg-gray-50',
            border: 'border-gray-100',
          },
          {
            label: 'Débitées',
            value: loadingEntries ? '—' : `${cutPct}%`,
            icon: <CheckCircle className="h-4 w-4 text-green-500" />,
            bg: 'bg-green-50',
            border: 'border-green-100',
          },
          {
            label: 'Restantes',
            value: loadingEntries ? '—' : (missingParts > 0 ? `${uncutCount} (${missingParts} hors-format)` : String(uncutCount)),
            icon: <AlertTriangle className={`h-4 w-4 ${uncutCount > 0 || missingParts > 0 ? 'text-amber-500' : 'text-gray-300'}`} />,
            bg: uncutCount > 0 || missingParts > 0 ? 'bg-amber-50' : 'bg-gray-50',
            border: uncutCount > 0 || missingParts > 0 ? 'border-amber-100' : 'border-gray-100',
          },
        ].map((card) => (
          <div key={card.label} className={`${card.bg} border ${card.border} rounded-2xl p-4 flex items-center gap-3`}>
            <div>{card.icon}</div>
            <div>
              <p className="text-xs text-gray-500">{card.label}</p>
              <p className="text-xl font-bold text-gray-900">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Progress bar ── */}
      {!loadingEntries && totalParts > 0 && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-2">
          <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3">
            <span className="text-xs text-gray-500 w-20 shrink-0">Progression</span>
            <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-2.5 rounded-full bg-green-500 transition-all duration-500"
                style={{ width: `${cutPct}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-gray-700 w-12 text-right shrink-0">
              {cutPct}%
            </span>
          </div>
        </div>
      )}

      {/* ── Cutting list content ── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-10 space-y-6 pt-4">
        {loadingEntries ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <Skeleton rows={8} />
          </div>
        ) : (
          Array.from(grouped.entries()).map(([panelType, sheetMap]) => {
            const [sheetW, sheetH] = getSheetDims(panelType);
            const panelEntryCount  = Array.from(sheetMap.values()).reduce(
              (s, arr) => s + arr.length,
              0,
            );

            return (
              <div key={panelType} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Panel type header */}
                <div className="flex items-center gap-3 px-5 py-4 bg-gray-50 border-b border-gray-100">
                  <Package className="h-5 w-5 text-gray-500" />
                  <div>
                    <h3 className="font-semibold text-gray-900">{MAT_LABEL(panelType)}</h3>
                    <p className="text-xs text-gray-400">
                      Panneau standard : {sheetW} × {sheetH} mm
                    </p>
                  </div>
                  <span className="ml-auto text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {sheetMap.size} panneau{sheetMap.size !== 1 ? 'x' : ''} · {panelEntryCount} référence{panelEntryCount !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Sheets */}
                <div className="divide-y divide-gray-50">
                  {Array.from(sheetMap.entries()).map(([sheetNumber, sheetEntries]) => {
                    const sheetKey = `${panelType}__${sheetNumber}`;
                    const allCut = sheetEntries.every(
                      (e) => e.project_part_id && partsCutMap.get(e.project_part_id),
                    );

                    return (
                      <div key={sheetNumber}>
                        {/* Sheet sub-header */}
                        <div className="flex items-center justify-between px-5 py-2.5 bg-gray-50/60 border-b border-gray-100">
                          <span className="text-sm font-semibold text-gray-700">
                            Panneau #{sheetNumber}
                          </span>
                          <button
                            onClick={() => markSheetAllCut(panelType, sheetNumber)}
                            disabled={allCut || markingSheet === sheetKey}
                            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                              allCut
                                ? 'bg-green-100 text-green-700 cursor-default'
                                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                          >
                            {markingSheet === sheetKey ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : allCut ? (
                              <CheckCircle className="h-3.5 w-3.5" />
                            ) : (
                              <Scissors className="h-3.5 w-3.5" />
                            )}
                            {allCut ? 'Tout débité' : 'Tout marquer débité'}
                          </button>
                        </div>

                        {/* Parts table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-50">
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase">Étiquette</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-400 uppercase">Larg. (mm)</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-400 uppercase">Haut. (mm)</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-400 uppercase">Qté</th>
                                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400 uppercase">Chants</th>
                                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400 uppercase">Fil</th>
                                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400 uppercase">Débité</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {sheetEntries.map((entry) => {
                                const isCut = entry.project_part_id
                                  ? (partsCutMap.get(entry.project_part_id) ?? false)
                                  : false;
                                return (
                                  <tr
                                    key={entry.id}
                                    className={`transition-colors ${
                                      isCut ? 'bg-green-50/60' : 'hover:bg-gray-50'
                                    }`}
                                  >
                                    <td className={`px-4 py-2.5 font-mono text-xs font-medium ${isCut ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                      {entry.part_label}
                                    </td>
                                    <td className={`px-4 py-2.5 text-right ${isCut ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                                      {entry.cut_width_mm}
                                    </td>
                                    <td className={`px-4 py-2.5 text-right ${isCut ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                                      {entry.cut_height_mm}
                                    </td>
                                    <td className={`px-4 py-2.5 text-right font-semibold ${isCut ? 'text-gray-400' : 'text-gray-900'}`}>
                                      {entry.quantity}
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                      {entry.edges && entry.edges !== '-' ? (
                                        <span className="flex gap-0.5 justify-center flex-wrap">
                                          {entry.edges.split(' ').map((edge) => (
                                            <span
                                              key={edge}
                                              className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700"
                                            >
                                              {edge}
                                            </span>
                                          ))}
                                        </span>
                                      ) : (
                                        <span className="text-gray-300 text-xs">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5 text-center text-base text-gray-500">
                                      {GRAIN_ICON[entry.grain_direction ?? 'none'] ?? '—'}
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                      <button
                                        onClick={() => markPartCut(entry, isCut)}
                                        disabled={!entry.project_part_id}
                                        className={`relative w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${
                                          isCut
                                            ? 'bg-green-500 border-green-500 text-white'
                                            : 'border-gray-300 hover:border-blue-400 bg-white'
                                        } ${!entry.project_part_id ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                                        title={isCut ? 'Marquer comme non débité' : 'Marquer comme débité'}
                                      >
                                        {isCut && (
                                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                          </svg>
                                        )}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {/* ── Workflow: Finish Cutting ── */}
        {!loadingEntries && entries.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-emerald-200 overflow-hidden">
            <div className="px-5 py-4">
              {finishError && (
                <div className="mb-3 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-red-600 text-sm">{finishError}</p>
                </div>
              )}
              <button
                onClick={handleFinishCutting}
                disabled={finishingCutting}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-semibold rounded-xl transition-colors text-base"
              >
                {finishingCutting ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle className="h-5 w-5" />
                )}
                {finishingCutting ? 'Finalisation en cours...' : 'Terminer la Découpe'}
                {!finishingCutting && <ArrowRight className="h-5 w-5 ml-1" />}
              </button>
              {uncutCount > 0 && !finishingCutting && (
                <p className="text-xs text-gray-500 text-center mt-2">
                  {uncutCount} pièce(s) restante(s) seront marquées comme débitées
                </p>
              )}
            </div>
          </div>
        )}

        {/* Generate error (when already has entries but regeneration failed) */}
        {generateError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-red-600 text-sm">{generateError}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CuttingListPage() {
  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager', 'workshop_worker']}>
      <CuttingListContent />
    </RoleGuard>
  );
}
