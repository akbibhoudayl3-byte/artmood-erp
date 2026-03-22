'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { ArrowLeft, FileText, Calendar, User, Printer, Copy, CheckCircle, AlertCircle, X, ShieldAlert, Eye, EyeOff, DollarSign } from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { checkMarginCompliance, getProjectRealCost } from '@/lib/services/cost-engine.service';
import type { MarginCheck, ProjectRealCost, CostBreakdown } from '@/types/finance';

interface QuoteDetail {
  id: string;
  project_id: string;
  version: number;
  status: string;
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  total_amount: number;
  notes: string | null;
  valid_until: string | null;
  sent_at: string | null;
  responded_at: string | null;
  created_at: string;
  margin_override?: boolean;
  margin_override_by?: string | null;
  margin_override_reason?: string | null;
  is_auto_generated?: boolean;
  cost_snapshot?: CostBreakdown | null;
  project?: { client_name: string; reference_code: string };
  creator?: { full_name: string } | null;
}

interface QuoteLine {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  sort_order: number;
}

export default function QuoteDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const { profile } = useAuth();
  const { t } = useLocale();

  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');
  const [actionError, setActionError] = useState('');
  const [duplicating, setDuplicating] = useState(false);

  // Cost engine state
  const [marginCheck, setMarginCheck] = useState<MarginCheck | null>(null);
  const [realCost, setRealCost] = useState<ProjectRealCost | null>(null);
  const [internalView, setInternalView] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverrideModal, setShowOverrideModal] = useState(false);

  const isManager = profile?.role === 'ceo' || profile?.role === 'commercial_manager';

  // Edit mode state (draft quotes only)
  const [editing, setEditing] = useState(false);
  const [editLines, setEditLines] = useState<{ id?: string; description: string; quantity: string; unit: string; unit_price: string }[]>([]);
  const [editDiscount, setEditDiscount] = useState('0');
  const [editNotes, setEditNotes] = useState('');
  const [editValidUntil, setEditValidUntil] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => { loadData(); }, [id]);

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setActionError('');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  function showError(msg: string) {
    setActionError(msg);
    setSuccessMsg('');
    setTimeout(() => setActionError(''), 6000);
  }

  async function loadData() {
    const [quoteRes, linesRes] = await Promise.all([
      supabase.from('quotes')
        .select('*, project:projects(client_name, reference_code), creator:profiles!quotes_created_by_fkey(full_name)')
        .eq('id', id).single(),
      supabase.from('quote_lines').select('*').eq('quote_id', id).order('sort_order'),
    ]);
    const q = quoteRes.data as QuoteDetail;
    setQuote(q);
    setLines((linesRes.data as QuoteLine[]) || []);
    setLoading(false);

    // Load margin info for cost engine
    if (q?.project_id) {
      checkMarginCompliance(q.total_amount, q.project_id).then(r => {
        if (r.success && r.data) setMarginCheck(r.data);
      });
      getProjectRealCost(q.project_id).then(r => {
        if (r.success && r.data) setRealCost(r.data);
      });
    }
  }

  async function updateStatus(status: string) {
    setActionError('');
    setSuccessMsg('');

    // For 'accepted': the RPC handles quote + project + PO atomically. No frontend quote update.
    // For other statuses: update quote directly.
    if (status !== 'accepted') {
      const updatePayload: Record<string, any> = {
        status,
        updated_at: new Date().toISOString(),
        ...(status === 'sent' ? { sent_at: new Date().toISOString() } : {}),
        ...(status === 'rejected' ? { responded_at: new Date().toISOString() } : {}),
      };

      const { error: quoteErr } = await supabase
        .from('quotes')
        .update(updatePayload)
        .eq('id', id);

      if (quoteErr) {
        showError('Failed to update quote status: ' + quoteErr.message);
        return;
      }
    }

    // When accepted: check deposit first, then atomic RPC
    if (status === 'accepted' && quote?.project_id && quote?.total_amount != null) {
      // Check if 50% deposit has been paid
      const { data: payments } = await supabase
        .from('payments')
        .select('amount')
        .eq('project_id', quote.project_id);
      const totalPaid = (payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0);
      const requiredDeposit = quote.total_amount * 0.5;
      if (totalPaid < requiredDeposit) {
        const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
        showError(
          `Acompte insuffisant. Le client doit payer au moins 50% (${fmt(requiredDeposit)} MAD) avant validation.\n` +
          `Montant reçu : ${fmt(totalPaid)} MAD. Reste à encaisser : ${fmt(requiredDeposit - totalPaid)} MAD.\n` +
          `Enregistrez le paiement dans Finance > Paiements d'abord.`
        );
        return;
      }

      const { data: rpcResult, error: rpcErr } = await supabase.rpc('approve_quote_and_create_po', {
        p_quote_id: id as string,
        p_project_id: quote.project_id,
        p_total_amount: quote.total_amount,
        p_quote_version: quote.version,
        p_ref_code: quote.project?.reference_code || 'PRJ',
      });

      if (rpcErr) {
        showError('Approval failed: ' + rpcErr.message);
      } else if (rpcResult && !rpcResult.success) {
        showError(rpcResult.error || 'Approval rejected by server.');
      } else if (rpcResult) {
        showSuccess(rpcResult.message);
      }
    } else if (status === 'sent') {
      showSuccess('Quote marked as sent.');
    } else if (status === 'rejected') {
      showSuccess('Quote marked as rejected.');
    }

    loadData();
  }

  async function handleDuplicate() {
    if (!quote) return;
    setDuplicating(true);
    setActionError('');
    setSuccessMsg('');

    try {
      // Get the max version for this project's quotes
      const { data: existingQuotes } = await supabase
        .from('quotes')
        .select('version')
        .eq('project_id', quote.project_id)
        .order('version', { ascending: false })
        .limit(1);

      const nextVersion = existingQuotes && existingQuotes.length > 0
        ? existingQuotes[0].version + 1
        : quote.version + 1;

      // Duplicate the quote header
      const { data: newQuote, error: newQuoteErr } = await supabase
        .from('quotes')
        .insert({
          project_id: quote.project_id,
          version: nextVersion,
          status: 'draft',
          subtotal: quote.subtotal,
          discount_percent: quote.discount_percent,
          discount_amount: quote.discount_amount,
          total_amount: quote.total_amount,
          notes: quote.notes,
          valid_until: quote.valid_until,
          created_by: profile?.id,
        })
        .select('id')
        .single();

      if (newQuoteErr || !newQuote) {
        showError('Failed to duplicate quote: ' + (newQuoteErr?.message || 'Unknown error'));
        setDuplicating(false);
        return;
      }

      // Duplicate all lines
      if (lines.length > 0) {
        const duplicatedLines = lines.map(line => ({
          quote_id: newQuote.id,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unit_price,
          total_price: line.total_price,
          sort_order: line.sort_order,
        }));

        const { error: linesErr } = await supabase
          .from('quote_lines')
          .insert(duplicatedLines);

        if (linesErr) {
          showError('Quote duplicated but lines failed to copy: ' + linesErr.message);
          setDuplicating(false);
          return;
        }
      }

      showSuccess(`Quote duplicated as v${nextVersion}. Navigating...`);
      setTimeout(() => {
        router.push(`/quotes/${newQuote.id}`);
      }, 1200);
    } catch (err: any) {
      showError(err?.message || 'An unexpected error occurred.');
    } finally {
      setDuplicating(false);
    }
  }

  function startEditing() {
    if (!quote) return;
    setEditLines(lines.map(l => ({
      id: l.id,
      description: l.description,
      quantity: String(l.quantity),
      unit: l.unit,
      unit_price: String(l.unit_price),
    })));
    setEditDiscount(String(quote.discount_percent || 0));
    setEditNotes(quote.notes || '');
    setEditValidUntil(quote.valid_until || '');
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setEditLines([]);
  }

  function updateEditLine(index: number, field: string, value: string) {
    const updated = [...editLines];
    updated[index] = { ...updated[index], [field]: value };
    setEditLines(updated);
  }

  function addEditLine() {
    setEditLines([...editLines, { description: '', quantity: '1', unit: 'unit', unit_price: '' }]);
  }

  function removeEditLine(index: number) {
    if (editLines.length <= 1) return;
    setEditLines(editLines.filter((_, i) => i !== index));
  }

  const editSubtotal = editLines.reduce((sum, l) => sum + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0);
  const editDiscountVal = parseFloat(editDiscount) || 0;
  const editDiscountAmount = editSubtotal * (editDiscountVal / 100);
  const editTotal = editSubtotal - editDiscountAmount;

  async function saveEdit() {
    if (!quote || editLines.some(l => !l.description.trim() || !l.unit_price)) return;
    setEditSaving(true);
    setActionError('');

    // Update quote header
    const { error: qErr } = await supabase.from('quotes').update({
      subtotal: editSubtotal,
      discount_percent: editDiscountVal,
      discount_amount: editDiscountAmount,
      total_amount: editTotal,
      notes: editNotes || null,
      valid_until: editValidUntil || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    if (qErr) {
      showError('Failed to update quote: ' + qErr.message);
      setEditSaving(false);
      return;
    }

    // Delete old lines, insert new ones
    await supabase.from('quote_lines').delete().eq('quote_id', id);
    const newLines = editLines.map((l, i) => ({
      quote_id: id as string,
      description: l.description.trim(),
      quantity: parseFloat(l.quantity) || 1,
      unit: l.unit || 'unit',
      unit_price: parseFloat(l.unit_price) || 0,
      total_price: (parseFloat(l.quantity) || 1) * (parseFloat(l.unit_price) || 0),
      sort_order: i,
    }));
    const { error: lErr } = await supabase.from('quote_lines').insert(newLines);

    if (lErr) {
      showError('Quote updated but lines failed to save: ' + lErr.message);
    } else {
      showSuccess('Quote updated successfully.');
    }

    setEditing(false);
    setEditSaving(false);
    loadData();
  }

  async function handleRevise() {
    await handleDuplicate();
  }

  async function handleMarginOverride() {
    if (!overrideReason.trim()) return;
    const { error } = await supabase.from('quotes').update({
      margin_override: true,
      margin_override_by: profile?.id,
      margin_override_reason: overrideReason.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) { showError('Override failed: ' + error.message); return; }
    showSuccess('Margin override approved.');
    setShowOverrideModal(false);
    setOverrideReason('');
    loadData();
  }

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;
  if (!quote) return <div className="text-center py-12 text-gray-500">Quote not found</div>;

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <p className="text-xs text-gray-400 font-mono">{quote.project?.reference_code}</p>
          <h1 className="text-xl font-bold text-gray-900">{quote.project?.client_name}</h1>
          <p className="text-sm text-gray-500">Quote v{quote.version}</p>
        </div>
        <StatusBadge status={quote.status} />
      </div>

      {/* Success / Error banners */}
      {successMsg && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          <CheckCircle size={16} className="shrink-0" />
          {successMsg}
        </div>
      )}
      {actionError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0" />
          {actionError}
        </div>
      )}

      {/* Actions Bar */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => window.open(`/api/quote-pdf?id=${id}`, '_blank')}
        >
          <Printer size={16} /> {t('common.print')} / PDF
        </Button>
        {isManager && (
          <Button
            variant="secondary"
            onClick={() => window.open(`/api/quote-pdf?id=${id}&internal=true`, '_blank')}
          >
            <DollarSign size={16} /> PDF Interne
          </Button>
        )}
        {quote.status === 'draft' && !editing && (
          <Button variant="secondary" onClick={startEditing}>
            <FileText size={16} /> Edit
          </Button>
        )}
        {(quote.status === 'sent' || quote.status === 'rejected') && (
          <Button
            variant="secondary"
            loading={duplicating}
            onClick={handleRevise}
            title="Create a revised draft version"
          >
            <Copy size={16} /> Revise
          </Button>
        )}
        <Button
          variant="secondary"
          loading={duplicating}
          onClick={handleDuplicate}
          title="Duplicate this quote as a new draft version"
        >
          <Copy size={16} /> Duplicate
        </Button>
      </div>

      {/* Margin Warning Banner */}
      {marginCheck && !marginCheck.compliant && !quote.margin_override && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <ShieldAlert size={20} className="text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700">
              Price Protection: Margin {marginCheck.marginPercent}% is below minimum {marginCheck.minMargin}%
            </p>
            <p className="text-xs text-red-500 mt-1">
              This quote cannot be sent to the client until the price is adjusted or a manager approves an override.
            </p>
            {isManager && (
              <button
                onClick={() => setShowOverrideModal(true)}
                className="mt-2 text-xs font-medium text-red-700 underline hover:text-red-900"
              >
                Approve Override (Manager Only)
              </button>
            )}
          </div>
        </div>
      )}

      {quote.margin_override && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          <ShieldAlert size={16} className="shrink-0" />
          Margin override approved{quote.margin_override_reason ? `: ${quote.margin_override_reason}` : ''}
        </div>
      )}

      {/* Override Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Approve Margin Override</h3>
            <p className="text-sm text-gray-600">
              Current margin: <strong>{marginCheck?.marginPercent}%</strong> (min: {marginCheck?.minMargin}%).
              Approving this override allows the quote to be sent below minimum margin.
            </p>
            <textarea
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              rows={3}
              placeholder="Reason for override (required)"
              value={overrideReason}
              onChange={e => setOverrideReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button variant="danger" className="flex-1" onClick={handleMarginOverride} disabled={!overrideReason.trim()}>
                Approve Override
              </Button>
              <Button variant="secondary" onClick={() => setShowOverrideModal(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Internal / Client View Toggle */}
      {isManager && (quote.cost_snapshot || (realCost && realCost.real_cost > 0)) && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setInternalView(!internalView)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              internalView ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {internalView ? <Eye size={14} /> : <EyeOff size={14} />}
            {internalView ? 'Internal View (Cost + Margin)' : 'Client View'}
          </button>
        </div>
      )}

      {/* Cost Snapshot (Internal View) */}
      {internalView && quote.cost_snapshot && (
        <Card>
          <CardHeader><h2 className="font-semibold text-sm flex items-center gap-1.5"><DollarSign size={14} /> Cost Breakdown (at quote creation)</h2></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {[
                { label: 'Materials', value: (quote.cost_snapshot as any).material_cost },
                { label: 'Hardware', value: (quote.cost_snapshot as any).hardware_cost },
                { label: 'Labor', value: (quote.cost_snapshot as any).labor_cost },
                { label: 'Machine', value: (quote.cost_snapshot as any).machine_cost },
                { label: 'Transport', value: (quote.cost_snapshot as any).transport_cost },
                { label: 'Total Cost', value: (quote.cost_snapshot as any).total_cost },
              ].map(item => (
                <div key={item.label} className={`p-2 rounded-lg ${item.label === 'Total Cost' ? 'bg-gray-100 font-bold' : 'bg-gray-50'}`}>
                  <p className="text-xs text-gray-500">{item.label}</p>
                  <p className="text-gray-900">{(item.value || 0).toLocaleString()} MAD</p>
                </div>
              ))}
            </div>
            {realCost && (
              <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
                <span className="text-sm text-gray-600">Current Margin</span>
                <span className={`text-sm font-bold ${
                  realCost.margin_percent >= 20 ? 'text-green-600' :
                  realCost.margin_percent >= 10 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {realCost.margin_percent}% ({realCost.profit.toLocaleString()} MAD profit)
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quote Info */}
      <Card>
        <CardContent>
          <div className="space-y-2 text-sm">
            {quote.creator && (
              <div className="flex items-center gap-2 text-gray-600">
                <User size={15} className="text-gray-400" /> Created by {quote.creator.full_name}
              </div>
            )}
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar size={15} className="text-gray-400" /> Created {new Date(quote.created_at).toLocaleDateString('fr-FR')}
            </div>
            {quote.valid_until && (
              <div className="flex items-center gap-2 text-gray-600">
                <FileText size={15} className="text-gray-400" /> {t('quotes.valid_until')} {new Date(quote.valid_until).toLocaleDateString('fr-FR')}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader><h2 className="font-semibold text-sm">{t('quotes.items')}</h2></CardHeader>
        <CardContent>
          {editing ? (
            /* ===== EDIT MODE ===== */
            <div className="space-y-3">
              {editLines.map((line, i) => (
                <div key={i} className="p-3 bg-gray-50 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-400">Item {i + 1}</span>
                    {editLines.length > 1 && (
                      <button onClick={() => removeEditLine(i)} className="text-red-400 hover:text-red-600">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Description *"
                    value={line.description} onChange={e => updateEditLine(i, 'description', e.target.value)} />
                  <div className="grid grid-cols-3 gap-2">
                    <input className="px-3 py-2 border border-gray-200 rounded-lg text-sm" type="number" placeholder="Qty"
                      value={line.quantity} onChange={e => updateEditLine(i, 'quantity', e.target.value)} />
                    <input className="px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Unit"
                      value={line.unit} onChange={e => updateEditLine(i, 'unit', e.target.value)} />
                    <input className="px-3 py-2 border border-gray-200 rounded-lg text-sm" type="number" placeholder="Price"
                      value={line.unit_price} onChange={e => updateEditLine(i, 'unit_price', e.target.value)} />
                  </div>
                  <p className="text-xs text-right text-gray-400">
                    = {((parseFloat(line.quantity) || 0) * (parseFloat(line.unit_price) || 0)).toLocaleString()} MAD
                  </p>
                </div>
              ))}
              <button onClick={addEditLine} className="w-full py-2 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600">
                + Add Line
              </button>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Discount %</label>
                  <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" type="number" min="0" max="100"
                    value={editDiscount} onChange={e => setEditDiscount(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Valid Until</label>
                  <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" type="date"
                    value={editValidUntil} onChange={e => setEditValidUntil(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
                <textarea className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" rows={2}
                  value={editNotes} onChange={e => setEditNotes(e.target.value)} />
              </div>
              {/* Edit Totals */}
              <div className="border-t border-gray-200 pt-3 space-y-1.5">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>{t('quotes.subtotal')}</span>
                  <span>{editSubtotal.toLocaleString()} MAD</span>
                </div>
                {editDiscountAmount > 0 && (
                  <div className="flex justify-between text-sm text-red-500">
                    <span>{t('quotes.discount')} ({editDiscountVal}%)</span>
                    <span>-{editDiscountAmount.toLocaleString()} MAD</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>{t('quotes.grand_total')}</span>
                  <span>{editTotal.toLocaleString()} MAD</span>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button variant="primary" className="flex-1" loading={editSaving} onClick={saveEdit}
                  disabled={editLines.some(l => !l.description.trim() || !l.unit_price)}>
                  Save Changes
                </Button>
                <Button variant="secondary" onClick={cancelEditing}>Cancel</Button>
              </div>
            </div>
          ) : (
            /* ===== VIEW MODE ===== */
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-500">
                      <th className="text-left py-2 pr-4">{t('common.description')}</th>
                      <th className="text-right py-2 px-2">Qty</th>
                      <th className="text-right py-2 px-2">Unit</th>
                      <th className="text-right py-2 px-2">Price</th>
                      <th className="text-right py-2 pl-2">{t('common.total')}</th>
                      {internalView && <th className="text-right py-2 pl-2 text-blue-500">Cost</th>}
                      {internalView && <th className="text-right py-2 pl-2 text-blue-500">Margin</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {lines.map(line => {
                      const costSnapshot = quote.cost_snapshot as any;
                      const totalCost = costSnapshot?.total_cost || 0;
                      const lineCostRatio = quote.subtotal > 0 ? line.total_price / quote.subtotal : 0;
                      const estimatedCost = Math.round(totalCost * lineCostRatio * (1 - (marginCheck?.marginPercent || 0) / 100) / (lineCostRatio || 1));
                      const lineMargin = line.total_price > 0 ? Math.round((1 - estimatedCost / line.total_price) * 1000) / 10 : 0;
                      return (
                        <tr key={line.id}>
                          <td className="py-2.5 pr-4 text-gray-700">{line.description}</td>
                          <td className="py-2.5 px-2 text-right text-gray-600">{line.quantity}</td>
                          <td className="py-2.5 px-2 text-right text-gray-400">{line.unit}</td>
                          <td className="py-2.5 px-2 text-right text-gray-600">{line.unit_price.toLocaleString()}</td>
                          <td className="py-2.5 pl-2 text-right font-medium">{line.total_price.toLocaleString()}</td>
                          {internalView && (
                            <td className="py-2.5 pl-2 text-right text-blue-600 text-xs">
                              {Math.round(line.total_price / (marginCheck?.marginPercent ? (1 / (1 - (marginCheck.marginPercent) / 100)) : 1.3)).toLocaleString()}
                            </td>
                          )}
                          {internalView && (
                            <td className="py-2.5 pl-2 text-right text-xs">
                              <span className={marginCheck && marginCheck.marginPercent >= 15 ? 'text-green-600' : 'text-red-600'}>
                                {marginCheck?.marginPercent || '—'}%
                              </span>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="border-t border-gray-200 mt-3 pt-3 space-y-1.5">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>{t('quotes.subtotal')}</span>
                  <span>{quote.subtotal.toLocaleString()} MAD</span>
                </div>
                {quote.discount_amount > 0 && (
                  <div className="flex justify-between text-sm text-red-500">
                    <span>{t('quotes.discount')} ({quote.discount_percent}%)</span>
                    <span>-{quote.discount_amount.toLocaleString()} MAD</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>{t('quotes.grand_total')}</span>
                  <span>{quote.total_amount.toLocaleString()} MAD</span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Status Actions */}
      {!editing && quote.status !== 'accepted' && (
        <Card>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
              {quote.status === 'draft' && (
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={() => updateStatus('sent')}
                  disabled={marginCheck ? (!marginCheck.compliant && !quote.margin_override) : false}
                  title={marginCheck && !marginCheck.compliant && !quote.margin_override ? 'Margin too low — override required' : ''}
                >
                  Mark as Sent
                </Button>
              )}
              {quote.status === 'sent' && (
                <>
                  <Button variant="success" className="flex-1" onClick={() => updateStatus('accepted')}>
                    Client Accepted
                  </Button>
                  <Button variant="danger" className="flex-1" onClick={() => updateStatus('rejected')}>
                    Client Rejected
                  </Button>
                  <Button variant="secondary" onClick={() => updateStatus('draft')}>
                    Revert to Draft
                  </Button>
                </>
              )}
              {quote.status === 'rejected' && (
                <p className="text-sm text-gray-500">This quote was rejected. Use <strong>Revise</strong> above to create a new version.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accepted confirmation */}
      {quote.status === 'accepted' && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          <CheckCircle size={16} className="shrink-0" />
          This quote has been accepted and the project total has been synced.
        </div>
      )}

      {quote.notes && (
        <Card>
          <CardHeader><h2 className="font-semibold text-sm">{t('common.notes')}</h2></CardHeader>
          <CardContent><p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.notes}</p></CardContent>
        </Card>
      )}
    </div>
      </RoleGuard>
  );
}
