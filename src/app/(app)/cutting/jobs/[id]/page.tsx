'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { RoleGuard } from '@/components/auth/RoleGuard';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import ErrorBanner from '@/components/ui/ErrorBanner';
import {
  ArrowLeft, Scissors, RefreshCw, LayoutGrid, Code2,
  Package, AlertTriangle, CheckCircle, Trash2, Play,
  Download, Eye,
} from 'lucide-react';
import { getNestingResult, reNestJob, updateJobStatus, deleteCuttingJob } from '@/lib/services/nesting-engine.service';
import { generateAllGcode } from '@/lib/services/gcode-engine.service';
import type { CuttingJob, CuttingPanel } from '@/types/production';

const MAT_LABELS: Record<string, string> = {
  mdf_18: 'MDF 18mm', mdf_16: 'MDF 16mm', mdf_22: 'MDF 22mm',
  stratifie_18: 'Stratifie 18mm', stratifie_16: 'Stratifie 16mm',
  back_hdf_5: 'HDF 5mm', back_hdf_3: 'HDF 3mm', back_mdf_8: 'MDF 8mm',
  melamine_anthracite: 'Melamine Anthracite', melamine_blanc: 'Melamine Blanc',
  melamine_chene: 'Melamine Chene', melamine_noyer: 'Melamine Noyer',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon', nesting: 'Imbrication...', nested: 'Imbriqué',
  cutting: 'En découpe', done: 'Terminé',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  nesting: 'bg-blue-100 text-blue-700',
  nested: 'bg-indigo-100 text-indigo-700',
  cutting: 'bg-amber-100 text-amber-700',
  done: 'bg-green-100 text-green-700',
};

