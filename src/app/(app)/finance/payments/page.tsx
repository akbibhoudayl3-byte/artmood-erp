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
import type { PaymentType, PaymentMethod } from '@/types/database';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { Plus, Banknote, TrendingUp, Pencil, Trash2, AlertTriangle, CheckCircle, ShieldAlert, Clock, XCircle } from 'lucide-react';
import { createLedgerEntry } from '@/lib/helpers/ledger';
import {
  loadPayments as loadPaymentsSvc,
  loadActiveProjects,
  createPayment,
  updatePayment,
  deletePayment,
  syncProjectPaidAmount,
  getProjectFinancialStatus,
  confirmPayment as confirmPaymentSvc,
  rejectPayment as rejectPaymentSvc,
  type PaymentWithProject,
  type CreatePaymentData,
  type ProjectFinancialStatus,
} from '@/lib/services/payment.service';

const PAYMENT_TYPES: PaymentType[] = ['deposit', 'pre_installation', 'final', 'other'];
const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'cheque', 'bank_transfer', 'card', 'other'];

const INITIAL_FORM = {
  project_id: '',
  amount: '',
  payment_type: 'deposit' as PaymentType,
  payment_method: 'cash' as PaymentMethod,
  received_at: new Date().toISOString().split('T')[0],
  reference_number: '',
  notes: '',
  editingId: null as string | null,
  oldAmount: 0,
  oldProjectId: '',
};

