'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { ArrowLeft, FileText, Calendar, User, Printer, Copy, CheckCircle, AlertCircle } from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

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
    setQuote(quoteRes.data as QuoteDetail);
    setLines((linesRes.data as QuoteLine[]) || []);
    setLoading(false);
  }

  async function updateStatus(status: string) {
    setActionError('');
    setSuccessMsg('');

    const updatePayload: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
      ...(status === 'sent' ? { sent_at: new Date().toISOString() } : {}),
      ...(status === 'accepted' || status === 'rejected' ? { responded_at: new Date().toISOString() } : {}),
    };

    const { error: quoteErr } = await supabase
      .from('quotes')
      .update(updatePayload)
      .eq('id', id);

    if (quoteErr) {
      showError('Failed to update quote status: ' + quoteErr.message);
      return;
    }

    // When accepted, also sync total_amount to the linked project
    if (status === 'accepted' && quote?.project_id && quote?.total_amount != null) {
      const { error: projectErr } = await supabase
        .from('projects')
        .update({
          total_amount: quote.total_amount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', quote.project_id);

      if (projectErr) {
        showError('Quote accepted, but failed to sync project total: ' + projectErr.message);
      } else {
        showSuccess('Quote accepted and project total synced to ' + quote.total_amount.toLocaleString() + ' MAD.');
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

      {/* PDF / Print + Duplicate */}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => window.open(`/api/quote-pdf?id=${id}`, '_blank')}
        >
          <Printer size={16} /> {t('common.print')} / PDF
        </Button>
        <Button
          variant="secondary"
          loading={duplicating}
          onClick={handleDuplicate}
          title="Duplicate this quote as a new draft version"
        >
          <Copy size={16} /> Duplicate
        </Button>
      </div>

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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="text-left py-2 pr-4">{t('common.description')}</th>
                  <th className="text-right py-2 px-2">Qty</th>
                  <th className="text-right py-2 px-2">Unit</th>
                  <th className="text-right py-2 px-2">Price</th>
                  <th className="text-right py-2 pl-2">{t('common.total')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lines.map(line => (
                  <tr key={line.id}>
                    <td className="py-2.5 pr-4 text-gray-700">{line.description}</td>
                    <td className="py-2.5 px-2 text-right text-gray-600">{line.quantity}</td>
                    <td className="py-2.5 px-2 text-right text-gray-400">{line.unit}</td>
                    <td className="py-2.5 px-2 text-right text-gray-600">{line.unit_price.toLocaleString()}</td>
                    <td className="py-2.5 pl-2 text-right font-medium">{line.total_price.toLocaleString()}</td>
                  </tr>
                ))}
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
        </CardContent>
      </Card>

      {/* Actions */}
      {quote.status !== 'accepted' && quote.status !== 'rejected' && (
        <Card>
          <CardContent>
            <div className="flex gap-2">
              {quote.status === 'draft' && (
                <Button variant="primary" className="flex-1" onClick={() => updateStatus('sent')}>{t('quotes.sent')}</Button>
              )}
              {quote.status === 'sent' && (
                <>
                  <Button variant="success" className="flex-1" onClick={() => updateStatus('accepted')}>{t('quotes.accepted')}</Button>
                  <Button variant="danger" className="flex-1" onClick={() => updateStatus('rejected')}>{t('quotes.rejected')}</Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
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
