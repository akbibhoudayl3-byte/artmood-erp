'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { RoleGuard } from '@/components/auth/RoleGuard';
import {
  AlertTriangle, CheckCircle, XCircle, Clock, ArrowLeft, X
} from 'lucide-react';

interface ExceptionRequest {
  id: string;
  project_id: string;
  requester_id: string;
  requested_status: string;
  current_deposit_pct: number;
  reason: string;
  urgency: string;
  note: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  project: {
    id: string;
    reference_code: string;
    client_name: string;
    status: string;
    total_amount: number;
    paid_amount: number;
  };
  requester: {
    full_name: string;
    role: string;
  };
  reviewer?: {
    full_name: string;
  } | null;
}

export default function ExceptionRequestsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { profile } = useAuth();

  const [requests, setRequests] = useState<ExceptionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [actionModal, setActionModal] = useState<{ req: ExceptionRequest; action: 'approve' | 'reject' } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadRequests(); }, [filter]);

  async function loadRequests() {
    setLoading(true);
    let query = supabase
      .from('exception_requests')
      .select('*, project:projects(id, reference_code, client_name, status, total_amount, paid_amount), requester:profiles!exception_requests_requester_id_fkey(full_name, role), reviewer:profiles!exception_requests_reviewed_by_fkey(full_name)')
      .order('created_at', { ascending: false });

    if (filter === 'pending') {
      query = query.eq('status', 'pending');
    }

    const { data } = await query;
    setRequests((data as ExceptionRequest[]) || []);
    setLoading(false);
  }

  async function handleAction() {
    if (!actionModal) return;
    setSubmitting(true);

    try {
      const res = await fetch(`/api/exception-requests/${actionModal.req.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: actionModal.action,
          review_note: reviewNote || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.message || data.error || 'Erreur');
        setSubmitting(false);
        return;
      }

      setActionModal(null);
      setReviewNote('');
      loadRequests();
    } catch {
      alert('Erreur réseau');
    }
    setSubmitting(false);
  }

  const isCeo = profile?.role === 'ceo';

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'workshop_manager'] as any[]}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/projects')} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Demandes d&apos;exception</h1>
            <p className="text-xs text-gray-500">Bypass acompte — approbation CEO requise</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            <Clock size={12} className="inline mr-1" /> En attente
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Toutes
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-28 skeleton rounded-2xl" />)}
          </div>
        ) : requests.length === 0 ? (
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500 text-center py-8">
                {filter === 'pending' ? 'Aucune demande en attente.' : 'Aucune demande d\'exception.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map(req => (
              <Card key={req.id} className={req.urgency === 'urgent' && req.status === 'pending' ? 'border-amber-300 bg-amber-50/30' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      {/* Header */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => router.push(`/projects/${req.project_id}`)}
                          className="text-sm font-bold text-blue-700 hover:underline"
                        >
                          {req.project?.reference_code}
                        </button>
                        <span className="text-sm text-gray-700">{req.project?.client_name}</span>
                        {req.urgency === 'urgent' && (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded">URGENT</span>
                        )}
                        <StatusBadge status={req.status} />
                      </div>

                      {/* Deposit info */}
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-gray-500">
                          Acompte: <span className="font-semibold text-red-600">{req.current_deposit_pct}%</span>
                        </span>
                        <span className="text-gray-400">|</span>
                        <span className="text-gray-500">
                          {req.project?.paid_amount?.toLocaleString() || 0} / {req.project?.total_amount?.toLocaleString() || 0} MAD
                        </span>
                      </div>

                      {/* Reason */}
                      <p className="text-sm text-gray-700">{req.reason}</p>
                      {req.note && <p className="text-xs text-gray-500 italic">{req.note}</p>}

                      {/* Requester + date */}
                      <div className="flex items-center gap-3 text-[11px] text-gray-400">
                        <span>Par: {req.requester?.full_name}</span>
                        <span>{new Date(req.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      {/* Review info for completed */}
                      {req.status !== 'pending' && req.reviewed_at && (
                        <div className={`text-xs p-2 rounded-lg mt-1 ${req.status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                          {req.status === 'approved' ? <CheckCircle size={12} className="inline mr-1" /> : <XCircle size={12} className="inline mr-1" />}
                          {req.status === 'approved' ? 'Approuvée' : 'Rejetée'} par {req.reviewer?.full_name}
                          {' le '}{new Date(req.reviewed_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                          {req.review_note && <span className="block mt-0.5">Note: {req.review_note}</span>}
                        </div>
                      )}
                    </div>

                    {/* Action buttons (CEO only, pending only) */}
                    {isCeo && req.status === 'pending' && (
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => { setReviewNote(''); setActionModal({ req, action: 'approve' }); }}
                          className="text-xs"
                        >
                          <CheckCircle size={14} /> Approuver
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => { setReviewNote(''); setActionModal({ req, action: 'reject' }); }}
                          className="text-xs"
                        >
                          <XCircle size={14} /> Rejeter
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Action Confirmation Modal */}
        {actionModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className={`font-bold flex items-center gap-2 ${actionModal.action === 'approve' ? 'text-green-700' : 'text-red-700'}`}>
                  {actionModal.action === 'approve' ? <CheckCircle size={18} /> : <XCircle size={18} />}
                  {actionModal.action === 'approve' ? 'Approuver l\'exception' : 'Rejeter l\'exception'}
                </h2>
                <button onClick={() => setActionModal(null)}><X size={20} className="text-gray-400" /></button>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-xs text-gray-600">
                <p><strong>Projet:</strong> {actionModal.req.project?.reference_code} — {actionModal.req.project?.client_name}</p>
                <p><strong>Acompte:</strong> {actionModal.req.current_deposit_pct}%</p>
                <p><strong>Raison:</strong> {actionModal.req.reason}</p>
              </div>

              {actionModal.action === 'approve' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <p>En approuvant, le projet passera immédiatement en production sans l&apos;acompte de 50%. Cette action sera auditée.</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Note {actionModal.action === 'reject' ? '(raison du rejet)' : '(optionnel)'}
                </label>
                <textarea
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  placeholder={actionModal.action === 'reject' ? 'Expliquez le refus...' : 'Note optionnelle...'}
                />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setActionModal(null)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600">
                  Annuler
                </button>
                <button
                  onClick={handleAction}
                  disabled={submitting}
                  className={`flex-1 py-2.5 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors ${
                    actionModal.action === 'approve'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {submitting ? 'Traitement...' : actionModal.action === 'approve' ? 'Confirmer l\'approbation' : 'Confirmer le rejet'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
