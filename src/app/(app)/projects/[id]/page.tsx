'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useProjectLoader } from '@/lib/hooks/useProjectLoader';
import { useProjectPermissions } from '@/lib/hooks/useProjectPermissions';
import { useFormModal } from '@/lib/hooks/useFormModal';
import { useConfirmDialog } from '@/lib/hooks/useConfirmDialog';
import { updateProject } from '@/lib/services/project.service';
import { validateProjectParts } from '@/lib/services/validation-engine.service';
import { calculateAndStoreCosts, generateAutoQuote } from '@/lib/services/cost-engine.service';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import FormModal from '@/components/ui/FormModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { PROJECT_STAGES } from '@/lib/constants';
import { getAvailableTransitions } from '@/lib/integrity/project-fsm-core';
import type { ProjectStatus } from '@/types/crm';
import PhotoUpload from '@/components/ui/PhotoUpload';
import { useLocale } from '@/lib/hooks/useLocale';
import {
  ArrowLeft, Phone, MapPin, Mail, Calendar, User, DollarSign,
  FileText, Clock, CheckCircle, CreditCard, Ruler, Palette, Factory, Truck, Printer, Upload,
  BarChart3, Box, MessageCircle, Package, LayoutGrid, Pencil, X, Scissors
} from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import ProjectMfgTabs from '@/components/projects/ProjectMfgTabs';
import ProductionTimeline from '@/components/projects/ProductionTimeline';

const STATUS_ICONS: Record<string, React.ReactNode> = {
  measurements: <Ruler size={16} />,
  measurements_confirmed: <CheckCircle size={16} />,
  design: <Palette size={16} />,
  client_validation: <CheckCircle size={16} />,
  production: <Factory size={16} />,
  installation: <Truck size={16} />,
  delivered: <CheckCircle size={16} />,
  cancelled: <X size={16} />,
};

const EDIT_INITIAL = {
  client_name: '',
  client_phone: '',
  client_email: '',
  client_address: '',
  client_city: '',
  total_amount: '',
  priority: 'normal',
  notes: '',
};

