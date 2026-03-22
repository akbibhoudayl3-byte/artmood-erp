'use client';

import { useEffect, useState, useCallback } from 'react';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import StatusBadge from '@/components/ui/StatusBadge';
import FormModal from '@/components/ui/FormModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ErrorBanner from '@/components/ui/ErrorBanner';
import EmptyState from '@/components/ui/EmptyState';
import { useLocale } from '@/lib/hooks/useLocale';
import { useAuth } from '@/lib/hooks/useAuth';
import { useFormModal } from '@/lib/hooks/useFormModal';
import { useConfirmDialog } from '@/lib/hooks/useConfirmDialog';
import type { Expense, ExpenseCategory, PaymentMethod } from '@/types/database';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { Plus, Receipt, TrendingDown, Filter, Pencil, Trash2 } from 'lucide-react';
import { createLedgerEntry } from '@/lib/helpers/ledger';
import {
  loadExpenses as loadExpensesSvc,
  createExpense,
  updateExpense,
  deleteExpense as deleteExpenseSvc,
} from '@/lib/services/expense.service';

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'rent', 'internet', 'phones', 'insurance', 'software', 'subscriptions', 'utilities',
  'fuel', 'transport', 'maintenance', 'tools', 'spare_parts', 'consumables', 'raw_materials',
  'salary', 'bonus', 'tax', 'other',
];

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'cheque', 'bank_transfer', 'card', 'other'];

const INITIAL_FORM = {
  date: new Date().toISOString().split('T')[0],
  category: 'other' as ExpenseCategory,
  amount: '',
  description: '',
  payment_method: 'cash' as PaymentMethod,
  reference_number: '',
  editingId: null as string | null,
};

