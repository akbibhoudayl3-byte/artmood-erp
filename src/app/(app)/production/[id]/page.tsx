'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { PRODUCTION_STATIONS } from '@/lib/constants';
import { useRealtime } from '@/lib/hooks/useRealtime';
import { ArrowLeft, Clock, User, Factory, ScanLine, Printer, ArrowRight, Scissors } from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

interface ProductionOrderDetail {
  id: string;
  project_id: string;
  status: string;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  project?: { client_name: string; reference_code: string };
  assigned?: { full_name: string } | null;
}

interface Part {
  id: string;
  part_name: string;
  part_code: string;
  current_station: string;
  assigned_worker: string | null;
  last_scan_time: string | null;
  worker?: { full_name: string } | null;
}

interface Scan {
  id: string;
  station: string;
  scanned_at: string;
  scanned_by_profile?: { full_name: string } | null;
}

export default function ProductionOrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const { t } = useLocale();
  const supabase = createClient();

  const [order, setOrder] = useState<ProductionOrderDetail | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);

  useEffect(() => { loadData(); }, [id]);

  // Real-time: refresh when parts update
  useRealtime('production_parts', () => loadData(), `production_order_id=eq.${id}`);

  async function loadData() {
    const [orderRes, partsRes] = await Promise.all([
      supabase.from('production_orders')
        .select('*, project:projects(client_name, reference_code), assigned:profiles!production_orders_assigned_to_fkey(full_name)')
        .eq('id', id).single(),
      supabase.from('production_parts')
        .select('*, worker:profiles!production_parts_assigned_worker_fkey(full_name)')
        .eq('production_order_id', id)
        .order('part_name'),
    ]);

    setOrder(orderRes.data as ProductionOrderDetail);
    setParts((partsRes.data as Part[]) || []);
    setLoading(false);
  }

  async function loadScans(partId: string) {
    setSelectedPart(partId);
    const { data } = await supabase.from('production_scans')
      .select('*, scanned_by_profile:profiles!production_scans_scanned_by_fkey(full_name)')
      .eq('part_id', partId)
      .order('scanned_at', { ascending: false });
    setScans((data as Scan[]) || []);
  }

  const [workflowBusy, setWorkflowBusy] = useState(false);

  async function startOrder() {
    setWorkflowBusy(true);
    await supabase.from('production_orders').update({
      status: 'in_progress', started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', id);
    setWorkflowBusy(false);
    loadData();
  }

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;
  if (!order) return <div className="text-center py-12 text-gray-500">{t('production.part_not_found')}</div>;

  const stationCounts = PRODUCTION_STATIONS.map(s => ({
    ...s,
    count: parts.filter(p => p.current_station === s.key).length,
  }));

  const completedParts = parts.filter(p => p.current_station === 'packing').length;
  const progressPct = parts.length > 0 ? (completedParts / parts.length) * 100 : 0;
  const daysElapsed = order.started_at ? Math.floor((Date.now() - new Date(order.started_at).getTime()) / 86400000) : 0;

  async function completeOrder() {
    if (!confirm('Mark this production order as completed?')) return;
    await supabase.from('production_orders').update({
      status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', id);
    loadData();
  }

  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager', 'workshop_worker'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/production')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <p className="text-xs text-gray-400 font-mono">{order.project?.reference_code}</p>
          <h1 className="text-xl font-bold text-gray-900">{order.project?.client_name}</h1>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Order Info */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between text-sm">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-gray-600">
                <Factory size={15} className="text-gray-400" /> {parts.length} parts
              </div>
              {order.started_at && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock size={15} className="text-gray-400" />
                  Started {new Date(order.started_at).toLocaleDateString('fr-FR')}
                  {' '}- {Math.floor((Date.now() - new Date(order.started_at).getTime()) / 86400000)} days
                </div>
              )}
              {order.assigned && (
                <div className="flex items-center gap-2 text-gray-600">
                  <User size={15} className="text-gray-400" /> {order.assigned.full_name}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workflow: ONE primary action per status */}
      {order.status === 'pending' && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent>
            <Button variant="success" className="w-full py-3 text-base font-semibold" onClick={startOrder} disabled={workflowBusy}>
              <Factory size={18} className="mr-2" /> {workflowBusy ? 'Starting...' : 'Start Production'} <ArrowRight size={18} className="ml-2" />
            </Button>
          </CardContent>
        </Card>
      )}
      {order.status === 'in_progress' && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent>
            <Button variant="primary" className="w-full py-3 text-base font-semibold" onClick={() => router.push(`/projects/${order.project_id}/cutting-list`)}>
              <Scissors size={18} className="mr-2" /> Start Cutting <ArrowRight size={18} className="ml-2" />
            </Button>
          </CardContent>
        </Card>
      )}
      {order.status === 'completed' && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent>
            <Button variant="primary" className="w-full py-3 text-base font-semibold" onClick={() => router.push(`/projects/${order.project_id}`)}>
              Back to Project <ArrowRight size={18} className="ml-2" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Progress Bar */}
      {parts.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-semibold text-[#1a1a2e]">{t('production.title')}</p>
              <p className="text-xs text-[#64648B]">{completedParts} of {parts.length} parts at packing &middot; {daysElapsed} days</p>
            </div>
            <span className={`text-lg font-bold ${progressPct >= 100 ? 'text-emerald-600' : progressPct >= 50 ? 'text-blue-600' : 'text-amber-600'}`}>
              {progressPct.toFixed(0)}%
            </span>
          </div>
          <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${progressPct >= 100 ? 'bg-emerald-500' : progressPct >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
              style={{ width: `${progressPct}%` }} />
          </div>
          {order.status === 'in_progress' && progressPct >= 100 && ['ceo', 'workshop_manager'].includes(profile?.role || '') && (
            <Button variant="success" fullWidth className="mt-3" onClick={completeOrder}>
              {t('common.save')}
            </Button>
          )}
        </Card>
      )}

      {/* Station Progress */}
      <div className="grid grid-cols-7 gap-2">
        {stationCounts.map(s => (
          <div key={s.key} className="text-center">
            <div className={`${s.color} text-white rounded-lg p-2`}>
              <p className="text-lg font-bold">{s.count}</p>
            </div>
            <p className="text-[10px] font-medium text-gray-600 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Parts List */}
      <Card>
        <CardHeader><h2 className="font-semibold text-sm">{t('common.name')} ({parts.length})</h2></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {parts.map(part => (
              <div key={part.id}>
                <div
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedPart === part.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'
                  }`}
                  onClick={() => loadScans(part.id)}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{part.part_name}</p>
                    <p className="text-xs text-gray-400 font-mono">{part.part_code}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {part.worker && <span className="text-xs text-gray-500">{part.worker.full_name}</span>}
                    <StatusBadge status={part.current_station} />
                  </div>
                </div>

                {/* Scan History */}
                {selectedPart === part.id && scans.length > 0 && (
                  <div className="ml-6 mt-1 mb-2 pl-3 border-l-2 border-blue-200 space-y-1">
                    {scans.map(scan => (
                      <div key={scan.id} className="flex items-center justify-between text-xs text-gray-500">
                        <div className="flex items-center gap-2">
                          <ScanLine size={12} />
                          <StatusBadge status={scan.station} />
                          {scan.scanned_by_profile && <span>{scan.scanned_by_profile.full_name}</span>}
                        </div>
                        <span>{new Date(scan.scanned_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Print */}
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => window.open(`/api/print/production-order?id=${id}`, '_blank')}>
          <Printer size={14} /> {t('production.title')}
        </Button>
      </div>

      {order.notes && (
        <Card>
          <CardHeader><h2 className="font-semibold text-sm">{t('common.notes')}</h2></CardHeader>
          <CardContent><p className="text-sm text-gray-600">{order.notes}</p></CardContent>
        </Card>
      )}
    </div>
      </RoleGuard>
  );
}