export default function ProjectDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { profile, canViewFinance } = useAuth();
  const { t } = useLocale();

  // ── Data loading via useProjectLoader ───────────────────────────────────────
  const {
    project,
    loading,
    error: loadError,
    reload,
    payments,
    events,
    quotes,
  } = useProjectLoader(id as string, {
    includePayments: true,
    includeEvents: true,
    includeQuotes: true,
  });

  // ── Permissions ─────────────────────────────────────────────────────────────
  const perms = useProjectPermissions(project);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [files, setFiles] = useState<{ url: string; name: string }[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [generatingQuote, setGeneratingQuote] = useState(false);
  const [schedulingInstall, setSchedulingInstall] = useState(false);
  const [installDate, setInstallDate] = useState('');
  const [installTime, setInstallTime] = useState('');
  const [installNotes, setInstallNotes] = useState('');

  // ── Auto-quote generation ────────────────────────────────────────────────────
  async function handleGenerateAutoQuote() {
    if (!project || !profile?.id) return;
    setGeneratingQuote(true);
    setErrorMsg(null);
    try {
      // 1. Validate parts first
      const validation = await validateProjectParts(id as string);
      if (validation.success && validation.data && !validation.data.is_valid) {
        setErrorMsg(`Impossible de générer le devis: ${validation.data.errors.length} erreurs de validation. Corrigez les pièces d'abord.`);
        setGeneratingQuote(false);
        return;
      }

      // 2. Calculate costs from BOM
      const costResult = await calculateAndStoreCosts(id as string, profile.id);
      if (!costResult.success || !costResult.data) {
        setErrorMsg(costResult.error || 'Échec du calcul des coûts.');
        setGeneratingQuote(false);
        return;
      }

      // 3. Generate quote from cost breakdown
      const quoteResult = await generateAutoQuote(id as string, profile.id, costResult.data);
      if (!quoteResult.success || !quoteResult.data) {
        setErrorMsg(quoteResult.error || 'Échec de la génération du devis.');
        setGeneratingQuote(false);
        return;
      }

      setSuccessMsg(`Devis v${quoteResult.data.version} généré automatiquement.`);
      reload();
    } catch (err) {
      setErrorMsg('Erreur inattendue lors de la génération du devis.');
    }
    setGeneratingQuote(false);
  }

  // ── Schedule installation ──────────────────────────────────────────────────
  async function handleScheduleInstallation() {
    if (!project || !installDate) {
      setErrorMsg('Veuillez sélectionner une date d\'installation.');
      return;
    }
    setSchedulingInstall(true);
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const sb = createClient();

      // Check if installation already exists for this project
      const { data: existing } = await sb.from('installations')
        .select('id').eq('project_id', project.id).limit(1);
      if (existing && existing.length > 0) {
        setErrorMsg('Une installation existe déjà pour ce projet.');
        setSchedulingInstall(false);
        return;
      }

      const { error } = await sb.from('installations').insert({
        project_id: project.id,
        scheduled_date: installDate,
        scheduled_time: installTime || null,
        status: 'scheduled',
        client_address: project.client_address || null,
        client_phone: project.client_phone || null,
        notes: installNotes || null,
        estimated_duration_hours: 8,
      });
      if (error) throw error;
      setSuccessMsg('Installation planifiée avec succès.');
      setInstallDate('');
      setInstallTime('');
      setInstallNotes('');
      reload();
    } catch (err: any) {
      setErrorMsg('Erreur lors de la planification: ' + (err.message || err));
    }
    setSchedulingInstall(false);
  }

  // ── Edit modal ──────────────────────────────────────────────────────────────
  const editModal = useFormModal(EDIT_INITIAL);
  const [editSaving, setEditSaving] = useState(false);

  // ── Production order for timeline ──────────────────────────────────────────
  const [productionOrderId, setProductionOrderId] = useState<string | null>(null);
  // ── BOM summary ──────────────────────────────────────────────────────────────
  const [bomSummary, setBomSummary] = useState<{ parts: number; materials: number; area: number; edge: number } | null>(null);
  useEffect(() => {
    if (!id) return;
    import('@/lib/supabase/client').then(({ createClient }) => {
      const sb = createClient();
      // Production order
      sb.from('production_orders')
        .select('id')
        .eq('project_id', id)
        .in('status', ['pending', 'in_progress', 'completed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .then(({ data }) => {
          if (data?.[0]) setProductionOrderId(data[0].id);
        });
      // BOM summary from project_parts
      sb.from('project_parts')
        .select('width_mm, height_mm, quantity, edge_top, edge_bottom, edge_left, edge_right, material_type')
        .eq('project_id', id)
        .then(({ data: pp }) => {
          if (!pp || pp.length === 0) return;
          const parts = pp.reduce((s, p) => s + p.quantity, 0);
          const area = pp.reduce((s, p) => s + (p.width_mm * p.height_mm * p.quantity) / 1e6, 0);
          const edge = pp.reduce((s, p) => s + p.quantity * (
            (p.edge_top ? p.width_mm : 0) + (p.edge_bottom ? p.width_mm : 0) +
            (p.edge_left ? p.height_mm : 0) + (p.edge_right ? p.height_mm : 0)
          ), 0);
          const materials = new Set(pp.map(p => p.material_type)).size;
          setBomSummary({ parts, materials, area: Math.round(area * 100) / 100, edge: Math.round(edge / 10) / 100 });
        });
    });
  }, [id]);

  // ── Cutting method + job summaries ───────────────────────────────────────
  const [cuttingMethod, setCuttingMethod] = useState<'saw' | 'cnc'>('saw');
  const [cuttingJob, setCuttingJob] = useState<{ id: string; status: string; total_parts: number; total_panels: number; total_waste_pct: number; cnc_count: number } | null>(null);
  const [sawSummary, setSawSummary] = useState<{ sheets: number; avgWaste: number; totalParts: number; cutParts: number } | null>(null);

  useEffect(() => {
    if (!id) return;
    import('@/lib/supabase/client').then(({ createClient }) => {
      const sb = createClient();

      // Fetch project cutting_method
      sb.from('projects').select('cutting_method').eq('id', id).single().then(({ data }) => {
        if (data?.cutting_method) setCuttingMethod(data.cutting_method as 'saw' | 'cnc');
      });

      // CNC job summary
      sb.from('cutting_jobs')
        .select('id, status, total_parts, total_panels, total_waste_pct')
        .eq('project_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .then(async ({ data }) => {
          if (!data?.[0]) return;
          const job = data[0];
          const { count } = await sb.from('cnc_programs').select('id', { count: 'exact', head: true }).eq('cutting_job_id', job.id);
          setCuttingJob({ ...job, cnc_count: count || 0 });
        });

      // SAW nesting summary
      sb.from('saw_nesting_results')
        .select('waste_percent, strips')
        .eq('project_id', id)
        .then(({ data: sawData }) => {
          if (!sawData?.length) return;
          const totalParts = sawData.reduce((s, sh) =>
            s + ((sh.strips as any[]) || []).reduce((ss: number, strip: any) => ss + (strip.parts?.length || 0), 0), 0);
          const avgWaste = Math.round(sawData.reduce((s, r) => s + r.waste_percent, 0) / sawData.length * 100) / 100;
          setSawSummary({ sheets: sawData.length, avgWaste, totalParts, cutParts: 0 });
        });

      // SAW cut progress
      sb.from('project_parts')
        .select('cut_at')
        .eq('project_id', id)
        .neq('material_type', 'hardware')
        .not('cut_at', 'is', null)
        .then(({ data, count }) => {
          if (data) {
            setSawSummary(prev => prev ? { ...prev, cutParts: data.length } : null);
          }
        });
    });
  }, [id]);

  async function toggleCuttingMethod(method: 'saw' | 'cnc') {
    setCuttingMethod(method);
    const { createClient } = await import('@/lib/supabase/client');
    const sb = createClient();
    await sb.from('projects').update({ cutting_method: method }).eq('id', id);
  }

  // ── Confirm dialog (for production safety) ─────────────────────────────────
  const confirm = useConfirmDialog();

  function openEdit() {
    if (!project) return;
    editModal.openEdit({
      client_name: project.client_name,
      client_phone: project.client_phone || '',
      client_email: project.client_email || '',
      client_address: project.client_address || '',
      client_city: project.client_city || '',
      total_amount: project.total_amount ? String(project.total_amount) : '',
      priority: project.priority || 'normal',
      notes: project.notes || '',
    });
  }

  async function saveEdit() {
    if (!editModal.formData.client_name.trim()) {
      setErrorMsg('Client name is required.');
      return;
    }
    setEditSaving(true);
    const res = await updateProject(id as string, {
      client_name: editModal.formData.client_name,
      client_phone: editModal.formData.client_phone || null,
      client_email: editModal.formData.client_email || null,
      client_address: editModal.formData.client_address || null,
      client_city: editModal.formData.client_city || null,
      total_amount: editModal.formData.total_amount ? parseFloat(editModal.formData.total_amount) : 0,
      priority: editModal.formData.priority,
      notes: editModal.formData.notes || null,
    });
    setEditSaving(false);
    if (!res.success) {
      setErrorMsg(res.error || 'Failed to save');
    } else {
      editModal.close();
      setSuccessMsg(t('projects.updated_success'));
      reload();
    }
  }

  async function handleStatusChange(newStatus: ProjectStatus, override = false) {
    if (!project) return;
    setErrorMsg(null);

    // ── Layer 2: Parts validation before production (HARD BLOCK only) ───────
    // Checks structurally impossible parts: zero dims, missing material,
    // exceeds per-module-type max dimensions.
    // Only on first attempt — skipped on CEO override retry.
    if (newStatus === 'production' && !override) {
      const validation = await validateProjectParts(id as string);

      if (validation.success && validation.data) {
        const criticalErrors = validation.data.errors;

        // HARD BLOCK: structurally impossible — cannot override
        if (criticalErrors.length > 0) {
          const msgs = criticalErrors.slice(0, 5).map(e => `• ${e.message}`).join('\n');
          const total = criticalErrors.length;
          setErrorMsg(
            `Validation échouée (${total} erreur(s) critique(s)):\n${msgs}` +
            `${total > 5 ? '\n• ...' : ''}` +
            `\n\nCorrigez les pièces avant de lancer la production.`
          );
          return;
        }
        // Soft warnings (below min threshold) are informational — do not block.
      }
      // If validation.success is false (no parts, DB error) — proceed to API.
    }

    // ── Layer 1 + 3: ALL transitions go through the API ─────────────────────
    // Layer 1: FSM edge check → HARD BLOCK
    // Layer 3: Business rules (deposit, design, total) → SOFT BLOCK
    try {
      const res = await fetch(`/api/projects/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, override }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setSuccessMsg(`Status updated to ${newStatus.replace(/_/g, ' ')}`);
        reload();
        return;
      }

      // ── HARD BLOCK: FSM violation — cannot proceed ─────────────────────
      if (data.blockType === 'hard') {
        setErrorMsg(data.violations?.join('\n') || data.reason || 'Transition not allowed');
        return;
      }

      // ── SOFT BLOCK: business warnings — CEO can override ───────────────
      if (data.blockType === 'soft' && data.overridable) {
        const warnings = (data.warnings || []).map((w: string) => `• ${w}`).join('\n');

        if (profile?.role !== 'ceo') {
          setErrorMsg(`Cannot proceed. Only CEO can override:\n${warnings}`);
          return;
        }

        // CEO confirm dialog for override
        confirm.open({
          title: 'Business Rule Warning',
          message: `Issues found:\n${warnings}\n\nProceed with CEO override?`,
          onConfirm: async () => {
            await handleStatusChange(newStatus, true);
          },
        });
        return;
      }

      // Generic error fallback
      setErrorMsg(data.reason || data.message || data.error || 'Failed to update status');
    } catch (err) {
      setErrorMsg('Network error: could not reach transition API');
    }
  }

  // Compute FSM-valid transitions for the current status
  const fsmTransitions = project
    ? [...getAvailableTransitions(project.status as ProjectStatus)]
    : [];

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;
  if (!project) return (
    <div className="space-y-4">
      <ErrorBanner message={loadError || 'Project not found'} type="error" />
      <div className="text-center py-12 text-gray-500">{t('common.no_results')}</div>
    </div>
  );

  const paymentPct = project.total_amount > 0 ? Math.round((project.paid_amount / project.total_amount) * 100) : 0;

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager'] as any[]}>
    <div className="space-y-4">
      {/* Banners */}
      <ErrorBanner message={errorMsg} type="error" onDismiss={() => setErrorMsg(null)} />
      <ErrorBanner message={successMsg} type="success" onDismiss={() => setSuccessMsg(null)} autoDismiss={3000} />
      <ErrorBanner message={loadError} type="warning" onDismiss={() => {}} />

      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/projects')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <p className="text-xs text-gray-400 font-mono">{project.reference_code}</p>
          <h1 className="text-xl font-bold text-gray-900">{project.client_name}</h1>
        </div>
        <StatusBadge status={project.status} />
        {perms.canEdit && (
          <button onClick={openEdit} className="p-2 hover:bg-gray-100 rounded-lg" title="Edit project">
            <Pencil size={18} className="text-gray-500" />
          </button>
        )}
      </div>

      {/* Project Info */}
      <ProjectMfgTabs projectId={String(id)} />
      <Card>
        <CardContent>
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <StatusBadge status={project.project_type} />
              {project.priority !== 'normal' && <StatusBadge status={project.priority} />}
            </div>
            {project.client_phone && (
              <a href={`tel:${project.client_phone}`} className="flex items-center gap-2 text-sm text-blue-600">
                <Phone size={15} className="text-gray-400" /> {project.client_phone}
              </a>
            )}
            {project.client_email && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail size={15} className="text-gray-400" /> {project.client_email}
              </div>
            )}
            {project.client_address && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <MapPin size={15} className="text-gray-400" /> {project.client_address}{project.client_city ? `, ${project.client_city}` : ''}
              </div>
            )}
            {project.designer && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User size={15} className="text-gray-400" /> {t('projects.design')}: {(project.designer as any).full_name}
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Clock size={14} /> {t('projects.created_on')} {new Date(project.created_at).toLocaleDateString('fr-FR')}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Progress */}
      {canViewFinance && project.total_amount > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm flex items-center gap-2"><DollarSign size={16} /> {t('costs.title')}</h2>
              <span className="text-sm font-bold">{paymentPct}%</span>
            </div>
            <div className="w-full h-2.5 bg-gray-100 rounded-full mt-2">
              <div className={`h-full rounded-full transition-all ${paymentPct >= 100 ? 'bg-green-500' : paymentPct >= 50 ? 'bg-blue-500' : 'bg-orange-500'}`}
                style={{ width: `${Math.min(paymentPct, 100)}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-1">{project.paid_amount.toLocaleString()} / {project.total_amount.toLocaleString()} MAD</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
              <div className={`p-2 rounded-lg ${project.deposit_paid ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
                <p className="font-medium">{t('projects.deposit_50')}</p>
                <p>{project.deposit_paid ? t('finance.paid') : t('finance.pending')}</p>
              </div>
              <div className={`p-2 rounded-lg ${project.pre_install_paid ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
                <p className="font-medium">{t('projects.pre_install_90')}</p>
                <p>{project.pre_install_paid ? t('finance.paid') : t('finance.pending')}</p>
              </div>
              <div className={`p-2 rounded-lg ${project.final_paid ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
                <p className="font-medium">{t('projects.final_100')}</p>
                <p>{project.final_paid ? t('finance.paid') : t('finance.pending')}</p>
              </div>
            </div>
            {payments.length > 0 && (
              <div className="space-y-2">
                {payments.map(p => (
                  <div key={p.id} className="flex justify-between items-center text-sm border-b border-gray-50 pb-2">
                    <div>
                      <StatusBadge status={p.payment_type} />
                      <span className="text-xs text-gray-400 ml-2">{p.payment_method}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-green-600">{p.amount.toLocaleString()} MAD</p>
                      <p className="text-xs text-gray-400">{new Date(p.received_at).toLocaleDateString('fr-FR')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invoice Button */}
      {canViewFinance && project.total_amount > 0 && ['production', 'installation', 'delivered', 'completed'].includes(project.status) && (
        <RoleGuard allowedRoles={['ceo', 'commercial_manager'] as any[]}>
          <Button variant="secondary" size="sm" className="w-full" onClick={() => window.open(`/api/print/invoice?project_id=${id}`, '_blank')}>
            <Printer size={14} /> Imprimer la Facture
          </Button>
        </RoleGuard>
      )}

      {/* Quotes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2"><FileText size={16} /> {t('quotes.title')}</h2>
            <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer'] as any[]}>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => router.push(`/quotes/new?project_id=${id}`)}>
                  <FileText size={14} /> Nouveau
                </Button>
                <Button variant="primary" size="sm" onClick={handleGenerateAutoQuote} disabled={generatingQuote}>
                  <DollarSign size={14} /> {generatingQuote ? 'Calcul...' : 'Auto Devis'}
                </Button>
              </div>
            </RoleGuard>
          </div>
        </CardHeader>
        <CardContent>
          {quotes.length > 0 ? (
            <div className="space-y-2">
              {quotes.map(q => (
                <div key={q.id} className="flex justify-between items-center text-sm p-2 hover:bg-gray-50 rounded-lg cursor-pointer"
                  onClick={() => router.push(`/quotes/${q.id}`)}>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">v{q.version}</span>
                    <StatusBadge status={q.status} />
                  </div>
                  <span className="font-medium">{q.total_amount.toLocaleString()} MAD</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">Aucun devis. Utilisez "Auto Devis" pour en générer un depuis le BOM.</p>
          )}
        </CardContent>
      </Card>

      {/* Schedule Installation — only when project is in production or installation status */}
      {(project.status === 'production' || project.status === 'installation') && perms.canEdit && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-sm flex items-center gap-2"><Truck size={16} /> Planifier l&apos;Installation</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Date *</label>
                <input type="date" value={installDate} onChange={e => setInstallDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Heure</label>
                <input type="time" value={installTime} onChange={e => setInstallTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs text-gray-500 mb-1 block">Notes</label>
              <input type="text" value={installNotes} onChange={e => setInstallNotes(e.target.value)}
                placeholder="Instructions pour l'installateur..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <Button variant="primary" size="sm" className="mt-3 w-full" onClick={handleScheduleInstallation} disabled={schedulingInstall || !installDate}>
              <Truck size={14} /> {schedulingInstall ? 'Planification...' : 'Planifier l\'Installation'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Status Pipeline — only shows FSM-valid transitions */}
      {perms.canChangeStatus && fsmTransitions.length > 0 && (
        <Card>
          <CardHeader><h2 className="font-semibold text-sm">{t('projects.move_to')}</h2></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {fsmTransitions.map(status => (
                <Button key={status} variant="secondary" size="sm" onClick={() => handleStatusChange(status)}>
                  {STATUS_ICONS[status]} {status.replace(/_/g, ' ')}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      {events.length > 0 && (
        <Card>
          <CardHeader><h2 className="font-semibold text-sm">{t('projects.timeline')}</h2></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {events.map(evt => (
                <div key={evt.id} className="flex gap-3 text-sm border-l-2 border-gray-200 pl-3">
                  <div>
                    <p className="text-gray-700">{evt.description}</p>
                    <p className="text-xs text-gray-400">{new Date(evt.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Factory Tools */}
      <Card>
        <CardHeader><h2 className="font-semibold text-sm flex items-center gap-2"><Factory size={16} /> {t('projects.factory_tools')}</h2></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => router.push(`/projects/${id}/parts`)}>
              <Box size={14} /> Parts
            </Button>
            <Button variant="secondary" size="sm" onClick={() => router.push(`/projects/${id}/production`)}>
              <Package size={14} /> {t('projects.production')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => router.push(`/projects/${id}/structure`)}>
              <LayoutGrid size={14} /> {t('projects.structure')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => router.push(`/projects/${id}/cabinets`)}>
              <Box size={14} /> {t('cabinets.title')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => router.push(`/projects/${id}/notify`)}>
              <MessageCircle size={14} /> {t('projects.notify_client')}
            </Button>
            {perms.canViewCosts && (
              <>
                <Button variant="secondary" size="sm" onClick={() => router.push(`/projects/${id}/costs`)}>
                  <BarChart3 size={14} /> {t('projects.profitability')}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => router.push(`/projects/${id}/performance`)}>
                  <BarChart3 size={14} /> {t('projects.performance')}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* BOM Summary */}
      {bomSummary && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm flex items-center gap-2"><Package size={16} /> Material Requirements</h2>
              <button onClick={() => router.push(`/projects/${id}/bom`)} className="text-xs text-blue-600 hover:underline">View BOM</button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="bg-blue-50 rounded-xl p-2">
                <p className="text-lg font-bold text-blue-700">{bomSummary.parts}</p>
                <p className="text-blue-500">Panels</p>
              </div>
              <div className="bg-green-50 rounded-xl p-2">
                <p className="text-lg font-bold text-green-700">{bomSummary.area}</p>
                <p className="text-green-500">m²</p>
              </div>
              <div className="bg-orange-50 rounded-xl p-2">
                <p className="text-lg font-bold text-orange-700">{bomSummary.edge}</p>
                <p className="text-orange-500">Edge (m)</p>
              </div>
              <div className="bg-purple-50 rounded-xl p-2">
                <p className="text-lg font-bold text-purple-700">{bomSummary.materials}</p>
                <p className="text-purple-500">Materials</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cutting — SAW/CNC */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Scissors size={16} className="text-[#C9956B]" /> Cutting
            </h2>
            {/* SAW / CNC toggle */}
            {['ceo', 'workshop_manager'].includes(profile?.role || '') && (
              <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
                <button
                  onClick={() => toggleCuttingMethod('saw')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${cuttingMethod === 'saw' ? 'bg-white text-[#C9956B] shadow-sm' : 'text-gray-500'}`}
                >
                  SAW
                </button>
                <button
                  onClick={() => toggleCuttingMethod('cnc')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${cuttingMethod === 'cnc' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
                >
                  CNC
                </button>
              </div>
            )}
            {!['ceo', 'workshop_manager'].includes(profile?.role || '') && (
              <span className="text-xs font-medium text-gray-400 uppercase">{cuttingMethod}</span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {cuttingMethod === 'saw' ? (
            /* ── SAW View ── */
            sawSummary && sawSummary.sheets > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-blue-50 rounded-xl p-2">
                    <p className="text-lg font-bold text-blue-700">{sawSummary.totalParts}</p>
                    <p className="text-blue-500 text-xs">Parts</p>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-2">
                    <p className="text-lg font-bold text-emerald-700">{sawSummary.sheets}</p>
                    <p className="text-emerald-500 text-xs">Sheets</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-2">
                    <p className="text-lg font-bold text-amber-700">{sawSummary.avgWaste}%</p>
                    <p className="text-amber-500 text-xs">Waste</p>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-2">
                    <p className="text-lg font-bold text-purple-700">{sawSummary.cutParts}/{sawSummary.totalParts}</p>
                    <p className="text-purple-500 text-xs">Cut</p>
                    <div className="mt-1 h-1 bg-purple-100 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${sawSummary.totalParts > 0 ? (sawSummary.cutParts / sawSummary.totalParts * 100) : 0}%` }} />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button variant="primary" size="sm" onClick={() => router.push(`/saw/cutting-list/${id}`)}>
                    <Scissors size={14} /> Cutting List
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-400 mb-3">No SAW cutting plan yet</p>
                <Button variant="primary" size="sm" onClick={() => router.push(`/saw/cutting-list/${id}`)}>
                  <Scissors size={14} /> Open SAW Cutting
                </Button>
              </div>
            )
          ) : (
            /* ── CNC View (existing) ── */
            cuttingJob ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-blue-50 rounded-xl p-2">
                    <p className="text-lg font-bold text-blue-700">{cuttingJob.total_parts}</p>
                    <p className="text-blue-500 text-xs">Parts</p>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-2">
                    <p className="text-lg font-bold text-emerald-700">{cuttingJob.total_panels}</p>
                    <p className="text-emerald-500 text-xs">Panels</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-2">
                    <p className="text-lg font-bold text-amber-700">{cuttingJob.total_waste_pct}%</p>
                    <p className="text-amber-500 text-xs">Waste</p>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-2">
                    <p className="text-lg font-bold text-purple-700">{cuttingJob.cnc_count}</p>
                    <p className="text-purple-500 text-xs">G-Code</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <StatusBadge status={cuttingJob.status} />
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => router.push(`/cutting/layout/${cuttingJob.id}`)}>
                      <LayoutGrid size={14} /> Layout
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => router.push(`/cutting/jobs/${cuttingJob.id}`)}>
                      Details
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-400 mb-3">No CNC cutting job yet</p>
                {['ceo', 'workshop_manager'].includes(profile?.role || '') && (
                  <Button variant="primary" size="sm" onClick={() => router.push(`/cutting/jobs?project=${id}`)}>
                    <Scissors size={14} /> Generate CNC Job
                  </Button>
                )}
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* Production Timeline */}
      {productionOrderId && (
        <Card>
          <CardContent>
            <ProductionTimeline orderId={productionOrderId} />
          </CardContent>
        </Card>
      )}

      {/* Print / Documents */}
      <Card>
        <CardHeader><h2 className="font-semibold text-sm flex items-center gap-2"><Printer size={16} /> {t('projects.documents')}</h2></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => window.open(`/api/print/delivery-note?id=${id}`, '_blank')}>
              <Truck size={14} /> {t('projects.delivery_note')}
            </Button>
            {quotes.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => window.open(`/api/quote-pdf?id=${quotes[0].id}`, '_blank')}>
                <FileText size={14} /> {t('projects.latest_quote')}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => window.open(`/api/export/panels-csv?project_id=${id}`, '_blank')}>
              <FileText size={14} /> {t('cabinets.panel_list')} CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* File Uploads */}
      <Card>
        <CardHeader><h2 className="font-semibold text-sm flex items-center gap-2"><Upload size={16} /> {t('projects.project_files')}</h2></CardHeader>
        <CardContent>
          <PhotoUpload
            bucket="project-files"
            pathPrefix={`project-${id}`}
            onUpload={(data) => setFiles(prev => [...prev, { url: data.url, name: data.path }])}
            existingPhotos={files.map(f => ({ url: f.url }))}
            maxPhotos={20}
            label={t('projects.upload_files')}
          />
        </CardContent>
      </Card>

      {project.notes && (
        <Card>
          <CardHeader><h2 className="font-semibold text-sm">{t('common.notes')}</h2></CardHeader>
          <CardContent><p className="text-sm text-gray-600 whitespace-pre-wrap">{project.notes}</p></CardContent>
        </Card>
      )}

      {/* Edit Project Modal */}
      <FormModal
        isOpen={editModal.isOpen}
        onClose={editModal.close}
        title={t('projects.edit_project')}
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={editModal.close} disabled={editSaving}>
              {t('common.cancel')}
            </Button>
            <Button
              className="flex-1"
              onClick={saveEdit}
              loading={editSaving}
              disabled={editSaving}
            >
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('projects.client_name')} *</label>
            <input
              value={editModal.formData.client_name}
              onChange={e => editModal.setField('client_name', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              placeholder="Client name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.phone')}</label>
              <input
                value={editModal.formData.client_phone}
                onChange={e => editModal.setField('client_phone', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                placeholder="+212..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.email')}</label>
              <input
                value={editModal.formData.client_email}
                onChange={e => editModal.setField('client_email', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                placeholder="email@..."
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.address')}</label>
            <input
              value={editModal.formData.client_address}
              onChange={e => editModal.setField('client_address', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.city')}</label>
              <input
                value={editModal.formData.client_city}
                onChange={e => editModal.setField('client_city', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('finance.amount')}</label>
              <input
                type="number"
                value={editModal.formData.total_amount}
                onChange={e => editModal.setField('total_amount', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.priority')}</label>
            <select
              value={editModal.formData.priority}
              onChange={e => editModal.setField('priority', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option value="normal">{t('common.normal')}</option>
              <option value="high">{t('common.high')}</option>
              <option value="urgent">{t('common.urgent')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.notes')}</label>
            <textarea
              value={editModal.formData.notes}
              onChange={e => editModal.setField('notes', e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />
          </div>
        </div>
      </FormModal>

      {/* Confirm Dialog (production safety override) */}
      <ConfirmDialog
        isOpen={confirm.isOpen}
        onClose={confirm.close}
        onConfirm={confirm.confirm}
        title={confirm.title}
        message={confirm.message}
        variant="warning"
        confirmLabel="Override & Proceed"
        loading={confirm.loading}
      />

    </div>
      </RoleGuard>
  );
}
