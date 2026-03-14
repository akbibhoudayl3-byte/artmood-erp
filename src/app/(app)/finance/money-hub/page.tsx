'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Textarea, Select } from '@/components/ui/Input';
import Card, { CardContent } from '@/components/ui/Card';
import { EXPENSE_CATEGORIES } from '@/lib/constants';
import PhotoUpload from '@/components/ui/PhotoUpload';
import { useLocale } from '@/lib/hooks/useLocale';
import { ArrowDownCircle, ArrowUpCircle, Clock, Check } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';

type Tab = 'expense' | 'payment' | 'commitment';

export default function MoneyHubPage() {
  const { t } = useLocale();
  const { profile } = useAuth();

  const TABS: { key: Tab; label: string; shortLabel: string; icon: React.ReactNode }[] = [
    { key: 'expense', label: t('moneyhub.add_expense'), shortLabel: t('finance.expenses'), icon: <ArrowUpCircle size={18} /> },
    { key: 'payment', label: t('moneyhub.add_payment'), shortLabel: t('finance.payments'), icon: <ArrowDownCircle size={18} /> },
    { key: 'commitment', label: 'Future Commitment', shortLabel: 'Commit', icon: <Clock size={18} /> },
  ];
  const router = useRouter();
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<Tab>('expense');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [expense, setExpense] = useState({
    amount: '', category: 'other', payment_method: 'cash', date: new Date().toISOString().split('T')[0],
    description: '', project_id: '', receipt_url: '',
  });

  const [payment, setPayment] = useState({
    amount: '', project_id: '', payment_type: 'deposit', payment_method: 'cash', notes: '',
  });

  const [commitment, setCommitment] = useState({
    title: '', amount: '', due_date: '', description: '',
  });

  const [projects, setProjects] = useState<{ id: string; client_name: string; reference_code: string }[]>([]);

  // Load projects for dropdown
  useEffect(() => {
    supabase.from('projects')
      .select('id, client_name, reference_code')
      .in('status', ['measurements', 'design', 'client_validation', 'production', 'installation'])
      .order('created_at', { ascending: false })
      .then(({ data }) => setProjects(data || []));
  }, []);

  const allCategories = EXPENSE_CATEGORIES.flatMap(g => g.items.map(i => ({ value: i.key, label: i.label })));

  async function submitExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!expense.amount) return;
    setLoading(true);

    const parsedAmount = parseFloat(expense.amount);
    const { data: expData, error: expErr } = await supabase.from('expenses').insert({
      amount: parsedAmount,
      category: expense.category,
      payment_method: expense.payment_method,
      date: expense.date,
      description: expense.description || null,
      project_id: expense.project_id || null,
      receipt_url: expense.receipt_url || null,
      created_by: profile?.id,
    }).select('id').single();

    if (expErr) {
      alert('Error: ' + expErr.message);
      setLoading(false);
      return;
    }

    // Create ledger entry
    await supabase.from('ledger').insert({
      date: expense.date,
      type: 'expense',
      category: expense.category,
      amount: parsedAmount,
      description: expense.description || null,
      source_module: 'money-hub',
      source_id: expData?.id,
      payment_method: expense.payment_method,
      created_by: profile?.id,
    });

    setLoading(false);
    showSuccess();
    setExpense({ amount: '', category: 'other', payment_method: 'cash', date: new Date().toISOString().split('T')[0], description: '', project_id: '', receipt_url: '' });
  }

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payment.project_id || !payment.amount) return;
    setLoading(true);

    const parsedAmount = parseFloat(payment.amount);
    const { data: paymentData, error: payErr } = await supabase.from('payments').insert({
      amount: parsedAmount,
      project_id: payment.project_id,
      payment_type: payment.payment_type,
      payment_method: payment.payment_method,
      notes: payment.notes || null,
      received_by: profile?.id,
    }).select('id').single();

    if (payErr) {
      alert('Error: ' + payErr.message);
      setLoading(false);
      return;
    }

    // Update project paid_amount
    const { data: project } = await supabase
      .from('projects')
      .select('paid_amount, total_amount')
      .eq('id', payment.project_id)
      .single();

    if (project) {
      const newPaid = (project.paid_amount || 0) + parsedAmount;
      const pct = project.total_amount > 0 ? newPaid / project.total_amount : 0;
      await supabase.from('projects').update({
        paid_amount: newPaid,
        deposit_paid: pct >= 0.5,
        pre_install_paid: pct >= 0.9,
        final_paid: pct >= 1.0,
        updated_at: new Date().toISOString(),
      }).eq('id', payment.project_id);
    }

    // Create ledger entry
    await supabase.from('ledger').insert({
      date: new Date().toISOString(),
      type: 'income',
      category: payment.payment_type,
      amount: parsedAmount,
      description: payment.notes || 'Payment received',
      project_id: payment.project_id,
      source_module: 'money-hub',
      source_id: paymentData?.id,
      payment_method: payment.payment_method,
      created_by: profile?.id,
    });

    setLoading(false);
    showSuccess();
    setPayment({ amount: '', project_id: '', payment_type: 'deposit', payment_method: 'cash', notes: '' });
  }

  async function submitCommitment(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await supabase.from('calendar_events').insert({
      title: commitment.title,
      description: `${commitment.amount} MAD - ${commitment.description}`,
      event_type: 'payment_due',
      event_date: commitment.due_date,
      created_by: profile?.id,
    });
    setLoading(false);
    showSuccess();
    setCommitment({ title: '', amount: '', due_date: '', description: '' });
  }

  function showSuccess() {
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
  }

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager'] as any[]}>
    <div className="max-w-lg mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">{t('moneyhub.title')}</h1>

      {success && (
        <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-auto bg-emerald-600 text-white px-4 py-3 rounded-xl flex items-center gap-2 shadow-lg z-50 animate-fade-scale">
          <Check size={18} /> Saved successfully
        </div>
      )}

      {/* Tab selector */}
      <div className="flex bg-[#F0EDE8] rounded-xl p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold ${
              activeTab === tab.key
                ? 'bg-white text-[#1B2A4A] shadow-sm'
                : 'text-[#64648B] active:text-[#1a1a2e]'
            }`}
          >
            {tab.icon} <span className="hidden sm:inline">{tab.label}</span><span className="sm:hidden">{tab.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* Quick Expense Tab */}
      {activeTab === 'expense' && (
        <form onSubmit={submitExpense}>
          <Card>
            <CardContent className="space-y-4 py-5">
              <PhotoUpload
                bucket="invoices"
                pathPrefix={`expense-${Date.now()}`}
                onUpload={(data) => setExpense({ ...expense, receipt_url: data.url })}
                existingPhotos={expense.receipt_url ? [{ url: expense.receipt_url }] : []}
                onRemove={() => setExpense({ ...expense, receipt_url: '' })}
                maxPhotos={1}
                label="Scan Invoice / Receipt"
                compact
              />

              <Input label={`${t('finance.amount')} *`} type="number" placeholder="0.00" value={expense.amount}
                onChange={(e) => setExpense({ ...expense, amount: e.target.value })} required />

              <Select label={`${t('finance.category')} *`} value={expense.category}
                onChange={(e) => setExpense({ ...expense, category: e.target.value })} options={allCategories} />

              <Select label={t('finance.payment_method')} value={expense.payment_method}
                onChange={(e) => setExpense({ ...expense, payment_method: e.target.value })}
                options={[
                  { value: 'cash', label: t('finance.cash') },
                  { value: 'cheque', label: t('finance.cheque') },
                  { value: 'bank_transfer', label: t('finance.bank_transfer') },
                  { value: 'card', label: t('finance.card') },
                ]} />

              <Input label={t('common.date')} type="date" value={expense.date}
                onChange={(e) => setExpense({ ...expense, date: e.target.value })} />

              <Textarea label={t('common.description')} placeholder="What was this expense for?" value={expense.description}
                onChange={(e) => setExpense({ ...expense, description: e.target.value })} rows={2} />
            </CardContent>
          </Card>
          <Button type="submit" fullWidth size="lg" loading={loading} className="mt-4">{t('moneyhub.add_expense')}</Button>
        </form>
      )}

      {activeTab === 'payment' && (
        <form onSubmit={submitPayment}>
          <Card>
            <CardContent className="space-y-4 py-5">
              <Input label={`${t('finance.amount')} *`} type="number" placeholder="0.00" value={payment.amount}
                onChange={(e) => setPayment({ ...payment, amount: e.target.value })} required />

              <Select label={`${t('common.project')} *`} value={payment.project_id}
                onChange={(e) => setPayment({ ...payment, project_id: e.target.value })}
                options={[
                  { value: '', label: '-- Select project --' },
                  ...projects.map(p => ({ value: p.id, label: `${p.client_name} · ${p.reference_code}` })),
                ]} />

              <Select label={t('common.type')} value={payment.payment_type}
                onChange={(e) => setPayment({ ...payment, payment_type: e.target.value })}
                options={[
                  { value: 'deposit', label: `${t('finance.deposit')} (50%)` },
                  { value: 'pre_installation', label: 'Pre-Installation (40%)' },
                  { value: 'final', label: 'Final Payment (10%)' },
                  { value: 'other', label: 'Other' },
                ]} />

              <Select label={t('finance.payment_method')} value={payment.payment_method}
                onChange={(e) => setPayment({ ...payment, payment_method: e.target.value })}
                options={[
                  { value: 'cash', label: t('finance.cash') },
                  { value: 'cheque', label: t('finance.cheque') },
                  { value: 'bank_transfer', label: t('finance.bank_transfer') },
                  { value: 'card', label: t('finance.card') },
                ]} />

              <Textarea label={t('common.notes')} placeholder="Optional notes" value={payment.notes}
                onChange={(e) => setPayment({ ...payment, notes: e.target.value })} rows={2} />
            </CardContent>
          </Card>
          <Button type="submit" fullWidth size="lg" loading={loading} variant="success" className="mt-4">{t('moneyhub.add_payment')}</Button>
        </form>
      )}

      {activeTab === 'commitment' && (
        <form onSubmit={submitCommitment}>
          <Card>
            <CardContent className="space-y-4 py-5">
              <Input label="Title *" placeholder="e.g., Supplier payment, Rent" value={commitment.title}
                onChange={(e) => setCommitment({ ...commitment, title: e.target.value })} required />

              <Input label={`${t('finance.amount')} *`} type="number" placeholder="0.00" value={commitment.amount}
                onChange={(e) => setCommitment({ ...commitment, amount: e.target.value })} required />

              <Input label={`${t('cheques.due_date')} *`} type="date" value={commitment.due_date}
                onChange={(e) => setCommitment({ ...commitment, due_date: e.target.value })} required />

              <Textarea label={t('common.description')} placeholder="Details about this commitment" value={commitment.description}
                onChange={(e) => setCommitment({ ...commitment, description: e.target.value })} rows={2} />
            </CardContent>
          </Card>
          <Button type="submit" fullWidth size="lg" loading={loading} className="mt-4">{t('common.save')}</Button>
        </form>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-2.5 pt-2">
        <button onClick={() => router.push('/finance/expenses')} className="p-3.5 bg-white border border-[#E8E5E0] rounded-xl text-sm font-medium text-[#1a1a2e] active:bg-[#F5F3F0]">
          {t('finance.expenses')}
        </button>
        <button onClick={() => router.push('/finance/cheques')} className="p-3.5 bg-white border border-[#E8E5E0] rounded-xl text-sm font-medium text-[#1a1a2e] active:bg-[#F5F3F0]">
          {t('cheques.title')}
        </button>
        <button onClick={() => router.push('/finance/ledger')} className="p-3.5 bg-white border border-[#E8E5E0] rounded-xl text-sm font-medium text-[#1a1a2e] active:bg-[#F5F3F0]">
          {t('finance.ledger')}
        </button>
        <button onClick={() => router.push('/finance/cashflow')} className="p-3.5 bg-white border border-[#E8E5E0] rounded-xl text-sm font-medium text-[#1a1a2e] active:bg-[#F5F3F0]">
          {t('finance.cashflow')}
        </button>
      </div>
    </div>
      </RoleGuard>
  );
}
