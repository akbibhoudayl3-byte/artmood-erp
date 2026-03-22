'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { FileText, Printer, DollarSign, Search, ExternalLink, AlertCircle } from 'lucide-react';

interface InvoiceProject {
  id: string;
  reference_code: string;
  client_name: string;
  client_phone: string | null;
  status: string;
  total_amount: number;
  paid_amount: number;
  created_at: string;
  has_accepted_quote: boolean;
}

export default function InvoicesPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLocale();
  const [projects, setProjects] = useState<InvoiceProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    // Fetch projects that have accepted quotes (invoice-able)
    const { data: projectsData, error } = await supabase
      .from('projects')
      .select('id, reference_code, client_name, client_phone, status, total_amount, paid_amount, created_at')
      .gt('total_amount', 0)
      .in('status', ['production', 'installation', 'delivered', 'completed'])
      .order('created_at', { ascending: false });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    // Check which projects have accepted quotes
    const projectIds = (projectsData || []).map(p => p.id);
    const { data: quotesData } = await supabase
      .from('quotes')
      .select('project_id')
      .in('project_id', projectIds.length > 0 ? projectIds : ['__none__'])
      .eq('status', 'accepted');

    const acceptedSet = new Set((quotesData || []).map(q => q.project_id));

    const enriched = (projectsData || []).map(p => ({
      ...p,
      has_accepted_quote: acceptedSet.has(p.id),
    }));

    setProjects(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const tvaRate = 0.20;
  const getTTC = (ht: number) => ht + Math.round(ht * tvaRate);

  const filtered = projects.filter(p => {
    const matchSearch = !search || p.client_name.toLowerCase().includes(search.toLowerCase()) || p.reference_code.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;

    const ttc = getTTC(p.total_amount);
    if (filter === 'unpaid') return p.paid_amount === 0;
    if (filter === 'partial') return p.paid_amount > 0 && p.paid_amount < ttc;
    if (filter === 'paid') return p.paid_amount >= ttc;
    return true;
  });

  const totalHT = filtered.reduce((s, p) => s + p.total_amount, 0);
  const totalPaid = filtered.reduce((s, p) => s + p.paid_amount, 0);
  const totalRemaining = filtered.reduce((s, p) => s + Math.max(0, getTTC(p.total_amount) - p.paid_amount), 0);

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Factures</h1>
      </div>

      <ErrorBanner message={errorMsg} type="error" onDismiss={() => setErrorMsg(null)} />

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent>
            <p className="text-xs text-gray-500">Total HT</p>
            <p className="text-lg font-bold">{fmt(totalHT)} MAD</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-gray-500">Encaissé</p>
            <p className="text-lg font-bold text-green-600">{fmt(totalPaid)} MAD</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-gray-500">Reste à percevoir</p>
            <p className="text-lg font-bold text-red-600">{fmt(totalRemaining)} MAD</p>
          </CardContent>
        </Card>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par client ou référence..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value as any)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
          <option value="all">Toutes</option>
          <option value="unpaid">Non payées</option>
          <option value="partial">Partiellement</option>
          <option value="paid">Payées</option>
        </select>
      </div>

      {/* Invoice list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FileText size={40} className="mx-auto mb-3 text-gray-300" />
            <p>Aucune facture trouvée</p>
          </div>
        ) : filtered.map(p => {
          const ttc = getTTC(p.total_amount);
          const remaining = Math.max(0, ttc - p.paid_amount);
          const paidPct = ttc > 0 ? Math.round((p.paid_amount / ttc) * 100) : 0;
          const payStatus = paidPct >= 100 ? 'completed' : paidPct > 0 ? 'in_progress' : 'pending';

          return (
            <Card key={p.id} className="hover:shadow-md transition-shadow">
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-400 font-mono">FAC-{p.reference_code}-{new Date(p.created_at).getFullYear()}</span>
                      <StatusBadge status={payStatus} />
                    </div>
                    <p className="font-semibold text-gray-900">{p.client_name}</p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                      <span>HT: {fmt(p.total_amount)} MAD</span>
                      <span>TTC: {fmt(ttc)} MAD</span>
                      <span className={remaining > 0 ? 'text-red-500 font-medium' : 'text-green-600 font-medium'}>
                        {remaining > 0 ? `Reste: ${fmt(remaining)} MAD` : 'Soldée'}
                      </span>
                    </div>
                    {/* Payment progress bar */}
                    <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2">
                      <div className={`h-full rounded-full transition-all ${paidPct >= 100 ? 'bg-green-500' : paidPct >= 50 ? 'bg-blue-500' : 'bg-orange-500'}`}
                        style={{ width: `${Math.min(paidPct, 100)}%` }} />
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button variant="secondary" size="sm"
                      onClick={() => router.push(`/projects/${p.id}`)}>
                      <ExternalLink size={14} />
                    </Button>
                    <Button variant="primary" size="sm"
                      onClick={() => window.open(`/api/print/invoice?project_id=${p.id}`, '_blank')}>
                      <Printer size={14} /> Facture
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
    </RoleGuard>
  );
}
