'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { PROJECT_STAGES } from '@/lib/constants';
import type { Project, ProjectStatus } from '@/types/database';
import PhotoUpload from '@/components/ui/PhotoUpload';
import { useLocale } from '@/lib/hooks/useLocale';
import {
  ArrowLeft, Phone, MapPin, Mail, Calendar, User, DollarSign,
  FileText, Clock, CheckCircle, CreditCard, Ruler, Palette, Factory, Truck, Printer, Upload,
  BarChart3, Box, MessageCircle, Package, LayoutGrid, Pencil, X,
  Lock, AlertTriangle, ChevronRight, XCircle
} from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import ProjectMfgTabs from '@/components/projects/ProjectMfgTabs';

interface ProjectDetail extends Omit<Project, 'designer'> {
  designer?: { full_name: string } | null;
}

interface Payment {
  id: string;
  amount: number;
  payment_type: string;
  payment_method: string;
  received_at: string;
}

interface ProjectEvent {
  id: string;
  event_type: string;
  description: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

interface Quote {
  id: string;
  version: number;
  status: string;
  total_amount: number;
  created_at: string;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  draft: <FileText size={16} />,
  measurements_confirmed: <Ruler size={16} />,
  design_validated: <Palette size={16} />,
  bom_generated: <Box size={16} />,
  ready_for_production: <CheckCircle size={16} />,
  in_production: <Factory size={16} />,
  installation: <Truck size={16} />,
  delivered: <CheckCircle size={16} />,
  cancelled: <XCircle size={16} />,
};

// Map project statuses to their sequential order for the progress bar
const STAGE_ORDER: ProjectStatus[] = [
  'draft', 'measurements_confirmed', 'design_validated', 'bom_generated',
  'ready_for_production', 'in_production', 'installation', 'delivered',
];

// Valid next transitions per status (matches FSM exactly)
const VALID_NEXT: Record<ProjectStatus, ProjectStatus[]> = {
  draft:                   ['measurements_confirmed'],
  measurements_confirmed:  ['design_validated'],
  design_validated:        ['bom_generated'],
  bom_generated:           ['ready_for_production'],
  ready_for_production:    ['in_production'],
  in_production:           ['installation'],
  installation:            ['delivered'],
  delivered:               [],
  cancelled:               [],
};

export default function ProjectDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { profile, canViewFinance } = useAuth();
  const supabase = createClient();
  const { t } = useLocale();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<{ url: string; name: string }[]>([]);
  const [showEdit, setShowEdit] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({ client_name: '', client_phone: '', client_email: '', client_address: '', client_city: '', total_amount: '', priority: 'normal', notes: '' });

  // Transition state
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState('');
  const [showDepositException, setShowDepositException] = useState(false);

  // Cancel modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Exception request modal
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [exceptionForm, setExceptionForm] = useState({ reason: '', note: '' });
  const [exceptionSubmitting, setExceptionSubmitting] = useState(false);
  const [exceptionStatus, setExceptionStatus] = useState<'idle' | 'sent' | 'pending'>('idle');

  useEffect(() => { loadAll(); }, [id]);

  async function loadAll() {
    const [projRes, payRes, evtRes, quoteRes] = await Promise.all([
      supabase.from('projects')
        .select('*, designer:profiles!projects_designer_id_fkey(full_name)')
        .eq('id', id).single(),
      supabase.from('payments').select('*').eq('project_id', id).order('received_at', { ascending: false }),
      supabase.from('project_events').select('*').eq('project_id', id).order('created_at', { ascending: false }),
      supabase.from('quotes').select('*').eq('project_id', id).order('version', { ascending: false }),
    ]);

    setProject(projRes.data as ProjectDetail);
    setPayments(payRes.data || []);
    setEvents((evtRes.data as ProjectEvent[]) || []);
    setQuotes(quoteRes.data || []);
    setLoading(false);
  }

