'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Input';
import { ArrowLeft, Plus, Trash2, GripVertical } from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

interface LineItem {
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
}

interface ProjectOption {
  id: string;
  client_name: string;
  reference_code: string;
}

export default function NewQuotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const supabase = createClient();
  const { t } = useLocale();

  const preselectedProjectId = searchParams.get('project') || '';

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState(preselectedProjectId);
  const [discountPercent, setDiscountPercent] = useState('0');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineItem[]>([
    { description: '', quantity: '1', unit: 'unit', unit_price: '' },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('projects').select('id, client_name, reference_code')
      .in('status', ['measurements', 'design', 'client_validation', 'production'])
      .order('created_at', { ascending: false })
      .then(({ data }) => setProjects((data as ProjectOption[]) || []));

    // Default valid_until to 30 days from now
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setValidUntil(d.toISOString().split('T')[0]);
  }, []);

  function updateLine(index: number, field: keyof LineItem, value: string) {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    setLines(updated);
  }

  function addLine() {
    setLines([...lines, { description: '', quantity: '1', unit: 'unit', unit_price: '' }]);
  }

  function removeLine(index: number) {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== index));
  }

  const subtotal = lines.reduce((sum, l) => sum + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0);
  const discount = parseFloat(discountPercent) || 0;
  const discountAmount = subtotal * (discount / 100);
  const total = subtotal - discountAmount;

  async function createQuote() {
    if (!projectId || lines.some(l => !l.description.trim() || !l.unit_price)) return;
    setSaving(true);

    // Get next version number for this project
    const { data: existing } = await supabase
      .from('quotes')
      .select('version')
      .eq('project_id', projectId)
      .order('version', { ascending: false })
      .limit(1);

    const nextVersion = (existing?.[0]?.version || 0) + 1;

    const { data: quote } = await supabase.from('quotes').insert({
      project_id: projectId,
      version: nextVersion,
      status: 'draft',
      subtotal,
      discount_percent: discount,
      discount_amount: discountAmount,
      total_amount: total,
      notes: notes || null,
      valid_until: validUntil || null,
      created_by: profile?.id,
    }).select().single();

    if (quote) {
      const quoteLines = lines.map((l, i) => ({
        quote_id: quote.id,
        description: l.description.trim(),
        quantity: parseFloat(l.quantity) || 1,
        unit: l.unit || 'unit',
        unit_price: parseFloat(l.unit_price) || 0,
        total_price: (parseFloat(l.quantity) || 1) * (parseFloat(l.unit_price) || 0),
        sort_order: i,
      }));
      await supabase.from('quote_lines').insert(quoteLines);

      // Update project total_amount
      await supabase.from('projects').update({ total_amount: total }).eq('id', projectId);

      router.push(`/quotes/${quote.id}`);
    } else {
      setSaving(false);
    }
  }

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-[#1a1a2e]">{t('quotes.new_quote')}</h1>
      </div>

      {/* Project Selection */}
      <Card>
        <CardContent>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-[#1a1a2e] mb-1.5">Project *</label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-[#E8E5E0] rounded-xl text-sm">
                <option value="">Select project...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.reference_code} — {p.client_name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label={`${t('quotes.discount')} %`} type="number" value={discountPercent}
                onChange={e => setDiscountPercent(e.target.value)} min="0" max="100" />
              <Input label={t('quotes.valid_until')} type="date" value={validUntil}
                onChange={e => setValidUntil(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardContent>
          <h3 className="font-semibold text-sm text-[#1a1a2e] mb-3">{t('quotes.items')}</h3>
          <div className="space-y-3">
            {lines.map((line, i) => (
              <div key={i} className="p-3 bg-[#FAFAF8] rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#64648B]">Item {i + 1}</span>
                  {lines.length > 1 && (
                    <button onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <Input placeholder="Description *" value={line.description}
                  onChange={e => updateLine(i, 'description', e.target.value)} />
                <div className="grid grid-cols-3 gap-2">
                  <Input type="number" placeholder="Qty" value={line.quantity}
                    onChange={e => updateLine(i, 'quantity', e.target.value)} />
                  <Input placeholder="Unit" value={line.unit}
                    onChange={e => updateLine(i, 'unit', e.target.value)} />
                  <Input type="number" placeholder="Price (MAD)" value={line.unit_price}
                    onChange={e => updateLine(i, 'unit_price', e.target.value)} />
                </div>
                <p className="text-xs text-right text-[#64648B] font-medium">
                  = {((parseFloat(line.quantity) || 0) * (parseFloat(line.unit_price) || 0)).toLocaleString()} MAD
                </p>
              </div>
            ))}
          </div>
          <Button variant="ghost" className="w-full mt-3" onClick={addLine}>
            <Plus size={16} /> {t('common.add')}
          </Button>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardContent>
          <Textarea label={t('common.notes')} value={notes} onChange={e => setNotes(e.target.value)}
            rows={3} placeholder="Terms, conditions, special notes..." />
        </CardContent>
      </Card>

      {/* Totals */}
      <Card className="p-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-[#64648B]">
            <span>{t('quotes.subtotal')}</span>
            <span>{subtotal.toLocaleString()} MAD</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm text-red-500">
              <span>{t('quotes.discount')} ({discount}%)</span>
              <span>-{discountAmount.toLocaleString()} MAD</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-[#1a1a2e] border-t border-[#F0EDE8] pt-2">
            <span>{t('quotes.grand_total')}</span>
            <span>{total.toLocaleString()} MAD</span>
          </div>
        </div>
        <Button fullWidth className="mt-4" loading={saving} onClick={createQuote}
          disabled={!projectId || lines.some(l => !l.description.trim() || !l.unit_price)}>
          {t('quotes.new_quote')}
        </Button>
      </Card>
    </div>
      </RoleGuard>
  );
}
