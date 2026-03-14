'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { RoleGuard } from '@/components/auth/RoleGuard';
import {
  Upload, FileSpreadsheet, ChevronRight, CheckCircle,
  AlertTriangle, X, ArrowLeft, RefreshCw, Info,
} from 'lucide-react';
import * as XLSX from 'xlsx';

// ── DB field catalogue ────────────────────────────────────────────────────────
const DB_FIELDS = [
  { key: 'name',             label: 'Name *',          numeric: false },
  { key: 'sku',              label: 'SKU',             numeric: false },
  { key: 'category',         label: 'Category',        numeric: false },
  { key: 'subcategory',      label: 'Subcategory',     numeric: false },
  { key: 'unit',             label: 'Unit',            numeric: false },
  { key: 'thickness_mm',     label: 'Thickness (mm)',  numeric: true  },
  { key: 'sheet_length_mm',  label: 'Length (mm)',     numeric: true  },
  { key: 'sheet_width_mm',   label: 'Width (mm)',      numeric: true  },
  { key: 'roll_length_m',    label: 'Roll length (m)', numeric: true  },
  { key: 'current_quantity', label: 'Quantity',        numeric: true  },
  { key: 'minimum_quantity', label: 'Min qty',         numeric: true  },
  { key: 'cost_per_unit',    label: 'Cost/unit (MAD)', numeric: true  },
  { key: 'location',         label: 'Location',        numeric: false },
  { key: '_skip',            label: '— Skip column —', numeric: false },
] as const;

type DbFieldKey = (typeof DB_FIELDS)[number]['key'];

const NUMERIC_FIELDS = DB_FIELDS.filter(f => f.numeric).map(f => f.key);

const CATEGORY_VALUES = [
  'panels', 'edge_banding', 'hardware', 'consumables',
  'workshop_supplies', 'packaging', 'outsourced_components', 'other',
];

// ── Smart auto-mapper ─────────────────────────────────────────────────────────
function autoMap(header: string): DbFieldKey {
  const h = header.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  if (/^(name|nom|article|materiau|material|designation|libelle)/.test(h)) return 'name';
  if (/^(sku|ref|reference|code|codearticle|id)/.test(h)) return 'sku';
  if (/^(cat|categorie|category|famille|type)/.test(h)) return 'category';
  if (/^(sous|sub|subcategory|souscategorie|famille2)/.test(h)) return 'subcategory';
  if (/^(unit|unite|uom|mesure)/.test(h)) return 'unit';
  if (/^(thick|epaisseur|ep|thickness|ep_mm)/.test(h)) return 'thickness_mm';
  if (/^(len|long|longueur|length)/.test(h)) return 'sheet_length_mm';
  if (/^(wid|larg|largeur|width)/.test(h)) return 'sheet_width_mm';
  if (/^(roll|roul|roule|rouleau)/.test(h)) return 'roll_length_m';
  if (/^(qty|qte|quant|stock|quantite|encours)/.test(h)) return 'current_quantity';
  if (/^(min|minim|seuil|threshold|alertestock)/.test(h)) return 'minimum_quantity';
  if (/^(cost|cout|prix|price|pu|coutunit|prixunit)/.test(h)) return 'cost_per_unit';
  if (/^(loc|emplace|location|place|zone|depot|entrepot)/.test(h)) return 'location';
  return '_skip';
}

// ── Row type ──────────────────────────────────────────────────────────────────
interface ImportRow {
  _idx:        number;
  _status:     'valid' | 'warning' | 'error';
  _errors:     string[];
  _warnings:   string[];
  _isNew:      boolean;
  _existingId?: string;
  [key: string]: any;
}

type Step = 'upload' | 'preview' | 'done';