  function openEdit() {
    if (!project) return;
    setEditForm({
      client_name: project.client_name,
      client_phone: project.client_phone || '',
      client_email: project.client_email || '',
      client_address: project.client_address || '',
      client_city: project.client_city || '',
      total_amount: project.total_amount ? String(project.total_amount) : '',
      priority: project.priority || 'normal',
      notes: project.notes || '',
    });
    setShowEdit(true);
  }

  async function saveEdit() {
    if (!editForm.client_name.trim()) return;
    setEditSaving(true);
    await supabase.from('projects').update({
      client_name: editForm.client_name.trim(),
      client_phone: editForm.client_phone || null,
      client_email: editForm.client_email || null,
      client_address: editForm.client_address || null,
      client_city: editForm.client_city || null,
      total_amount: editForm.total_amount ? parseFloat(editForm.total_amount) : 0,
      priority: editForm.priority,
      notes: editForm.notes || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    setShowEdit(false);
    setEditSaving(false);
    loadAll();
  }

  async function transitionTo(newStatus: ProjectStatus, opts?: { cancelled_reason?: string; notes?: string }) {
    setTransitioning(true);
    setTransitionError('');
    setShowDepositException(false);

    try {
      const res = await fetch(`/api/projects/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          notes: opts?.notes,
          cancelled_reason: opts?.cancelled_reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const reason = data.reason || data.message || data.error || 'Transition refusée';
        setTransitionError(reason);
        // Detect deposit gate block → show "Request Exception" option
        if (newStatus === 'in_production' && reason.toLowerCase().includes('acompte')) {
          setShowDepositException(true);
        }
        setTransitioning(false);
        return;
      }
      setTransitioning(false);
      setShowCancelModal(false);
      loadAll();
    } catch {
      setTransitionError('Erreur réseau');
      setTransitioning(false);
    }
  }

  async function submitExceptionRequest() {
    if (!exceptionForm.reason.trim()) return;
    setExceptionSubmitting(true);

    try {
      const res = await fetch(`/api/projects/${id}/exception-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: exceptionForm.reason, note: exceptionForm.note || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTransitionError(data.error || 'Erreur lors de la demande');
        setExceptionSubmitting(false);
        return;
      }
      setExceptionStatus('sent');
      setShowExceptionModal(false);
      setTransitionError('');
      setShowDepositException(false);
      setExceptionForm({ reason: '', note: '' });
      loadAll();
    } catch {
      setTransitionError('Erreur réseau');
    }
    setExceptionSubmitting(false);
  }

  // Check for pending exception on load
  useEffect(() => {
    if (!id) return;
    createClient().from('project_exceptions')
      .select('id')
      .eq('project_id', id)
      .eq('status', 'pending')
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setExceptionStatus('pending');
      });
  }, [id]);

  async function handleCancel() {
    if (!cancelReason.trim()) {
      setTransitionError('Une raison d\'annulation est obligatoire.');
      return;
    }
    await transitionTo('cancelled', { cancelled_reason: cancelReason });
  }

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;
  if (!project) return <div className="text-center py-12 text-gray-500">{t('common.no_results')}</div>;

  const paymentPct = project.total_amount > 0 ? Math.round((project.paid_amount / project.total_amount) * 100) : 0;
  const currentStageIdx = STAGE_ORDER.indexOf(project.status as ProjectStatus);
  const isTerminal = project.status === 'delivered' || project.status === 'cancelled';
  const nextStatuses = VALID_NEXT[project.status as ProjectStatus] || [];
  const canManage = ['ceo', 'commercial_manager', 'workshop_manager', 'operations_manager'].includes(profile?.role || '');

