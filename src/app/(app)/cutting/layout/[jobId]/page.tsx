'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { RoleGuard } from '@/components/auth/RoleGuard';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  ArrowLeft, LayoutGrid, Package, AlertTriangle, Printer, RotateCw,
} from 'lucide-react';
import { getNestingResult } from '@/lib/services/nesting-engine.service';
import type { CuttingPanel, PanelPlacement } from '@/types/production';

const MAT_LABELS: Record<string, string> = {
  mdf_18: 'MDF 18mm', mdf_16: 'MDF 16mm', mdf_22: 'MDF 22mm',
  stratifie_18: 'Stratifie 18mm', stratifie_16: 'Stratifie 16mm',
  back_hdf_5: 'HDF 5mm', back_hdf_3: 'HDF 3mm', back_mdf_8: 'MDF 8mm',
  melamine_anthracite: 'Mel. Anthracite', melamine_blanc: 'Mel. Blanc',
  melamine_chene: 'Mel. Chene', melamine_noyer: 'Mel. Noyer',
};

// Deterministic pastel color from label string
function labelColor(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = label.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 55%, 75%)`;
}
function labelColorDark(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = label.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 50%, 35%)`;
}

function LayoutContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = params.jobId as string;
  const initialPanelId = searchParams.get('panel');

  const [panels, setPanels] = useState<CuttingPanel[]>([]);
  const [job, setJob] = useState<any>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getNestingResult(jobId);
    if (result.success && result.data) {
      setJob(result.data.job);
      setPanels(result.data.panels);
      // Set initial selected panel
      if (initialPanelId) {
        const idx = result.data.panels.findIndex(p => p.id === initialPanelId);
        if (idx >= 0) setSelectedIdx(idx);
      }
    } else {
      setError(result.error || 'Failed to load');
    }
    setLoading(false);
  }, [jobId, initialPanelId]);

  useEffect(() => { load(); }, [load]);

  const selectedPanel = panels[selectedIdx] || null;
  const placements = useMemo(() => selectedPanel?.placements || [], [selectedPanel]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-64 bg-gray-200 rounded-lg" />
        <div className="h-[500px] bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-red-600">{error || 'Not found'}</p>
        <Button variant="secondary" onClick={() => router.back()}>
          <ArrowLeft size={16} /> Retour
        </Button>
      </div>
    );
  }

  const proj = job.project as any;
  const sheetW = selectedPanel?.sheet_width_mm || 2800;
  const sheetH = selectedPanel?.sheet_height_mm || 1220;

  // SVG dimensions — scale to fit container
  const SVG_MAX_WIDTH = 900;
  const scale = SVG_MAX_WIDTH / sheetW;
  const svgW = sheetW * scale;
  const svgH = sheetH * scale;

  // Stats
  const usedArea = Number(selectedPanel?.used_area_mm2 || 0);
  const wasteArea = Number(selectedPanel?.waste_area_mm2 || 0);
  const wastePct = Number(selectedPanel?.waste_percent || 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(`/cutting/jobs/${jobId}`)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <LayoutGrid size={20} className="text-[#C9956B]" />
            Disposition Panneaux
          </h1>
          <p className="text-sm text-gray-500">
            {proj?.reference_code} — {proj?.client_name}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 no-print"
          title="Imprimer"
        >
          <Printer size={20} />
        </button>
      </div>

      {/* Panel selector */}
      <div className="flex gap-2 flex-wrap no-print">
        {panels.map((panel, idx) => {
          const matLabel = MAT_LABELS[panel.material_code] || panel.material_code;
          return (
            <button
              key={panel.id}
              onClick={() => setSelectedIdx(idx)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors border ${
                idx === selectedIdx
                  ? 'bg-[#1B2A4A] text-white border-[#1B2A4A]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              {matLabel} #{panel.panel_index}
            </button>
          );
        })}
      </div>

      {/* SVG Panel Layout */}
      {selectedPanel && (
        <Card>
          <CardContent>
            <div className="overflow-x-auto">
              <svg
                width={svgW}
                height={svgH}
                viewBox={`0 0 ${sheetW} ${sheetH}`}
                className="border border-gray-200 rounded-lg bg-gray-50 mx-auto"
                style={{ maxWidth: '100%', height: 'auto' }}
              >
                {/* Sheet background */}
                <rect
                  x={0} y={0}
                  width={sheetW} height={sheetH}
                  fill="#f3f4f6" stroke="#d1d5db" strokeWidth={2}
                />

                {/* Waste hatching pattern */}
                <defs>
                  <pattern id="waste-hatch" patternUnits="userSpaceOnUse" width={20} height={20} patternTransform="rotate(45)">
                    <line x1={0} y1={0} x2={0} y2={20} stroke="#fca5a5" strokeWidth={1.5} />
                  </pattern>
                </defs>

                {/* Sheet label */}
                <text x={sheetW / 2} y={30} textAnchor="middle" fontSize={24} fill="#9ca3af" fontWeight="bold">
                  {sheetW} x {sheetH} mm — {MAT_LABELS[selectedPanel.material_code] || selectedPanel.material_code}
                </text>

                {/* Placed parts */}
                {placements.map((pl: PanelPlacement, i: number) => {
                  const x = Number(pl.x_mm);
                  const y = Number(pl.y_mm);
                  const w = Number(pl.width_mm);
                  const h = Number(pl.height_mm);
                  const fill = labelColor(pl.part_label || `part-${i}`);
                  const textColor = labelColorDark(pl.part_label || `part-${i}`);

                  // Determine font size to fit
                  const maxChars = Math.max(8, (pl.part_label || '').length);
                  const fontSize = Math.min(
                    Math.max(10, Math.min(w / (maxChars * 0.6), h / 3)),
                    22,
                  );

                  return (
                    <g key={pl.id || i}>
                      <rect
                        x={x} y={y} width={w} height={h}
                        fill={fill}
                        stroke="#374151"
                        strokeWidth={1.5}
                        rx={2}
                      />
                      {/* Part label */}
                      <text
                        x={x + w / 2}
                        y={y + h / 2 - fontSize * 0.2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={fontSize}
                        fill={textColor}
                        fontWeight="600"
                      >
                        {(pl.part_label || '').substring(0, 12)}
                      </text>
                      {/* Dimensions */}
                      <text
                        x={x + w / 2}
                        y={y + h / 2 + fontSize * 0.9}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={Math.max(8, fontSize * 0.65)}
                        fill={textColor}
                        opacity={0.7}
                      >
                        {w}x{h}
                      </text>
                      {/* Rotation indicator */}
                      {pl.rotated && (
                        <g transform={`translate(${x + w - 16}, ${y + 4})`}>
                          <circle cx={6} cy={6} r={6} fill="rgba(0,0,0,0.3)" />
                          <text x={6} y={6} textAnchor="middle" dominantBaseline="central" fontSize={8} fill="white" fontWeight="bold">R</text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Stats bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Pièces</p>
                <p className="text-lg font-bold">{placements.length}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Utilisé</p>
                <p className="text-lg font-bold">{(usedArea / 1e6).toFixed(2)} m²</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Chute</p>
                <p className="text-lg font-bold">{(wasteArea / 1e6).toFixed(2)} m²</p>
              </div>
              <div className={`${wastePct > 20 ? 'bg-red-50' : wastePct > 15 ? 'bg-amber-50' : 'bg-green-50'} rounded-lg p-3 text-center`}>
                <p className="text-xs text-gray-500">% Chute</p>
                <p className={`text-lg font-bold ${wastePct > 20 ? 'text-red-600' : wastePct > 15 ? 'text-amber-600' : 'text-green-600'}`}>
                  {wastePct}%
                </p>
              </div>
            </div>

            {/* Parts legend */}
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Pièces sur ce panneau</p>
              <div className="flex flex-wrap gap-1.5">
                {placements.map((pl: PanelPlacement, i: number) => (
                  <span
                    key={pl.id || i}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                    style={{ backgroundColor: labelColor(pl.part_label || `part-${i}`), color: labelColorDark(pl.part_label || `part-${i}`) }}
                  >
                    {pl.rotated && <RotateCw size={10} />}
                    {pl.part_label}
                    <span className="opacity-60">{pl.width_mm}x{pl.height_mm}</span>
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {panels.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Package size={48} className="mx-auto mb-4 opacity-30" />
          <p>Aucun panneau. Lancez l&apos;imbrication d&apos;abord.</p>
        </div>
      )}
    </div>
  );
}

export default function LayoutPage() {
  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker'] as any[]}>
      <LayoutContent />
    </RoleGuard>
  );
}
