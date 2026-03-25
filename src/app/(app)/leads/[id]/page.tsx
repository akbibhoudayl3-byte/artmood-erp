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
  Hammer
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

  const [lead, setLead] = useState<Lead & { assigned_profile?: { full_name: string } } | null>(null);
  const [linkedProjectId, setLinkedProjectId] = useState<string | null>(null);
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

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    const [leadRes, actRes, projRes] = await Promise.all([
      supabase.from('leads')
        .select('*, assigned_profile:profiles!leads_assigned_to_fkey(full_name)')
        .eq('id', id).single(),
      supabase.from('lead_activities')
        .select('*, user:profiles(full_name)')
        .eq('lead_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('projects')
        .select('id')
        .eq('lead_id', id)
        .limit(1),
    ]);
    setLead(leadRes.data as typeof lead);
    setActivities((actRes.data as typeof activities) || []);
    setLinkedProjectId(projRes.data?.[0]?.id || null);
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
    if (!editForm.full_name.trim() || !editForm.phone.trim()) {
      setConvertError('Name and phone are required.');
      return;
    }
    setEditSaving(true);
    const { error: editErr } = await supabase.from('leads').update({
      full_name: editForm.full_name.trim(),
      phone: editForm.phone.trim(),
      city: editForm.city || null,
      email: editForm.email || null,
      notes: editForm.notes || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    setEditSaving(false);
    if (editErr) {
      setConvertError('Failed to save: ' + editErr.message);
      return;
    }
    setShowEdit(false);
    loadData();
  }

  async function updateStatus(newStatus: LeadStatus) {
    const { error: statusErr } = await supabase.from('leads').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id);
    if (statusErr) return;
    await supabase.from('lead_activities').insert({
      lead_id: id, user_id: profile?.id, activity_type: 'status_change',
      description: `Status changed to ${newStatus}`,
    });

    // AUTO-CONVERT: when lead becomes 'won', create project automatically
    if (newStatus === 'won' && lead && !linkedProjectId) {
      const { data: newProject, error: projErr } = await supabase
        .from('projects')
        .insert({
          client_name: lead.full_name,
          client_phone: lead.phone,
          client_email: lead.email || null,
          client_city: lead.city || null,
          project_type: 'kitchen',
          status: 'measurements',
          created_by: profile?.id,
          lead_id: lead.id,
          notes: lead.notes || null,
        })
        .select('id, reference_code')
        .single();

      if (!projErr && newProject) {
        await supabase.from('lead_activities').insert({
          lead_id: id, user_id: profile?.id, activity_type: 'status_change',
          description: `Auto-converted to project: ${newProject.reference_code}`,
        });
        router.push(`/projects/${newProject.id}`);
        return;
      }
    }

    loadData();
  }

  async function addNote() {
    if (!newNote.trim()) return;
    const { error: noteErr } = await supabase.from('lead_activities').insert({
      lead_id: id, user_id: profile?.id, activity_type: 'note', description: newNote.trim(),
    });
    if (!noteErr) setNewNote('');
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
      // 1. Insert the new project
      const { data: newProject, error: projectError } = await supabase
        .from('projects')
        .insert({
          client_name: convertForm.client_name.trim(),
          client_phone: convertForm.client_phone.trim(),
          client_email: convertForm.client_email.trim() || null,
          client_city: convertForm.client_city.trim() || null,
          total_amount: convertForm.budget ? parseFloat(convertForm.budget) : 0,
          project_type: 'kitchen',
          status: 'measurements',
          created_by: profile?.id,
          lead_id: lead?.id,
          notes: convertForm.notes.trim() || null,
        })
        .select('id, reference_code')
        .single();

      if (projectError || !newProject) {
        setConvertError(projectError?.message || 'Failed to create project.');
        setConverting(false);
        return;
      }

      // 2. Update lead status to won
      await supabase.from('leads').update({
        status: 'won',
        updated_at: new Date().toISOString(),
      }).eq('id', id);

      // 3. Log activity
      await supabase.from('lead_activities').insert({
        lead_id: id,
        user_id: profile?.id,
        activity_type: 'status_change',
        description: `Converted to project: ${newProject.reference_code}`,
      });

      // 4. Navigate to new project
      router.push(`/projects/${newProject.id}`);
    } catch (err: any) {
      setConvertError(err?.message || 'An unexpected error occurred.');
      setConverting(false);
    }
  }

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;
  if (!lead) return <div className="text-center py-12 text-gray-500">Lead not found</div>;

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
            {canManageLeads && (
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

      {/* Follow-up Scheduling */}
      {canManageLeads && (
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
      {lead.status === 'won' && !linkedProjectId && canManageLeads && (
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

      {/* If already linked to a project, show a link */}
      {linkedProjectId && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 flex items-center justify-between gap-3">
          <p className="text-sm text-blue-700 font-medium">This lead has been converted to a project.</p>
          <button
            onClick={() => router.push(`/projects/${linkedProjectId}`)}
            className="text-sm text-blue-600 underline font-semibold"
          >
            View Project
          </button>
        </div>
      )}

      {/* Status Actions */}
      {canManageLeads && (
        <Card>
          <CardHeader><h2 className="font-semibold text-sm">{t('projects.move_to')}</h2></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {LEAD_STAGES.filter(s => s.key !== lead.status).map(stage => (
                <Button key={stage.key} variant={stage.key === 'won' ? 'success' : stage.key === 'lost' ? 'danger' : 'secondary'} size="sm"
                  onClick={() => updateStatus(stage.key as LeadStatus)}>
                  {stage.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity / Notes */}
      <Card>
        <CardHeader><h2 className="font-semibold text-sm">Activity</h2></CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a note..." rows={2} />
            <Button variant="primary" size="sm" onClick={addNote} className="self-end">{t('common.add')}</Button>
          </div>
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
              <button onClick={saveEdit} disabled={editSaving}
                className="flex-1 py-2.5 bg-[#1E2F52] text-white rounded-xl text-sm font-medium disabled:opacity-50">
                {editSaving ? 'Saving...' : 'Save'}
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
                disabled={converting}
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