export default function ExpensesPage() {
  const { t } = useLocale();
  const { profile } = useAuth();

  // Data
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');

  // Banners
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form modal
  const modal = useFormModal(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Confirm dialog
  const confirm = useConfirmDialog();

  // ── Load data ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await loadExpensesSvc();
    if (res.success) {
      setExpenses(res.data || []);
    } else {
      setErrorMsg(res.error || 'Failed to load expenses');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Open edit ──────────────────────────────────────────────────────────
  function openEdit(exp: Expense) {
    modal.openEdit({
      date: exp.date ? exp.date.split('T')[0] : new Date().toISOString().split('T')[0],
      category: exp.category as ExpenseCategory,
      amount: String(exp.amount ?? ''),
      description: exp.description ?? '',
      payment_method: (exp.payment_method as PaymentMethod) ?? 'cash',
      reference_number: exp.reference_number ?? '',
      editingId: exp.id,
    });
    setFormError(null);
  }

  // ── Handle delete ──────────────────────────────────────────────────────
  function handleDeleteClick(exp: Expense) {
    confirm.open({
      title: 'Delete Expense',
      message: 'Are you sure you want to delete this expense? This action cannot be undone.',
      onConfirm: async () => {
        const res = await deleteExpenseSvc(exp.id);
        if (!res.success) {
          setErrorMsg(res.error || 'Failed to delete expense');
          return;
        }
        setSuccessMsg('Expense deleted.');
        setExpenses(prev => prev.filter(e => e.id !== exp.id));
      },
    });
  }

  // ── Handle save (create / update) ──────────────────────────────────────
  async function handleSave() {
    const { date, category, amount, description, payment_method, reference_number, editingId } = modal.formData;

    // Validation
    if (!date) { setFormError('Date is required.'); return; }
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) { setFormError('Amount must be greater than 0.'); return; }

    setSaving(true);
    setFormError(null);

    if (editingId) {
      // UPDATE
      const res = await updateExpense(editingId, {
        date,
        category,
        amount: parsed,
        description: description.trim() || null,
        payment_method,
        reference_number: reference_number.trim() || null,
      });

      if (!res.success) {
        setFormError(res.error || 'Failed to update expense');
        setSaving(false);
        return;
      }

      modal.close();
      setSaving(false);
      setSuccessMsg('Expense updated successfully.');
      fetchData();
      return;
    }

    // CREATE
    const res = await createExpense({
      date,
      category,
      amount: parsed,
      description: description.trim() || undefined,
      payment_method,
      reference_number: reference_number.trim() || undefined,
      created_by: profile?.id,
    });

    if (!res.success) {
      setFormError(res.error || 'Failed to save expense');
      setSaving(false);
      return;
    }

    // Create ledger entry
    await createLedgerEntry({
      date,
      type: 'expense',
      category,
      amount: parsed,
      description: description.trim() || null,
      source_module: 'expenses',
      source_id: res.data?.id,
      payment_method,
      created_by: profile?.id || null,
    });

    modal.close();
    setSaving(false);
    setSuccessMsg('Expense saved successfully.');
    fetchData();
  }

  // ── Derived data ──────────────────────────────────────────────────────
  const filtered =
    filterCategory === 'all'
      ? expenses
      : expenses.filter(e => e.category === filterCategory);

  const totalFiltered = filtered.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  const totalAll = expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <RoleGuard allowedRoles={['ceo', 'hr_manager', 'commercial_manager']}>
      <div className="p-4 space-y-4 max-w-5xl mx-auto">
        {/* Banners */}
        <ErrorBanner message={successMsg} type="success" onDismiss={() => setSuccessMsg(null)} autoDismiss={3000} />
        <ErrorBanner message={errorMsg} type="error" onDismiss={() => setErrorMsg(null)} />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-red-500" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Expenses</h1>
          </div>
          <Button onClick={() => { modal.openCreate({ date: new Date().toISOString().split('T')[0] }); setFormError(null); }} size="sm" className="flex items-center gap-1">
            <Plus className="w-4 h-4" />
            Add Expense
          </Button>
        </div>

        {/* Summary cards */}
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

        {/* Category filter pills */}
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

        {/* Desktop table */}
        <div className="hidden md:block">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {loading ? (
                <div className="p-8 text-center text-gray-400">Loading...</div>
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={<Receipt className="w-8 h-8 opacity-30" />}
                  title="No expenses found"
                />
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
                          {exp.date ? new Date(exp.date).toLocaleDateString('fr-MA') : '\u2014'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={exp.category} />
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-xs truncate">
                          {exp.description || '\u2014'}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 capitalize">
                          {exp.payment_method?.replace(/_/g, ' ') || '\u2014'}
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
                              onClick={() => handleDeleteClick(exp)}
                              title="Delete"
                              className="p-1.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
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

        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {loading ? (
            <div className="text-center text-gray-400 py-8">Loading...</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Receipt className="w-8 h-8 opacity-30" />}
              title="No expenses found"
            />
          ) : (
            filtered.map(exp => (
              <Card key={exp.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={exp.category} />
                        <span className="text-xs text-gray-400">
                          {exp.date ? new Date(exp.date).toLocaleDateString('fr-MA') : '\u2014'}
                        </span>
                      </div>
                      {exp.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 truncate">
                          {exp.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 capitalize mt-0.5">
                        {exp.payment_method?.replace(/_/g, ' ') || '\u2014'}
                        {exp.reference_number ? ` \u00b7 ${exp.reference_number}` : ''}
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
                          onClick={() => handleDeleteClick(exp)}
                          title="Delete"
                          className="p-1.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
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

      {/* Form Modal (Add / Edit) */}
      <FormModal
        isOpen={modal.isOpen}
        onClose={() => { modal.close(); setFormError(null); }}
        title={modal.mode === 'edit' ? 'Edit Expense' : 'Add Expense'}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { modal.close(); setFormError(null); }} className="flex-1" disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="flex-1" disabled={saving} loading={saving}>
              {modal.mode === 'edit' ? 'Update' : 'Save'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <ErrorBanner message={formError} type="error" onDismiss={() => setFormError(null)} />

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Date <span className="text-red-500">*</span>
            </label>
            <Input
              type="date"
              value={modal.formData.date}
              onChange={e => modal.setField('date', e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Category
            </label>
            <select
              value={modal.formData.category}
              onChange={e => modal.setField('category', e.target.value as ExpenseCategory)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {EXPENSE_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>
                  {cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Amount (MAD) <span className="text-red-500">*</span>
            </label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={modal.formData.amount}
              onChange={e => modal.setField('amount', e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Description
            </label>
            <Input
              type="text"
              placeholder="Optional description"
              value={modal.formData.description}
              onChange={e => modal.setField('description', e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Payment Method
            </label>
            <select
              value={modal.formData.payment_method}
              onChange={e => modal.setField('payment_method', e.target.value as PaymentMethod)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PAYMENT_METHODS.map(m => (
                <option key={m} value={m}>
                  {m.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Reference Number
            </label>
            <Input
              type="text"
              placeholder="Cheque no., invoice ref..."
              value={modal.formData.reference_number}
              onChange={e => modal.setField('reference_number', e.target.value)}
              className="w-full"
            />
          </div>
        </div>
      </FormModal>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={confirm.isOpen}
        onClose={confirm.close}
        onConfirm={confirm.confirm}
        title={confirm.title}
        message={confirm.message}
        variant="danger"
        loading={confirm.loading}
      />
    </RoleGuard>
  );
}