function CuttingJobDetail() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const id = params.id as string;

  const [job, setJob] = useState<CuttingJob | null>(null);
  const [panels, setPanels] = useState<CuttingPanel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const canGenerate = profile && ['ceo', 'workshop_manager'].includes(profile.role);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getNestingResult(id);
    if (result.success && result.data) {
      setJob(result.data.job);
      setPanels(result.data.panels);
    } else {
      setError(result.error || 'Failed to load');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleReNest = async () => {
    if (!job) return;
    setBusy('nesting');
    const result = await reNestJob(id);
    setBusy('');
    if (result.success) load();
    else setError(result.error || 'Re-nesting failed');
  };

  const handleGenerateGcode = async () => {
    if (!job) return;
    setBusy('gcode');
    const result = await generateAllGcode(id, job.project_id);
    setBusy('');
    if (result.success) {
      load();
    } else {
      setError(result.error || 'G-code generation failed');
    }
  };

  const handleStatusChange = async (status: string) => {
    setBusy('status');
    await updateJobStatus(id, status);
    setBusy('');
    load();
  };

  const handleDelete = async () => {
    if (!confirm('Supprimer ce travail de découpe ?')) return;
    setBusy('delete');
    await deleteCuttingJob(id);
    setBusy('');
    router.push('/cutting/jobs');
  };

  // Group panels by material
  const materialGroups = new Map<string, CuttingPanel[]>();
  for (const p of panels) {
    const key = `${p.material_code}__${p.thickness_mm}`;
    if (!materialGroups.has(key)) materialGroups.set(key, []);
    materialGroups.get(key)!.push(p);
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4 p-4">
        <div className="h-8 w-64 bg-gray-200 rounded-lg" />
        <div className="h-4 w-48 bg-gray-100 rounded" />
        <div className="grid grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl" />)}
        </div>
        <div className="h-64 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6">
        <ErrorBanner type="error" message={error || 'Job not found'} />
        <Button variant="secondary" className="mt-4" onClick={() => router.push('/cutting/jobs')}>
          <ArrowLeft size={16} /> Retour
        </Button>
      </div>
    );
  }

  const proj = job.project as any;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/cutting/jobs')}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">Travail de Découpe</h1>
            <span className="text-xs font-mono bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
              {proj?.reference_code || '—'}
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[job.status] || ''}`}>
              {STATUS_LABELS[job.status] || job.status}
            </span>
          </div>
          <p className="text-sm text-gray-500">{proj?.client_name || 'Project'}</p>
        </div>
        <Scissors size={20} className="text-gray-400" />
      </div>

      {error && <ErrorBanner type="error" message={error} onDismiss={() => setError('')} />}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1"><Package size={12} /> Pièces</p>
          <p className="text-2xl font-bold text-gray-900">{job.total_parts}</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1"><LayoutGrid size={12} /> Panneaux</p>
          <p className="text-2xl font-bold text-gray-900">{job.total_panels}</p>
        </div>
        <div className={`${job.total_waste_pct > 20 ? 'bg-red-50 border-red-100' : job.total_waste_pct > 15 ? 'bg-amber-50 border-amber-100' : 'bg-green-50 border-green-100'} border rounded-2xl p-4`}>
          <p className="text-xs text-gray-500 flex items-center gap-1"><AlertTriangle size={12} /> Chute</p>
          <p className="text-2xl font-bold text-gray-900">{job.total_waste_pct}%</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1"><Code2 size={12} /> G-Code</p>
          <p className="text-2xl font-bold text-gray-900">{(job as any).cnc_count || 0}</p>
        </div>
      </div>

      {/* Actions */}
      {canGenerate && (
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleReNest}
            loading={busy === 'nesting'}
            disabled={!!busy}
          >
            <RefreshCw size={14} /> Ré-imbriquer
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleGenerateGcode}
            loading={busy === 'gcode'}
            disabled={!!busy || job.status === 'draft'}
          >
            <Code2 size={14} /> Générer G-Code
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/cutting/layout/${id}`)}
          >
            <Eye size={14} /> Voir Layout
          </Button>
          {(job as any).cnc_count > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push(`/cutting/gcode/${id}`)}
            >
              <Download size={14} /> G-Code
            </Button>
          )}
          {job.status === 'nested' && (
            <Button variant="accent" size="sm" onClick={() => handleStatusChange('cutting')} disabled={!!busy}>
              <Play size={14} /> Lancer Découpe
            </Button>
          )}
          {job.status === 'cutting' && (
            <Button variant="success" size="sm" onClick={() => handleStatusChange('done')} disabled={!!busy}>
              <CheckCircle size={14} /> Terminer
            </Button>
          )}
          <Button variant="danger" size="sm" onClick={handleDelete} loading={busy === 'delete'} disabled={!!busy}>
            <Trash2 size={14} />
          </Button>
        </div>
      )}

      {/* Material groups */}
      {Array.from(materialGroups.entries()).map(([groupKey, groupPanels]) => {
        const [matCode, thick] = groupKey.split('__');
        const matLabel = MAT_LABELS[matCode] || matCode;
        const totalParts = groupPanels.reduce((s, p) => s + (p.placements?.length || 0), 0);
        const avgWaste = groupPanels.length > 0
          ? Math.round(groupPanels.reduce((s, p) => s + p.waste_percent, 0) / groupPanels.length * 100) / 100
          : 0;

        return (
          <Card key={groupKey}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm flex items-center gap-1.5">
                    <Package size={14} className="text-[#C9956B]" /> {matLabel}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {groupPanels[0]?.sheet_width_mm} x {groupPanels[0]?.sheet_height_mm} mm
                  </p>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <p>{groupPanels.length} panneau{groupPanels.length > 1 ? 'x' : ''}</p>
                  <p>{totalParts} pièces · {avgWaste}% chute</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {groupPanels.map(panel => (
                  <div
                    key={panel.id}
                    className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 hover:bg-gray-100 transition-colors cursor-pointer"
                    onClick={() => router.push(`/cutting/layout/${id}?panel=${panel.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                        #{panel.panel_index}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Panneau #{panel.panel_index}
                        </p>
                        <p className="text-xs text-gray-500">
                          {panel.placements?.length || 0} pièces
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${
                        panel.waste_percent > 20 ? 'text-red-600' :
                        panel.waste_percent > 15 ? 'text-amber-600' :
                        'text-green-600'
                      }`}>
                        {panel.waste_percent}% chute
                      </p>
                      <p className="text-xs text-gray-400">
                        {Math.round(Number(panel.used_area_mm2) / 10000)} cm² utilisé
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {panels.length === 0 && job.status === 'draft' && (
        <div className="text-center py-12 text-gray-400">
          <LayoutGrid size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-semibold text-gray-500">Pas encore imbriqué</p>
          <p className="text-sm mt-1">Cliquez sur &quot;Ré-imbriquer&quot; pour lancer l&apos;imbrication.</p>
        </div>
      )}
    </div>
  );
}

export default function CuttingJobDetailPage() {
  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker'] as any[]}>
      <CuttingJobDetail />
    </RoleGuard>
  );
}
