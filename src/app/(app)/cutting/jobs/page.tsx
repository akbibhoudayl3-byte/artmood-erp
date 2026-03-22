'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { RoleGuard } from '@/components/auth/RoleGuard';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import ErrorBanner from '@/components/ui/ErrorBanner';
import EmptyState from '@/components/ui/EmptyState';
import FormModal from '@/components/ui/FormModal';
import {
  Scissors, Plus, RefreshCw, Package, LayoutGrid,
  AlertTriangle, CheckCircle, Loader2, FolderKanban,
} from 'lucide-react';
import { createAndNestJob } from '@/lib/services/nesting-engine.service';
import type { CuttingJob } from '@/types/production';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft:   { label: 'Brouillon', color: 'gray' },
  nesting: { label: 'Imbrication...', color: 'blue' },
  nested:  { label: 'Imbriqué', color: 'indigo' },
  cutting: { label: 'En découpe', color: 'amber' },
  done:    { label: 'Terminé', color: 'green' },
};

export default function CuttingJobsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = createClient();

  const [jobs, setJobs] = useState<CuttingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const canGenerate = profile && ['ceo', 'workshop_manager'].includes(profile.role);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('cutting_jobs')
      .select('*, project:projects(reference_code, client_name)')
      .order('created_at', { ascending: false });

    if (filter !== 'all') {
      query = query.eq('status', filter);
    }

    const { data, error: err } = await query;
    if (err) setError(err.message);
    setJobs((data || []) as CuttingJob[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const openNewModal = async () => {
    setShowNew(true);
    setCreateError('');
    setSelectedProject('');
    // Fetch projects that don't have a cutting job yet
    const { data } = await supabase
      .from('projects')
      .select('id, reference_code, client_name')
      .order('created_at', { ascending: false })
      .limit(50);
    setProjects(data || []);
  };

  const handleCreate = async () => {
    if (!selectedProject || !profile) return;
    setCreating(true);
    setCreateError('');

    const result = await createAndNestJob(selectedProject, profile.id);
    setCreating(false);

    if (result.success && result.data) {
      setShowNew(false);
      loadJobs();
      router.push(`/cutting/jobs/${result.data.job.id}`);
    } else {
      setCreateError(result.error || 'Failed to create cutting job');
    }
  };

  const filters = [
    { key: 'all', label: 'Tous' },
    { key: 'nested', label: 'Imbriqué' },
    { key: 'cutting', label: 'En découpe' },
    { key: 'done', label: 'Terminé' },
  ];

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker'] as any[]}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Scissors size={22} className="text-[#C9956B]" />
              Cutting / CNC
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{jobs.length} travaux de découpe</p>
          </div>
          {canGenerate && (
            <Button onClick={openNewModal} variant="primary" size="sm">
              <Plus size={16} /> Nouveau
            </Button>
          )}
        </div>

        {error && <ErrorBanner type="error" message={error} onDismiss={() => setError('')} />}

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === f.key
                  ? 'bg-[#1B2A4A] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Jobs list */}
        {loading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl" />)}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon="Scissors"
            title="Aucun travail de découpe"
            description="Créez un travail de découpe à partir des pièces d'un projet pour commencer l'imbrication."
          />
        ) : (
          <div className="space-y-2">
            {jobs.map(job => {
              const proj = job.project as any;
              const st = STATUS_MAP[job.status] || STATUS_MAP.draft;
              return (
                <Card key={job.id}>
                  <CardContent>
                    <button
                      onClick={() => router.push(`/cutting/jobs/${job.id}`)}
                      className="w-full text-left flex items-center gap-4 py-1"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 truncate">
                            {proj?.client_name || 'Client'}
                          </span>
                          <span className="text-xs font-mono bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                            {proj?.reference_code || '—'}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                            st.color === 'green' ? 'bg-green-100 text-green-700' :
                            st.color === 'amber' ? 'bg-amber-100 text-amber-700' :
                            st.color === 'indigo' ? 'bg-indigo-100 text-indigo-700' :
                            st.color === 'blue' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {job.status === 'done' && <CheckCircle size={12} />}
                            {st.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Package size={12} /> {job.total_parts} pcs
                          </span>
                          <span className="flex items-center gap-1">
                            <LayoutGrid size={12} /> {job.total_panels} panneaux
                          </span>
                          <span className={`flex items-center gap-1 ${
                            job.total_waste_pct > 20 ? 'text-red-500' :
                            job.total_waste_pct > 15 ? 'text-amber-500' :
                            'text-green-600'
                          }`}>
                            <AlertTriangle size={12} /> {job.total_waste_pct}% chute
                          </span>
                          <span className="text-gray-400">
                            {new Date(job.created_at).toLocaleDateString('fr-FR')}
                          </span>
                        </div>
                      </div>
                      <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* New Job Modal */}
        <FormModal
          isOpen={showNew}
          onClose={() => setShowNew(false)}
          title="Nouveau travail de découpe"
          footer={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowNew(false)}>Annuler</Button>
              <Button onClick={handleCreate} loading={creating} disabled={!selectedProject}>
                <Scissors size={16} /> Créer & Imbriquer
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Sélectionnez un projet. L&apos;imbrication sera générée automatiquement à partir des pièces du projet.
            </p>
            {createError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{createError}</span>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Projet</label>
              <select
                value={selectedProject}
                onChange={e => setSelectedProject(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
              >
                <option value="">— Choisir un projet —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.reference_code} — {p.client_name}
                  </option>
                ))}
              </select>
            </div>
            {creating && (
              <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 rounded-xl px-4 py-3">
                <Loader2 size={16} className="animate-spin" />
                Imbrication en cours... (MaxRects 2D bin-packing)
              </div>
            )}
          </div>
        </FormModal>
      </div>
    </RoleGuard>
  );
}
