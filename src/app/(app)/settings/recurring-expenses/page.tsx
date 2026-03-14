'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Select } from '@/components/ui/Input';
import { EXPENSE_CATEGORIES } from '@/lib/constants';
import { ArrowLeft, Plus, X, RotateCcw, Trash2 } from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

interface RecurringExpense {
  id: string;
  category: string;
  amount: number;
  description: string | null;
  payment_method: string | null;
  recurring_day: number | null;
  is_recurring: boolean;
}

export default function RecurringExpensesPage() {
  const { isCeo } = useAuth();
  const { t } = useLocale();
  const router = useRouter();
  const supabase = createClient();
  const [expenses, setExpenses] = useState<RecurringExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [form, setForm] = useState({
    category: 'rent',
    amount: '',
    description: '',
    payment_method: 'bank_transfer',
    recurring_day: '1',
  });

  const allCategories = EXPENSE_CATEGORIES.flatMap(g => g.items.map(i => ({ value: i.key, label: i.label })));

  useEffect(() => { loadExpenses(); }, []);

  async function loadExpenses() {
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('is_recurring', true)
      .order('category');
    setExpenses(data || []);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const profile = (await supabase.auth.getUser()).data.user;

    await supabase.from('expenses').insert({
      category: form.category,
      amount: parseFloat(form.amount),
      description: form.description || null,
      payment_method: form.payment_method,
      recurring_day: parseInt(form.recurring_day),
      is_recurring: true,
      date: new Date().toISOString().split('T')[0],
      created_by: profile?.id,
    });

    setSaving(false);
    setShowForm(false);
    setForm({ category: 'rent', amount: '', description: '', payment_method: 'bank_transfer', recurring_day: '1' });
    loadExpenses();
  }

  async function deleteExpense(id: string) {
    await supabase.from('expenses').delete().eq('id', id);
    loadExpenses();
  }

  async function generateMonthly() {
    setGenerating(true);
    const profile = (await supabase.auth.getUser()).data.user;
    const today = new Date().toISOString().split('T')[0];

    const inserts = expenses.map(exp => ({
      category: exp.category,
      amount: exp.amount,
      description: `[Auto] ${exp.description || exp.category}`,
      payment_method: exp.payment_method,
      is_recurring: false,
      date: today,
      created_by: profile?.id,
    }));

    if (inserts.length > 0) {
      await supabase.from('expenses').insert(inserts);

      // Also log to ledger
      const ledgerInserts = inserts.map(ins => ({
        date: today,
        type: 'expense' as const,
        category: ins.category,
        amount: ins.amount,
        description: ins.description,
        source_module: 'recurring',
        payment_method: ins.payment_method,
        created_by: profile?.id,
      }));
      await supabase.from('ledger').insert(ledgerInserts);
    }

    setGenerating(false);
    alert(`Generated ${inserts.length} expense entries for this month`);
  }

  const totalMonthly = expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker', 'installer', 'hr_manager', 'community_manager'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/settings')} className="p-2 hover:bg-[#F5F3F0] rounded-xl">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight flex-1">{t('recurring.title')}</h1>
        <Button onClick={() => setShowForm(true)} size="sm"><Plus size={16} /> {t('recurring.add')}</Button>
      </div>

      {/* Summary */}
      <Card className="p-4 bg-[#F5F3F0] border-[#E8E5E0]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-[#64648B] font-semibold uppercase">{t('common.total')} {t('recurring.monthly')}</p>
            <p className="text-xl font-bold text-[#1a1a2e]">{totalMonthly.toLocaleString()} MAD</p>
          </div>
          <Button variant="secondary" loading={generating} onClick={generateMonthly} size="sm">
            <RotateCcw size={14} /> Generate This Month
          </Button>
        </div>
      </Card>

      {/* List */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 skeleton" />)}</div>
      ) : expenses.length === 0 ? (
        <div className="text-center py-12 text-[#64648B]">
          <RotateCcw size={32} className="text-[#E8E5E0] mx-auto mb-3" />
          <p>No recurring expenses set up</p>
          <p className="text-xs mt-1">Add recurring items like rent, internet, salaries</p>
        </div>
      ) : (
        <div className="space-y-2">
          {expenses.map(exp => (
            <Card key={exp.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#1a1a2e] capitalize">{exp.category.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-[#64648B]">
                    {exp.description || 'No description'} - Day {exp.recurring_day}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-bold text-[#1a1a2e]">{Number(exp.amount).toLocaleString()} MAD</p>
                  <button onClick={() => deleteExpense(exp.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-[#64648B] hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto animate-fade-scale">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-[#1a1a2e]">{t('recurring.add')}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-[#F5F3F0] rounded-xl">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <Select label="Category *" value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                options={allCategories} />

              <Input label="Amount (MAD) *" type="number" required placeholder="0.00"
                value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />

              <Input label="Description" placeholder="e.g., Office rent"
                value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />

              <Select label="Payment Method" value={form.payment_method}
                onChange={e => setForm({ ...form, payment_method: e.target.value })}
                options={[
                  { value: 'cash', label: 'Cash' },
                  { value: 'bank_transfer', label: 'Bank Transfer' },
                  { value: 'cheque', label: 'Cheque' },
                  { value: 'card', label: 'Card' },
                ]} />

              <Input label="Day of Month" type="number" min="1" max="28" placeholder="1"
                value={form.recurring_day} onChange={e => setForm({ ...form, recurring_day: e.target.value })} />

              <Button type="submit" fullWidth loading={saving} size="lg" className="mt-2">{t('common.save')}</Button>
            </form>
          </div>
        </div>
      )}
    </div>
      </RoleGuard>
  );
}
