'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Input';
interface SupplierOption { id: string; name: string; }
import { ArrowLeft, Plus, Trash2 , AlertCircle } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';

interface POLine {
  item_name: string;
  quantity: string;
  unit: string;
  unit_price: string;
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = createClient();
  const { t } = useLocale();

  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<POLine[]>([{ item_name: '', quantity: '1', unit: 'unit', unit_price: '' }]);
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('');;

  useEffect(() => {
    supabase.from('suppliers').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setSuppliers(data || []));
  }, []);

  function updateLine(index: number, field: keyof POLine, value: string) {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    setLines(updated);
  }

  function addLine() {
    setLines([...lines, { item_name: '', quantity: '1', unit: 'unit', unit_price: '' }]);
  }

  function removeLine(index: number) {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== index));
  }

  const total = lines.reduce((sum, l) => sum + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0);

  async function createPO() {
    // ── Validation ──────────────────────────────────────────────
    setFormError('');
    if (!supplierId) {
      setFormError('Veuillez sélectionner un fournisseur.');
      return;
    }
    if (!lines || lines.length === 0) {
      setFormError("Ajoutez au moins un article.");
      return;
    }
    const hasInvalidLine = lines.some(
      (l) => !l.item_name?.trim() || !l.quantity || Number(l.quantity) <= 0
    );
    if (hasInvalidLine) {
      setFormError("Tous les articles doivent avoir un nom et une quantité > 0.");
      return;
    }
    setSaving(true);

    const { data: po, error: poErr } = await supabase.from('purchase_orders').insert({
      supplier_id: supplierId,
      total_amount: total,
      notes: notes || null,
      created_by: profile?.id,
    }).select('id').single();

    if (poErr || !po) {
      setFormError('Erreur création bon de commande: ' + (poErr?.message || 'Unknown error'));
      setSaving(false);
      return;
    }

    const poLines = lines.map((l, i) => ({
      purchase_order_id: po.id,
      item_name: l.item_name.trim(),
      quantity: parseFloat(l.quantity) || 1,
      unit: l.unit || 'unit',
      unit_price: parseFloat(l.unit_price) || 0,
      total_price: (parseFloat(l.quantity) || 1) * (parseFloat(l.unit_price) || 0),
      sort_order: i,
    }));

    const { error: linesErr } = await supabase.from('purchase_order_lines').insert(poLines);
    if (linesErr) {
      setFormError('Bon créé mais erreur lignes: ' + linesErr.message);
      setSaving(false);
      return;
    }

    router.push('/purchase-orders');
  }

  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/purchase-orders')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-[#1a1a2e]">{t('po.new_order')}</h1>
      </div>

      {formError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={16} /> {formError}
        </div>
      )}

      <Card>
        <CardContent>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('po.supplier')} *</label>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
                className="w-full border border-[#E8E5E0] rounded-xl px-3 py-2.5 text-sm">
                <option value="">{t('po.supplier')}...</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <Textarea label={t('common.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={`${t('common.notes')}...`} />
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardContent>
          <h3 className="font-semibold text-sm mb-3">{t('po.items')}</h3>
          <div className="space-y-3">
            {lines.map((line, i) => (
              <div key={i} className="p-3 bg-gray-50 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#64648B]">Item {i + 1}</span>
                  {lines.length > 1 && (
                    <button onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <Input placeholder="Item name" value={line.item_name} onChange={(e) => updateLine(i, 'item_name', e.target.value)} />
                <div className="grid grid-cols-3 gap-2">
                  <Input type="number" placeholder={t('po.quantity')} value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} />
                  <Input placeholder="Unit" value={line.unit} onChange={(e) => updateLine(i, 'unit', e.target.value)} />
                  <Input type="number" placeholder={t('po.unit_price')} value={line.unit_price} onChange={(e) => updateLine(i, 'unit_price', e.target.value)} />
                </div>
                <p className="text-xs text-right text-[#64648B]">
                  {t('po.subtotal')}: {((parseFloat(line.quantity) || 0) * (parseFloat(line.unit_price) || 0)).toLocaleString()} MAD
                </p>
              </div>
            ))}
          </div>
          <Button variant="ghost" className="w-full mt-3" onClick={addLine}>
            <Plus size={16} /> {t('common.add')} {t('po.items')}
          </Button>
        </CardContent>
      </Card>

      {/* Total & Submit */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-[#64648B]">{t('common.total')}</span>
          <span className="text-xl font-bold text-[#1a1a2e]">{total.toLocaleString()} MAD</span>
        </div>
        <Button fullWidth loading={saving} onClick={createPO}>{t('po.new_order')}</Button>
      </Card>
    </div>
      </RoleGuard>
  );
}
