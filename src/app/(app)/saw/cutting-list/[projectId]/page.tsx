'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { RoleGuard } from '@/components/auth/RoleGuard';
import {
  Scissors, Printer, Download, RefreshCw, Tag, CheckSquare, Square,
  ChevronRight, ArrowLeft, Loader2, AlertTriangle, TrendingDown, Zap,
} from 'lucide-react';
import type { SawNestingResult, SawStrip } from '@/types/production';
import type { IndustrialNestingStats } from '@/lib/services/saw-optimizer.service';

// ── Material labels ──────────────────────────────────────────────────────────

const MAT_LABELS: Record<string, string> = {
  mdf_18: 'MDF 18mm', mdf_16: 'MDF 16mm', mdf_22: 'MDF 22mm', mdf_10: 'MDF 10mm',
  stratifie_18: 'Stratifié 18mm', stratifie_16: 'Stratifié 16mm',
  back_hdf_5: 'HDF 5mm', back_hdf_3: 'HDF 3mm', back_mdf_8: 'MDF 8mm',
  melamine_anthracite: 'Mélamine Anthracite', melamine_blanc: 'Mélamine Blanc',
  melamine_chene: 'Mélamine Chêne', melamine_noyer: 'Mélamine Noyer',
};

// ── Color palette for strips ─────────────────────────────────────────────────

const STRIP_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#06B6D4', '#EC4899', '#84CC16', '#F97316', '#6366F1',
];

function getStripColor(index: number) {
  return STRIP_COLORS[index % STRIP_COLORS.length];
}

// ── Types ────────────────────────────────────────────────────────────────────

interface CutStatus {
  [partId: string]: { cut_at: string; cut_by: string } | null;
}

// ── Page Component ───────────────────────────────────────────────────────────

