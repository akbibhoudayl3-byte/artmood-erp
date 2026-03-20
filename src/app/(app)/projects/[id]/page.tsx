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
  BarChart3, Box, MessageCircle, Package, LayoutGrid, Pencil, X, ArrowRight, Scissors
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
  measurements: <Ruler size={16} />,
  design: <Palette size={16} />,
  client_validation: <CheckCircle size={16} />,
  production: <Factory size={16} />,
  installation: <Truck size={16} />,
  completed: <CheckCircle size={16} />,
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
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [workflowError, setWorkflowError] = useState('');
  const [hasProduction, setHasProduction] = useState(false);

  useEffect(() => { loadAll(); }, [id]);

  async function loadAll() {
    const [projRes, payRes, evtRes, quoteRes, prodRes] = await Promise.all([
      supabase.from('projects')
        .select('*, designer:profiles!projects_designer_id_fkey(full_name)')
        .eq('id', id).single(),
      supabase.from('payments').select('*').eq('project_id', id).order('received_at', { ascending: false }),
      supabase.from('project_events').select('*').eq('project_id', id).order('created_at', { ascending: false }),
      supabase.from('quotes').select('*').eq('project_id', id).order('version', { ascending: false }),
      supabase.from('production_orders').select('id').eq('project_id', id).limit(1),
    ]);

    setProject(projRes.data as ProjectDetail);
    setPayments(payRes.data || []);
    setEvents((evtRes.data as ProjectEvent[]) || []);
    setQuotes(quoteRes.data || []);
    setHasProduction((prodRes.data || []).length > 0);
    setLoading(false);
  }

  async function handleGenerateProduction() {
    setWorkflowBusy(true);
    setWorkflowError('');
    try {
      const res = await fetch('/api/bom/generate-production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: id }),
      });
      if (!res.ok) {
        const data = await res.json();
        setWorkflowError(data.error || 'Failed to generate production');
        setWorkflowBusy(false);
        return;
      }
      // Redirect to production page
      router.push(`/projects/${id}/production`);
    } catch {
      setWorkflowError('Network error');
      setWorkflowBusy(false);
    }
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

  async function updateStatus(newStatus: ProjectStatus) {
    // Block production if deposit not paid
    if (newStatus === 'production' && !project?.deposit_paid) {
      alert('Cannot move to production: 50% deposit has not been paid. Please collect the deposit first.');
      return;
    }

    // Production safety validation
    if (newStatus === 'production') {
      const validationErrors: string[] = [];

      if (!project?.deposit_paid) validationErrors.push('50% deposit not paid');
      if (!project?.design_validated) validationErrors.push('Design not validated');
      if (project?.total_amount === 0) validationErrors.push('No quote amount set');

      // Check if materials are available (any critical stock)
      const { data: criticalStock } = await supabase
        .from('stock_items')
        .select('name')
        .lte('current_quantity', 0)  // using column reference
        .eq('is_active', true)
        .limit(5);

      if (criticalStock && criticalStock.length > 0) {
        validationErrors.push(`${criticalStock.length} stock items at zero: ${criticalStock.map(s => s.name).join(', ')}`);
      }

      if (validationErrors.length > 0) {
        const proceed = confirm(
          `Production Safety Check - Issues found:\n\n${validationErrors.map(e => `- ${e}`).join('\n')}\n\nDo you want to proceed anyway? (CEO override)`
        );
        if (!proceed) return;
        // Only CEO can override
        if (profile?.role !== 'ceo') {
          alert('Only CEO can override production safety validation. Please contact the CEO.');
          return;
        }
      }
    }

    await supabase.from('projects').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id);
    loadAll();
  }

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;
  if (!project) return <div className="text-center py-12 text-gray-500">{t('common.no_results')}</div>;

  const paymentPct = project.total_amount > 0 ? Math.round((project.paid_amount / project.total_amount) * 100) : 0;

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
        {['ceo', 'commercial_manager'].includes(profile?.role || '') && (
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

      {/* Workflow: ONE primary action */}
      {project && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent>
            {workflowError && (
              <p className="text-sm text-red-600 mb-2">{workflowError}</p>
            )}
            {hasProduction ? (
              <Button variant="primary" className="w-full py-3 text-base font-semibold" onClick={() => router.push(`/projects/${id}/production`)}>
                <Factory size={18} className="mr-2" /> Go to Production <ArrowRight size={18} className="ml-2" />
              </Button>
            ) : (
              <Button variant="primary" className="w-full py-3 text-base font-semibold" onClick={handleGenerateProduction} disabled={workflowBusy}>
                <Factory size={18} className="mr-2" /> {workflowBusy ? 'Generating...' : 'Generate Production'} <ArrowRight size={18} className="ml-2" />
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Status Pipeline */}
      {['ceo', 'commercial_manager', 'workshop_manager'].includes(profile?.role || '') && (
        <Card>
          <CardHeader><h2 className="font-semibold text-sm">{t('projects.move_to')}</h2></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {PROJECT_STAGES.filter(s => s.key !== project.status).map(stage => (
                <Button key={stage.key} variant="secondary" size="sm" onClick={() => updateStatus(stage.key as ProjectStatus)}>
                  {STATUS_ICONS[stage.key]} {stage.label}
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

    </div>
      </RoleGuard>
  );
}
