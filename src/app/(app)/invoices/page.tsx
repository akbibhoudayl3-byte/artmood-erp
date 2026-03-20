'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { RoleGuard } from '@/components/auth/RoleGuard';
import Card, { CardContent } from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import { FileText, ExternalLink, Printer, Search } from 'lucide-react';

interface InvoiceProject {
  id: string;
  reference_code: string;
  client_name: string;
  client_phone: string | null;
  status: string;
  total_amount: number;
  paid_amount: number;
  deposit_paid: boolean;
  final_paid: boolean;
  created_at: string;
}

export default function InvoicesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [projects, setProjects] = useState<InvoiceProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('projects')
        .select('id, reference_code, client_name, client_phone, status, total_amount, paid_amount, deposit_paid, final_paid, created_at')
        .in('status', ['production', 'installation', 'delivered'])
        .gt('total_amount', 0)
        .order('created_at', { ascending: false });
      setProjects((data as InvoiceProject[]) || []);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = projects.filter(p => {
    const q = search.toLowerCase();
    return !q || p.client_name.toLowerCase().includes(q) || (p.reference_code || '').toLowerCase().includes(q);
  });

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager'] as any[]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[#1a1a2e]">Factures</h1>
          <span className="text-sm text-[#64648B]">{filtered.length} projet(s)</span>
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par client ou référence..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white"
          />
        </div>

        {loading ? (
          <div className="text-center py-8 text-sm text-gray-400">Chargement...</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent>
              <div className="text-center py-8">
                <FileText size={32} className="mx-auto text-gray-300 mb-3" />
                <p className="text-sm text-gray-400">Aucun projet facturable trouvé.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map(project => {
              const remaining = project.total_amount - project.paid_amount;
              const paidPct = project.total_amount > 0 ? Math.round((project.paid_amount / project.total_amount) * 100) : 0;

              return (
                <Card key={project.id} className="hover:shadow-md transition-shadow">
                  <CardContent>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-sm text-[#1a1a2e] truncate">
                            {project.reference_code}
                          </p>
                          <StatusBadge status={project.status} />
                        </div>
                        <p className="text-xs text-[#64648B]">{project.client_name}</p>
                        <div className="flex gap-3 mt-2 text-xs text-[#64648B]">
                          <span>Total: <b>{project.total_amount.toLocaleString('fr-MA')} MAD</b></span>
                          <span>Payé: <b className="text-green-600">{project.paid_amount.toLocaleString('fr-MA')} MAD</b> ({paidPct}%)</span>
                          {remaining > 0 && (
                            <span>Reste: <b className="text-red-500">{remaining.toLocaleString('fr-MA')} MAD</b></span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <a
                          href={`/api/print/invoice?project_id=${project.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-2 bg-[#1E2F52] hover:bg-[#2a3f6b] text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          <Printer size={13} />
                          Facture
                        </a>
                        <button
                          onClick={() => router.push(`/projects/${project.id}`)}
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