export default function PaymentsPage() {
  const { t } = useLocale();
  const { profile } = useAuth();

  // Data
  const [payments, setPayments] = useState<PaymentWithProject[]>([]);
  const [projects, setProjects] = useState<{ id: string; client_name: string; reference_code: string; total_amount: number; paid_amount: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // Financial status for selected project in form
  const [financialStatus, setFinancialStatus] = useState<ProjectFinancialStatus | null>(null);
  const [loadingFinancial, setLoadingFinancial] = useState(false);

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
    const [paymentsRes, projectsRes] = await Promise.all([
      loadPaymentsSvc(),
      loadActiveProjects(),
    ]);

    if (paymentsRes.success) {
      setPayments(paymentsRes.data || []);
    } else {
      setErrorMsg(paymentsRes.error || 'Failed to load payments');
    }
    if (projectsRes.success) {
      setProjects(projectsRes.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Load financial status for a project ──────────────────────────────
  async function loadFinancialStatus(projectId: string, editingPaymentAmount?: number) {
    if (!projectId) { setFinancialStatus(null); return; }
    setLoadingFinancial(true);
    const res = await getProjectFinancialStatus(projectId);
    if (res.success && res.data) {
      const fs = { ...res.data };
      // If editing, the current payment's amount isn't "new" — add it back to remaining
      if (editingPaymentAmount && editingPaymentAmount > 0) {
        fs.paid_amount = Math.max(0, fs.paid_amount - editingPaymentAmount);
        fs.remaining = Math.max(0, fs.total_amount - fs.paid_amount);
        fs.max_allowed = fs.remaining;
        fs.is_fully_paid = fs.total_amount > 0 && fs.paid_amount >= fs.total_amount;
        fs.overpayment = Math.max(0, fs.paid_amount - fs.total_amount);
      }
      setFinancialStatus(fs);
    } else {
      setFinancialStatus(null);
    }
    setLoadingFinancial(false);
  }

  // ── Open edit ──────────────────────────────────────────────────────────
  function openEdit(p: PaymentWithProject) {
    modal.openEdit({
      project_id: p.project_id,
      amount: String(p.amount),
      payment_type: p.payment_type,
      payment_method: p.payment_method || 'cash',
      received_at: p.received_at ? p.received_at.split('T')[0] : new Date().toISOString().split('T')[0],
      reference_number: p.reference_number || '',
      notes: p.notes || '',
      editingId: p.id,
      oldAmount: p.amount,
      oldProjectId: p.project_id,
    });
    setFormError(null);
    // Load financial status accounting for the payment being edited
    loadFinancialStatus(p.project_id, p.amount);
  }

  // ── Handle delete ──────────────────────────────────────────────────────
  function handleDeleteClick(p: PaymentWithProject) {
    confirm.open({
      title: 'Delete Payment',
      message: 'Delete this payment? This will also update the project total.',
      onConfirm: async () => {
        const res = await deletePayment(p.id, p.project_id, Number(p.amount));
        if (!res.success) {
          setErrorMsg(res.error || 'Failed to delete payment');
          return;
        }
        setSuccessMsg('Payment deleted.');
        fetchData();
      },
    });
  }

  // ── Handle save (create / update) ──────────────────────────────────────
  async function handleSave() {
    const { project_id, amount, payment_type, payment_method, received_at, reference_number, notes, editingId, oldAmount, oldProjectId } = modal.formData;

    // Validation
    if (!project_id) {
      setFormError('Please select a project.');
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError('Amount must be greater than zero.');
      return;
    }
    if (!received_at) {
      setFormError('Payment date is required.');
      return;
    }

    setSaving(true);
    setFormError(null);

    if (editingId) {
      // UPDATE
      const res = await updatePayment(editingId, {
        project_id,
        amount: parsedAmount,
        payment_type,
        payment_method,
        received_at,
        reference_number: reference_number || null,
        notes: notes || null,
      });

      if (!res.success) {
        setFormError(res.error || 'Failed to update payment');
        setSaving(false);
        return;
      }

      // Sync paid_amount if amount or project changed
      if (parsedAmount !== oldAmount || project_id !== oldProjectId) {
        await syncProjectPaidAmount(oldProjectId);
        if (project_id !== oldProjectId) {
          await syncProjectPaidAmount(project_id);
        }
      }

      modal.close();
      setSaving(false);
      setSuccessMsg('Payment updated successfully.');
      fetchData();
      return;
    }

    // CREATE
    const paymentData: CreatePaymentData = {
      project_id,
      amount: parsedAmount,
      payment_type,
      payment_method,
      received_at: new Date(received_at).toISOString(),
      reference_number: reference_number || undefined,
      notes: notes || undefined,
      received_by: profile?.id,
    };

    const res = await createPayment(paymentData);
    if (!res.success) {
      setFormError(res.error || 'Failed to record payment');
      setSaving(false);
      return;
    }

    // Create ledger entry for income
    await createLedgerEntry({
      date: new Date(received_at).toISOString(),
      type: 'income',
      category: payment_type,
      amount: parsedAmount,
      description: `Payment from ${projects.find(p => p.id === project_id)?.client_name || 'client'}`,
      project_id,
      source_module: 'payments',
      source_id: res.data?.id,
      payment_method,
      created_by: profile?.id || null,
    });

    modal.close();
    setSaving(false);
    setSuccessMsg('Payment recorded successfully.');
    fetchData();
  }

  // ── Confirm / Reject handlers ─────────────────────────────────────────
  async function handleConfirm(p: PaymentWithProject) {
    const res = await confirmPaymentSvc(p.id);
    if (res.success) {
      setSuccessMsg('Paiement confirmé.');
      fetchData();
    } else {
      setErrorMsg(res.error || 'Échec de la confirmation.');
    }
  }

  function handleRejectClick(p: PaymentWithProject) {
    confirm.open({
      title: 'Rejeter le paiement',
      message: `Rejeter ce paiement de ${fmtAmount(Number(p.amount))} ? Cette action ne peut pas être annulée facilement.`,
      onConfirm: async () => {
        const res = await rejectPaymentSvc(p.id, 'Rejeté manuellement');
        if (res.success) {
          setSuccessMsg('Paiement rejeté.');
          fetchData();
        } else {
          setErrorMsg(res.error || 'Échec du rejet.');
        }
      },
    });
  }

  // ── Computed ───────────────────────────────────────────────────────────
  const now = new Date();
  const confirmedTotal = payments
    .filter(p => p.payment_status === 'confirmed')
    .reduce((s, p) => s + Number(p.amount), 0);
  const pendingTotal = payments
    .filter(p => p.payment_status === 'pending_proof')
    .reduce((s, p) => s + Number(p.amount), 0);
  const totalThisMonth = payments
    .filter(p => {
      const d = new Date(p.received_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && p.payment_status === 'confirmed';
    })
    .reduce((s, p) => s + Number(p.amount), 0);

  const fmtAmount = (n: number) =>
    new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD', minimumFractionDigits: 0 }).format(n);

  // ── Loading skeleton ──────────────────────────────────────────────────
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
          <Button onClick={() => { modal.openCreate({ received_at: new Date().toISOString().split('T')[0] }); setFormError(null); setFinancialStatus(null); }}>
            <Plus size={18} /> {t('finance.add_payment') || 'Add Payment'}
          </Button>
        </div>

        {/* Global banners */}
        <ErrorBanner message={successMsg} type="success" onDismiss={() => setSuccessMsg(null)} autoDismiss={4000} />
        <ErrorBanner message={errorMsg} type="error" onDismiss={() => setErrorMsg(null)} />

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card className="bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-100">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                <CheckCircle size={18} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-[10px] text-emerald-600 font-medium uppercase tracking-wider">Confirmé</p>
                <p className="text-xl font-bold text-emerald-700">{fmtAmount(confirmedTotal)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={`border-amber-100 ${pendingTotal > 0 ? 'bg-gradient-to-r from-amber-50 to-yellow-50' : 'bg-gray-50'}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${pendingTotal > 0 ? 'bg-amber-100' : 'bg-gray-100'}`}>
                <Clock size={18} className={pendingTotal > 0 ? 'text-amber-600' : 'text-gray-400'} />
              </div>
              <div>
                <p className={`text-[10px] font-medium uppercase tracking-wider ${pendingTotal > 0 ? 'text-amber-600' : 'text-gray-400'}`}>En attente</p>
                <p className={`text-xl font-bold ${pendingTotal > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{fmtAmount(pendingTotal)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100 hidden md:block">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                <TrendingUp size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-[10px] text-blue-600 font-medium uppercase tracking-wider">Ce mois</p>
                <p className="text-xl font-bold text-blue-700">{fmtAmount(totalThisMonth)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

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
                  <th className="text-center px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Statut</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('common.amount')}</th>
                  <th className="text-center px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EDE8]">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        icon={<Banknote size={32} className="opacity-30" />}
                        title={t('common.no_results') || 'No payments found'}
                      />
                    </td>
                  </tr>
                ) : payments.map(p => (
                  <tr key={p.id} className="hover:bg-[#FAFAF8] transition-colors">
                    <td className="px-5 py-3.5 text-[#64648B] text-xs">
                      {new Date(p.received_at).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="px-5 py-3.5">
                      <div>
                        <p className="font-medium text-[#1a1a2e]">{p.project?.client_name || '\u2014'}</p>
                        <p className="text-xs text-[#64648B]">{p.project?.reference_code}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5"><StatusBadge status={p.payment_type} /></td>
                    <td className="px-5 py-3.5 text-[#64648B] text-xs">{p.payment_method || '\u2014'}</td>
                    <td className="px-5 py-3.5 text-center">
                      {p.payment_status === 'confirmed' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                          <CheckCircle size={10} /> Confirmé
                        </span>
                      )}
                      {p.payment_status === 'pending_proof' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">
                          <Clock size={10} /> En attente
                        </span>
                      )}
                      {p.payment_status === 'rejected' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700">
                          <XCircle size={10} /> Rejeté
                        </span>
                      )}
                    </td>
                    <td className={`px-5 py-3.5 text-right font-semibold ${
                      p.payment_status === 'confirmed' ? 'text-emerald-600' :
                      p.payment_status === 'rejected' ? 'text-red-400 line-through' :
                      'text-amber-600'
                    }`}>
                      {p.payment_status !== 'rejected' ? '+' : ''}{fmtAmount(Number(p.amount))}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-center gap-1">
                        {p.payment_status === 'pending_proof' && (
                          <>
                            <button onClick={() => handleConfirm(p)} className="p-1.5 rounded text-emerald-600 hover:bg-emerald-50 transition-colors" title="Confirmer">
                              <CheckCircle size={14} />
                            </button>
                            <button onClick={() => handleRejectClick(p)} className="p-1.5 rounded text-red-500 hover:bg-red-50 transition-colors" title="Rejeter">
                              <XCircle size={14} />
                            </button>
                          </>
                        )}
                        <button onClick={() => openEdit(p)} className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(p)}
                          className="p-1.5 rounded text-red-500 hover:bg-red-50 transition-colors"
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
                    {p.payment_status === 'pending_proof' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold">En attente</span>
                    )}
                    {p.payment_status === 'rejected' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 font-semibold">Rejeté</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-[#1a1a2e] truncate">{p.project?.client_name || '\u2014'}</p>
                  <p className="text-xs text-[#64648B] mt-0.5">
                    {new Date(p.received_at).toLocaleDateString('fr-MA', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
                  <p className={`font-bold text-sm ${
                    p.payment_status === 'confirmed' ? 'text-emerald-600' :
                    p.payment_status === 'rejected' ? 'text-red-400 line-through' :
                    'text-amber-600'
                  }`}>
                    {p.payment_status !== 'rejected' ? '+' : ''}{fmtAmount(Number(p.amount))}
                  </p>
                  <div className="flex items-center gap-1">
                    {p.payment_status === 'pending_proof' && (
                      <>
                        <button onClick={() => handleConfirm(p)} className="p-1 rounded text-emerald-600 hover:bg-emerald-50" title="Confirmer">
                          <CheckCircle size={13} />
                        </button>
                        <button onClick={() => handleRejectClick(p)} className="p-1 rounded text-red-500 hover:bg-red-50" title="Rejeter">
                          <XCircle size={13} />
                        </button>
                      </>
                    )}
                    <button onClick={() => openEdit(p)} className="p-1 rounded text-blue-600 hover:bg-blue-50" title="Edit">
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(p)}
                      className="p-1 rounded text-red-500 hover:bg-red-50"
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
            <EmptyState
              icon={<Banknote size={48} />}
              title={t('common.no_results') || 'No payments yet'}
            />
          )}
        </div>
      </div>

      {/* Form Modal (Add / Edit) */}
      <FormModal
        isOpen={modal.isOpen}
        onClose={() => { modal.close(); setFormError(null); }}
        title={modal.mode === 'edit' ? 'Edit Payment' : (t('finance.add_payment') || 'Add Payment')}
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => { modal.close(); setFormError(null); }}>
              {t('common.cancel') || 'Cancel'}
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={saving || (financialStatus?.is_fully_paid && financialStatus?.total_amount > 0)}
              loading={saving}
            >
              {modal.mode === 'edit' ? 'Update' : (t('common.save') || 'Save')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <ErrorBanner message={formError} type="error" onDismiss={() => setFormError(null)} />

          <div className="space-y-1">
            <label className="text-xs font-medium text-[#64648B] uppercase tracking-wider">
              {t('common.project')} *
            </label>
            <select
              value={modal.formData.project_id}
              onChange={e => {
                modal.setField('project_id', e.target.value);
                setFormError(null);
                loadFinancialStatus(e.target.value, modal.formData.editingId ? modal.formData.oldAmount : undefined);
              }}
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

          {/* ── Financial Status Panel ── */}
          {modal.formData.project_id && financialStatus && (
            <div className={`rounded-xl border p-3 space-y-2 ${
              financialStatus.is_fully_paid
                ? 'bg-red-50 border-red-200'
                : financialStatus.overpayment > 0
                  ? 'bg-orange-50 border-orange-200'
                  : financialStatus.remaining === 0 && financialStatus.total_amount === 0
                    ? 'bg-gray-50 border-gray-200'
                    : 'bg-emerald-50 border-emerald-200'
            }`}>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                {financialStatus.is_fully_paid ? (
                  <><ShieldAlert size={14} className="text-red-500" /><span className="text-red-700">Project Fully Paid</span></>
                ) : financialStatus.overpayment > 0 ? (
                  <><AlertTriangle size={14} className="text-orange-500" /><span className="text-orange-700">Overpayment Detected</span></>
                ) : (
                  <><CheckCircle size={14} className="text-emerald-500" /><span className="text-emerald-700">Financial Status</span></>
                )}
              </div>

              {financialStatus.total_amount > 0 && (
                <>
                  {/* Progress bar */}
                  <div className="w-full h-2 bg-white/70 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        financialStatus.is_fully_paid ? 'bg-red-400' : financialStatus.paid_amount / financialStatus.total_amount > 0.9 ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${Math.min(100, (financialStatus.paid_amount / financialStatus.total_amount) * 100)}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-[#64648B] uppercase">Total</p>
                      <p className="text-xs font-bold text-[#1a1a2e]">{fmtAmount(financialStatus.total_amount)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#64648B] uppercase">Paid</p>
                      <p className="text-xs font-bold text-emerald-600">{fmtAmount(financialStatus.paid_amount)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#64648B] uppercase">Remaining</p>
                      <p className={`text-xs font-bold ${financialStatus.remaining > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                        {fmtAmount(financialStatus.remaining)}
                      </p>
                    </div>
                  </div>

                  {financialStatus.overpayment > 0 && (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-orange-100 rounded-lg">
                      <AlertTriangle size={12} className="text-orange-600 shrink-0" />
                      <span className="text-[11px] font-medium text-orange-700">
                        Overpayment: {fmtAmount(financialStatus.overpayment)}
                      </span>
                    </div>
                  )}

                  {financialStatus.is_fully_paid && (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-red-100 rounded-lg">
                      <ShieldAlert size={12} className="text-red-600 shrink-0" />
                      <span className="text-[11px] font-medium text-red-700">
                        No further payments allowed for this project.
                      </span>
                    </div>
                  )}
                </>
              )}

              {financialStatus.total_amount === 0 && (
                <p className="text-[11px] text-[#64648B]">Project has no total amount set. Financial limits not enforced.</p>
              )}
            </div>
          )}
          {loadingFinancial && (
            <div className="text-xs text-[#64648B] animate-pulse">Loading financial status...</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#64648B] uppercase tracking-wider">
                {t('common.amount')} (MAD) *
              </label>
              <Input
                type="number"
                placeholder={financialStatus?.max_allowed ? `Max: ${financialStatus.max_allowed.toFixed(2)}` : '0.00'}
                value={modal.formData.amount}
                onChange={e => { modal.setField('amount', e.target.value); setFormError(null); }}
                min="0.01"
                step="0.01"
                max={financialStatus?.total_amount && financialStatus.total_amount > 0 ? financialStatus.max_allowed : undefined}
              />
              {financialStatus && financialStatus.max_allowed > 0 && financialStatus.total_amount > 0 && (
                <p className="text-[10px] text-[#64648B]">Max allowed: {fmtAmount(financialStatus.max_allowed)}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#64648B] uppercase tracking-wider">
                {t('common.date')} *
              </label>
              <Input
                type="date"
                value={modal.formData.received_at}
                onChange={e => modal.setField('received_at', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#64648B] uppercase tracking-wider">Type</label>
              <select
                value={modal.formData.payment_type}
                onChange={e => modal.setField('payment_type', e.target.value as PaymentType)}
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
                value={modal.formData.payment_method}
                onChange={e => modal.setField('payment_method', e.target.value as PaymentMethod)}
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
              value={modal.formData.reference_number}
              onChange={e => modal.setField('reference_number', e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[#64648B] uppercase tracking-wider">
              {t('common.notes') || 'Notes'}
            </label>
            <Input
              placeholder={t('common.notes') || 'Notes...'}
              value={modal.formData.notes}
              onChange={e => modal.setField('notes', e.target.value)}
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
