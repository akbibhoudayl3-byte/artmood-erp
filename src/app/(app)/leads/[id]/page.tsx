'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { Textarea } from '@/components/ui/Input';
import { LEAD_STAGES } from '@/lib/constants';
import type { Lead, LeadActivity, LeadStatus } from '@/types/database';
import Input from '@/components/ui/Input';
import {
  ArrowLeft, Phone, MapPin, Mail, Calendar, User,
  MessageSquare, Clock, Instagram, Facebook, Globe, Users, Building, Bell, Edit2, X,
  Hammer, FileUp, AlertTriangle, CheckCircle
} from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  instagram: <Instagram size={14} />,
  facebook: <Facebook size={14} />,
  google: <Globe size={14} />,
  referral: <Users size={14} />,
  architect: <Building size={14} />,
  walk_in: <User size={14} />,
  website: <Globe size={14} />,
};

export default function LeadDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { profile, canManageLeads } = useAuth();
  const supabase = createClient();
  const { t } = useLocale();

  const [lead, setLead] = useState<Lead & { assigned_profile?: { full_name: string }; project_id?: string | null; converted_at?: string | null } | null>(null);
  const [activities, setActivities] = useState<(LeadActivity & { user?: { full_name: string } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [settingFollowUp, setSettingFollowUp] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: '', phone: '', city: '', email: '', notes: '' });

  // Convert to Project state
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertForm, setConvertForm] = useState({
    client_name: '',
    client_phone: '',
    client_email: '',
    client_city: '',
    budget: '',
    notes: '',
  });
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState('');

  // Bypass modal state (contacted → quote_sent without visit)
  const [showBypassModal, setShowBypassModal] = useState(false);
  const [bypassForm, setBypassForm] = useState({
    plan_file: '',
    measurements_provided_by_client: false,
    disclaimer_accepted: false,
    quote_id: '',
    quote_url: '',
  });
  const [bypassSaving, setBypassSaving] = useState(false);
  const [bypassError, setBypassError] = useState('');

  // Transition prompt state (call_log, visit_date, lost_reason)
  const [transitionPrompt, setTransitionPrompt] = useState<{ target: LeadStatus; field: string } | null>(null);
  const [transitionInput, setTransitionInput] = useState('');

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    const [leadRes, actRes] = await Promise.all([
      supabase.from('leads')
        .select('*, assigned_profile:profiles!leads_assigned_to_fkey(full_name)')
        .eq('id', id).single(),
      supabase.from('lead_activities')
        .select('*, user:profiles(full_name)')
        .eq('lead_id', id)
        .order('created_at', { ascending: false }),
    ]);
    setLead(leadRes.data as typeof lead);
    setActivities((actRes.data as typeof activities) || []);
    setLoading(false);
  }

  function openEdit() {
    if (!lead) return;
    setEditForm({
      full_name: lead.full_name,
      phone: lead.phone,
      city: lead.city || '',
      email: lead.email || '',
      notes: lead.notes || '',
    });
    setShowEdit(true);
  }

  function openConvertModal() {
    if (!lead) return;
    setConvertForm({
      client_name: lead.full_name || '',
      client_phone: lead.phone || '',
      client_email: lead.email || '',
      client_city: lead.city || '',
      budget: '',
      notes: '',
    });
    setConvertError('');
    setShowConvertModal(true);
  }

  async function saveEdit() {
    if (!editForm.full_name.trim() || !editForm.phone.trim()) return;
    setEditSaving(true);
    await supabase.from('leads').update({
      full_name: editForm.full_name.trim(),
      phone: editForm.phone.trim(),
      city: editForm.city || null,
      email: editForm.email || null,
      notes: editForm.notes || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    setShowEdit(false);
    setEditSaving(false);
    loadData();
  }

  async function updateStatus(newStatus: LeadStatus, context?: { call_log?: string; visit_date?: string; quote_id?: string; lost_reason?: string }) {
    try {
      const res = await fetch(`/api/leads/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, ...context }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.reason || data.error || 'Transition refusée');
        return;
      }
    } catch {
      alert('Erreur lors de la mise à jour du statut');
      return;
    }
    loadData();
  }

  function openBypassModal() {
    setBypassForm({ plan_file: '', measurements_provided_by_client: false, disclaimer_accepted: false, quote_id: '', quote_url: '' });
    setBypassError('');
    setShowBypassModal(true);
  }

  async function submitBypass() {
    setBypassSaving(true);
    setBypassError('');
    try {
      const res = await fetch(`/api/leads/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'quote_sent',
          plan_file: bypassForm.plan_file,
          measurements_provided_by_client: bypassForm.measurements_provided_by_client,
          disclaimer_accepted: bypassForm.disclaimer_accepted,
          quote_id: bypassForm.quote_id || undefined,
          quote_url: bypassForm.quote_url || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBypassError(data.reason || data.error || 'Transition refusée');
        setBypassSaving(false);
        return;
      }
      setShowBypassModal(false);
      setBypassSaving(false);
      loadData();
    } catch {
      setBypassError('Erreur réseau');
      setBypassSaving(false);
    }
  }

  function handleStatusClick(targetStatus: LeadStatus) {
    // For transitions that need input, show a prompt
    if (targetStatus === 'contacted') {
      setTransitionPrompt({ target: 'contacted', field: 'call_log' });
      setTransitionInput('');
      return;
    }
    if (targetStatus === 'visit_scheduled') {
      setTransitionPrompt({ target: 'visit_scheduled', field: 'visit_date' });
      setTransitionInput('');
      return;
    }
    if (targetStatus === 'quote_sent' && lead?.status === 'contacted') {
      // This is a bypass — open the bypass modal
      openBypassModal();
      return;
    }
    if (targetStatus === 'quote_sent') {
      setTransitionPrompt({ target: 'quote_sent', field: 'quote_id' });
      setTransitionInput('');
      return;
    }
    if (targetStatus === 'lost') {
      setTransitionPrompt({ target: 'lost', field: 'lost_reason' });
      setTransitionInput('');
      return;
    }
    // For won and others, just call directly
    updateStatus(targetStatus);
  }

  function submitTransitionPrompt() {
    if (!transitionPrompt) return;
    const { target, field } = transitionPrompt;
    if (!transitionInput.trim() && field !== 'lost_reason') {
      alert('Ce champ est obligatoire');
      return;
    }
    updateStatus(target, { [field]: transitionInput });
    setTransitionPrompt(null);
    setTransitionInput('');
  }

  async function addNote() {
    if (!newNote.trim()) return;
    await supabase.from('lead_activities').insert({
      lead_id: id, user_id: profile?.id, activity_type: 'note', description: newNote.trim(),
    });
    setNewNote('');
    loadData();
  }

  async function handleCreateProject() {
    if (!convertForm.client_name.trim() || !convertForm.client_phone.trim()) {
      setConvertError('Client name and phone are required.');
      return;
    }
    setConverting(true);
    setConvertError('');

    try {
      const res = await fetch(`/api/leads/${lead.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: convertForm.client_name,
          client_phone: convertForm.client_phone,
          client_email: convertForm.client_email,
          client_city: convertForm.client_city,
          budget: convertForm.budget,
          notes: convertForm.notes,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setConvertError(result.error || 'Failed to convert lead.');
        setConverting(false);
        return;
      }
      router.push(`/projects/${result.project.id}`);
    } catch (err: any) {
      setConvertError(err?.message || 'An unexpected error occurred.');
      setConverting(false);
    }
  }

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;
  if (!lead) return <div className="text-center py-12 text-gray-500">Lead not found</div>;

  // Lead is READ-ONLY after conversion to project
  const isConverted = !!(lead.converted_at || lead.project_id);

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'community_manager'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/leads')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{lead.full_name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <StatusBadge status={lead.status} />
            {canManageLeads && !isConverted && (
              <button onClick={openEdit} className="p-1.5 hover:bg-gray-100 rounded-lg" title="Edit lead">
                <Edit2 size={16} className="text-gray-500" />
              </button>
            )}
            {lead.source && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                {SOURCE_ICONS[lead.source]} {lead.source}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Contact Info */}
      <Card>
        <CardContent>
          <div className="space-y-3">
            <a href={`tel:${lead.phone}`} className="flex items-center gap-3 text-sm text-blue-600">
              <Phone size={16} className="text-gray-400" /> {lead.phone}
            </a>
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="flex items-center gap-3 text-sm text-blue-600">
                <Mail size={16} className="text-gray-400" /> {lead.email}
              </a>
            )}
            {lead.city && (
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <MapPin size={16} className="text-gray-400" /> {lead.city}
                {lead.address && ` - ${lead.address}`}
              </div>
            )}
            {lead.assigned_profile && (
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <User size={16} className="text-gray-400" /> Assigned to: {lead.assigned_profile.full_name}
              </div>
            )}
            {lead.next_follow_up && (
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <Calendar size={16} className="text-gray-400" />
                Follow-up: {new Date(lead.next_follow_up).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
              </div>
            )}
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <Clock size={14} /> Created {new Date(lead.created_at).toLocaleDateString('fr-FR')}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Follow-up Scheduling — hidden when lead is converted (read-only) */}
      {canManageLeads && !isConverted && (
        <Card>
          <CardHeader><h2 className="font-semibold text-sm flex items-center gap-2"><Bell size={16} /> Follow-up Reminder</h2></CardHeader>
          <CardContent>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Input
                  type="date"
                  label="Schedule Follow-up"
                  value={followUpDate || (lead.next_follow_up ? lead.next_follow_up.split('T')[0] : '')}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                />
              </div>
              <Button
                variant="primary"
                size="sm"
                loading={settingFollowUp}
                onClick={async () => {
                  if (!followUpDate) return;
                  setSettingFollowUp(true);
                  await supabase.from('leads').update({ next_follow_up: followUpDate, updated_at: new Date().toISOString() }).eq('id', id);
                  await supabase.from('lead_activities').insert({
                    lead_id: id, user_id: profile?.id, activity_type: 'follow_up',
                    description: `Follow-up scheduled for ${new Date(followUpDate).toLocaleDateString('fr-FR')}`,
                  });
                  setSettingFollowUp(false);
                  loadData();
                }}
              >
                Set
              </Button>
            </div>
            {lead.next_follow_up && (
              <p className="text-xs text-[#64648B] mt-2">
                Current: {new Date(lead.next_follow_up).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {lead.notes && (
        <Card>
          <CardHeader><h2 className="font-semibold text-sm">{t('common.notes')}</h2></CardHeader>
          <CardContent><p className="text-sm text-gray-600">{lead.notes}</p></CardContent>
        </Card>
      )}

      {/* Convert to Project Card — shown only when won and no project yet */}
      {lead.status === 'won' && !lead.project_id && canManageLeads && (
        <div className="rounded-2xl border-2 border-green-400 bg-green-50 p-4 flex items-center justify-between gap-3">
          <div>
            <p className="font-bold text-green-800 text-sm">This lead is ready to become a project!</p>
            <p className="text-xs text-green-600 mt-0.5">Create a project from this won lead to track production and delivery.</p>
          </div>
          <button
            onClick={openConvertModal}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl whitespace-nowrap transition-colors"
          >
            <Hammer size={16} /> Create Project from Lead
          </button>
        </div>
      )}

      {/* Converted lead — locked, read-only banner */}
      {isConverted && (
        <div className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-4 flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
              <CheckCircle size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-blue-800 text-sm">Lead converti en projet</p>
              <p className="text-xs text-blue-600 mt-0.5">
                Ce lead est verrouillé en lecture seule.
                {lead.converted_at && ` Converti le ${new Date(lead.converted_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.`}
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push(`/projects/${lead.project_id}`)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl whitespace-nowrap transition-colors"
          >
            Voir le projet
          </button>
        </div>
      )}

      {/* External Measurements Badge */}
      {lead.measurement_source === 'external' && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-amber-800 text-sm">Mesures externes</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Les mesures ont été fournies par le client/architecte. ArtMood n&apos;est pas responsable des erreurs de mesure.
            </p>
            {lead.plan_file_url && (
              <a href={lead.plan_file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-700 underline mt-1 inline-block">
                Voir le plan fourni
              </a>
            )}
          </div>
        </div>
      )}

      {/* Status Actions — FSM-aware */}
      {canManageLeads && lead.status !== 'won' && lead.status !== 'lost' && (
        <Card>
          <CardHeader><h2 className="font-semibold text-sm">{t('projects.move_to')}</h2></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {/* Standard next step */}
              {lead.status === 'new' && (
                <Button variant="secondary" size="sm" onClick={() => handleStatusClick('contacted')}>
                  Contacté
                </Button>
              )}
              {lead.status === 'contacted' && (
                <>
                  <Button variant="secondary" size="sm" onClick={() => handleStatusClick('visit_scheduled')}>
                    Visite planifiée
                  </Button>
                  <Button variant="secondary" size="sm" onClick={openBypassModal}
                    className="!border-amber-300 !text-amber-700 hover:!bg-amber-50"
                  >
                    <FileUp size={14} className="mr-1" /> Devis direct (plan fourni)
                  </Button>
                </>
              )}
              {lead.status === 'visit_scheduled' && (
                <Button variant="secondary" size="sm" onClick={() => handleStatusClick('quote_sent')}>
                  Devis envoyé
                </Button>
              )}
              {lead.status === 'quote_sent' && (
                <Button variant="success" size="sm" onClick={() => handleStatusClick('won')}>
                  Gagné
                </Button>
              )}
              {/* Lost — always available */}
              <Button variant="danger" size="sm" onClick={() => handleStatusClick('lost')}>
                Perdu
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reopen from lost */}
      {canManageLeads && lead.status === 'lost' && (
        <Card>
          <CardHeader><h2 className="font-semibold text-sm">{t('projects.move_to')}</h2></CardHeader>
          <CardContent>
            <Button variant="secondary" size="sm" onClick={() => updateStatus('new')}>
              Réouvrir (Nouveau)
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Activity / Notes */}
      <Card>
        <CardHeader><h2 className="font-semibold text-sm">Activity</h2></CardHeader>
        <CardContent>
          {!isConverted && (
            <div className="flex gap-2 mb-4">
              <Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a note..." rows={2} />
              <Button variant="primary" size="sm" onClick={addNote} className="self-end">{t('common.add')}</Button>
            </div>
          )}
          <div className="space-y-3">
            {activities.map(act => (
              <div key={act.id} className="flex gap-3 text-sm border-l-2 border-gray-200 pl-3">
                <div className="flex-1">
                  <p className="text-gray-700">{act.description}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {act.user?.full_name} - {new Date(act.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            {activities.length === 0 && <p className="text-sm text-gray-400 text-center">{t('common.no_results')}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Edit Lead Modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-[#1a1a2e]">Edit Lead</h2>
              <button onClick={() => setShowEdit(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input value={editForm.full_name} onChange={e => setEditForm(f => ({...f, full_name: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone *</label>
                <input value={editForm.phone} onChange={e => setEditForm(f => ({...f, phone: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                <input value={editForm.city} onChange={e => setEditForm(f => ({...f, city: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input value={editForm.email} onChange={e => setEditForm(f => ({...f, email: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea value={editForm.notes} onChange={e => setEditForm(f => ({...f, notes: e.target.value}))} rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowEdit(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">Cancel</button>
              <button onClick={saveEdit} disabled={editSaving || !editForm.full_name.trim() || !editForm.phone.trim()}
                className="flex-1 py-2.5 bg-[#1E2F52] text-white rounded-xl text-sm font-medium disabled:opacity-50">
                {editSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transition Prompt Modal (call_log, visit_date, quote_id, lost_reason) */}
      {transitionPrompt && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-[#1a1a2e]">
                {transitionPrompt.field === 'call_log' && 'Journal d\'appel'}
                {transitionPrompt.field === 'visit_date' && 'Date de visite'}
                {transitionPrompt.field === 'quote_id' && 'Référence du devis'}
                {transitionPrompt.field === 'lost_reason' && 'Raison de la perte'}
              </h2>
              <button onClick={() => setTransitionPrompt(null)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div>
              {transitionPrompt.field === 'visit_date' ? (
                <Input type="date" label="Date de visite *" value={transitionInput} onChange={(e) => setTransitionInput(e.target.value)} />
              ) : (
                <Textarea
                  rows={3}
                  placeholder={
                    transitionPrompt.field === 'call_log' ? 'Résumé de l\'appel...' :
                    transitionPrompt.field === 'quote_id' ? 'ID du devis ou URL...' :
                    'Raison (optionnel)...'
                  }
                  value={transitionInput}
                  onChange={(e) => setTransitionInput(e.target.value)}
                />
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setTransitionPrompt(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">Annuler</button>
              <button onClick={submitTransitionPrompt}
                className="flex-1 py-2.5 bg-[#1E2F52] text-white rounded-xl text-sm font-medium">
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bypass Modal — Contacted → Quote Sent (plan-based, skip visit) */}
      {showBypassModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-[#1a1a2e] flex items-center gap-2">
                  <FileUp size={18} className="text-amber-600" /> Devis direct — Plan fourni
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Passer directement au devis sans visite sur site. Un plan doit être fourni.
                </p>
              </div>
              <button onClick={() => setShowBypassModal(false)}><X size={20} className="text-gray-400" /></button>
            </div>

            {bypassError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">
                {bypassError}
              </div>
            )}

            {/* Warning banner */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-3 flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800">
                Cette option permet de sauter l&apos;étape de visite lorsque le client ou l&apos;architecte fournit un plan avec les mesures.
                Les mesures seront marquées comme <strong>&quot;externes&quot;</strong>.
              </p>
            </div>

            {/* Plan file upload */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fichier plan (URL) *</label>
              <input
                value={bypassForm.plan_file}
                onChange={e => setBypassForm(f => ({...f, plan_file: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                placeholder="URL du plan téléchargé..."
              />
              <p className="text-xs text-gray-400 mt-1">Téléchargez le plan dans Documents puis collez l&apos;URL ici</p>
            </div>

            {/* Quote reference */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Référence du devis *</label>
              <input
                value={bypassForm.quote_id}
                onChange={e => setBypassForm(f => ({...f, quote_id: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                placeholder="ID ou URL du devis..."
              />
            </div>

            {/* Measurements checkbox */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={bypassForm.measurements_provided_by_client}
                onChange={e => setBypassForm(f => ({...f, measurements_provided_by_client: e.target.checked}))}
                className="mt-1 w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">
                Je confirme que les mesures ont été fournies par le <strong>client ou l&apos;architecte</strong>
              </span>
            </label>

            {/* Disclaimer checkbox */}
            <div className="border border-amber-200 rounded-xl p-3 bg-amber-50/50">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bypassForm.disclaimer_accepted}
                  onChange={e => setBypassForm(f => ({...f, disclaimer_accepted: e.target.checked}))}
                  className="mt-1 w-4 h-4 rounded border-amber-400"
                />
                <span className="text-sm text-amber-900">
                  <strong>Clause de non-responsabilité:</strong> ArtMood n&apos;est pas responsable des erreurs de mesure
                  fournies par le client ou l&apos;architecte. La responsabilité des dimensions incombe au fournisseur des plans.
                </span>
              </label>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowBypassModal(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">
                Annuler
              </button>
              <button
                onClick={submitBypass}
                disabled={
                  bypassSaving ||
                  !bypassForm.plan_file.trim() ||
                  !bypassForm.measurements_provided_by_client ||
                  !bypassForm.disclaimer_accepted ||
                  (!bypassForm.quote_id.trim() && !bypassForm.quote_url.trim())
                }
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {bypassSaving ? 'Envoi...' : <><CheckCircle size={14} /> Valider le bypass</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert to Project Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-[#1a1a2e]">Create Project from Lead</h2>
                <p className="text-xs text-gray-500 mt-0.5">A new project will be created and linked to this lead.</p>
              </div>
              <button onClick={() => setShowConvertModal(false)}><X size={20} className="text-gray-400" /></button>
            </div>

            {convertError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">
                {convertError}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client Name *</label>
              <input
                value={convertForm.client_name}
                onChange={e => setConvertForm(f => ({...f, client_name: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                placeholder="Client name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone *</label>
                <input
                  value={convertForm.client_phone}
                  onChange={e => setConvertForm(f => ({...f, client_phone: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  placeholder="Phone"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                <input
                  value={convertForm.client_city}
                  onChange={e => setConvertForm(f => ({...f, client_city: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  placeholder="City"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                value={convertForm.client_email}
                onChange={e => setConvertForm(f => ({...f, client_email: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                placeholder="Email address"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Initial Budget (MAD)</label>
              <input
                type="number"
                min="0"
                value={convertForm.budget}
                onChange={e => setConvertForm(f => ({...f, budget: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
              <textarea
                value={convertForm.notes}
                onChange={e => setConvertForm(f => ({...f, notes: e.target.value}))}
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                placeholder="Any additional notes..."
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowConvertModal(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                disabled={converting || !convertForm.client_name.trim() || !convertForm.client_phone.trim()}
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {converting ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
      </RoleGuard>
  );
}
