'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { CheckCircle, XCircle, ArrowLeft } from 'lucide-react';

interface ExReq {
  id: string;
  project_id: string;
  current_deposit_percent: number;
  reason: string;
  note: string | null;
  status: string;
  reviewed_at: string | null;
  created_at: string;
  project: { reference_code: string; client_name: string };
  requester: { full_name: string };
  reviewer?: { full_name: string } | null;
}

export default function ExceptionRequestsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { profile } = useAuth();

  const [requests, setRequests] = useState<ExReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => { load(); }, [filter]);

  async function load() {
    setLoading(true);
    let q = supabase
      .from('project_exceptions')
      .select('*, project:projects(reference_code, client_name), requester:profiles!project_exceptions_requested_by_fkey(full_name), reviewer:profiles!project_exceptions_reviewed_by_fkey(full_name)')
      .order('created_at', { ascending: false });
    if (filter === 'pending') q = q.eq('status', 'pending');
    const { data } = await q;
    setRequests((data as ExReq[]) || []);
    setLoading(false);
  }

  async function act(id: string, action: 'approve' | 'reject') {
    setActing(id);
    const res = await fetch(`/api/exception-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const d = await res.json();
      alert(d.error || 'Erreur');
    }
    setActing(null);
    load();
  }

  const isCeo = profile?.role === 'ceo';

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'workshop_manager'] as any[]}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/projects')} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Demandes d&apos;exception</h1>
        </div>

        <div className="flex gap-2">
          {(['pending', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === f ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
              {f === 'pending' ? 'En attente' : 'Toutes'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 skeleton rounded-2xl" />)}</div>
        ) : requests.length === 0 ? (
          <Card><CardContent><p className="text-sm text-gray-500 text-center py-8">Aucune demande.</p></CardContent></Card>
        ) : (
          <div className="space-y-3">
            {requests.map(req => (
              <Card key={req.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => router.push(`/projects/${req.project_id}`)}
                          className="text-sm font-bold text-blue-700 hover:underline">
                          {req.project?.reference_code}
                        </button>
                        <span className="text-sm text-gray-700">{req.project?.client_name}</span>
                        <StatusBadge status={req.status} />
                      </div>
                      <p className="text-xs text-gray-500">
                        Acompte: <span className="font-semibold text-red-600">{req.current_deposit_percent}%</span>
                      </p>
                      <p className="text-sm text-gray-700">{req.reason}</p>
                      {req.note && <p className="text-xs text-gray-500 italic">{req.note}</p>}
                      <p className="text-[11px] text-gray-400">
                        Par {req.requester?.full_name} — {new Date(req.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {req.status !== 'pending' && req.reviewed_at && (
                        <p className={`text-xs ${req.status === 'approved' ? 'text-green-600' : 'text-red-600'}`}>
                          {req.status === 'approved' ? 'Approuvee' : 'Rejetee'} par {req.reviewer?.full_name}
                        </p>
                      )}
                    </div>

                    {isCeo && req.status === 'pending' && (
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <Button variant="primary" size="sm" loading={acting === req.id}
                          onClick={() => act(req.id, 'approve')} className="text-xs">
                          <CheckCircle size={14} /> Approuver
                        </Button>
                        <Button variant="danger" size="sm" loading={acting === req.id}
                          onClick={() => act(req.id, 'reject')} className="text-xs">
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
      </div>
    </RoleGuard>
  );
}
