"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import Input from '@/components/ui/Input';
import { COST_TYPES } from '@/lib/constants';
import type { ProjectCost, CostType } from '@/types/database';
import { ArrowLeft, Plus, DollarSign, TrendingUp, TrendingDown, X, Trash2, AlertCircle, CheckCircle} from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

export default function ProjectCostsPage() {
  const { id: projectId } = useParams();
  const router = useRouter();
  const { profile, canViewFinance } = useAuth();
  const supabase = createClient();
  const { t } = useLocale();

  const [costs, setCosts] = useState<ProjectCost[]>([]);
  const [costSuccess, setCostSuccess] = useState('');
  const [project, setProject] = useState<{ total_amount: number; paid_amount: number; client_name: string; reference_code: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  // Form
  const [costType, setCostType] = useState<CostType>('material');
  const [costDescription, setCostDescription] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costError, setCostError] = useState('');
  // Aliases for backward compat
  const description = costDescription;
  const setDescription = setCostDescription;
  const amount = costAmount;
  const setAmount = setCostAmount;

  useEffect(() => { loadData(); }, [projectId]);

  async function loadData() {
    const [costsRes, projRes] = await Promise.all([
      supabase.from('project_costs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      supabase.from('projects')
        .select('total_amount, paid_amount, client_name, reference_code')
        .eq('id', projectId)
        .single(),
    ]);
    setCosts((costsRes.data as ProjectCost[]) || []);
    setProject(projRes.data);
    setLoading(false);
  }

  async function addCost() {
    // ── Validation ───────────────────────────────────────────────
    setCostError('');
    const parsedAmount = parseFloat(costAmount || '0');
    if (!costDescription?.trim()) {
      setCostError('La description est requise.');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setCostError("Le montant doit être supérieur à zéro.");
      return;
    }
    // ─────────────────────────────────────────────────────────────
    const amt = parseFloat(amount);
    if (!amt || !description.trim()) return;

    await supabase.from('project_costs').insert({
      project_id: projectId,
      cost_type: costType,
      description: description.trim(),
      amount: amt,
      created_by: profile?.id,
    });

    setShowNew(false);
    setDescription('');
    setAmount('');
    loadData();
  }

  async function deleteCost(costId: string) {
    if (!confirm('Delete this cost entry?')) return;
    const { error: deleteErr } = await supabase.from('project_costs').delete().eq('id', costId);
    if (deleteErr) {
      setCostError('Erreur suppression: ' + deleteErr.message);
      return;
    }
    loadData();
  }

  if (!canViewFinance) {
    return <div className="text-center py-12 text-gray-500">Access denied</div>;
  }

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;

  const totalCost = costs.reduce((sum, c) => sum + c.amount, 0);
  const revenue = project?.total_amount || 0;
  const profit = revenue - totalCost;
  const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;

  // Group costs by type
  const costsByType = COST_TYPES.map(t => ({
    ...t,
    total: costs.filter(c => c.cost_type === t.key).reduce((sum, c) => sum + c.amount, 0),
    count: costs.filter(c => c.cost_type === t.key).length,
  })).filter(t => t.total > 0);

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(`/projects/${projectId}`)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <p className="text-xs text-gray-400 font-mono">{project?.reference_code}</p>
          <h1 className="text-xl font-bold text-[#1a1a2e]">{t('projects.profitability')}</h1>
        </div>
        <Button size="sm" onClick={() => setShowNew(true)}>
          <Plus size={14} /> {t('costs.add_cost')}
        </Button>
      </div>

      {/* Profitability Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={16} className="text-green-500" />
            <span className="text-xs text-[#64648B]">Revenue</span>
          </div>
          <p className="text-xl font-bold text-green-600">{revenue.toLocaleString()} MAD</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown size={16} className="text-red-500" />
            <span className="text-xs text-[#64648B]">{t('costs.total_cost')}</span>
          </div>
          <p className="text-xl font-bold text-red-600">{totalCost.toLocaleString()} MAD</p>
        </Card>
      </div>

      <Card className={`p-4 ${profit >= 0 ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-[#64648B]">{t('costs.profit_margin')}</p>
            <p className={`text-2xl font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {profit.toLocaleString()} MAD
            </p>
          </div>
          <div className={`text-3xl font-bold ${margin >= 30 ? 'text-green-500' : margin >= 15 ? 'text-yellow-500' : 'text-red-500'}`}>
            {margin}%
          </div>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full mt-3">
          <div
            className={`h-full rounded-full transition-all ${margin >= 30 ? 'bg-green-500' : margin >= 15 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${Math.min(Math.max(margin, 0), 100)}%` }}
          />
        </div>
      </Card>

      {/* Cost Breakdown */}
      {costsByType.length > 0 && (
        <Card>
          <CardHeader><h2 className="font-semibold text-sm">Cost Breakdown</h2></CardHeader>

          {costSuccess && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-2 text-sm mb-3">
              <CheckCircle size={14} />
              <span>{costSuccess}</span>
            </div>
          )}
          {costError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-sm mb-3">
              <AlertCircle size={14} />
              <span>{costError}</span>
              <button onClick={() => setCostError('')} className="ml-auto text-red-500 hover:text-red-700">
                <X size={12} />
              </button>
            </div>
          )}
          <CardContent>
            <div className="space-y-2">
              {costsByType.map(ct => (
                <div key={ct.key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={ct.key} />
                    <span className="text-xs text-[#64648B]">({ct.count})</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{ct.total.toLocaleString()} MAD</p>
                    <p className="text-xs text-[#64648B]">{totalCost > 0 ? Math.round(ct.total / totalCost * 100) : 0}%</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Cost Form */}
      {showNew && (
        <Card className="border-blue-200">
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">{t('costs.add_cost')}</h3>
                <button onClick={() => setShowNew(false)}><X size={18} className="text-gray-400" /></button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cost Type</label>
                <select value={costType} onChange={(e) => setCostType(e.target.value as CostType)}
                  className="w-full border border-[#E8E5E0] rounded-xl px-3 py-2 text-sm">
                  {COST_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <Input label={t('common.description')} placeholder="e.g. Melamine boards 18mm" value={description} onChange={(e) => setDescription(e.target.value)} />
              <Input label={`${t('common.amount')} (MAD)`} type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <Button fullWidth onClick={addCost}><DollarSign size={16} /> {t('costs.add_cost')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cost List */}
      <Card>
        <CardHeader><h2 className="font-semibold text-sm">Cost Entries ({costs.length})</h2></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {costs.map(cost => (
              <div key={cost.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <StatusBadge status={cost.cost_type} />
                  <div className="min-w-0">
                    <p className="text-sm text-[#1a1a2e] truncate">{cost.description}</p>
                    <p className="text-xs text-[#64648B]">{new Date(cost.created_at).toLocaleDateString('fr-FR')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <p className="text-sm font-medium text-red-600">{cost.amount.toLocaleString()} MAD</p>
                  {['ceo', 'commercial_manager'].includes(profile?.role || '') && (
                    <button onClick={() => deleteCost(cost.id)} className="p-1 text-gray-400 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {costs.length === 0 && <p className="text-sm text-[#64648B] text-center py-4">{t('common.no_results')}</p>}
          </div>
        </CardContent>
      </Card>
    </div>
      </RoleGuard>
  );
}
