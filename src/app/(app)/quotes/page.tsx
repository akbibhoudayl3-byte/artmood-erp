'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLocale } from '@/lib/hooks/useLocale';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { Plus, Search, FileText, Calendar, CheckCircle2, XCircle, Clock, Send } from 'lucide-react';

interface Quote {
  id: string;
  version: number;
  status: string;
  total_amount: number;
  discount_percent: number;
  valid_until: string | null;
  sent_at: string | null;
  created_at: string;
  project?: { client_name: string; reference_code: string } | null;
  creator?: { full_name: string } | null;
}

const STATUS_TABS = ['all', 'draft', 'sent', 'accepted', 'rejected'] as const;

const STATUS_ICONS: Record<string, React.ReactNode> = {
  draft: <Clock size={14} />,
  sent: <Send size={14} />,
  accepted: <CheckCircle2 size={14} />,
  rejected: <XCircle size={14} />,
};

export default function QuotesPage() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const supabase = createClient();

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => { loadQuotes(); }, []);

  async function loadQuotes() {
    const { data } = await supabase
      .from('quotes')
      .select('*, project:projects(client_name, reference_code), creator:profiles!quotes_created_by_fkey(full_name)')
      .order('created_at', { ascending: false });
    setQuotes((data as Quote[]) || []);
    setLoading(false);
  }

  const filtered = quotes.filter(q => {
    const matchSearch = !search ||
      q.project?.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      q.project?.reference_code?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || q.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const counts = STATUS_TABS.reduce((acc, s) => {
    acc[s] = s === 'all' ? quotes.length : quotes.filter(q => q.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  const fmt = (n: number) =>
    new Intl.NumberFormat(locale === 'ar' || locale === 'darija' ? 'ar-MA' : locale === 'fr' ? 'fr-MA' : 'en-MA', {
      style: 'currency', currency: 'MAD', minimumFractionDigits: 0,
    }).format(n);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-24 skeleton rounded-xl" />)}
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer'] as any[]}>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">{t('quotes.title')}</h1>
            <p className="text-sm text-[#64648B] mt-0.5">{quotes.length} {t('common.total') || 'total'}</p>
          </div>
          <Button onClick={() => router.push('/quotes/new')}>
            <Plus size={18} /> {t('quotes.new_quote')}
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64648B]" />
          <input
            type="text"
            placeholder={`${t('common.search') || 'Search'}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20 focus:border-[#C9956B] placeholder:text-gray-400"
          />
        </div>

        {/* Status tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {STATUS_TABS.map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                filterStatus === s
                  ? 'bg-[#1a1a2e] text-white shadow-sm'
                  : 'bg-white border border-[#E8E5E0] text-[#64648B] hover:border-[#C9956B]/40'
              }`}
            >
              {STATUS_ICONS[s]}
              {s === 'all' ? (t('common.all') || 'All') : t(`quotes.${s}`) || s}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                filterStatus === s ? 'bg-white/20' : 'bg-[#F5F3F0]'
              }`}>{counts[s]}</span>
            </button>
          ))}
        </div>

        {/* Quote list */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-[#64648B]">
            <FileText size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">{t('common.no_results') || 'No quotes found'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(q => (
              <Card
                key={q.id}
                className="cursor-pointer hover:shadow-md transition-all border border-[#E8E5E0] hover:border-[#C9956B]/30"
                onClick={() => router.push(`/quotes/${q.id}`)}
              >
                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-[#1a1a2e] truncate">
                        {q.project?.client_name || '—'}
                      </span>
                      <span className="text-xs text-[#9CA3AF] shrink-0">
                        {q.project?.reference_code || ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#64648B]">
                      <span>v{q.version}</span>
                      {q.valid_until && (
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          {new Date(q.valid_until).toLocaleDateString()}
                        </span>
                      )}
                      {q.creator?.full_name && (
                        <span className="truncate">{q.creator.full_name}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <StatusBadge status={q.status} />
                    <span className="text-base font-bold text-[#1a1a2e]">{fmt(q.total_amount)}</span>
                    {q.discount_percent > 0 && (
                      <span className="text-xs text-[#C9956B]">-{q.discount_percent}%</span>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
