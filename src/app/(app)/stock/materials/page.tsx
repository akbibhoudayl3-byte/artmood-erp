'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Input';
import StatusBadge from '@/components/ui/StatusBadge';
import { ArrowLeft, Plus, Search, X, Edit2, Trash2, Layers, DollarSign, Check, Package } from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

interface MaterialPrice {
  id: string;
  material_key: string;
  material_name: string;
  price_per_m2: number | null;
  price_per_unit: number | null;
  unit: string;
  supplier_id: string | null;
  thickness_mm: number | null;
  notes: string | null;
  is_active: boolean;
  supplier?: { id: string; name: string } | null;
}

type ModalMode = null | 'add';

export default function MaterialsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = createClient();

  const { t } = useLocale();
  const canEdit = ['ceo', 'workshop_manager', 'commercial_manager'].includes(profile?.role || '');

  const [materials, setMaterials] = useState<MaterialPrice[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<ModalMode>(null);
  const [saving, setSaving] = useState(false);

  // Inline editing
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState('');
  const priceInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [form, setForm] = useState({
    material_name: '',
    material_key: '',
    price_per_m2: '',
    price_per_unit: '',
    thickness_mm: '',
    unit: 'm2',
    supplier_id: '',
    notes: '',
  });

  useEffect(() => {
    loadMaterials();
    loadSuppliers();
  }, []);

  useEffect(() => {
    if (editingPriceId && priceInputRef.current) {
      priceInputRef.current.focus();
      priceInputRef.current.select();
    }
  }, [editingPriceId]);

  async function loadMaterials() {
    const { data } = await supabase
      .from('material_prices')
      .select('*, supplier:suppliers!material_prices_supplier_id_fkey(id, name)')
      .eq('is_active', true)
      .order('material_name');
    setMaterials((data as MaterialPrice[]) || []);
    setLoading(false);
  }

  async function loadSuppliers() {
    const { data } = await supabase.from('suppliers').select('id, name').order('name');
    setSuppliers(data || []);
  }

  function openAdd() {
    setForm({
      material_name: '',
      material_key: '',
      price_per_m2: '',
      price_per_unit: '',
      thickness_mm: '',
      unit: 'm2',
      supplier_id: '',
      notes: '',
    });
    setModal('add');
  }

  async function saveMaterial() {
    if (!form.material_name.trim() || !form.material_key.trim()) return;
    setSaving(true);

    const payload = {
      material_name: form.material_name.trim(),
      material_key: form.material_key.trim(),
      price_per_m2: form.price_per_m2 ? parseFloat(form.price_per_m2) : null,
      price_per_unit: form.price_per_unit ? parseFloat(form.price_per_unit) : null,
      thickness_mm: form.thickness_mm ? parseFloat(form.thickness_mm) : null,
      unit: form.unit,
      supplier_id: form.supplier_id || null,
      notes: form.notes || null,
      is_active: true,
    };

    await supabase.from('material_prices').insert(payload);

    setModal(null);
    setSaving(false);
    await loadMaterials();
  }

  function startEditPrice(material: MaterialPrice) {
    if (!canEdit) return;
    setEditingPriceId(material.id);
    setEditingPriceValue(material.price_per_m2 != null ? String(material.price_per_m2) : '');
  }

  async function saveInlinePrice() {
    if (!editingPriceId) return;
    const newPrice = editingPriceValue ? parseFloat(editingPriceValue) : null;

    await supabase
      .from('material_prices')
      .update({ price_per_m2: newPrice })
      .eq('id', editingPriceId);

    setEditingPriceId(null);
    setEditingPriceValue('');
    await loadMaterials();
  }

  function cancelEditPrice() {
    setEditingPriceId(null);
    setEditingPriceValue('');
  }

  async function deleteMaterial(material: MaterialPrice) {
    if (!confirm(`Delete "${material.material_name}"? This will deactivate the material.`)) return;
    await supabase.from('material_prices').update({ is_active: false }).eq('id', material.id);
    await loadMaterials();
  }

  const filtered = materials.filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.material_name.toLowerCase().includes(q) ||
      m.material_key.toLowerCase().includes(q) ||
      m.supplier?.name?.toLowerCase().includes(q)
    );
  });

  const totalCount = materials.length;
  const avgPrice = totalCount > 0
    ? materials.reduce((sum, m) => sum + (m.price_per_m2 || 0), 0) / materials.filter(m => m.price_per_m2 != null).length
    : 0;

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-20 skeleton" />)}
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager'] as any[]}>
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/stock')}
          className="p-2 rounded-xl hover:bg-[#F5F3F0] transition-colors"
        >
          <ArrowLeft size={20} className="text-[#1a1a2e]" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">{t('materials.title')}</h1>
          <p className="text-sm text-[#64648B]">Price database per m² for factory materials</p>
        </div>
        {canEdit && (
          <Button onClick={openAdd}>
            <Plus size={18} /> {t('materials.add_material')}
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#C9956B]/10 flex items-center justify-center">
              <Layers size={18} className="text-[#C9956B]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1a1a2e]">{totalCount}</p>
              <p className="text-xs text-[#64648B]">Total Materials</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <DollarSign size={18} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1a1a2e]">
                {isNaN(avgPrice) ? '-' : avgPrice.toFixed(1)}
              </p>
              <p className="text-xs text-[#64648B]">Avg Price/m² (MAD)</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64648B]" />
        <input
          type="text"
          placeholder="Search materials by name, key, or supplier..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20 focus:border-[#C9956B]"
        />
      </div>

      {/* Desktop Table */}
      <Card className="hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F0EDE8]">
                <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Material</th>
                <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Key</th>
                <th className="text-right px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('materials.price_per_m2')}</th>
                <th className="text-right px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Thickness</th>
                <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Unit</th>
                <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">{t('materials.supplier')}</th>
                {canEdit && <th className="text-right px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EDE8]">
              {filtered.map(material => (
                <tr key={material.id} className="hover:bg-[#FAFAF8]">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-[#1a1a2e]">{material.material_name}</p>
                    {material.notes && (
                      <p className="text-[10px] text-[#64648B] truncate max-w-[200px]">{material.notes}</p>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs font-mono text-[#64648B] bg-[#F5F3F0] px-2 py-0.5 rounded-md">
                      {material.material_key}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {editingPriceId === material.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <input
                          ref={priceInputRef}
                          type="number"
                          step="0.01"
                          value={editingPriceValue}
                          onChange={(e) => setEditingPriceValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveInlinePrice();
                            if (e.key === 'Escape') cancelEditPrice();
                          }}
                          className="w-24 px-2 py-1 text-sm text-right border border-[#C9956B] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20"
                        />
                        <button onClick={saveInlinePrice} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                          <Check size={14} />
                        </button>
                        <button onClick={cancelEditPrice} className="p-1 text-gray-400 hover:bg-gray-100 rounded-lg">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <span
                        onClick={() => startEditPrice(material)}
                        className={`font-semibold text-[#1a1a2e] ${canEdit ? 'cursor-pointer hover:text-[#C9956B] hover:underline underline-offset-2' : ''}`}
                        title={canEdit ? 'Click to edit price' : undefined}
                      >
                        {material.price_per_m2 != null ? `${material.price_per_m2.toFixed(2)} MAD` : '-'}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right text-[#64648B]">
                    {material.thickness_mm != null ? `${material.thickness_mm} mm` : '-'}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={material.unit || 'other'} />
                  </td>
                  <td className="px-5 py-3.5 text-[#64648B] text-sm">
                    {material.supplier?.name || '-'}
                  </td>
                  {canEdit && (
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => startEditPrice(material)}
                          className="p-1.5 text-[#64648B] hover:bg-gray-100 rounded-lg"
                          title="Edit price"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => deleteMaterial(material)}
                          className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-2.5">
        {filtered.map(material => (
          <Card key={material.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#1a1a2e]">{material.material_name}</p>
                <span className="text-[11px] font-mono text-[#64648B] bg-[#F5F3F0] px-1.5 py-0.5 rounded-md inline-block mt-0.5">
                  {material.material_key}
                </span>
                <div className="flex items-center gap-2 mt-1.5">
                  {material.thickness_mm != null && (
                    <span className="text-[10px] text-[#64648B]">{material.thickness_mm} mm</span>
                  )}
                  {material.supplier?.name && (
                    <span className="text-[10px] text-[#64648B]">{material.supplier.name}</span>
                  )}
                </div>
              </div>
              <div className="text-right ml-3">
                {editingPriceId === material.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.01"
                      value={editingPriceValue}
                      onChange={(e) => setEditingPriceValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveInlinePrice();
                        if (e.key === 'Escape') cancelEditPrice();
                      }}
                      className="w-20 px-2 py-1 text-sm text-right border border-[#C9956B] rounded-lg focus:outline-none"
                      autoFocus
                    />
                    <button onClick={saveInlinePrice} className="p-1 text-emerald-600">
                      <Check size={14} />
                    </button>
                  </div>
                ) : (
                  <p
                    onClick={() => startEditPrice(material)}
                    className={`text-lg font-bold text-[#1a1a2e] ${canEdit ? 'cursor-pointer' : ''}`}
                  >
                    {material.price_per_m2 != null ? `${material.price_per_m2.toFixed(2)}` : '-'}
                  </p>
                )}
                <p className="text-[11px] text-[#64648B]">MAD/m²</p>
              </div>
            </div>
            {material.notes && (
              <p className="text-[10px] text-[#64648B] mt-1.5 truncate">{material.notes}</p>
            )}
            {canEdit && (
              <div className="flex gap-2 mt-3 pt-3 border-t border-[#F0EDE8]">
                <button
                  onClick={() => startEditPrice(material)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-[#64648B] bg-gray-100 rounded-lg"
                >
                  <Edit2 size={12} /> {t('common.edit')}
                </button>
                <button
                  onClick={() => deleteMaterial(material)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-red-500 bg-red-50 rounded-lg"
                >
                  <Trash2 size={12} /> {t('common.delete')}
                </button>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Package size={48} className="mx-auto text-[#E8E5E0] mb-3" />
          <p className="text-[#64648B]">{t('common.no_results')}</p>
        </div>
      )}

      {/* ADD MODAL */}
      {modal === 'add' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[#F0EDE8]">
              <h2 className="font-bold text-[#1a1a2e]">{t('materials.add_material')}</h2>
              <button onClick={() => setModal(null)}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <Input
                label="Material Name *"
                value={form.material_name}
                onChange={e => setForm({ ...form, material_name: e.target.value })}
                placeholder="e.g. Melamine White Gloss"
              />
              <Input
                label="Material Key *"
                value={form.material_key}
                onChange={e => setForm({ ...form, material_key: e.target.value })}
                placeholder="e.g. MEL-WHT-18"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Price per m² (MAD)"
                  type="number"
                  step="0.01"
                  value={form.price_per_m2}
                  onChange={e => setForm({ ...form, price_per_m2: e.target.value })}
                  placeholder="0.00"
                />
                <Input
                  label="Price per Unit (MAD)"
                  type="number"
                  step="0.01"
                  value={form.price_per_unit}
                  onChange={e => setForm({ ...form, price_per_unit: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Thickness (mm)"
                  type="number"
                  step="0.1"
                  value={form.thickness_mm}
                  onChange={e => setForm({ ...form, thickness_mm: e.target.value })}
                  placeholder="e.g. 18"
                />
                <div>
                  <label className="block text-sm font-medium text-[#1a1a2e] mb-1.5">Unit</label>
                  <select
                    value={form.unit}
                    onChange={e => setForm({ ...form, unit: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20 focus:border-[#C9956B]"
                  >
                    <option value="m2">m²</option>
                    <option value="ml">ml (linear meter)</option>
                    <option value="pcs">Piece</option>
                    <option value="kg">Kilogram</option>
                    <option value="l">Liter</option>
                    <option value="sheet">Sheet</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1a1a2e] mb-1.5">Supplier</label>
                <select
                  value={form.supplier_id}
                  onChange={e => setForm({ ...form, supplier_id: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20 focus:border-[#C9956B]"
                >
                  <option value="">No supplier</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <Textarea
                label="Notes"
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                rows={2}
                placeholder="Optional notes about this material..."
              />
              <div className="flex gap-2 pt-2">
                <Button variant="secondary" className="flex-1" onClick={() => setModal(null)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  className="flex-1"
                  onClick={saveMaterial}
                  loading={saving}
                  disabled={!form.material_name.trim() || !form.material_key.trim()}
                >
                  {t('materials.add_material')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
      </RoleGuard>
  );
}
