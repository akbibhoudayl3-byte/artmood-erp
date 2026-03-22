'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Input';
import type { Supplier } from '@/types/database';
import { Truck, Plus, Search, Phone, Mail, MapPin, X, Edit2, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useConfirmDialog } from '@/lib/hooks/useConfirmDialog';

export default function SuppliersPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const { t } = useLocale();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const confirm = useConfirmDialog();

  // Form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => { loadSuppliers(); }, []);

  async function loadSuppliers() {
    const { data, error: loadErr } = await supabase
      .from('suppliers')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (loadErr) {
      setError('Failed to load suppliers: ' + loadErr.message);
    } else {
      setSuppliers(data || []);
    }
    setLoading(false);
  }

  function resetForm() {
    setName(''); setPhone(''); setEmail(''); setAddress('');
    setCity(''); setCategory(''); setNotes('');
    setEditingId(null); setShowForm(false); setError('');
  }

  function editSupplier(s: Supplier) {
    setName(s.name); setPhone(s.phone || ''); setEmail(s.email || '');
    setAddress(s.address || ''); setCity(s.city || '');
    setCategory(s.category || ''); setNotes(s.notes || '');
    setEditingId(s.id); setShowForm(true); setError('');
  }

  async function saveSupplier() {
    // Validation
    if (!name.trim()) {
      setError('Supplier name is required.');
      return;
    }
    if (phone && !/^[+\d\s\-()]{6,20}$/.test(phone.trim())) {
      setError('Phone number format appears invalid.');
      return;
    }
    if (email && !/\S+@\S+\.\S+/.test(email.trim())) {
      setError('Email address appears invalid.');
      return;
    }

    setSaving(true);
    setError('');

    const payload = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      city: city.trim() || null,
      category: category.trim() || null,
      notes: notes.trim() || null,
    };

    let opError;
    if (editingId) {
      const { error: updateErr } = await supabase
        .from('suppliers')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingId);
      opError = updateErr;
    } else {
      const { error: insertErr } = await supabase.from('suppliers').insert(payload);
      opError = insertErr;
    }

    if (opError) {
      setError('Error saving supplier: ' + opError.message);
      setSaving(false);
      return;
    }

    setSuccessMsg(editingId ? 'Supplier updated.' : 'Supplier added.');
    setTimeout(() => setSuccessMsg(''), 3000);
    resetForm();
    loadSuppliers();
    setSaving(false);
  }

  function deleteSupplier(s: Supplier) {
    confirm.open({
      title: 'Deactivate Supplier',
      message: `Deactivate "${s.name}"? They will no longer appear in the list.`,
      onConfirm: async () => {
        const { error: delErr } = await supabase
          .from('suppliers')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', s.id);
        if (delErr) {
          setError('Failed to deactivate supplier: ' + delErr.message);
        } else {
          setError('');
          setSuccessMsg('Supplier deactivated.');
          setTimeout(() => setSuccessMsg(''), 3000);
          loadSuppliers();
        }
      },
    });
  }

  const filtered = suppliers.filter(s =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.category?.toLowerCase().includes(search.toLowerCase()) ||
    s.city?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => <div key={i} className="h-20 skeleton" />)}
    </div>
  );

  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager'] as any[]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">{t('suppliers.title')}</h1>
            <p className="text-sm text-[#64648B]">{suppliers.length} active suppliers</p>
          </div>
          <Button onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus size={18} /> {t('suppliers.add_supplier')}
          </Button>
        </div>

        {/* Success / Error banners */}
        {successMsg && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm">
            <CheckCircle size={16} /> {successMsg}
          </div>
        )}
        {error && !showForm && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            <AlertCircle size={16} /> {error}
            <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64648B]" />
          <input
            type="text"
            placeholder={`${t('common.search')}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20 focus:border-[#C9956B]"
          />
        </div>

        {/* Form */}
        {showForm && (
          <Card className="border-blue-200">
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">{editingId ? t('common.edit') : t('suppliers.add_supplier')}</h3>
                  <button onClick={resetForm}><X size={18} className="text-gray-400" /></button>
                </div>

                {/* Inline error */}
                {error && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
                    <AlertCircle size={13} /> {error}
                  </div>
                )}

                <Input
                  label={`${t('common.name')} *`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Supplier name"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label={t('common.phone')}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+212..."
                  />
                  <Input
                    label={t('common.email')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label={t('common.city')}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                  <Input
                    label="Category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Panels, Hardware"
                  />
                </div>
                <Input
                  label={t('common.address')}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
                <Textarea
                  label={t('common.notes')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={resetForm}>
                    {t('common.cancel')}
                  </Button>
                  <Button className="flex-1" onClick={saveSupplier} disabled={saving}>
                    {saving ? 'Saving...' : editingId ? t('common.save') : t('suppliers.add_supplier')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Supplier List */}
        <div className="space-y-2.5">
          {filtered.map(supplier => (
            <Card key={supplier.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[#1a1a2e]">{supplier.name}</p>
                    {supplier.category && (
                      <span className="text-[11px] px-2 py-0.5 bg-gray-100 text-[#64648B] rounded-lg">
                        {supplier.category}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-[#64648B]">
                    {supplier.phone && (
                      <a href={`tel:${supplier.phone}`} className="flex items-center gap-1 text-blue-600">
                        <Phone size={12} /> {supplier.phone}
                      </a>
                    )}
                    {supplier.email && (
                      <span className="flex items-center gap-1"><Mail size={12} /> {supplier.email}</span>
                    )}
                    {supplier.city && (
                      <span className="flex items-center gap-1"><MapPin size={12} /> {supplier.city}</span>
                    )}
                  </div>
                  {supplier.balance !== 0 && (
                    <p className={`text-xs mt-1 font-medium ${supplier.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {t('suppliers.balance')}: {Math.abs(supplier.balance).toLocaleString()} MAD{' '}
                      {supplier.balance > 0 ? '(owed)' : '(credit)'}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => editSupplier(supplier)}
                    className="p-2 text-gray-400 hover:text-[#1a1a2e] hover:bg-gray-100 rounded-lg"
                    title="Edit"
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    onClick={() => deleteSupplier(supplier)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                    title="Deactivate"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <Truck size={48} className="mx-auto text-[#E8E5E0] mb-3" />
            <p className="text-[#64648B]">{t('common.no_results')}</p>
          </div>
        )}

        <ConfirmDialog
          isOpen={confirm.isOpen}
          onClose={confirm.close}
          onConfirm={confirm.confirm}
          title={confirm.title}
          message={confirm.message}
          variant="danger"
          loading={confirm.loading}
        />
      </div>
    </RoleGuard>
  );
}
