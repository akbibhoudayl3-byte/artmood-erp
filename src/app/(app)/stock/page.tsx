'use client';

/**
 * stock_page_paginated.tsx
 *
 * Stock page with server-side pagination, server-side search, and server-side filtering.
 *
 * Deploy to: src/app/(app)/stock/page.tsx
 *
 * Changes from original:
 *   - PAGE_SIZE = 50 (server-side)
 *   - loadStock() uses .range() + count: 'exact'
 *   - Search + category filter are server-side (ilike + eq)
 *   - Pagination bar: "Page X of Y · N items" with Prev / Next buttons
 *   - useEffect watches search, filterCategory, page — debounces search by 300ms
 *   - All modal code preserved exactly as before
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Input';
import StatusBadge from '@/components/ui/StatusBadge';
import type { StockItem, StockMovement } from '@/types/database';
import { useLocale } from '@/lib/hooks/useLocale';
import {
  Package, AlertTriangle, Plus, Search, X, ArrowDownRight, ArrowUpRight,
  Edit2, Trash2, History, DollarSign, Upload, CheckCircle, AlertCircle,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';

const PAGE_SIZE = 50;

type ModalMode = null | 'add' | 'edit' | 'movement' | 'history';

export default function StockPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLocale();
  const canManage = ['ceo', 'workshop_manager'].includes(profile?.role || '');

  const [items, setItems] = useState<StockItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [modal, setModal] = useState<ModalMode>(null);
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Low-stock summary for banner (fetched once, not paginated)
  const [lowStockCount, setLowStockCount] = useState(0);
  const [totalValue, setTotalValue] = useState(0);

  const [form, setForm] = useState({
    name: '', sku: '', category: 'panels', subcategory: '', unit: 'pcs',
    minimum_quantity: '10', cost_per_unit: '', thickness_mm: '', sheet_length_mm: '',
    sheet_width_mm: '', roll_length_m: '', location: '', notes: '',
  });

  const [movType, setMovType] = useState<'in' | 'out' | 'adjust'>('in');
  const [movQty, setMovQty] = useState('');
  const [movNotes, setMovNotes] = useState('');
  const [movements, setMovements] = useState<(StockMovement & { creator?: { full_name: string } })[]>([]);

  // Debounce search input — 300ms delay before triggering load
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadStock = useCallback(async (
    currentPage: number,
    currentSearch: string,
    currentCategory: string,
  ) => {
    setLoading(true);

    let query = supabase
      .from('stock_items')
      .select('*', { count: 'exact' })
      .eq('is_active', true);

    // Server-side category filter
    if (currentCategory !== 'all') {
      query = query.eq('category', currentCategory);
    }

    // Server-side search — match name or sku
    if (currentSearch.trim()) {
      const term = currentSearch.trim();
      query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
    }

    // Pagination
    const from = currentPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    query = query.order('name').range(from, to);

    const { data, count, error } = await query;

    if (error) {
      setErrorMsg('Failed to load stock: ' + error.message);
    } else {
      setItems(data || []);
      setTotalCount(count || 0);
    }

    setLoading(false);
  }, []);

  // Load summary stats (low stock count + total value) — not paginated
  const loadSummary = useCallback(async () => {
    const { data } = await supabase
      .from('stock_items')
      .select('current_quantity, minimum_quantity, cost_per_unit')
      .eq('is_active', true);

    if (data) {
      setLowStockCount(data.filter(i => i.current_quantity <= i.minimum_quantity).length);
      setTotalValue(data.reduce((s, i) => s + (i.cost_per_unit || 0) * i.current_quantity, 0));
    }
  }, []);

  // Initial load + summary
  useEffect(() => {
    loadStock(0, '', 'all');
    loadSummary();
  }, [loadStock, loadSummary]);

  // Reset page to 0 when category changes
  useEffect(() => {
    setPage(0);
    loadStock(0, search, filterCategory);
  }, [filterCategory]);

  // Debounce search — reset page to 0
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(0);
      loadStock(0, value, filterCategory);
    }, 300);
  };

  // Navigate to a specific page
  const goToPage = (newPage: number) => {
    setPage(newPage);
    loadStock(newPage, search, filterCategory);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ── Modal helpers (unchanged from original) ──────────────────────────────────

  function openAdd() {
    setForm({ name: '', sku: '', category: 'panels', subcategory: '', unit: 'pcs', minimum_quantity: '10', cost_per_unit: '', thickness_mm: '', sheet_length_mm: '', sheet_width_mm: '', roll_length_m: '', location: '', notes: '' });
    setSelectedItem(null);
    setErrorMsg('');
    setModal('add');
  }

  function openEdit(item: StockItem) {
    setForm({
      name: item.name, sku: item.sku || '', category: item.category,
      subcategory: (item as any).subcategory || '', unit: item.unit,
      minimum_quantity: String(item.minimum_quantity),
      cost_per_unit: item.cost_per_unit ? String(item.cost_per_unit) : '',
      thickness_mm: (item as any).thickness_mm ? String((item as any).thickness_mm) : '',
      sheet_length_mm: (item as any).sheet_length_mm ? String((item as any).sheet_length_mm) : '',
      sheet_width_mm: (item as any).sheet_width_mm ? String((item as any).sheet_width_mm) : '',
      roll_length_m: (item as any).roll_length_m ? String((item as any).roll_length_m) : '',
      location: item.location || '', notes: item.notes || '',
    });
    setSelectedItem(item);
    setErrorMsg('');
    setModal('edit');
  }

  function openMovement(item: StockItem) {
    setSelectedItem(item);
    setMovType('in');
    setMovQty('');
    setMovNotes('');
    setErrorMsg('');
    setModal('movement');
  }

  async function openHistory(item: StockItem) {
    setSelectedItem(item);
    setModal('history');
    const { data, error } = await supabase
      .from('stock_movements')
      .select('*, creator:profiles!stock_movements_created_by_fkey(full_name)')
      .eq('stock_item_id', item.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) {
      setErrorMsg('Failed to load history: ' + error.message);
    } else {
      setMovements((data as typeof movements) || []);
    }
  }

  async function saveItem() {
    if (!form.name.trim()) { setErrorMsg('Item name is required.'); return; }
    if (form.minimum_quantity && (isNaN(Number(form.minimum_quantity)) || Number(form.minimum_quantity) < 0)) {
      setErrorMsg('Minimum quantity must be a positive number.'); return;
    }
    if (form.cost_per_unit && (isNaN(Number(form.cost_per_unit)) || Number(form.cost_per_unit) < 0)) {
      setErrorMsg('Cost per unit must be a positive number.'); return;
    }

    setSaving(true);
    setErrorMsg('');

    const payload: Record<string, any> = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      category: form.category,
      subcategory: form.subcategory.trim() || null,
      unit: form.unit.trim() || 'pcs',
      minimum_quantity: parseInt(form.minimum_quantity) || 0,
      cost_per_unit: form.cost_per_unit ? parseFloat(form.cost_per_unit) : null,
      thickness_mm: form.thickness_mm ? parseFloat(form.thickness_mm) : null,
      sheet_length_mm: form.sheet_length_mm ? parseFloat(form.sheet_length_mm) : null,
      sheet_width_mm: form.sheet_width_mm ? parseFloat(form.sheet_width_mm) : null,
      roll_length_m: form.roll_length_m ? parseFloat(form.roll_length_m) : null,
      location: form.location.trim() || null,
      notes: form.notes.trim() || null,
    };

    try {
      const isEdit = modal === 'edit' && selectedItem;
      const res = await fetch('/api/stock/items', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { ...payload, id: selectedItem.id } : payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Error saving item');
        setSaving(false);
        return;
      }

      setSuccessMsg(isEdit ? 'Item updated.' : 'Item added.');
      setTimeout(() => setSuccessMsg(''), 3000);
      setModal(null);
      setSaving(false);
      await Promise.all([loadStock(page, search, filterCategory), loadSummary()]);
    } catch {
      setErrorMsg('Network error');
      setSaving(false);
    }
  }

  async function deleteItem(item: StockItem) {
    if (!confirm(`Deactivate "${item.name}"? Stock history is preserved.`)) return;
    const { error } = await supabase.from('stock_items').update({ is_active: false }).eq('id', item.id);
    if (error) {
      setErrorMsg('Failed to deactivate: ' + error.message);
    } else {
      await Promise.all([loadStock(page, search, filterCategory), loadSummary()]);
    }
  }

  async function saveMovement() {
    if (!selectedItem || !movQty) return;

    const qty = parseFloat(movQty);
    if (isNaN(qty) || qty < 0 || (movType !== 'adjust' && qty <= 0)) {
      setErrorMsg('Please enter a valid positive quantity.');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    const signedQty = movType === 'out'
      ? -qty
      : movType === 'adjust'
      ? qty - selectedItem.current_quantity
      : qty;

    const dbMovType = movType === 'in' ? 'in' : movType === 'out' ? 'out' : 'adjustment';

    try {
      const res = await fetch('/api/stock/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stock_item_id: selectedItem.id,
          movement_type: dbMovType,
          quantity: signedQty,
          notes: movNotes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.error?.includes('Insufficient') || data.available !== undefined) {
          setErrorMsg(`Insufficient stock. Available: ${data.available ?? selectedItem.current_quantity} ${selectedItem.unit}. Cannot remove ${qty}.`);
        } else {
          setErrorMsg(data.error || 'Stock movement error');
        }
        setSaving(false);
        return;
      }

      setSuccessMsg(`Stock ${movType === 'in' ? 'added' : movType === 'out' ? 'removed' : 'adjusted'} successfully.`);
      setTimeout(() => setSuccessMsg(''), 3000);
      setModal(null);
      setSaving(false);
      await Promise.all([loadStock(page, search, filterCategory), loadSummary()]);
    } catch {
      setErrorMsg('Network error');
      setSaving(false);
    }
  }

  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager'] as any[]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">{t('stock.title')}</h1>
            <p className="text-sm text-[#64648B]">
              {totalCount} items &middot; Value: {totalValue.toLocaleString()} MAD
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => router.push('/stock/import')}>
              <Upload size={14} /> Import
            </Button>
            <Button variant="secondary" size="sm" onClick={() => router.push('/stock/materials')}>
              <DollarSign size={14} /> Material Prices
            </Button>
            {canManage && (
              <Button onClick={openAdd}><Plus size={18} /> {t('stock.add_item')}</Button>
            )}
          </div>
        </div>

        {/* Feedback banners */}
        {successMsg && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm">
            <CheckCircle size={16} /> {successMsg}
          </div>
        )}
        {errorMsg && !modal && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            <AlertCircle size={16} /> {errorMsg}
            <button onClick={() => setErrorMsg('')} className="ml-auto"><X size={14} /></button>
          </div>
        )}

        {lowStockCount > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 flex items-center gap-3">
            <AlertTriangle size={20} className="text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 font-medium">{lowStockCount} {t('stock.low_stock')}</p>
          </div>
        )}

        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64648B]" />
            <input
              type="text"
              placeholder={`${t('common.search')}...`}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20 focus:border-[#C9956B]"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3.5 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white"
          >
            <option value="all">All Categories</option>
            <option value="panels">Panels</option>
            <option value="edge_banding">Edge Banding</option>
            <option value="hardware">Hardware</option>
            <option value="consumables">Consumables</option>
            <option value="workshop_supplies">Workshop Supplies</option>
            <option value="packaging">Packaging</option>
            <option value="outsourced_components">Outsourced</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Desktop table */}
        <Card className="hidden md:block">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="space-y-3 p-4">
                {[...Array(5)].map((_, i) => <div key={i} className="h-12 skeleton rounded-lg" />)}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F0EDE8]">
                    <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Item</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Category</th>
                    <th className="text-right px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Qty</th>
                    <th className="text-right px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Min</th>
                    <th className="text-right px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Cost/Unit</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Status</th>
                    {canManage && <th className="text-right px-5 py-3.5 font-semibold text-[#64648B] text-xs uppercase tracking-wider">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EDE8]">
                  {items.map(item => {
                    const isLow = item.current_quantity <= item.minimum_quantity;
                    return (
                      <tr key={item.id} className="hover:bg-[#FAFAF8]">
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-[#1a1a2e]">{item.name}</p>
                          {item.sku && <p className="text-xs text-[#64648B] font-mono">{item.sku}</p>}
                          <div className="flex items-center gap-2 flex-wrap">
                            {(item as any).subcategory && <span className="text-[10px] text-[#64648B]">{(item as any).subcategory}</span>}
                            {(item as any).thickness_mm && <span className="text-[10px] text-[#64648B] font-mono">{(item as any).thickness_mm}mm</span>}
                            {item.location && <span className="text-[10px] text-[#64648B]">{item.location}</span>}
                          </div>
                        </td>
                        <td className="px-5 py-3.5"><StatusBadge status={item.category} /></td>
                        <td className={`px-5 py-3.5 text-right font-semibold ${isLow ? 'text-red-600' : 'text-[#1a1a2e]'}`}>
                          {item.current_quantity} {item.unit}
                        </td>
                        <td className="px-5 py-3.5 text-right text-[#64648B]">{item.minimum_quantity}</td>
                        <td className="px-5 py-3.5 text-right text-[#64648B]">{item.cost_per_unit ? `${item.cost_per_unit} MAD` : '-'}</td>
                        <td className="px-5 py-3.5">
                          {isLow ? (
                            <span className="inline-flex items-center gap-1 text-xs text-red-600 font-semibold">
                              <AlertTriangle size={12} /> Low
                            </span>
                          ) : (
                            <span className="text-xs text-emerald-600 font-semibold">OK</span>
                          )}
                        </td>
                        {canManage && (
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openMovement(item)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg" title="Stock movement">
                                <ArrowUpRight size={14} />
                              </button>
                              <button onClick={() => openHistory(item)} className="p-1.5 text-[#64648B] hover:bg-gray-100 rounded-lg" title="History">
                                <History size={14} />
                              </button>
                              <button onClick={() => openEdit(item)} className="p-1.5 text-[#64648B] hover:bg-gray-100 rounded-lg" title="Edit">
                                <Edit2 size={14} />
                              </button>
                              <button onClick={() => deleteItem(item)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg" title="Deactivate">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {/* Mobile cards */}
        {loading ? (
          <div className="md:hidden space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 skeleton rounded-2xl" />)}
          </div>
        ) : (
          <div className="md:hidden space-y-2.5">
            {items.map(item => {
              const isLow = item.current_quantity <= item.minimum_quantity;
              return (
                <Card key={item.id} className={`p-4 ${isLow ? 'border-red-200 bg-red-50/30' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#1a1a2e]">{item.name}</p>
                      {item.sku && <p className="text-[11px] text-[#64648B] font-mono">{item.sku}</p>}
                      <div className="flex items-center gap-2 mt-1.5">
                        <StatusBadge status={item.category} />
                        {item.location && <span className="text-[10px] text-[#64648B]">{item.location}</span>}
                      </div>
                    </div>
                    <div className="text-right ml-3">
                      <p className={`text-lg font-bold ${isLow ? 'text-red-600' : 'text-[#1a1a2e]'}`}>{item.current_quantity}</p>
                      <p className="text-[11px] text-[#64648B]">{item.unit} (min: {item.minimum_quantity})</p>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-[#F0EDE8]">
                      <button onClick={() => openMovement(item)} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg">
                        <ArrowUpRight size={12} /> Movement
                      </button>
                      <button onClick={() => openHistory(item)} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-[#64648B] bg-gray-100 rounded-lg">
                        <History size={12} /> History
                      </button>
                      <button onClick={() => openEdit(item)} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-[#64648B] bg-gray-100 rounded-lg">
                        <Edit2 size={12} /> Edit
                      </button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <div className="text-center py-12">
            <Package size={48} className="mx-auto text-[#E8E5E0] mb-3" />
            <p className="text-[#64648B]">{search ? 'No items match your search' : 'No items found'}</p>
          </div>
        )}

        {/* ── Pagination bar ─────────────────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-1 py-2">
            <p className="text-sm text-[#64648B]">
              Page <span className="font-semibold text-[#1a1a2e]">{page + 1}</span> of{' '}
              <span className="font-semibold text-[#1a1a2e]">{totalPages}</span>
              <span className="hidden sm:inline"> · {totalCount} items</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page === 0 || loading}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-[#F5F3F0] text-[#1a1a2e] hover:bg-[#EDE9E3] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages - 1 || loading}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-[#F5F3F0] text-[#1a1a2e] hover:bg-[#EDE9E3] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ADD / EDIT MODAL */}
        {(modal === 'add' || modal === 'edit') && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setModal(null)}>
            <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-[#F0EDE8]">
                <h2 className="font-bold text-[#1a1a2e]">{modal === 'edit' ? 'Edit Item' : t('stock.add_item')}</h2>
                <button onClick={() => setModal(null)}><X size={20} className="text-gray-400" /></button>
              </div>
              <div className="p-4 space-y-3">
                {errorMsg && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
                    <AlertCircle size={13} /> {errorMsg}
                  </div>
                )}
                <Input label={`${t('common.name')} *`} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Melamine White 18mm" />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="SKU" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="e.g. PNL-001" />
                  <div>
                    <label className="block text-sm font-medium text-[#1a1a2e] mb-1.5">Category</label>
                    <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-[#E8E5E0] rounded-xl text-sm">
                      <option value="panels">Panels</option>
                      <option value="edge_banding">Edge Banding</option>
                      <option value="hardware">Hardware</option>
                      <option value="consumables">Consumables</option>
                      <option value="workshop_supplies">Workshop Supplies</option>
                      <option value="packaging">Packaging</option>
                      <option value="outsourced_components">Outsourced Components</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Input label="Unit" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="pcs" />
                  <Input label="Min Qty" type="number" min="0" value={form.minimum_quantity} onChange={e => setForm({ ...form, minimum_quantity: e.target.value })} />
                  <Input label="Cost/Unit (MAD)" type="number" min="0" step="0.01" value={form.cost_per_unit} onChange={e => setForm({ ...form, cost_per_unit: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Subcategory" value={form.subcategory} onChange={e => setForm({ ...form, subcategory: e.target.value })} placeholder="e.g. MDF, PVC" />
                  <Input label="Thickness (mm)" type="number" min="0" value={form.thickness_mm} onChange={e => setForm({ ...form, thickness_mm: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Input label="Length (mm)" type="number" min="0" value={form.sheet_length_mm} onChange={e => setForm({ ...form, sheet_length_mm: e.target.value })} placeholder="2800" />
                  <Input label="Width (mm)" type="number" min="0" value={form.sheet_width_mm} onChange={e => setForm({ ...form, sheet_width_mm: e.target.value })} placeholder="2070" />
                  <Input label="Roll (m)" type="number" min="0" value={form.roll_length_m} onChange={e => setForm({ ...form, roll_length_m: e.target.value })} />
                </div>
                <Input label="Location" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Shelf A3" />
                <Textarea label={t('common.notes')} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
                <div className="flex gap-2 pt-2">
                  <Button variant="secondary" className="flex-1" onClick={() => setModal(null)}>{t('common.cancel')}</Button>
                  <Button className="flex-1" onClick={saveItem} disabled={saving || !form.name.trim()}>
                    {saving ? 'Saving...' : modal === 'edit' ? t('common.save') : t('stock.add_item')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MOVEMENT MODAL */}
        {modal === 'movement' && selectedItem && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setModal(null)}>
            <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-[#F0EDE8]">
                <div>
                  <h2 className="font-bold text-[#1a1a2e]">Stock Movement</h2>
                  <p className="text-xs text-[#64648B]">{selectedItem.name} — Current: {selectedItem.current_quantity} {selectedItem.unit}</p>
                </div>
                <button onClick={() => setModal(null)}><X size={20} className="text-gray-400" /></button>
              </div>
              <div className="p-4 space-y-3">
                {errorMsg && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
                    <AlertCircle size={13} /> {errorMsg}
                  </div>
                )}
                <div className="flex gap-2">
                  {(['in', 'out', 'adjust'] as const).map(mt => (
                    <button key={mt} onClick={() => setMovType(mt)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        movType === mt
                          ? mt === 'in' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                            : mt === 'out' ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                            : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                          : 'bg-gray-100 text-[#64648B]'
                      }`}>
                      {mt === 'in' ? t('stock.stock_in') : mt === 'out' ? t('stock.stock_out') : 'Set to'}
                    </button>
                  ))}
                </div>
                <Input
                  label={movType === 'adjust' ? `Target quantity (currently ${selectedItem.current_quantity})` : `Quantity (${selectedItem.unit})`}
                  type="number" min="0" value={movQty}
                  onChange={e => setMovQty(e.target.value)}
                  placeholder={movType === 'adjust' ? String(selectedItem.current_quantity) : '0'}
                />
                {movType === 'out' && movQty && parseFloat(movQty) > selectedItem.current_quantity && (
                  <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                    <AlertTriangle size={12} /> Quantity exceeds current stock ({selectedItem.current_quantity})
                  </p>
                )}
                <Textarea label={t('common.notes')} value={movNotes} onChange={e => setMovNotes(e.target.value)} rows={2} placeholder="Reason for movement..." />
                <div className="flex gap-2 pt-2">
                  <Button variant="secondary" className="flex-1" onClick={() => setModal(null)}>{t('common.cancel')}</Button>
                  <Button className="flex-1" onClick={saveMovement} disabled={saving || !movQty || (movType === 'adjust' ? parseFloat(movQty) < 0 : parseFloat(movQty) <= 0)}>
                    {saving ? 'Saving...' : movType === 'in' ? 'Add Stock' : movType === 'out' ? 'Remove Stock' : 'Set Quantity'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* HISTORY MODAL */}
        {modal === 'history' && selectedItem && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setModal(null)}>
            <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-[#F0EDE8] sticky top-0 bg-white">
                <div>
                  <h2 className="font-bold text-[#1a1a2e]">{t('stock.movement_history')}</h2>
                  <p className="text-xs text-[#64648B]">{selectedItem.name}</p>
                </div>
                <button onClick={() => setModal(null)}><X size={20} className="text-gray-400" /></button>
              </div>
              <div className="p-4">
                {movements.length === 0 ? (
                  <p className="text-center text-[#64648B] py-8">No movements recorded</p>
                ) : (
                  <div className="space-y-2">
                    {movements.map(m => (
                      <div key={m.id} className="flex items-center gap-3 p-3 bg-[#FAFAF8] rounded-xl">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          m.quantity > 0 ? 'bg-emerald-50' : 'bg-red-50'
                        }`}>
                          {m.quantity >= 0
                            ? <ArrowDownRight size={14} className="text-emerald-600" />
                            : <ArrowUpRight size={14} className="text-red-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#1a1a2e]">
                            {m.quantity >= 0 ? '+' : ''}{m.quantity} {selectedItem.unit}
                            {m.movement_type && <span className="text-xs text-gray-400 ml-2">({m.movement_type})</span>}
                          </p>
                          {m.notes && <p className="text-xs text-[#64648B] truncate">{m.notes}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-[#64648B]">{new Date(m.created_at).toLocaleDateString('fr-FR')}</p>
                          {m.creator && <p className="text-[10px] text-[#64648B]">{m.creator.full_name}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