  // Get label for a status
  function statusLabel(s: string): string {
    const stage = PROJECT_STAGES.find(st => st.key === s);
    return stage?.label || s;
  }

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/projects')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <p className="text-xs text-gray-400 font-mono">{project.reference_code}</p>
          <h1 className="text-xl font-bold text-gray-900">{project.client_name}</h1>
        </div>
        <StatusBadge status={project.status} />
        {['ceo', 'commercial_manager'].includes(profile?.role || '') && !isTerminal && (
          <button onClick={openEdit} className="p-2 hover:bg-gray-100 rounded-lg" title="Edit project">
            <Pencil size={18} className="text-gray-500" />
          </button>
        )}
      </div>

      {/* ── Progress Bar ─────────────────────────────────────────────────── */}
      <Card>
        <CardContent>
          {project.status === 'cancelled' ? (
            <div className="flex items-center gap-3 text-red-600">
              <XCircle size={20} />
              <div>
                <p className="font-semibold text-sm">Projet annulé</p>
                {project.cancelled_reason && (
                  <p className="text-xs text-red-500 mt-0.5">Raison: {project.cancelled_reason}</p>
                )}
                {project.cancelled_at && (
                  <p className="text-xs text-red-400">
                    Le {new Date(project.cancelled_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Progression du projet</span>
                <span>{currentStageIdx + 1} / {STAGE_ORDER.length}</span>
              </div>
              {/* Stage dots */}
              <div className="flex items-center gap-1">
                {STAGE_ORDER.map((stage, idx) => {
                  const isCurrent = idx === currentStageIdx;
                  const isPast = idx < currentStageIdx;
                  const stageInfo = PROJECT_STAGES.find(s => s.key === stage);
                  return (
                    <div key={stage} className="flex items-center flex-1">
                      <div className="flex flex-col items-center flex-1 min-w-0">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                            isCurrent
                              ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                              : isPast
                              ? 'bg-green-500 text-white'
                              : 'bg-gray-200 text-gray-400'
                          }`}
                        >
                          {isPast ? <CheckCircle size={14} /> : idx + 1}
                        </div>
                        <span className={`text-[10px] mt-1 text-center leading-tight truncate w-full ${
                          isCurrent ? 'text-blue-700 font-semibold' : isPast ? 'text-green-600' : 'text-gray-400'
                        }`}>
                          {stageInfo?.label || stage}
                        </span>
                      </div>
                      {idx < STAGE_ORDER.length - 1 && (
                        <div className={`h-0.5 flex-1 mx-0.5 ${
                          idx < currentStageIdx ? 'bg-green-400' : 'bg-gray-200'
                        }`} />
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Progress bar */}
              <div className="w-full h-2 bg-gray-100 rounded-full">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${Math.round(((currentStageIdx + 1) / STAGE_ORDER.length) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Terminal Lock Banner ──────────────────────────────────────────── */}
      {isTerminal && (
        <div className={`rounded-2xl border-2 p-4 flex items-center gap-3 ${
          project.status === 'delivered'
            ? 'border-green-300 bg-green-50'
            : 'border-red-300 bg-red-50'
        }`}>
          <Lock size={20} className={project.status === 'delivered' ? 'text-green-600' : 'text-red-600'} />
          <div>
            <p className={`font-semibold text-sm ${project.status === 'delivered' ? 'text-green-800' : 'text-red-800'}`}>
              {project.status === 'delivered' ? 'Projet livré — verrouillé' : 'Projet annulé — verrouillé'}
            </p>
            <p className={`text-xs mt-0.5 ${project.status === 'delivered' ? 'text-green-600' : 'text-red-600'}`}>
              Aucune modification de statut possible.
            </p>
          </div>
        </div>
      )}

      {/* ── Transition Error ─────────────────────────────────────────────── */}
      {transitionError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-red-700 font-medium">Transition refusée</p>
            <p className="text-xs text-red-600 mt-0.5">{transitionError}</p>
            {showDepositException && profile?.role !== 'ceo' && (
              <button
                onClick={() => {
                  setExceptionForm({ reason: '', note: '' });
                  setShowExceptionModal(true);
                }}
                className="mt-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Demander une exception
              </button>
            )}
          </div>
          <button onClick={() => { setTransitionError(''); setShowDepositException(false); }} className="ml-auto">
            <X size={16} className="text-red-400" />
          </button>
        </div>
      )}

      {/* ── Pending Exception Banner ──────────────────────────────────────── */}
      {exceptionStatus === 'pending' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 flex items-center gap-2">
          <Clock size={16} className="text-amber-500 shrink-0" />
          <div>
            <p className="text-sm text-amber-700 font-medium">Exception en attente d&apos;approbation</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Votre demande de bypass acompte a été envoyée au CEO. En attente de décision.
            </p>
          </div>
        </div>
      )}
      {exceptionStatus === 'sent' && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-3 flex items-center gap-2">
          <CheckCircle size={16} className="text-green-500 shrink-0" />
          <div>
            <p className="text-sm text-green-700 font-medium">Demande d&apos;exception envoyée</p>
            <p className="text-xs text-green-600 mt-0.5">Le CEO a été notifié. Vous serez informé de la décision.</p>
          </div>
        </div>
      )}

      {/* ── Next Step Action ─────────────────────────────────────────────── */}
      {canManage && !isTerminal && nextStatuses.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <ChevronRight size={16} /> Prochaine étape
            </h2>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {nextStatuses.map(ns => (
                <Button
                  key={ns}
                  variant="primary"
                  size="sm"
                  loading={transitioning}
                  onClick={() => transitionTo(ns)}
                  className="flex items-center gap-2"
                >
                  {STATUS_ICONS[ns]} {statusLabel(ns)}
                </Button>
              ))}
              {/* Cancel is always available for non-terminal states */}
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setCancelReason('');
                  setTransitionError('');
                  setShowCancelModal(true);
                }}
              >
                <XCircle size={14} /> Annuler le projet
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                <User size={15} className="text-gray-400" /> {t('projects.design')}: {project.designer.full_name}
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Clock size={14} /> Created {new Date(project.created_at).toLocaleDateString('fr-FR')}
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
                <p className="font-medium">50% Deposit</p>
                <p>{project.deposit_paid ? 'Paid' : 'Pending'}</p>
              </div>
              <div className={`p-2 rounded-lg ${project.pre_install_paid ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
                <p className="font-medium">90% Pre-Install</p>
                <p>{project.pre_install_paid ? 'Paid' : 'Pending'}</p>
              </div>
              <div className={`p-2 rounded-lg ${project.final_paid ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
                <p className="font-medium">100% Final</p>
                <p>{project.final_paid ? 'Paid' : 'Pending'}</p>
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

      {/* Quotes */}
      {quotes.length > 0 && (
        <Card>
          <CardHeader><h2 className="font-semibold text-sm flex items-center gap-2"><FileText size={16} /> {t('quotes.title')}</h2></CardHeader>
          <CardContent>
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
            <Button variant="secondary" size="sm" onClick={() => router.push(`/projects/${id}/production`)}>
              <Package size={14} /> Production
            </Button>
            <Button variant="secondary" size="sm" onClick={() => router.push(`/projects/${id}/structure`)}>
              <LayoutGrid size={14} /> Structure
            </Button>
            <Button variant="secondary" size="sm" onClick={() => router.push(`/projects/${id}/cabinets`)}>
              <Box size={14} /> {t('cabinets.title')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => router.push(`/projects/${id}/notify`)}>
              <MessageCircle size={14} /> Notify Client
            </Button>
            {canViewFinance && (
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

      {/* Print / Documents */}
      <Card>
        <CardHeader><h2 className="font-semibold text-sm flex items-center gap-2"><Printer size={16} /> {t('projects.documents')}</h2></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => window.open(`/api/print/delivery-note?id=${id}`, '_blank')}>
              <Truck size={14} /> Delivery Note
            </Button>
            {quotes.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => window.open(`/api/quote-pdf?id=${quotes[0].id}`, '_blank')}>
                <FileText size={14} /> Latest Quote
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
        <CardHeader><h2 className="font-semibold text-sm flex items-center gap-2"><Upload size={16} /> Project Files</h2></CardHeader>
        <CardContent>
          <PhotoUpload
            bucket="project-files"
            pathPrefix={`project-${id}`}
            onUpload={(data) => setFiles(prev => [...prev, { url: data.url, name: data.path }])}
            existingPhotos={files.map(f => ({ url: f.url }))}
            maxPhotos={20}
            label="Upload Files"
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
      {showEdit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold text-[#1a1a2e]">Edit Project</h2>
              <button onClick={() => setShowEdit(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Client Name *</label>
                <input value={editForm.client_name} onChange={e => setEditForm(f => ({...f, client_name: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" placeholder="Client name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input value={editForm.client_phone} onChange={e => setEditForm(f => ({...f, client_phone: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" placeholder="+212..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input value={editForm.client_email} onChange={e => setEditForm(f => ({...f, client_email: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" placeholder="email@..." />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                <input value={editForm.client_address} onChange={e => setEditForm(f => ({...f, client_address: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                  <input value={editForm.client_city} onChange={e => setEditForm(f => ({...f, client_city: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Total (MAD)</label>
                  <input type="number" value={editForm.total_amount} onChange={e => setEditForm(f => ({...f, total_amount: e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                <select value={editForm.priority} onChange={e => setEditForm(f => ({...f, priority: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea value={editForm.notes} onChange={e => setEditForm(f => ({...f, notes: e.target.value}))} rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowEdit(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={editSaving || !editForm.client_name.trim()}
                  className="flex-1 py-2.5 bg-[#1E2F52] text-white rounded-xl text-sm font-medium disabled:opacity-50">
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Project Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-red-700 flex items-center gap-2">
                <XCircle size={18} /> Annuler le projet
              </h2>
              <button onClick={() => setShowCancelModal(false)}><X size={20} className="text-gray-400" /></button>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-3 flex items-start gap-2">
              <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700">
                Cette action est <strong>irréversible</strong>. Le projet sera définitivement verrouillé.
              </p>
            </div>

            {transitionError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">
                {transitionError}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Raison de l&apos;annulation *</label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                placeholder="Expliquez pourquoi ce projet est annulé..."
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowCancelModal(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">
                Retour
              </button>
              <button
                onClick={handleCancel}
                disabled={transitioning || !cancelReason.trim()}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {transitioning ? 'Annulation...' : 'Confirmer l\'annulation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exception Request Modal */}
      {showExceptionModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-amber-700 flex items-center gap-2">
                <AlertTriangle size={18} /> Demander une exception
              </h2>
              <button onClick={() => setShowExceptionModal(false)}><X size={20} className="text-gray-400" /></button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-3 text-xs text-amber-700 space-y-1">
              <p>L&apos;acompte de 50% n&apos;est pas atteint pour ce projet.</p>
              <p className="font-semibold">
                Acompte actuel: {project.total_amount > 0 ? Math.round((project.paid_amount / project.total_amount) * 100) : 0}%
                ({project.paid_amount?.toLocaleString() || 0} / {project.total_amount?.toLocaleString() || 0} MAD)
              </p>
              <p>Cette demande sera envoyée au CEO pour approbation.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Raison *</label>
              <textarea
                value={exceptionForm.reason}
                onChange={e => setExceptionForm(f => ({...f, reason: e.target.value}))}
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                placeholder="Pourquoi lancer la production sans l'acompte complet..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Note (optionnel)</label>
              <input
                value={exceptionForm.note}
                onChange={e => setExceptionForm(f => ({...f, note: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                placeholder="Contexte additionnel..."
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowExceptionModal(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">
                Annuler
              </button>
              <button
                onClick={submitExceptionRequest}
                disabled={exceptionSubmitting || !exceptionForm.reason.trim()}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {exceptionSubmitting ? 'Envoi...' : 'Envoyer la demande'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
      </RoleGuard>
  );
}
