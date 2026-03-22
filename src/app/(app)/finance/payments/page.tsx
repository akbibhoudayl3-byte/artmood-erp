'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import StatusBadge from '@/components/ui/StatusBadge';
import { useLocale } from '@/lib/hooks/useLocale';
import { useAuth } from '@/lib/hooks/useAuth';
import type { PaymentType, PaymentMethod } from '@/types/database';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { Plus, X, Banknote, TrendingUp, AlertCircle, CheckCircle, Pencil, Trash2 } from 'lucide-react';

const PAYMENT_TYPES: PaymentType[] = ['deposit', 'pre_installation', 'final', 'other'];
const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'cheque', 'bank_transfer', 'card', 'other'];

interface PaymentWithProject {
  id: string;
  project_id: string;
  amount: number;
  payment_type: PaymentType;
  payment_method: PaymentMethod | null;
  reference_number: string | null;
  notes: string | null;
  received_by: string | null;
  received_at: string;
  created_at: string;
  project?: { client_name: string; reference_code: string } | null;
}

export default function PaymentsPage() {
  const { t } = useLocale();
  const { profile } = useAuth();
  const supabase = createClient();
  const [payments, setPayments] = useState<PaymentWithProject[]>([]);
  const [projects, setProjects] = useState<{ id: string; client_name: string; reference_code: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loadError, setLoadError] = useState('');

  const [editingPayment, setEditingPayment] = useState<PaymentWithProject | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  const [projectId, setProjectId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('deposit');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().split('T')[0]);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadPayments();
    loadProjects();
  }, []);

  async function loadPayments() {
    try {
      const res = await fetch('/api/payments');
      if (res.ok) {
        const data = await res.json();
        setPayments((data.payments as PaymentWithProject[]) || []);
      } else {
        const err = await res.json();
        setLoadError('Failed to load payments: ' + (err.error || 'Unknown error'));
      }
    } catch (e: any) {
      setLoadError('Failed to load payments: ' + e.message);
    }
    setLoading(false);
  }

  async function loadProjects() {
    const { data } = await supabase
      .from('projects')
      .select('id, client_name, reference_code')
      .in('status', ['measurements_confirmed', 'design_validated', 'bom_generated', 'ready_for_production', 'in_production', 'installation'])
      .order('created_at', { ascending: false });
    setProjects(data || []);
  }

  function resetForm() {
    setAmount('');
    setProjectId('');
    setReferenceNumber('');
    setNotes('');
    setPaymentType('deposit');
    setPaymentMethod('cash');
    setReceivedAt(new Date().toISOString().split('T')[0]);
    setFormError('');
    setShowForm(false);
    setEditingPayment(null);
  }

  function openEdit(p: PaymentWithProject) {
    setEditingPayment(p);
    setProjectId(p.project_id);
    setAmount(String(p.amount));
    setPaymentType(p.payment_type);
    setPaymentMethod(p.payment_method || 'cash');
    setReceivedAt(p.received_at ? p.received_at.split('T')[0] : new Date().toISOString().split('T')[0]);
    setReferenceNumber(p.reference_number || '');
    setNotes(p.notes || '');
    setFormError('');
    setShowForm(true);
  }

  async function handleDelete(paymentId: string) {
    if (!window.confirm('Delete this payment? This will also update the project total.')) return;
    setDeleting(paymentId);

    try {
      const res = await fetch(`/api/payments/${paymentId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        setSuccessMsg('');
        setLoadError('Failed to delete: ' + (err.error || 'Unknown error'));
        setDeleting(null);
        return;
      }
    } catch (e: any) {
      setLoadError('Failed to delete: ' + e.message);
      setDeleting(null);
      return;
    }

    setDeleting(null);
    setSuccessMsg('Payment deleted.');
    setTimeout(() => setSuccessMsg(''), 3000);
    loadPayments();
  }

  async function handleSave() {
    // Validation
    if (!projectId) {
      setFormError('Please select a project.');
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError('Amount must be greater than zero.');
      return;
    }
    if (!receivedAt) {
      setFormError('Payment date is required.');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      if (editingPayment) {
        // UPDATE via API
        const res = await fetch(`/api/payments/${editingPayment.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId,
            amount: parsedAmount,
            payment_type: paymentType,
            payment_method: paymentMethod,
            received_at: new Date(receivedAt).toISOString(),
            reference_number: referenceNumber || null,
            notes: notes || null,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          setFormError('Failed to update: ' + (err.error || 'Unknown error'));
          setSaving(false);
          return;
        }

        setEditingPayment(null);
        resetForm();
        setSaving(false);
        setSuccessMsg('Payment updated successfully.');
        setTimeout(() => setSuccessMsg(''), 4000);
        loadPayments();
        return;
      }

      // INSERT via API
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          amount: parsedAmount,
          payment_type: paymentType,
          payment_method: paymentMethod,
          received_at: new Date(receivedAt).toISOString(),
          reference_number: referenceNumber || null,
          notes: notes || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setFormError('Failed to record payment: ' + (err.error || 'Unknown error'));
        setSaving(false);
        return;
      }

      setEditingPayment(null);
      resetForm();
      setSaving(false);
      setSuccessMsg('Payment recorded successfully.');
      setTimeout(() => setSuccessMsg(''), 4000);
      loadPayments();
    } catch (e: any) {
      setFormError('Error: ' + e.message);
      setSaving(false);
    }
  }

  const now = new Date();
  const totalThisMonth = payments
    .filter(p => {
      const d = new Date(p.received_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, p) => s + Number(p.amount), 0);

  const fmtAmount = (n: number) =>
    new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD', minimumFractionDigits: 0 }).format(n);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />)}
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager'] as any[]}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">{t('finance.payments')}</h1>
            <p className="text-sm text-[#64648B]">
              {t('finance.this_month') || 'This month'}:{' '}
              <span className="font-semibold text-emerald-600">{fmtAmount(totalThisMonth)}</span>
            </p>
          </div>
          <Button onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus size={18} /> {t('finance.add_payment') || 'Add Payment'}
          </Button>
        </div>

        {/* Global banners */}
        {successMsg && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm">
            <CheckCircle size={16} /> {successMsg}
          </div>
        )}
        {loadError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            <AlertCircle size={16} /> {loadError}
            <button onClick={() => setLoadError('')} className="ml-auto"><X size={14} /></button>
          </div>
        )}

        {/* Summary */}
        <Card className="bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-100">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
              <TrendingUp size={20} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-emerald-600 font-medium uppercase tracking-wider">
                {payments.length} {t('finance.payments') || 'payments'}
              </p>
              <p className="text-2xl font-bold text-emerald-700">
                {fmtAmount(payments.reduce((s, p) => s + Number(p.amount), 0))}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Desktop table */}
        <Card className="hidden md:block overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F0EDE8] bg-[#FAFAF8]">
                  <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('common.date')}</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('common.project')}</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Type</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('finance.payment_method')}</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('common.amount')}</th>
                  <th className="text-center px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EDE8]">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-[#64648B]">
                      <Banknote size={32} className="mx-auto mb-2 opacity-30" />
                      <p>{t('common.no_results') || 'No payments found'}</p>
                    </td>
                  </tr>
                ) : payments.map(p => (
                  <tr key={p.id} className="hover:bg-[#FAFAF8] transition-colors">
                    <td className="px-5 py-3.5 text-[#64648B] text-xs">
                      {new Date(p.received_at).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="px-5 py-3.5">
                      <div>
                        <p className="font-medium text-[#1a1a2e]">{p.project?.client_name || '—'}</p>
                        <p className="text-xs text-[#64648B]">{p.project?.reference_code}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5"><StatusBadge status={p.payment_type} /></td>
                    <td className="px-5 py-3.5 text-[#64648B] text-xs">{p.payment_method || '—'}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-emerald-600">
                      +{fmtAmount(Number(p.amount))}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEdit(p)} className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          disabled={deleting === p.id}
                          className="p-1.5 rounded text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2.5">
          {payments.map(p => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={p.payment_type} />
                    {p.payment_method && (
                      <span className="text-[11px] text-[#64648B]">{p.payment_method}</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-[#1a1a2e] truncate">{p.project?.client_name || '—'}</p>
                  <p className="text-xs text-[#64648B] mt-0.5">
                    {new Date(p.received_at).toLocaleDateString('fr-MA', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
                  <p className="font-bold text-emerald-600 text-sm">
                    +{fmtAmount(Number(p.amount))}
                  </p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(p)} className="p-1 rounded text-blue-600 hover:bg-blue-50" title="Edit">
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={deleting === p.id}
                      className="p-1 rounded text-red-500 hover:bg-red-50 disabled:opacity-40"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {payments.length === 0 && (
            <div className="text-center py-12">
              <Banknote size={48} className="mx-auto text-[#E8E5E0] mb-3" />
              <p className="text-[#64648B]">{t('common.no_results') || 'No payments yet'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Payment Drawer */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={resetForm}
          />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#1a1a2e]">
                {editingPayment ? 'Edit Payment' : (t('finance.add_payment') || 'Add Payment')}
              </h2>
              <button
                onClick={resetForm}
                className="p-2 hover:bg-[#F5F3F0] rounded-xl transition-colors"
              >
                <X size={20} className="text-[#64648B]" />
              </button>
            </div>

            {/* Inline form error */}
            {formError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
                <AlertCircle size={13} /> {formError}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-[#64648B] uppercase tracking-wider">
                {t('common.project')} *
              </label>
              <select
                value={projectId}
                onChange={e => { setProjectId(e.target.value); setFormError(''); }}
                className="w-full px-3.5 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20 focus:border-[#C9956B]"
              >
                <option value="">-- Select project --</option>
                {projects.map(pr => (
                  <option key={pr.id} value={pr.id}>
                    {pr.client_name} · {pr.reference_code}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#64648B] uppercase tracking-wider">
                  {t('common.amount')} (MAD) *
                </label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => { setAmount(e.target.value); setFormError(''); }}
                  min="0.01"
                  step="0.01"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#64648B] uppercase tracking-wider">
                  {t('common.date')} *
                </label>
                <Input
                  type="date"
                  value={receivedAt}
                  onChange={e => setReceivedAt(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#64648B] uppercase tracking-wider">Type</label>
                <select
                  value={paymentType}
                  onChange={e => setPaymentType(e.target.value as PaymentType)}
                  className="w-full px-3.5 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20 focus:border-[#C9956B]"
                >
                  {PAYMENT_TYPES.map(pt => (
                    <option key={pt} value={pt}>{pt}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#64648B] uppercase tracking-wider">
                  {t('finance.payment_method')}
                </label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3.5 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20 focus:border-[#C9956B]"
                >
                  {PAYMENT_METHODS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[#64648B] uppercase tracking-wider">
                {t('finance.reference') || 'Reference #'}
              </label>
              <Input
                placeholder="CHQ-001, REF-..."
                value={referenceNumber}
                onChange={e => setReferenceNumber(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[#64648B] uppercase tracking-wider">
                {t('common.notes') || 'Notes'}
              </label>
              <Input
                placeholder={t('common.notes') || 'Notes...'}
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={resetForm}>
                {t('common.cancel') || 'Cancel'}
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={saving || !amount || !projectId}
              >
                {saving ? (t('common.saving') || 'Saving...') : editingPayment ? 'Update' : (t('common.save') || 'Save')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </RoleGuard>
  );
}
