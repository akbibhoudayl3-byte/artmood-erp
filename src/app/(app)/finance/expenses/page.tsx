'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import StatusBadge from '@/components/ui/StatusBadge';
import { useLocale } from '@/lib/hooks/useLocale';
import { useAuth } from '@/lib/hooks/useAuth';
import type { Expense, ExpenseCategory, PaymentMethod } from '@/types/database';
import { RoleGuard } from '@/components/auth/RoleGuard';
import {
  Plus, X, Receipt, TrendingDown, Filter,
  Pencil, Trash2, CheckCircle, AlertCircle,
} from 'lucide-react';
import { createLedgerEntry } from '@/lib/helpers/ledger';

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'rent', 'internet', 'phones', 'insurance', 'software', 'subscriptions', 'utilities',
  'fuel', 'transport', 'maintenance', 'tools', 'spare_parts', 'consumables', 'raw_materials',
  'salary', 'bonus', 'tax', 'other',
];

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'cheque', 'bank_transfer', 'card', 'other'];

// ─── Toast Component ────────────────────────────────────────────────────────

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}

function Toast({ message, type, onClose }: ToastProps) {
  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all duration-300 ${
        type === 'success' ? 'bg-green-600' : 'bg-red-600'
      }`}
    >
      {type === 'success' ? (
        <CheckCircle className="w-4 h-4 shrink-0" />
      ) : (
        <AlertCircle className="w-4 h-4 shrink-0" />
      )}
      <span>{message}</span>
      <button onClick={onClose} className="ml-2 hover:opacity-75">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const { t } = useLocale();
  const { profile } = useAuth();
  const supabase = createClient();

  // List state
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');

  // Modal / form state
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form fields
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [referenceNumber, setReferenceNumber] = useState('');

  // Feedback state
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false })
      .limit(200);
    setExpenses(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  // ── Toast helpers ─────────────────────────────────────────────────────────

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setToastType('success');
    setTimeout(() => setSuccessMsg(''), 2000);
  }

  function showError(msg: string) {
    setSuccessMsg(msg);
    setToastType('error');
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  // ── Form helpers ──────────────────────────────────────────────────────────

  function resetForm() {
    setDate(new Date().toISOString().split('T')[0]);
    setCategory('other');
    setAmount('');
    setDescription('');
    setPaymentMethod('cash');
    setReferenceNumber('');
    setFormError('');
  }

  function openAdd() {
    setEditingExpense(null);
    resetForm();
    setShowForm(true);
  }

  function openEdit(exp: Expense) {
    setEditingExpense(exp);
    setDate(exp.date ? exp.date.split('T')[0] : new Date().toISOString().split('T')[0]);
    setCategory(exp.category as ExpenseCategory);
    setAmount(String(exp.amount ?? ''));
    setDescription(exp.description ?? '');
    setPaymentMethod((exp.payment_method as PaymentMethod) ?? 'cash');
    setReferenceNumber(exp.reference_number ?? '');
    setFormError('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingExpense(null);
    resetForm();
  }

  // ── Validation ────────────────────────────────────────────────────────────

  function validate(): boolean {
    if (!date) {
      setFormError('Date is required.');
      return false;
    }
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setFormError('Amount must be greater than 0.');
      return false;
    }
    setFormError('');
    return true;
  }

  // ── Save (insert or update) ───────────────────────────────────────────────

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setFormError('');

    const payload = {
      date,
      category,
      amount: parseFloat(amount),
      description: description.trim() || null,
      payment_method: paymentMethod,
      reference_number: referenceNumber.trim() || null,
    };

    if (editingExpense) {
      // UPDATE
      const { error } = await supabase
        .from('expenses')
        .update(payload)
        .eq('id', editingExpense.id);

      if (error) {
        setFormError(error.message || 'Failed to update expense.');
        setSaving(false);
        return;
      }
      showSuccess('Expense updated successfully.');
    } else {
      // INSERT
      const { data: newExpense, error } = await supabase.from('expenses').insert({
        ...payload,
        created_by: profile?.id,
        is_recurring: false,
      }).select('id').single();

      if (error) {
        setFormError(error.message || 'Failed to save expense.');
        setSaving(false);
        return;
      }

      // Create ledger entry
      await createLedgerEntry({
        date: payload.date,
        type: 'expense',
        category: payload.category,
        amount: payload.amount,
        description: payload.description,
        source_module: 'expenses',
        source_id: newExpense?.id,
        payment_method: payload.payment_method,
        created_by: profile?.id || null,
      });

      showSuccess('Expense saved successfully.');
    }

    closeForm();
    setSaving(false);
    loadExpenses();
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    const confirmed = window.confirm('Are you sure you want to delete this expense? This action cannot be undone.');
    if (!confirmed) return;

    setDeleting(id);
    const { error } = await supabase.from('expenses').delete().eq('id', id);

    if (error) {
      showError(error.message || 'Failed to delete expense.');
    } else {
      showSuccess('Expense deleted.');
      setExpenses(prev => prev.filter(e => e.id !== id));
    }
    setDeleting(null);
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const filtered =
    filterCategory === 'all'
      ? expenses
      : expenses.filter(e => e.category === filterCategory);

  const totalFiltered = filtered.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  const totalAll = expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <RoleGuard allowedRoles={['ceo', 'hr_manager', 'commercial_manager']}>
      {/* Toast notification */}
      {successMsg && (
        <Toast
          message={successMsg}
          type={toastType}
          onClose={() => setSuccessMsg('')}
        />
      )}

      <div className="p-4 space-y-4 max-w-5xl mx-auto">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-red-500" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Expenses</h1>
          </div>
          <Button onClick={openAdd} size="sm" className="flex items-center gap-1">
            <Plus className="w-4 h-4" />
            Add Expense
          </Button>
        </div>

        {/* ── Summary card ── */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Total (all)</p>
              <p className="text-lg font-bold text-red-600">
                {totalAll.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">
                {filterCategory === 'all' ? 'Showing all' : filterCategory}
              </p>
              <p className="text-lg font-bold text-gray-800 dark:text-gray-200">
                {totalFiltered.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Category filter pills ── */}
        <div className="flex gap-2 flex-wrap items-center">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          <button
            onClick={() => setFilterCategory('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filterCategory === 'all'
                ? 'bg-gray-800 text-white dark:bg-white dark:text-gray-900'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
            }`}
          >
            All
          </button>
          {EXPENSE_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                filterCategory === cat
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
              }`}
            >
              {cat.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {/* ── Desktop table ── */}
        <div className="hidden md:block">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {loading ? (
                <div className="p-8 text-center text-gray-400">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-gray-400 flex flex-col items-center gap-2">
                  <Receipt className="w-8 h-8 opacity-30" />
                  <span>No expenses found</span>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Category</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Description</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Method</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">Amount</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {filtered.map(exp => (
                      <tr
                        key={exp.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                      >
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {exp.date ? new Date(exp.date).toLocaleDateString('fr-MA') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={exp.category} />
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-xs truncate">
                          {exp.description || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 capitalize">
                          {exp.payment_method?.replace(/_/g, ' ') || '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-red-600 whitespace-nowrap">
                          {(exp.amount ?? 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} MAD
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => openEdit(exp)}
                              title="Edit"
                              className="p-1.5 rounded text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(exp.id)}
                              disabled={deleting === exp.id}
                              title="Delete"
                              className="p-1.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-40"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Mobile cards ── */}
        <div className="md:hidden space-y-2">
          {loading ? (
            <div className="text-center text-gray-400 py-8">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-gray-400 py-8 flex flex-col items-center gap-2">
              <Receipt className="w-8 h-8 opacity-30" />
              <span>No expenses found</span>
            </div>
          ) : (
            filtered.map(exp => (
              <Card key={exp.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={exp.category} />
                        <span className="text-xs text-gray-400">
                          {exp.date ? new Date(exp.date).toLocaleDateString('fr-MA') : '—'}
                        </span>
                      </div>
                      {exp.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 truncate">
                          {exp.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 capitalize mt-0.5">
                        {exp.payment_method?.replace(/_/g, ' ') || '—'}
                        {exp.reference_number ? ` · ${exp.reference_number}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="font-bold text-red-600 text-sm">
                        {(exp.amount ?? 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(exp)}
                          title="Edit"
                          className="p-1.5 rounded text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(exp.id)}
                          disabled={deleting === exp.id}
                          title="Delete"
                          className="p-1.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* ── Add / Edit Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {editingExpense ? 'Edit Expense' : 'Add Expense'}
              </h2>
              <button
                onClick={closeForm}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form error banner */}
            {formError && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 mb-4 text-sm text-red-700 dark:text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Form fields */}
            <div className="space-y-3">
              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Date <span className="text-red-500">*</span>
                </label>
                <Input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as ExpenseCategory)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {EXPENSE_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>
                      {cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Amount (MAD) <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Description
                </label>
                <Input
                  type="text"
                  placeholder="Optional description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full"
                />
              </div>

              {/* Payment method */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {PAYMENT_METHODS.map(m => (
                    <option key={m} value={m}>
                      {m.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reference number */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Reference Number
                </label>
                <Input
                  type="text"
                  placeholder="Cheque no., invoice ref…"
                  value={referenceNumber}
                  onChange={e => setReferenceNumber(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-5">
              <Button
                variant="secondary"
                onClick={closeForm}
                className="flex-1"
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                className="flex-1"
                disabled={saving}
              >
                {saving ? 'Saving…' : editingExpense ? 'Update' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </RoleGuard>
  );
}
