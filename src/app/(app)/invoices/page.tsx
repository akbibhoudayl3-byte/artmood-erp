'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { RoleGuard } from '@/components/auth/RoleGuard';
import Card, { CardContent } from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import { FileText, ExternalLink, Printer, Search, Plus, RefreshCw } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Invoice {
  id: string;
  invoice_number: string;
  project_id: string;
  quote_id: string | null;
  status: string;
  total_amount: number;
  vat_rate: number;
  vat_amount: number;
  total_ttc: number;
  paid_amount: number;
  issue_date: string | null;
  due_date: string | null;
  created_at: string;
  projects: {
    id: string;
    reference_code: string;
    client_name: string;
    client_phone: string | null;
    client_email: string | null;
  } | null;
}

interface InvoiceableProject {
  id: string;
  reference_code: string;
  client_name: string;
  total_amount: number;
  paid_amount: number;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  issued: 'Émise',
  partial: 'Partielle',
  paid: 'Payée',
  cancelled: 'Annulée',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  issued: 'bg-blue-100 text-blue-700',
  partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
};

export default function InvoicesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [projects, setProjects] = useState<InvoiceableProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  async function loadInvoices() {
    setLoading(true);
    const res = await fetch('/api/invoices');
    if (res.ok) {
      const data = await res.json();
      setInvoices(data.invoices || []);
    }
    setLoading(false);
  }

  async function loadProjects() {
    const { data } = await supabase
      .from('projects')
      .select('id, reference_code, client_name, total_amount, paid_amount')
      .in('status', ['in_production', 'installation', 'delivered'])
      .gt('total_amount', 0)
      .order('created_at', { ascending: false });
    setProjects((data as InvoiceableProject[]) || []);
  }

  useEffect(() => {
    loadInvoices();
    loadProjects();
  }, []);

  async function createInvoice() {
    if (!selectedProjectId) return;
    setCreating(true);

    // Find accepted quote for this project
    const { data: quotes } = await supabase
      .from('quotes')
      .select('id')
      .eq('project_id', selectedProjectId)
      .eq('status', 'accepted')
      .order('version', { ascending: false })
      .limit(1);

    const quoteId = quotes?.[0]?.id || null;

    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: selectedProjectId,
        quote_id: quoteId,
      }),
    });

    if (res.ok) {
      setShowCreateForm(false);
      setSelectedProjectId('');
      await loadInvoices();
    } else {
      const data = await res.json();
      alert(data.error || 'Erreur lors de la création');
    }
    setCreating(false);
  }

  const filtered = invoices.filter(inv => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      inv.invoice_number.toLowerCase().includes(q) ||
      (inv.projects?.client_name || '').toLowerCase().includes(q) ||
      (inv.projects?.reference_code || '').toLowerCase().includes(q)
    );
  });

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager'] as any[]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[#1a1a2e]">Factures</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#64648B]">{filtered.length} facture(s)</span>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#1E2F52] hover:bg-[#2a3f6b] text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Plus size={13} />
              Nouvelle facture
            </button>
          </div>
        </div>

        {/* Create invoice form */}
        {showCreateForm && (
          <Card>
            <CardContent>
              <h3 className="font-semibold text-sm text-[#1a1a2e] mb-3">Créer une facture</h3>
              <div className="flex gap-3">
                <select
                  value={selectedProjectId}
                  onChange={e => setSelectedProjectId(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 border border-[#E8E5E0] rounded-xl text-sm"
                >
                  <option value="">Sélectionner un projet...</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.reference_code} — {p.client_name} ({p.total_amount.toLocaleString('fr-MA')} MAD)
                    </option>
                  ))}
                </select>
                <button
                  onClick={createInvoice}
                  disabled={!selectedProjectId || creating}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#1E2F52] hover:bg-[#2a3f6b] disabled:bg-gray-300 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  {creating ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                  Créer
                </button>
              </div>
              <p className="text-xs text-[#64648B] mt-2">
                La facture sera générée depuis le devis accepté (si existant).
                Les paiements existants seront automatiquement liés.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par n° facture, client ou référence..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white"
          />
        </div>

        {/* Invoice list */}
        {loading ? (
          <div className="text-center py-8 text-sm text-gray-400">Chargement...</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent>
              <div className="text-center py-8">
                <FileText size={32} className="mx-auto text-gray-300 mb-3" />
                <p className="text-sm text-gray-400">Aucune facture trouvée.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map(inv => {
              const total = inv.total_ttc || inv.total_amount;
              const remaining = total - inv.paid_amount;
              const paidPct = total > 0 ? Math.round((inv.paid_amount / total) * 100) : 0;

              return (
                <Card key={inv.id} className="hover:shadow-md transition-shadow">
                  <CardContent>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-sm text-[#1a1a2e]">
                            {inv.invoice_number}
                          </p>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[inv.status] || 'bg-gray-100 text-gray-600'}`}>
                            {STATUS_LABELS[inv.status] || inv.status}
                          </span>
                        </div>
                        <p className="text-xs text-[#64648B]">
                          {inv.projects?.reference_code} — {inv.projects?.client_name}
                        </p>
                        <div className="flex gap-3 mt-2 text-xs text-[#64648B]">
                          <span>Total TTC: <b>{total.toLocaleString('fr-MA')} MAD</b></span>
                          <span>Payé: <b className="text-green-600">{inv.paid_amount.toLocaleString('fr-MA')} MAD</b> ({paidPct}%)</span>
                          {remaining > 0 && (
                            <span>Reste: <b className="text-red-500">{remaining.toLocaleString('fr-MA')} MAD</b></span>
                          )}
                        </div>
                        {inv.due_date && (
                          <p className="text-[10px] text-[#64648B] mt-1">
                            Échéance: {new Date(inv.due_date).toLocaleDateString('fr-FR')}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <a
                          href={`/api/invoices/${inv.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-2 bg-[#1E2F52] hover:bg-[#2a3f6b] text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          <Printer size={13} />
                          PDF
                        </a>
                        <button
                          onClick={() => router.push(`/projects/${inv.project_id}`)}
                          className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors"
                        >
                          <ExternalLink size={13} />
                          Projet
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