export default function SawCuttingListPage() {
  const { projectId } = useParams() as { projectId: string };
  const router = useRouter();
  const { profile } = useAuth();
  const canManage = ['ceo', 'workshop_manager'].includes(profile?.role || '');

  // State
  const [project, setProject] = useState<{ reference_code: string; client_name: string; cutting_method: string } | null>(null);
  const [sheets, setSheets] = useState<SawNestingResult[]>([]);
  const [cutStatus, setCutStatus] = useState<CutStatus>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState('');
  const [nestingStats, setNestingStats] = useState<{
    strategy: string;
    yieldPercent: number;
    offcutsGenerated: number;
    cutCount: number;
    comparison: { strategy: string; waste: number; sheets: number; yield: number }[];
  } | null>(null);

  // ── Fetch data ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');

    const { createClient } = await import('@/lib/supabase/client');
    const sb = createClient();

    // Fetch project
    const { data: proj } = await sb.from('projects')
      .select('reference_code, client_name, cutting_method')
      .eq('id', projectId)
      .single();

    if (!proj) {
      setError('Project not found');
      setLoading(false);
      return;
    }
    setProject(proj);

    // Fetch SAW nesting results
    const { data: nestingData } = await sb.from('saw_nesting_results')
      .select('*')
      .eq('project_id', projectId)
      .order('material_code, sheet_index');

    setSheets((nestingData || []) as SawNestingResult[]);

    // Set default material tab
    if (nestingData?.length && !selectedMaterial) {
      setSelectedMaterial(nestingData[0].material_code);
    }

    // Fetch cut status for all parts
    const { data: parts } = await sb.from('project_parts')
      .select('id, cut_at, cut_by')
      .eq('project_id', projectId)
      .neq('material_type', 'hardware');

    const status: CutStatus = {};
    for (const p of (parts || [])) {
      status[p.id] = p.cut_at ? { cut_at: p.cut_at, cut_by: p.cut_by } : null;
    }
    setCutStatus(status);

    setLoading(false);
  }, [projectId, selectedMaterial]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Generate nesting ────────────────────────────────────────────────────

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    setNestingStats(null);

    try {
      const { generateIndustrialNesting } = await import('@/lib/services/saw-optimizer.service');
      const result = await generateIndustrialNesting(projectId);

      if (!result.success) {
        setError(result.error || 'Nesting failed');
        setGenerating(false);
        return;
      }

      // Capture strategy comparison
      if (result.data) {
        setNestingStats({
          strategy: result.data.strategy,
          yieldPercent: result.data.yieldPercent,
          offcutsGenerated: result.data.offcutsGenerated.length,
          cutCount: result.data.cutCount,
          comparison: result.data.strategyComparison,
        });
      }

      await fetchData();
    } catch (e: any) {
      setError(e.message || 'Unknown error');
    }

    setGenerating(false);
  }

  // ── Mark part as cut ────────────────────────────────────────────────────

  async function toggleCut(partId: string) {
    const { createClient } = await import('@/lib/supabase/client');
    const sb = createClient();
    const isCut = !!cutStatus[partId];

    if (isCut) {
      // Unmark
      await sb.from('project_parts').update({ cut_at: null, cut_by: null }).eq('id', partId);
      setCutStatus(prev => ({ ...prev, [partId]: null }));
    } else {
      // Mark as cut
      const now = new Date().toISOString();
      await sb.from('project_parts').update({ cut_at: now, cut_by: profile?.id }).eq('id', partId);
      setCutStatus(prev => ({ ...prev, [partId]: { cut_at: now, cut_by: profile?.id || '' } }));
    }
  }

  // ── Mark all parts in a sheet as cut ────────────────────────────────────

  async function markAllCut(sheet: SawNestingResult) {
    const { createClient } = await import('@/lib/supabase/client');
    const sb = createClient();
    const now = new Date().toISOString();

    const partIds = sheet.strips.flatMap(s => s.parts.map(p => p.partId));
    const uniqueIds = [...new Set(partIds)];

    await sb.from('project_parts')
      .update({ cut_at: now, cut_by: profile?.id })
      .in('id', uniqueIds);

    setCutStatus(prev => {
      const next = { ...prev };
      for (const id of uniqueIds) {
        next[id] = { cut_at: now, cut_by: profile?.id || '' };
      }
      return next;
    });
  }

  // ── Export CSV ──────────────────────────────────────────────────────────

  function exportCSV() {
    const rows = [['Sheet', 'Strip', 'Part Label', 'Width (mm)', 'Height (mm)', 'Material', 'Thickness', 'Edge Top', 'Edge Bottom', 'Edge Left', 'Edge Right', 'Cut'].join(',')];

    for (const sheet of filteredSheets) {
      const matLabel = MAT_LABELS[sheet.material_code] || sheet.material_code;
      for (const strip of sheet.strips) {
        for (const part of strip.parts) {
          const isCut = !!cutStatus[part.partId];
          rows.push([
            `Sheet ${sheet.sheet_index}`,
            `Strip ${strip.stripIndex}`,
            `"${part.label}"`,
            part.width,
            part.height,
            `"${matLabel}"`,
            sheet.thickness_mm,
            part.edgeTop ? 'Yes' : '',
            part.edgeBottom ? 'Yes' : '',
            part.edgeLeft ? 'Yes' : '',
            part.edgeRight ? 'Yes' : '',
            isCut ? 'Yes' : 'No',
          ].join(','));
        }
      }
    }

    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SAW_${project?.reference_code || 'PROJ'}_cutting_list.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Computed values ─────────────────────────────────────────────────────

  const materialGroups = [...new Set(sheets.map(s => s.material_code))];
  const filteredSheets = selectedMaterial
    ? sheets.filter(s => s.material_code === selectedMaterial)
    : sheets;

  const totalParts = sheets.reduce((s, sh) =>
    s + sh.strips.reduce((ss, strip) => ss + strip.parts.length, 0), 0);
  const cutParts = sheets.reduce((s, sh) =>
    s + sh.strips.reduce((ss, strip) =>
      ss + strip.parts.filter(p => !!cutStatus[p.partId]).length, 0), 0);

  // ── SVG Renderer ────────────────────────────────────────────────────────

  function renderSheetSVG(sheet: SawNestingResult) {
    const W = sheet.sheet_width_mm;
    const H = sheet.sheet_height_mm;
    const scale = Math.min(800 / W, 400 / H);
    const svgW = W * scale;
    const svgH = H * scale;

    return (
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full border rounded bg-gray-50" style={{ maxHeight: 350 }}>
        {/* Sheet outline */}
        <rect x={0} y={0} width={svgW} height={svgH} fill="#f9fafb" stroke="#d1d5db" strokeWidth={1} />

        {/* Strips and parts */}
        {sheet.strips.map((strip, si) => {
          const color = getStripColor(si);
          const sy = strip.ripY * scale;
          const sh = strip.stripHeight * scale;

          return (
            <g key={si}>
              {/* Strip background */}
              <rect x={0} y={sy} width={svgW} height={sh} fill={color} opacity={0.08} stroke={color} strokeWidth={0.5} strokeDasharray="4 2" />

              {/* Parts in strip */}
              {strip.parts.map((part, pi) => {
                const px = part.crossX * scale;
                const pw = part.width * scale;
                const isCut = !!cutStatus[part.partId];

                return (
                  <g key={pi}>
                    <rect
                      x={px} y={sy} width={pw} height={sh}
                      fill={isCut ? '#dcfce7' : color}
                      opacity={isCut ? 0.8 : 0.25}
                      stroke={isCut ? '#16a34a' : color}
                      strokeWidth={1}
                      rx={2}
                    />
                    {/* Part label */}
                    {pw > 30 && sh > 15 && (
                      <text
                        x={px + pw / 2} y={sy + sh / 2}
                        textAnchor="middle" dominantBaseline="central"
                        fontSize={Math.min(10, pw / 8, sh / 3)}
                        fill={isCut ? '#166534' : '#1e3a5f'}
                        fontWeight="600"
                      >
                        {part.label.length > 12 ? part.label.slice(0, 10) + '..' : part.label}
                      </text>
                    )}
                    {/* Dimensions */}
                    {pw > 50 && sh > 25 && (
                      <text
                        x={px + pw / 2} y={sy + sh / 2 + Math.min(10, sh / 4)}
                        textAnchor="middle" dominantBaseline="central"
                        fontSize={Math.min(7, pw / 12)}
                        fill="#6b7280"
                      >
                        {part.width}×{part.height}
                      </text>
                    )}
                    {/* Cut checkmark */}
                    {isCut && pw > 20 && (
                      <text
                        x={px + 4} y={sy + 10}
                        fontSize={10} fill="#16a34a" fontWeight="bold"
                      >✓</text>
                    )}
                    {/* Edge indicators */}
                    {part.edgeTop && <line x1={px + 2} y1={sy} x2={px + pw - 2} y2={sy} stroke="#f97316" strokeWidth={2} />}
                    {part.edgeBottom && <line x1={px + 2} y1={sy + sh} x2={px + pw - 2} y2={sy + sh} stroke="#f97316" strokeWidth={2} />}
                    {part.edgeLeft && <line x1={px} y1={sy + 2} x2={px} y2={sy + sh - 2} stroke="#f97316" strokeWidth={2} />}
                    {part.edgeRight && <line x1={px + pw} y1={sy + 2} x2={px + pw} y2={sy + sh - 2} stroke="#f97316" strokeWidth={2} />}
                  </g>
                );
              })}

              {/* Strip label */}
              <text x={svgW - 5} y={sy + sh / 2} textAnchor="end" dominantBaseline="central"
                fontSize={8} fill={color} fontWeight="600" opacity={0.7}>
                Strip {strip.stripIndex}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker']}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="animate-spin text-gray-400" size={32} />
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker']}>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push(`/projects/${projectId}`)} className="p-2 rounded-lg hover:bg-gray-100">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Scissors size={20} className="text-[#C9956B]" />
                SAW Cutting List
              </h1>
              <p className="text-sm text-gray-500">
                {project?.reference_code} — {project?.client_name}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {sheets.length > 0 ? 'Re-Nest' : 'Generate Nesting'}
              </Button>
            )}
            {sheets.length > 0 && (
              <>
                <Button variant="secondary" size="sm" onClick={() => window.open(`/api/print/saw-instructions?projectId=${projectId}${selectedMaterial ? '&material=' + selectedMaterial : ''}`, '_blank')}>
                  <Printer size={14} /> Instructions
                </Button>
                <Button variant="secondary" size="sm" onClick={() => window.open(`/api/print/saw-labels?projectId=${projectId}${selectedMaterial ? '&material=' + selectedMaterial : ''}`, '_blank')}>
                  <Tag size={14} /> Labels
                </Button>
                <Button variant="secondary" size="sm" onClick={exportCSV}>
                  <Download size={14} /> CSV
                </Button>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-red-700 text-sm">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {/* Industrial Optimizer Banner */}
        {nestingStats && (
          <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-emerald-600" />
                <span className="font-semibold text-sm text-emerald-800">
                  Industrial Optimizer — Winner: <span className="text-blue-700">{nestingStats.strategy}</span>
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>Yield: <strong className="text-emerald-700">{nestingStats.yieldPercent.toFixed(1)}%</strong></span>
                {nestingStats.offcutsGenerated > 0 && (
                  <span>Offcuts: <strong className="text-amber-600">{nestingStats.offcutsGenerated}</strong></span>
                )}
                <span>Cuts: <strong>{nestingStats.cutCount}</strong></span>
              </div>
            </div>
            {nestingStats.comparison.length > 1 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {nestingStats.comparison.slice(0, 4).map(c => {
                  const isWinner = c.strategy === nestingStats.strategy;
                  return (
                    <div
                      key={c.strategy}
                      className={`rounded-lg p-2.5 text-center text-xs ${
                        isWinner
                          ? 'bg-white border-2 border-emerald-400 shadow-sm'
                          : 'bg-white/60 border border-gray-200'
                      }`}
                    >
                      <p className={`font-semibold text-[11px] mb-1 truncate ${isWinner ? 'text-emerald-700' : 'text-gray-500'}`}>
                        {c.strategy}{isWinner && ' ✓'}
                      </p>
                      <p className={`text-lg font-bold ${isWinner ? 'text-emerald-700' : 'text-gray-600'}`}>
                        {c.yield.toFixed(1)}%
                      </p>
                      <p className="text-gray-400">{c.sheets} sheet{c.sheets !== 1 ? 's' : ''} · {c.waste.toFixed(1)}% waste</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Summary bar */}
        {sheets.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{totalParts}</p>
              <p className="text-xs text-blue-500">Total Parts</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">{sheets.length}</p>
              <p className="text-xs text-emerald-500">Sheets</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-amber-700">
                {sheets.length > 0
                  ? (100 - sheets.reduce((s, sh) => s + sh.waste_percent, 0) / sheets.length).toFixed(1)
                  : 0}%
              </p>
              <p className="text-xs text-amber-500">Avg Yield</p>
              <p className="text-[10px] text-amber-400 mt-0.5">
                waste: {sheets.length > 0 ? (sheets.reduce((s, sh) => s + sh.waste_percent, 0) / sheets.length).toFixed(1) : 0}%
              </p>
            </div>
            <div className="bg-purple-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-purple-700">{cutParts}/{totalParts}</p>
              <p className="text-xs text-purple-500">Cut Progress</p>
              <div className="mt-1 h-1.5 bg-purple-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all"
                  style={{ width: `${totalParts > 0 ? (cutParts / totalParts * 100) : 0}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Material tabs */}
        {materialGroups.length > 1 && (
          <div className="flex overflow-x-auto gap-1 bg-gray-100 rounded-xl p-1">
            {materialGroups.map(mat => (
              <button
                key={mat}
                onClick={() => setSelectedMaterial(mat)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedMaterial === mat
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {MAT_LABELS[mat] || mat}
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {sheets.length === 0 && !loading && (
          <Card>
            <CardContent>
              <div className="text-center py-12">
                <Scissors size={48} className="mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold text-gray-600 mb-2">No Cutting Plan Yet</h3>
                <p className="text-sm text-gray-400 mb-4">
                  Generate a SAW nesting plan to create optimized cutting instructions.
                </p>
                {canManage && (
                  <Button variant="primary" onClick={handleGenerate} disabled={generating}>
                    {generating ? <Loader2 size={14} className="animate-spin" /> : <Scissors size={14} />}
                    Generate Nesting
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sheets */}
        {filteredSheets.map(sheet => {
          const sheetParts = sheet.strips.flatMap(s => s.parts);
          const sheetCut = sheetParts.filter(p => !!cutStatus[p.partId]).length;

          return (
            <Card key={sheet.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Scissors size={14} className="text-[#C9956B]" />
                    {MAT_LABELS[sheet.material_code] || sheet.material_code} — Sheet #{sheet.sheet_index}
                    <span className="text-xs text-gray-400 font-normal">
                      ({sheet.sheet_width_mm}×{sheet.sheet_height_mm}mm)
                    </span>
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{sheetParts.length} parts</span>
                    <span className="text-amber-600 font-medium">{sheet.waste_percent}% waste</span>
                    <span className={`font-medium ${sheetCut === sheetParts.length ? 'text-green-600' : 'text-blue-600'}`}>
                      {sheetCut}/{sheetParts.length} cut
                    </span>
                    {canManage && sheetCut < sheetParts.length && (
                      <button
                        onClick={() => markAllCut(sheet)}
                        className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                      >
                        <CheckSquare size={12} /> Mark All
                      </button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* SVG Layout */}
                  {renderSheetSVG(sheet)}

                  {/* Parts table per strip */}
                  {sheet.strips.map(strip => (
                    <div key={strip.stripIndex} className="border rounded-lg overflow-hidden">
                      <div
                        className="px-3 py-2 text-xs font-semibold flex items-center gap-2"
                        style={{ backgroundColor: getStripColor(strip.stripIndex - 1) + '15', color: getStripColor(strip.stripIndex - 1) }}
                      >
                        <ChevronRight size={12} />
                        Strip {strip.stripIndex} — Rip at {strip.ripY}mm — Height: {strip.stripHeight}mm
                        {strip.wasteWidth > 0 && (
                          <span className="text-amber-600 ml-auto text-xs">
                            Waste: {strip.wasteWidth}mm
                          </span>
                        )}
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500 text-xs">
                            <th className="text-left px-3 py-1.5 w-8"></th>
                            <th className="text-left px-3 py-1.5">Part</th>
                            <th className="text-center px-3 py-1.5">Width</th>
                            <th className="text-center px-3 py-1.5">Height</th>
                            <th className="text-center px-3 py-1.5">Cross X</th>
                            <th className="text-center px-3 py-1.5">Edges</th>
                          </tr>
                        </thead>
                        <tbody>
                          {strip.parts.map((part, pi) => {
                            const isCut = !!cutStatus[part.partId];
                            return (
                              <tr
                                key={pi}
                                className={`border-t ${isCut ? 'bg-green-50' : 'hover:bg-gray-50'} cursor-pointer transition-colors`}
                                onClick={() => toggleCut(part.partId)}
                              >
                                <td className="px-3 py-2 text-center">
                                  {isCut
                                    ? <CheckSquare size={16} className="text-green-600" />
                                    : <Square size={16} className="text-gray-300" />
                                  }
                                </td>
                                <td className={`px-3 py-2 font-medium ${isCut ? 'text-green-700 line-through' : 'text-gray-800'}`}>
                                  {part.label}
                                </td>
                                <td className="px-3 py-2 text-center text-gray-600">{part.width}</td>
                                <td className="px-3 py-2 text-center text-gray-600">{part.height}</td>
                                <td className="px-3 py-2 text-center text-gray-400 text-xs">{part.crossX}mm</td>
                                <td className="px-3 py-2 text-center">
                                  <div className="flex justify-center gap-1">
                                    {part.edgeTop && <span className="inline-block w-4 h-1 bg-orange-400 rounded" title="Top" />}
                                    {part.edgeBottom && <span className="inline-block w-4 h-1 bg-orange-400 rounded" title="Bottom" />}
                                    {part.edgeLeft && <span className="inline-block w-1 h-4 bg-orange-400 rounded" title="Left" />}
                                    {part.edgeRight && <span className="inline-block w-1 h-4 bg-orange-400 rounded" title="Right" />}
                                    {!part.edgeTop && !part.edgeBottom && !part.edgeLeft && !part.edgeRight && (
                                      <span className="text-gray-300 text-xs">—</span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </RoleGuard>
  );
}
