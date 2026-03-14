'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Select } from '@/components/ui/Input';
import StatusBadge from '@/components/ui/StatusBadge';
import type { Cheque } from '@/types/database';
import PhotoUpload from '@/components/ui/PhotoUpload';
import { useLocale } from '@/lib/hooks/useLocale';
import { Plus, X } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';

export default function ChequesPage() {
  const { t } = useLocale();
  const { profile } = useAuth();
  const supabase = createClient();
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('all');

  const [form, setForm] = useState({
    type: 'received' as 'received' | 'issued',
    amount: '',
    due_date: '',
    cheque_number: '',
    bank_name: '',
    client_name: '',
    supplier_name: '',
    notes: '',
    photo_url: '',
  });

  useEffect(() => { loadCheques(); }, []);

  async function loadCheques() {
    const { data } = await supabase.from('cheques').select('*').order('due_date', { ascending: true });
    setCheques(data || []);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase.from('cheques').insert({
      type: form.type,
      amount: parseFloat(form.amount),
      due_date: form.due_date,
      cheque_number: form.cheque_number || null,
      bank_name: form.bank_name || null,
      client_name: form.client_name || null,
      supplier_name: form.supplier_name || null,
      notes: form.notes || null,
      photo_url: form.photo_url || null,
      status: 'pending',
      created_by: profile?.id,
    });
    setSaving(false);
    setShowForm(false);
    setForm({ type: 'received', amount: '', due_date: '', cheque_number: '', bank_name: '', client_name: '', supplier_name: '', notes: '', photo_url: '' });
    loadCheques();
  }

  const filtered = cheques.filter(c => filter === 'all' || c.type === filter || c.status === filter);

  const totalReceived = cheques.filter(c => c.type === 'received' && c.status === 'pending').reduce((s, c) => s + Number(c.amount), 0);
  const totalIssued = cheques.filter(c => c.type === 'issued' && c.status === 'pending').reduce((s, c) => s + Number(c.amount), 0);

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">{t('cheques.title')}</h1>
        <Button onClick={() => setShowForm(true)}><Plus size={18} /> <span className="hidden sm:inline">{t('common.add')} {t('finance.cheque')}</span><span className="sm:hidden">{t('common.add')}</span></Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 bg-emerald-50/50 border-emerald-200">
          <p className="text-[11px] text-emerald-600 font-semibold">{t('finance.pending')} {t('cheques.received')}</p>
          <p className="text-lg sm:text-xl font-bold text-emerald-800">{totalReceived.toLocaleString()} MAD</p>
        </Card>
        <Card className="p-4 bg-red-50/50 border-red-200">
          <p className="text-[11px] text-red-600 font-semibold">{t('finance.pending')} {t('cheques.issued')}</p>
          <p className="text-lg sm:text-xl font-bold text-red-800">{totalIssued.toLocaleString()} MAD</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0">
        {['all', 'received', 'issued', 'pending', 'cleared', 'bounced'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border ${
              filter === f ? 'bg-[#1B2A4A] text-white border-[#1B2A4A]' : 'bg-white text-[#64648B] border-[#E8E5E0] active:bg-[#F5F3F0]'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Cheque List */}
      <div className="space-y-2.5">
        {filtered.map(cheque => (
          <Card key={cheque.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={cheque.type} />
                  <StatusBadge status={cheque.status} />
                </div>
                <p className="text-lg font-bold text-[#1a1a2e] mt-1.5">{Number(cheque.amount).toLocaleString()} MAD</p>
                <p className="text-xs text-[#64648B] mt-0.5">
                  {cheque.client_name || cheque.supplier_name || 'N/A'}
                  {cheque.cheque_number ? ` - #${cheque.cheque_number}` : ''}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-medium text-[#1a1a2e]">
                  {new Date(cheque.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
                {new Date(cheque.due_date) <= new Date(Date.now() + 7 * 86400000) && cheque.status === 'pending' && (
                  <p className="text-[11px] text-red-500 font-semibold mt-0.5">Due soon</p>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Add Cheque Modal - bottom sheet on mobile */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto animate-fade-scale">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-[#1a1a2e]">{t('common.add')} {t('finance.cheque')}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-[#F5F3F0] rounded-xl active:scale-95"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <PhotoUpload
                bucket="cheques"
                pathPrefix={`cheque-${Date.now()}`}
                onUpload={(data) => setForm({ ...form, photo_url: data.url })}
                existingPhotos={form.photo_url ? [{ url: form.photo_url }] : []}
                onRemove={() => setForm({ ...form, photo_url: '' })}
                maxPhotos={1}
                label="Take photo of cheque"
                compact
              />

              <Select label={`${t('common.type')} *`} value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as 'received' | 'issued' })}
                options={[{ value: 'received', label: t('cheques.received') }, { value: 'issued', label: t('cheques.issued') }]} />

              <Input label={`${t('finance.amount')} *`} type="number" placeholder="0.00" required
                value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />

              <Input label={`${t('cheques.due_date')} *`} type="date" required
                value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />

              <Input label={t('cheques.cheque_number')} placeholder="Optional"
                value={form.cheque_number} onChange={(e) => setForm({ ...form, cheque_number: e.target.value })} />

              <Input label={form.type === 'received' ? 'Client Name' : 'Supplier Name'}
                value={form.type === 'received' ? form.client_name : form.supplier_name}
                onChange={(e) => setForm({ ...form, [form.type === 'received' ? 'client_name' : 'supplier_name']: e.target.value })} />

              <Button type="submit" fullWidth loading={saving} size="lg" className="mt-2">{t('common.save')} {t('finance.cheque')}</Button>
            </form>
          </div>
        </div>
      )}
    </div>
      </RoleGuard>
  );
}
