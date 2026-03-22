'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input, { Select, Textarea } from '@/components/ui/Input';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  ArrowLeft, Phone, ExternalLink, Camera, Wrench,
  Play, CheckCircle, Clock, Plus, Calendar, User, FileText,
  Shield, ShieldOff, ShieldQuestion, X,
} from 'lucide-react';
import {
  getTicket, updateTicket, submitResolution,
  createIntervention, updateIntervention, getInstallers,
} from '@/lib/services/sav.service';
import type { SavTicket, SavIntervention } from '@/types/sav';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtCost(n: number) {
  return n > 0 ? `${n.toLocaleString('fr-FR')} MAD` : '—';
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SavTicketDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const { t } = useLocale();

  const [ticket, setTicket] = useState<SavTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Intervention form
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planDate, setPlanDate] = useState('');
  const [planTime, setPlanTime] = useState('');
  const [planTech, setPlanTech] = useState('');
  const [planNotes, setPlanNotes] = useState('');
  const [planSaving, setPlanSaving] = useState(false);

  // Complete intervention form
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completeDesc, setCompleteDesc] = useState('');
  const [completeParts, setCompleteParts] = useState('');
  const [completeTravelCost, setCompleteTravelCost] = useState('');
  const [completePartsCost, setCompletePartsCost] = useState('');
  const [completeLaborCost, setCompleteLaborCost] = useState('');
  const [completeSaving, setCompleteSaving] = useState(false);

  // Resolution
  const [resolutionText, setResolutionText] = useState('');
  const [resolvingSaving, setResolvingSaving] = useState(false);

  // Installers for dropdown
  const [installers, setInstallers] = useState<{ id: string; full_name: string }[]>([]);

  // Saving state for close button
  const [closingSaving, setClosingSaving] = useState(false);

  const loadTicket = useCallback(async () => {
    setLoading(true);
    const res = await getTicket(id as string);
    if (res.success && res.data) {
      setTicket(res.data);
      setResolutionText(res.data.resolution_report || '');
    } else {
      setError(res.error || 'Ticket not found');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadTicket();
    getInstallers().then(r => {
      if (r.success && r.data) setInstallers(r.data);
    });
  }, [loadTicket]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handlePlanIntervention() {
    if (!planDate) { setError('Planned date is required'); return; }
    setPlanSaving(true);
    setError(null);
    const res = await createIntervention({
      ticket_id: id as string,
      planned_date: planDate,
      planned_time: planTime || undefined,
      technician_id: planTech || undefined,
      notes: planNotes || undefined,
    });
    setPlanSaving(false);
    if (res.success) {
      setSuccess('Intervention planned');
      setShowPlanForm(false);
      setPlanDate(''); setPlanTime(''); setPlanTech(''); setPlanNotes('');
      loadTicket();
    } else {
      setError(res.error || 'Failed to plan intervention');
    }
  }

  async function handleStartIntervention(intv: SavIntervention) {
    setError(null);
    const res = await updateIntervention(intv.id, id as string, {
      status: 'in_progress',
      actual_start: new Date().toISOString(),
    });
    if (res.success) {
      setSuccess('Intervention started');
      loadTicket();
    } else {
      setError(res.error || 'Failed');
    }
  }

  async function handleCompleteIntervention() {
    if (!completingId) return;
    setCompleteSaving(true);
    setError(null);
    const res = await updateIntervention(completingId, id as string, {
      status: 'completed',
      actual_end: new Date().toISOString(),
      work_description: completeDesc || undefined,
      parts_used: completeParts || undefined,
      travel_cost: completeTravelCost ? parseFloat(completeTravelCost) : undefined,
      parts_cost: completePartsCost ? parseFloat(completePartsCost) : undefined,
      labor_cost: completeLaborCost ? parseFloat(completeLaborCost) : undefined,
    });
    setCompleteSaving(false);
    if (res.success) {
      setSuccess('Intervention completed');
      setCompletingId(null);
      setCompleteDesc(''); setCompleteParts('');
      setCompleteTravelCost(''); setCompletePartsCost(''); setCompleteLaborCost('');
      loadTicket();
    } else {
      setError(res.error || 'Failed');
    }
  }

  async function handleResolve() {
    if (!resolutionText.trim()) { setError('Resolution report is required'); return; }
    setResolvingSaving(true);
    setError(null);
    const res = await submitResolution(id as string, resolutionText);
    setResolvingSaving(false);
    if (res.success) {
      setSuccess('Ticket resolved');
      loadTicket();
    } else {
      setError(res.error || 'Failed');
    }
  }

  async function handleClose() {
    setClosingSaving(true);
    setError(null);
    const res = await updateTicket(id as string, { status: 'closed' });
    setClosingSaving(false);
    if (res.success) {
      setSuccess('Ticket closed');
      loadTicket();
    } else {
      setError(res.error || 'Failed');
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-[#C9956B] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p>{error || 'Ticket not found'}</p>
        <Button variant="ghost" className="mt-4" onClick={() => router.push('/sav')}>
          <ArrowLeft size={16} /> Back to SAV
        </Button>
      </div>
    );
  }

  const project = ticket.project;
  const photos = ticket.sav_photos || [];
  const interventions = (ticket.sav_interventions || []).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const canResolve = ticket.status === 'in_progress' || ticket.status === 'planned';
  const canClose = ticket.status === 'resolved';
  const canPlan = ticket.status !== 'closed' && ticket.status !== 'resolved';

  return (
    <div className="min-h-screen bg-[#FAFAF8] dark:bg-[#0f0f23]">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-[#1a1a2e]/80 backdrop-blur-xl border-b border-[#E8E5E0] dark:border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/sav')}
            className="p-2 -ml-2 rounded-xl hover:bg-[#F5F3F0] dark:hover:bg-white/5 transition-colors"
          >
            <ArrowLeft size={20} className="text-[#1a1a2e] dark:text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-[#1a1a2e] dark:text-white truncate">
                {ticket.ticket_number || 'SAV Ticket'}
              </h1>
              <StatusBadge status={ticket.status} />
              <StatusBadge status={ticket.priority} />
            </div>
            <p className="text-xs text-[#64648B] dark:text-white/50 mt-0.5">
              Created {timeAgo(ticket.created_at)}
              {ticket.created_profile && ` by ${ticket.created_profile.full_name}`}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-32">
        {/* ── Banners ─────────────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
            {error}
            <button onClick={() => setError(null)}><X size={16} /></button>
          </div>
        )}
        {success && (
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
            {success}
            <button onClick={() => setSuccess(null)}><X size={16} /></button>
          </div>
        )}

        {/* ── Warranty Banner ─────────────────────────────────────────────── */}
        <Card>
          <CardContent className="py-3">
            {ticket.warranty_status === 'under_warranty' ? (
              <div className="flex items-center gap-3 text-emerald-700 dark:text-emerald-400">
                <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Shield size={20} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Under Warranty</p>
                  <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                    Until {fmtDate(ticket.warranty_expiry_date)}
                  </p>
                </div>
              </div>
            ) : ticket.warranty_status === 'expired' ? (
              <div className="flex items-center gap-3 text-red-700 dark:text-red-400">
                <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                  <ShieldOff size={20} className="text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Warranty Expired</p>
                  <p className="text-xs text-red-600/70 dark:text-red-400/70">
                    Expired {fmtDate(ticket.warranty_expiry_date)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
                <div className="w-10 h-10 bg-gray-100 dark:bg-white/5 rounded-xl flex items-center justify-center flex-shrink-0">
                  <ShieldQuestion size={20} className="text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Warranty Unknown</p>
                  <p className="text-xs text-gray-400">No delivery date recorded</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Project Info ─────────────────────────────────────────────────── */}
        {project && (
          <Card>
            <CardContent>
              <h3 className="text-xs font-semibold text-[#64648B] dark:text-white/50 uppercase tracking-wider mb-3">
                Project
              </h3>
              <div className="space-y-2.5">
                <button
                  onClick={() => router.push(`/projects/${project.id}`)}
                  className="flex items-center gap-2 text-sm font-medium text-[#C9956B] hover:underline"
                >
                  <FileText size={14} />
                  {project.reference_code}
                  <ExternalLink size={12} />
                </button>
                <div className="flex items-center gap-2 text-sm text-[#1a1a2e] dark:text-white">
                  <User size={14} className="text-[#64648B]" />
                  {project.client_name}
                </div>
                {project.client_phone && (
                  <a
                    href={`tel:${project.client_phone}`}
                    className="flex items-center gap-2 text-sm text-[#C9956B] hover:underline"
                  >
                    <Phone size={14} />
                    {project.client_phone}
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Issue Details ────────────────────────────────────────────────── */}
        <Card>
          <CardContent>
            <h3 className="text-xs font-semibold text-[#64648B] dark:text-white/50 uppercase tracking-wider mb-3">
              Issue Details
            </h3>
            <div className="mb-3">
              <StatusBadge status={ticket.issue_type} />
            </div>
            <p className="text-sm text-[#1a1a2e] dark:text-white/90 leading-relaxed whitespace-pre-wrap">
              {ticket.issue_description}
            </p>
          </CardContent>
        </Card>

        {/* ── Photos ──────────────────────────────────────────────────────── */}
        {photos.length > 0 && (
          <Card>
            <CardContent>
              <h3 className="text-xs font-semibold text-[#64648B] dark:text-white/50 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Camera size={14} />
                Photos ({photos.length})
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo) => (
                  <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-white/5">
                    <img
                      src={photo.photo_url}
                      alt={photo.caption || 'SAV photo'}
                      className="w-full h-full object-cover"
                    />
                    {photo.photo_type !== 'issue' && (
                      <span className="absolute bottom-1 left-1 text-[9px] bg-black/50 text-white px-1.5 py-0.5 rounded">
                        {photo.photo_type}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Interventions ───────────────────────────────────────────────── */}
        <Card>
          <CardContent>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-[#64648B] dark:text-white/50 uppercase tracking-wider flex items-center gap-2">
                <Wrench size={14} />
                Interventions ({interventions.length})
              </h3>
              {canPlan && (
                <button
                  onClick={() => setShowPlanForm(true)}
                  className="text-xs text-[#C9956B] font-medium flex items-center gap-1 hover:underline"
                >
                  <Plus size={14} /> Plan
                </button>
              )}
            </div>

            {interventions.length === 0 && !showPlanForm && (
              <p className="text-sm text-[#64648B] dark:text-white/40 text-center py-4">
                No interventions yet
              </p>
            )}

            {/* Plan Intervention Form */}
            {showPlanForm && (
              <div className="bg-[#FAFAF8] dark:bg-white/5 rounded-xl p-4 mb-4 space-y-3 border border-[#E8E5E0] dark:border-white/10">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[#1a1a2e] dark:text-white">Plan Intervention</h4>
                  <button onClick={() => setShowPlanForm(false)}>
                    <X size={16} className="text-[#64648B]" />
                  </button>
                </div>
                <Input
                  type="date"
                  label="Planned Date *"
                  value={planDate}
                  onChange={(e) => setPlanDate(e.target.value)}
                />
                <Input
                  type="time"
                  label="Time (optional)"
                  value={planTime}
                  onChange={(e) => setPlanTime(e.target.value)}
                />
                <Select
                  label="Technician"
                  value={planTech}
                  onChange={(e) => setPlanTech(e.target.value)}
                  options={[
                    { value: '', label: 'Select technician...' },
                    ...installers.map(i => ({ value: i.id, label: i.full_name })),
                  ]}
                />
                <Textarea
                  label="Notes"
                  placeholder="Any instructions..."
                  value={planNotes}
                  onChange={(e) => setPlanNotes(e.target.value)}
                  rows={2}
                />
                <Button
                  variant="primary"
                  fullWidth
                  loading={planSaving}
                  onClick={handlePlanIntervention}
                >
                  <Calendar size={16} /> Schedule Intervention
                </Button>
              </div>
            )}

            {/* Intervention List */}
            <div className="space-y-3">
              {interventions.map((intv) => (
                <div
                  key={intv.id}
                  className="border border-[#E8E5E0] dark:border-white/10 rounded-xl p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={intv.status} />
                      {intv.technician && (
                        <span className="text-xs text-[#64648B] dark:text-white/50">
                          {intv.technician.full_name}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-[#64648B] dark:text-white/40">
                      {fmtDate(intv.planned_date)}
                      {intv.planned_time && ` ${intv.planned_time}`}
                    </span>
                  </div>

                  {intv.notes && (
                    <p className="text-xs text-[#64648B] dark:text-white/50">{intv.notes}</p>
                  )}

                  {intv.status === 'completed' && (
                    <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-lg p-2.5 space-y-1.5">
                      {intv.work_description && (
                        <p className="text-xs text-emerald-800 dark:text-emerald-300">{intv.work_description}</p>
                      )}
                      {intv.parts_used && (
                        <p className="text-xs text-emerald-700/70 dark:text-emerald-400/70">Parts: {intv.parts_used}</p>
                      )}
                      <div className="flex gap-3 text-xs text-emerald-700/70 dark:text-emerald-400/70">
                        {intv.travel_cost > 0 && <span>Travel: {fmtCost(intv.travel_cost)}</span>}
                        {intv.parts_cost > 0 && <span>Parts: {fmtCost(intv.parts_cost)}</span>}
                        {intv.labor_cost > 0 && <span>Labor: {fmtCost(intv.labor_cost)}</span>}
                      </div>
                      {(intv.actual_start || intv.actual_end) && (
                        <p className="text-[10px] text-emerald-600/50 dark:text-emerald-400/50">
                          {intv.actual_start && `Started: ${fmtDateTime(intv.actual_start)}`}
                          {intv.actual_end && ` | Ended: ${fmtDateTime(intv.actual_end)}`}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  {intv.status === 'planned' && (
                    <Button
                      variant="accent"
                      size="sm"
                      fullWidth
                      onClick={() => handleStartIntervention(intv)}
                    >
                      <Play size={14} /> Start Intervention
                    </Button>
                  )}

                  {intv.status === 'in_progress' && completingId !== intv.id && (
                    <Button
                      variant="success"
                      size="sm"
                      fullWidth
                      onClick={() => setCompletingId(intv.id)}
                    >
                      <CheckCircle size={14} /> Complete
                    </Button>
                  )}

                  {/* Complete Intervention Form */}
                  {completingId === intv.id && (
                    <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-3 space-y-3 border border-emerald-200 dark:border-emerald-800">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                          Complete Intervention
                        </h4>
                        <button onClick={() => setCompletingId(null)}>
                          <X size={16} className="text-emerald-600" />
                        </button>
                      </div>
                      <Textarea
                        label="Work Description"
                        placeholder="What was done..."
                        value={completeDesc}
                        onChange={(e) => setCompleteDesc(e.target.value)}
                        rows={2}
                      />
                      <Input
                        label="Parts Used"
                        placeholder="e.g. 2x hinges, 1x panel"
                        value={completeParts}
                        onChange={(e) => setCompleteParts(e.target.value)}
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <Input
                          type="number"
                          label="Travel"
                          placeholder="MAD"
                          value={completeTravelCost}
                          onChange={(e) => setCompleteTravelCost(e.target.value)}
                        />
                        <Input
                          type="number"
                          label="Parts"
                          placeholder="MAD"
                          value={completePartsCost}
                          onChange={(e) => setCompletePartsCost(e.target.value)}
                        />
                        <Input
                          type="number"
                          label="Labor"
                          placeholder="MAD"
                          value={completeLaborCost}
                          onChange={(e) => setCompleteLaborCost(e.target.value)}
                        />
                      </div>
                      <Button
                        variant="success"
                        fullWidth
                        loading={completeSaving}
                        onClick={handleCompleteIntervention}
                      >
                        <CheckCircle size={16} /> Confirm Completion
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Resolution ──────────────────────────────────────────────────── */}
        {(canResolve || ticket.status === 'resolved' || ticket.status === 'closed') && (
          <Card>
            <CardContent>
              <h3 className="text-xs font-semibold text-[#64648B] dark:text-white/50 uppercase tracking-wider mb-3 flex items-center gap-2">
                <FileText size={14} />
                Resolution Report
              </h3>
              {ticket.status === 'closed' || ticket.status === 'resolved' ? (
                <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-3">
                  <p className="text-sm text-emerald-800 dark:text-emerald-300 whitespace-pre-wrap">
                    {ticket.resolution_report || 'No report provided'}
                  </p>
                  {ticket.resolved_at && (
                    <p className="text-xs text-emerald-600/60 dark:text-emerald-400/50 mt-2">
                      Resolved {fmtDateTime(ticket.resolved_at)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <Textarea
                    placeholder="Describe the resolution..."
                    value={resolutionText}
                    onChange={(e) => setResolutionText(e.target.value)}
                    rows={3}
                  />
                  <Button
                    variant="success"
                    fullWidth
                    loading={resolvingSaving}
                    onClick={handleResolve}
                  >
                    <CheckCircle size={16} /> Mark Resolved
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Assigned To ─────────────────────────────────────────────────── */}
        {ticket.assigned_profile && (
          <Card>
            <CardContent className="py-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#C9956B]/10 rounded-full flex items-center justify-center">
                  <User size={16} className="text-[#C9956B]" />
                </div>
                <div>
                  <p className="text-[11px] text-[#64648B] dark:text-white/50">Assigned to</p>
                  <p className="text-sm font-medium text-[#1a1a2e] dark:text-white">
                    {ticket.assigned_profile.full_name}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Bottom Action Bar ─────────────────────────────────────────────── */}
      {(canPlan || canClose) && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-[#1a1a2e]/90 backdrop-blur-xl border-t border-[#E8E5E0] dark:border-white/10 p-4 z-20">
          {canPlan && ticket.status === 'open' && (
            <Button
              variant="primary"
              fullWidth
              size="lg"
              onClick={() => {
                setShowPlanForm(true);
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
              }}
            >
              <Calendar size={18} /> Plan Intervention
            </Button>
          )}
          {canClose && (
            <Button
              variant="primary"
              fullWidth
              size="lg"
              loading={closingSaving}
              onClick={handleClose}
            >
              <CheckCircle size={18} /> Close Ticket
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