// ── Page ─────────────────────────────────────────────────────────────────────
export default function StockImportPage() {
  const { profile } = useAuth();
  const router  = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step,      setStep]      = useState<Step>('upload');
  const [dragging,  setDragging]  = useState(false);
  const [fileName,  setFileName]  = useState('');

  // Raw data kept so we can remap columns on the fly
  const [rawRows,   setRawRows]   = useState<any[][]>([]);
  const [headers,   setHeaders]   = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, DbFieldKey>>({});
  const [rows,      setRows]      = useState<ImportRow[]>([]);
  const [existingMap, setExistingMap] = useState<Record<string, string>>({}); // lc name → id

  const [saving,     setSaving]     = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [errCount,   setErrCount]   = useState(0);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  async function fetchExisting() {
    const { data } = await supabase
      .from('stock_items').select('id, name').eq('is_active', true);
    const m: Record<string, string> = {};
    (data || []).forEach(r => { m[r.name.toLowerCase().trim()] = r.id; });
    return m;
  }

  function deriveRows(
    raw: any[][],
    hdrs: string[],
    cmap: Record<string, DbFieldKey>,
    existing: Record<string, string>,
  ): ImportRow[] {
    return raw
      .filter(r => r.some(c => String(c ?? '').trim() !== ''))
      .map((r, idx) => {
        const row: ImportRow = {
          _idx: idx, _status: 'valid', _errors: [], _warnings: [],
          _isNew: true,
        };

        // Map cells → DB fields
        hdrs.forEach((h, i) => {
          const field = cmap[h];
          if (!field || field === '_skip') return;
          let val: any = r[i];
          if (val === undefined || val === null || String(val).trim() === '') {
            row[field] = undefined;
            return;
          }
          if (NUMERIC_FIELDS.includes(field as any)) {
            val = parseFloat(String(val).replace(',', '.'));
            row[field] = isNaN(val) ? null : val;
          } else {
            row[field] = String(val).trim();
          }
        });

        // Defaults
        if (!row.category) row.category = 'panels';
        if (!row.unit)     row.unit     = 'pcs';
        if (row.current_quantity == null) row.current_quantity = 0;
        if (row.minimum_quantity  == null) row.minimum_quantity  = 0;

        // Normalize category
        if (row.category) {
          const normalized = String(row.category).toLowerCase().replace(/[-\s]/g, '_');
          if (CATEGORY_VALUES.includes(normalized)) {
            row.category = normalized;
          } else {
            const found = CATEGORY_VALUES.find(c =>
              c.startsWith(normalized.substring(0, 4)));
            if (found) row.category = found;
            else row._warnings.push(`Unknown category "${row.category}" → "other"`);
            if (found === undefined) row.category = 'other';
          }
        }

        // Validate
        if (!row.name || String(row.name).trim() === '') {
          row._errors.push('Name is required');
        } else {
          const key = String(row.name).toLowerCase().trim();
          if (existing[key]) {
            row._isNew      = false;
            row._existingId = existing[key];
            row._warnings.push('Existing item — will UPDATE');
          }
        }
        if ((row.current_quantity ?? 0) < 0)
          row._errors.push('Quantity cannot be negative');
        if (row.cost_per_unit != null && row.cost_per_unit < 0)
          row._errors.push('Cost cannot be negative');

        row._status = row._errors.length   > 0 ? 'error'
                    : row._warnings.length > 0 ? 'warning'
                    : 'valid';
        return row;
      });
  }

  // ── File parse ───────────────────────────────────────────────────────────────
  async function parseFile(file: File) {
    const existing = await fetchExisting();
    setExistingMap(existing);

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const all: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (all.length < 2) return;

    const hdrs  = (all[0] as any[]).map(h => String(h ?? '').trim());
    const raw   = all.slice(1);
    const cmap  = Object.fromEntries(hdrs.map(h => [h, autoMap(h)])) as Record<string, DbFieldKey>;

    setFileName(file.name);
    setHeaders(hdrs);
    setRawRows(raw);
    setColumnMap(cmap);
    setRows(deriveRows(raw, hdrs, cmap, existing));
    setStep('preview');
  }

  // ── Column map change → rebuild rows ────────────────────────────────────────
  function changeColumnMap(header: string, field: DbFieldKey) {
    const newMap = { ...columnMap, [header]: field };
    setColumnMap(newMap);
    setRows(deriveRows(rawRows, headers, newMap, existingMap));
  }

  // ── Inline cell edit ────────────────────────────────────────────────────────
  function editCell(rowIdx: number, field: string, raw: string) {
    setRows(prev => prev.map((r, i) => {
      if (i !== rowIdx) return r;
      let val: any = raw;
      if (NUMERIC_FIELDS.includes(field as any)) {
        val = raw === '' ? null : parseFloat(raw.replace(',', '.'));
        if (!isNaN(val as number) && (val as number) < 0) val = 0;
      }
      const updated = { ...r, [field]: val };
      // Re-validate
      updated._errors = [];
      updated._warnings = [];
      if (!updated.name || String(updated.name).trim() === '') {
        updated._errors.push('Name is required');
      } else {
        const key = String(updated.name).toLowerCase().trim();
        if (existingMap[key]) {
          updated._isNew      = false;
          updated._existingId = existingMap[key];
          updated._warnings.push('Existing item — will UPDATE');
        } else {
          updated._isNew      = true;
          updated._existingId = undefined;
        }
      }
      if ((updated.current_quantity ?? 0) < 0)
        updated._errors.push('Quantity cannot be negative');
      updated._status = updated._errors.length   > 0 ? 'error'
                      : updated._warnings.length > 0 ? 'warning'
                      : 'valid';
      return updated;
    }));
  }

  function removeRow(rowIdx: number) {
    setRows(prev => prev.filter((_, i) => i !== rowIdx));
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function saveImport() {
    setSaving(true);
    let ok = 0, err = 0;
    const validRows = rows.filter(r => r._status !== 'error');

    for (const row of validRows) {
      try {
        const payload: Record<string, any> = {
          name:              String(row.name).trim(),
          sku:               row.sku        || null,
          category:          row.category   || 'panels',
          subcategory:       row.subcategory || null,
          unit:              row.unit        || 'pcs',
          thickness_mm:      row.thickness_mm     ?? null,
          sheet_length_mm:   row.sheet_length_mm  ?? null,
          sheet_width_mm:    row.sheet_width_mm   ?? null,
          roll_length_m:     row.roll_length_m    ?? null,
          current_quantity:  row.current_quantity ?? 0,
          minimum_quantity:  row.minimum_quantity ?? 0,
          low_stock_threshold: row.minimum_quantity ?? 0,
          cost_per_unit:     row.cost_per_unit    ?? null,
          location:          row.location || null,
          is_active:         true,
        };

        if (row._isNew) {
          const { data: newItem, error } = await supabase
            .from('stock_items')
            .insert(payload)
            .select('id')
            .single();
          if (error) throw error;

          // Record opening stock movement
          if ((payload.current_quantity as number) > 0 && newItem) {
            await supabase.from('stock_movements').insert({
              stock_item_id:  newItem.id,
              movement_type:  'purchase_in',
              quantity:       payload.current_quantity,
              unit:           payload.unit,
              notes:          `Opening stock — imported from ${fileName}`,
              created_by:     profile?.id,
            });
          }
        } else if (row._existingId) {
          const { error } = await supabase
            .from('stock_items')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('id', row._existingId);
          if (error) throw error;
        }

        ok++;
      } catch (e) {
        console.error('Import row error:', e);
        err++;
      }
    }

    setSavedCount(ok);
    setErrCount(err);
    setSaving(false);
    setStep('done');
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────────
  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [existingMap]);

  // ── Derived counts ───────────────────────────────────────────────────────────
  const validCount    = rows.filter(r => r._status !== 'error').length;
  const errRowCount   = rows.filter(r => r._status === 'error').length;
  const newCount      = rows.filter(r => r._isNew  && r._status !== 'error').length;
  const updateCount   = rows.filter(r => !r._isNew && r._status !== 'error').length;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager'] as any[]}>
      <div className="space-y-4 max-w-5xl mx-auto pb-24">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/stock')}
            className="p-2 hover:bg-[#F0EDE8] rounded-xl transition-colors"
          >
            <ArrowLeft size={18} className="text-[#64648B]" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">Import Materials</h1>
            <p className="text-sm text-[#64648B]">Excel / CSV → Preview → Edit → Confirm → Save</p>
          </div>
        </div>

        {/* Step pill bar */}
        <div className="flex items-center gap-2 text-sm select-none">
          {(['upload', 'preview', 'done'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <ChevronRight size={14} className="text-[#C4C4D4]" />}
              <span className={`px-3 py-1 rounded-full font-medium transition-colors ${
                step === s
                  ? 'bg-[#C9956B] text-white'
                  : (step === 'done' || (step === 'preview' && s === 'upload'))
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-[#F0EDE8] text-[#64648B]'
              }`}>
                {s === 'upload' ? '1. Upload' : s === 'preview' ? '2. Preview & Edit' : '3. Done'}
              </span>
            </div>
          ))}
        </div>

        {/* ── STEP 1: Upload ──────────────────────────────────────────────────── */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div
              onDragOver={(e: React.DragEvent) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
            <Card
              className={`border-2 border-dashed transition-all cursor-pointer select-none ${
                dragging ? 'border-[#C9956B] bg-orange-50/70' : 'border-[#E8E5E0] hover:border-[#C9956B]/50'
              }`}
              onClick={() => fileRef.current?.click()}
            >
              <div className="p-12 flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 bg-[#F5F2EE] rounded-2xl flex items-center justify-center">
                  <FileSpreadsheet size={32} className="text-[#C9956B]" />
                </div>
                <div>
                  <p className="font-semibold text-[#1a1a2e] text-lg">Drop your Excel file here</p>
                  <p className="text-sm text-[#64648B] mt-1">
                    or click to browse — supports .xlsx, .xls, .csv
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}>
                  <Upload size={14} /> Browse file
                </Button>
              </div>
            </Card>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => e.target.files?.[0] && parseFile(e.target.files[0])}
            />

            {/* Column guide */}
            <Card>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Info size={14} className="text-[#64648B]" />
                  <p className="text-sm font-semibold text-[#1a1a2e]">
                    Expected column names (auto-detected from first row)
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
                  {[
                    { col: 'Name / Nom / Désignation',  field: 'Item name (required)' },
                    { col: 'SKU / Ref / Code',          field: 'Reference code' },
                    { col: 'Category / Catégorie',      field: 'panels, edge_banding, hardware…' },
                    { col: 'Unit / Unité',              field: 'panel, meter, piece, kg…' },
                    { col: 'Épaisseur / Thickness',     field: 'mm (number)' },
                    { col: 'Longueur / Length',         field: 'mm (number)' },
                    { col: 'Largeur / Width',           field: 'mm (number)' },
                    { col: 'Qty / Quantité / Stock',    field: 'Current stock count' },
                    { col: 'Min / Minimum / Seuil',     field: 'Low stock threshold' },
                    { col: 'Prix / Cost / Coût',        field: 'Cost per unit in MAD' },
                    { col: 'Location / Emplacement',    field: 'e.g. Shelf A3' },
                  ].map(({ col, field }) => (
                    <div key={col} className="bg-[#FAFAF8] rounded-lg p-2">
                      <p className="font-mono text-[#C9956B] font-medium text-[10px] leading-tight">{col}</p>
                      <p className="text-[#64648B] text-[10px] mt-0.5">{field}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ── STEP 2: Preview & Edit ──────────────────────────────────────────── */}
        {step === 'preview' && (
          <div className="space-y-4">

            {/* Column mapping */}
            <Card>
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-[#1a1a2e]">Column Mapping</p>
                    <p className="text-xs text-[#64648B]">{fileName} — adjust if auto-detection is wrong</p>
                  </div>
                  <button
                    onClick={() => { setStep('upload'); setRows([]); setRawRows([]); }}
                    className="text-xs text-[#64648B] hover:text-[#1a1a2e] flex items-center gap-1.5 px-3 py-1.5 bg-[#F0EDE8] rounded-lg"
                  >
                    <RefreshCw size={12} /> Change file
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {headers.map(h => (
                    <div key={h} className="flex items-center gap-1.5 bg-[#F5F2EE] rounded-lg p-2 text-xs">
                      <span className="font-mono text-[#64648B]">{h}</span>
                      <span className="text-[#C4C4D4] mx-0.5">→</span>
                      <select
                        value={columnMap[h] || '_skip'}
                        onChange={e => changeColumnMap(h, e.target.value as DbFieldKey)}
                        className="border-0 bg-transparent text-[#1a1a2e] font-medium focus:outline-none cursor-pointer text-xs"
                      >
                        {DB_FIELDS.map(f => (
                          <option key={f.key} value={f.key}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Summary chips */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Total rows',  value: rows.length,  color: 'text-[#1a1a2e]'    },
                { label: 'Valid',       value: validCount,   color: 'text-emerald-600'   },
                { label: 'New items',   value: newCount,     color: 'text-blue-600'      },
                { label: 'Updates',     value: updateCount,  color: 'text-amber-600'     },
              ].map(({ label, value, color }) => (
                <Card key={label} className="p-3 text-center">
                  <p className={`text-2xl font-black ${color}`}>{value}</p>
                  <p className="text-[10px] text-[#64648B] font-medium uppercase tracking-wide mt-0.5">{label}</p>
                </Card>
              ))}
            </div>

            {/* Error summary */}
            {errRowCount > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 flex items-center gap-3">
                <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-700">
                  <strong>{errRowCount} row{errRowCount > 1 ? 's' : ''}</strong> with errors will be skipped. Fix them inline or remove them.
                </p>
              </div>
            )}

            {/* Preview table */}
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#F0EDE8] bg-[#FAFAF8]">
                      <th className="px-3 py-2.5 text-left font-semibold text-[#64648B] uppercase tracking-wide w-20">Status</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-[#64648B] uppercase tracking-wide min-w-[140px]">Name *</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-[#64648B] uppercase tracking-wide">Category</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-[#64648B] uppercase tracking-wide w-20">Unit</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-[#64648B] uppercase tracking-wide w-20">Thick.</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-[#64648B] uppercase tracking-wide w-16">Qty</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-[#64648B] uppercase tracking-wide w-24">Cost</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-[#64648B] uppercase tracking-wide">Location</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0EDE8]">
                    {rows.map((row, i) => (
                      <tr
                        key={i}
                        className={
                          row._status === 'error'   ? 'bg-red-50/70' :
                          row._status === 'warning' ? 'bg-amber-50/50' : ''
                        }
                      >
                        {/* Status */}
                        <td className="px-3 py-2">
                          {row._status === 'error' ? (
                            <div className="space-y-0.5">
                              <AlertTriangle size={13} className="text-red-500" />
                              {row._errors.map((e, ei) => (
                                <p key={ei} className="text-red-600 text-[10px] leading-tight">{e}</p>
                              ))}
                            </div>
                          ) : (
                            <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              row._isNew
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {row._isNew ? 'NEW' : 'UPDATE'}
                            </span>
                          )}
                        </td>

                        {/* Name */}
                        <td className="px-3 py-2">
                          <input
                            value={row.name || ''}
                            onChange={e => editCell(i, 'name', e.target.value)}
                            className={`border rounded-lg px-1.5 py-1 text-xs w-full bg-white ${
                              row._status === 'error' && !row.name
                                ? 'border-red-300 ring-1 ring-red-200'
                                : 'border-[#E8E5E0]'
                            }`}
                          />
                        </td>

                        {/* Category */}
                        <td className="px-3 py-2">
                          <select
                            value={row.category || 'panels'}
                            onChange={e => editCell(i, 'category', e.target.value)}
                            className="border border-[#E8E5E0] rounded-lg px-1.5 py-1 text-xs bg-white w-full"
                          >
                            {CATEGORY_VALUES.map(c => (
                              <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                            ))}
                          </select>
                        </td>

                        {/* Unit */}
                        <td className="px-3 py-2">
                          <input
                            value={row.unit || ''}
                            onChange={e => editCell(i, 'unit', e.target.value)}
                            className="border border-[#E8E5E0] rounded-lg px-1.5 py-1 text-xs w-full bg-white"
                            placeholder="pcs"
                          />
                        </td>

                        {/* Thickness */}
                        <td className="px-3 py-2">
                          <input
                            value={row.thickness_mm ?? ''}
                            onChange={e => editCell(i, 'thickness_mm', e.target.value)}
                            type="number" step="0.1"
                            className="border border-[#E8E5E0] rounded-lg px-1.5 py-1 text-xs w-16 text-right bg-white"
                            placeholder="—"
                          />
                        </td>

                        {/* Qty */}
                        <td className="px-3 py-2">
                          <input
                            value={row.current_quantity ?? 0}
                            onChange={e => editCell(i, 'current_quantity', e.target.value)}
                            type="number" min="0"
                            className="border border-[#E8E5E0] rounded-lg px-1.5 py-1 text-xs w-14 text-right bg-white"
                          />
                        </td>

                        {/* Cost */}
                        <td className="px-3 py-2">
                          <input
                            value={row.cost_per_unit ?? ''}
                            onChange={e => editCell(i, 'cost_per_unit', e.target.value)}
                            type="number" min="0" step="0.01"
                            className="border border-[#E8E5E0] rounded-lg px-1.5 py-1 text-xs w-20 text-right bg-white"
                            placeholder="0.00"
                          />
                        </td>

                        {/* Location */}
                        <td className="px-3 py-2">
                          <input
                            value={row.location || ''}
                            onChange={e => editCell(i, 'location', e.target.value)}
                            className="border border-[#E8E5E0] rounded-lg px-1.5 py-1 text-xs w-full bg-white"
                            placeholder="—"
                          />
                        </td>

                        {/* Remove */}
                        <td className="px-2 py-2">
                          <button
                            onClick={() => removeRow(i)}
                            className="p-1 hover:bg-red-50 rounded-lg text-red-400 transition-colors"
                            title="Remove row"
                          >
                            <X size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {rows.length === 0 && (
                  <div className="py-12 text-center">
                    <p className="text-[#64648B] text-sm">No rows detected — check your file</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Sticky action bar */}
            <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-2xl md:ml-auto
                            flex items-center justify-between gap-4 p-4 bg-[#1a1a2e] rounded-2xl shadow-2xl z-40">
              <div className="text-white min-w-0">
                <p className="font-semibold text-sm truncate">
                  {validCount} item{validCount !== 1 ? 's' : ''} ready to import
                </p>
                {errRowCount > 0 && (
                  <p className="text-red-300 text-xs">{errRowCount} row{errRowCount > 1 ? 's' : ''} with errors will be skipped</p>
                )}
              </div>
              <Button
                onClick={saveImport}
                loading={saving}
                disabled={validCount === 0 || saving}
                className="whitespace-nowrap bg-[#C9956B] hover:bg-[#b8845a] text-white flex-shrink-0"
              >
                <CheckCircle size={15} />
                Confirm & Import
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Done ────────────────────────────────────────────────────── */}
        {step === 'done' && (
          <Card>
            <div className="p-12 flex flex-col items-center gap-6 text-center">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center">
                <CheckCircle size={40} className="text-emerald-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[#1a1a2e]">Import Complete!</h2>
                <p className="text-[#64648B] mt-2">
                  <span className="text-emerald-600 font-bold">{savedCount}</span> item{savedCount !== 1 ? 's' : ''} saved successfully
                  {errCount > 0 && (
                    <span className="text-red-500"> · {errCount} failed (check console)</span>
                  )}
                </p>
              </div>
              <div className="flex gap-3 flex-wrap justify-center">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStep('upload');
                    setRows([]);
                    setRawRows([]);
                    setFileName('');
                  }}
                >
                  Import another file
                </Button>
                <Button onClick={() => router.push('/stock')}>
                  View stock →
                </Button>
              </div>
            </div>
          </Card>
        )}

      </div>
    </RoleGuard>
  );
}
