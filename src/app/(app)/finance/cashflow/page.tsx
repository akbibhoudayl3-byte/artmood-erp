'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import type { MonthlyCashflow } from '@/types/database';
import { useLocale } from '@/lib/hooks/useLocale';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';

export default function CashflowPage() {
  const { t } = useLocale();
  const supabase = createClient();
  const [data, setData] = useState<MonthlyCashflow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadCashflow(); }, []);

  async function loadCashflow() {
    const { data: rows } = await supabase.from('v_monthly_cashflow').select('*').limit(12);
    setData(rows || []);
    setLoading(false);
  }

  const currentMonth = data[0];

  if (loading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 skeleton" />)}</div>;

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager'] as any[]}>
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">{t('finance.cashflow')}</h1>

      {/* Summary cards - stack on smallest mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3 sm:flex-col sm:items-start">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={18} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-[#64648B] font-medium">{t('finance.revenue')}</p>
              <p className="text-xl font-bold text-emerald-600">
                {(currentMonth?.total_income || 0).toLocaleString()} MAD
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3 sm:flex-col sm:items-start">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
              <TrendingDown size={18} className="text-red-500" />
            </div>
            <div>
              <p className="text-xs text-[#64648B] font-medium">{t('finance.expenses')}</p>
              <p className="text-xl font-bold text-red-600">
                {(currentMonth?.total_expenses || 0).toLocaleString()} MAD
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3 sm:flex-col sm:items-start">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <DollarSign size={18} className="text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-[#64648B] font-medium">Net</p>
              <p className={`text-xl font-bold ${(currentMonth?.net_cashflow || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {(currentMonth?.net_cashflow || 0).toLocaleString()} MAD
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Monthly Breakdown */}
      <Card className="p-4 sm:p-5">
        <h2 className="font-semibold text-[#1a1a2e] mb-4">Monthly Breakdown</h2>
        <div className="space-y-4">
          {data.map((month) => {
            const maxVal = Math.max(...data.map(d => Math.max(d.total_income, d.total_expenses))) || 1;
            return (
              <div key={month.month}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-medium text-[#1a1a2e]">
                    {new Date(month.month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </p>
                  <p className={`text-sm font-bold ${month.net_cashflow >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {month.net_cashflow >= 0 ? '+' : ''}{month.net_cashflow.toLocaleString()} MAD
                  </p>
                </div>
                <div className="flex gap-1 h-5 rounded-lg overflow-hidden">
                  <div
                    className="bg-emerald-400 rounded-l-lg"
                    style={{ width: `${(month.total_income / maxVal) * 50}%` }}
                  />
                  <div
                    className="bg-red-400 rounded-r-lg"
                    style={{ width: `${(month.total_expenses / maxVal) * 50}%` }}
                  />
                </div>
                {/* Show amounts on mobile */}
                <div className="flex justify-between text-[11px] text-[#64648B] mt-1 sm:hidden">
                  <span>+{month.total_income.toLocaleString()}</span>
                  <span>-{month.total_expenses.toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-4 text-xs text-[#64648B]">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-emerald-400 rounded" /> {t('finance.revenue')}</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-red-400 rounded" /> {t('finance.expenses')}</span>
        </div>
      </Card>
    </div>
      </RoleGuard>
  );
}
