'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { useLocale } from '@/lib/hooks/useLocale';
import { Lock, Unlock, Calendar, DollarSign, ArrowDown, ArrowUp } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';

interface DailyClose {
  id: string;
  date: string;
  closed_by: string | null;
  is_closed: boolean;
  closed_at: string | null;
  notes: string | null;
}

interface DaySummary {
  income: number;
  expenses: number;
  payments_count: number;
  expenses_count: number;
}

export default function DailyClosePage() {
  const { t } = useLocale();
  const { profile, isCeo, canViewFinance } = useAuth();
  const supabase = createClient();

  const [todayClose, setTodayClose] = useState<DailyClose | null>(null);
  const [recentCloses, setRecentCloses] = useState<DailyClose[]>([]);
  const [summary, setSummary] = useState<DaySummary>({ income: 0, expenses: 0, payments_count: 0, expenses_count: 0 });
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [closeRes, recentRes, incomeRes, expenseRes] = await Promise.all([
      supabase.from('daily_close').select('*').eq('date', today).maybeSingle(),
      supabase.from('daily_close').select('*').order('date', { ascending: false }).limit(14),
      supabase.from('ledger').select('amount').eq('date', today).eq('type', 'income'),
      supabase.from('ledger').select('amount').eq('date', today).eq('type', 'expense'),
    ]);

    setTodayClose(closeRes.data as DailyClose | null);
    setRecentCloses((recentRes.data as DailyClose[]) || []);

    const incomeData = incomeRes.data || [];
    const expenseData = expenseRes.data || [];
    setSummary({
      income: incomeData.reduce((s, r) => s + r.amount, 0),
      expenses: expenseData.reduce((s, r) => s + r.amount, 0),
      payments_count: incomeData.length,
      expenses_count: expenseData.length,
    });

    if (closeRes.data?.notes) setNotes(closeRes.data.notes);
    setLoading(false);
  }

  async function performClose() {
    if (todayClose?.is_closed) return;

    if (todayClose) {
      await supabase.from('daily_close').update({
        is_closed: true,
        closed_by: profile?.id,
        closed_at: new Date().toISOString(),
        notes: notes || null,
      }).eq('id', todayClose.id);
    } else {
      await supabase.from('daily_close').insert({
        date: today,
        is_closed: true,
        closed_by: profile?.id,
        closed_at: new Date().toISOString(),
        notes: notes || null,
      });
    }
    loadData();
  }

  if (!canViewFinance) return <div className="text-center py-12 text-gray-500">Access denied</div>;
  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;

  const net = summary.income - summary.expenses;
  const isClosed = todayClose?.is_closed;

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager'] as any[]}>
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">{t('daily_close.title')}</h1>
        <p className="text-sm text-[#64648B]">{new Date(today).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      {/* Today's Status */}
      <Card className={isClosed ? 'border-green-200 bg-green-50/30' : 'border-orange-200 bg-orange-50/30'}>
        <CardContent>
          <div className="flex items-center gap-3">
            {isClosed ? <Lock size={24} className="text-green-500" /> : <Unlock size={24} className="text-orange-500" />}
            <div>
              <p className="font-semibold text-sm">{isClosed ? 'Day Closed' : 'Day Open'}</p>
              {isClosed && todayClose?.closed_at && (
                <p className="text-xs text-[#64648B]">Closed at {new Date(todayClose.closed_at).toLocaleTimeString('fr-FR')}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Day Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <ArrowDown size={16} className="mx-auto text-green-500 mb-1" />
          <p className="text-lg font-bold text-green-600">{summary.income.toLocaleString()}</p>
          <p className="text-[11px] text-[#64648B]">{t('finance.revenue')} ({summary.payments_count})</p>
        </Card>
        <Card className="p-3 text-center">
          <ArrowUp size={16} className="mx-auto text-red-500 mb-1" />
          <p className="text-lg font-bold text-red-600">{summary.expenses.toLocaleString()}</p>
          <p className="text-[11px] text-[#64648B]">{t('finance.expenses')} ({summary.expenses_count})</p>
        </Card>
        <Card className="p-3 text-center">
          <DollarSign size={16} className={`mx-auto ${net >= 0 ? 'text-green-500' : 'text-red-500'} mb-1`} />
          <p className={`text-lg font-bold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>{net.toLocaleString()}</p>
          <p className="text-[11px] text-[#64648B]">Net (MAD)</p>
        </Card>
      </div>

      {/* Close Form */}
      {!isClosed && (isCeo || canViewFinance) && (
        <Card>
          <CardContent>
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">{t('daily_close.close_day')}</h3>
              <Textarea
                label={t('common.notes')}
                placeholder="Any notes about today's finances..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
              <Button fullWidth onClick={performClose}>
                <Lock size={16} /> {t('daily_close.close_day')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Closes */}
      <Card>
        <CardHeader><h2 className="font-semibold text-sm">{t('moneyhub.recent_transactions')}</h2></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recentCloses.map(close => (
              <div key={close.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-[#64648B]" />
                  <span className="text-sm">{new Date(close.date).toLocaleDateString('fr-FR')}</span>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-lg ${close.is_closed ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                  {close.is_closed ? 'Closed' : 'Open'}
                </span>
              </div>
            ))}
            {recentCloses.length === 0 && <p className="text-sm text-[#64648B] text-center py-4">{t('common.no_results')}</p>}
          </div>
        </CardContent>
      </Card>
    </div>
      </RoleGuard>
  );
}
