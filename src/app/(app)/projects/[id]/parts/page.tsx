'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { RoleGuard } from '@/components/auth/RoleGuard';
import ProjectMfgTabs from '@/components/projects/ProjectMfgTabs';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormModal from '@/components/ui/FormModal';
import { calculateAndStoreCosts, generateAutoQuote } from '@/lib/services/cost-engine.service';
import { enforceThickness } from '@/lib/services/kitchen-engine.service';
import {
  ArrowLeft, Plus, Trash2, Pencil, Copy, Download,
  Layers, CheckCircle, Scissors, Box, RotateCcw,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProjectPart {
  id: string;
  project_id: string;
  project_module_id: string | null;
  part_code: string | null;
  part_name: string;
  material_type: string;
  thickness_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
  edge_top: boolean;
  edge_bottom: boolean;
  edge_left: boolean;
  edge_right: boolean;
  grain_direction: 'length' | 'width' | 'none';
  is_cut: boolean;
  is_edged: boolean;
  is_assembled: boolean;
  notes: string | null;
  created_at: string;
}

interface Project {
  id: string;
  reference_code: string;
  client_name: string;
}

const MATERIAL_OPTIONS = [
  { value: 'mdf_18', label: 'MDF 18mm' },
  { value: 'mdf_16', label: 'MDF 16mm' },
  { value: 'mdf_22', label: 'MDF 22mm' },
  { value: 'melamine_white', label: 'Melamine White 18mm' },
  { value: 'melamine_oak', label: 'Melamine Oak 18mm' },
  { value: 'melamine_walnut', label: 'Melamine Walnut 18mm' },
  { value: 'melamine_anthracite', label: 'Melamine Anthracite 18mm' },
  { value: 'plywood_18', label: 'Plywood 18mm' },
  { value: 'back_hdf_3', label: 'HDF 3mm (Back Panel)' },
  { value: 'back_hdf_5', label: 'HDF 5mm (Back Panel)' },
  { value: 'solid_wood', label: 'Solid Wood' },
];

const GRAIN_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'length', label: '↕ Length' },
  { value: 'width', label: '↔ Width' },
];

const EMPTY_PART = {
  part_name: '',
  material_type: 'mdf_18',
  thickness_mm: '18',
  width_mm: '',
  height_mm: '',
  quantity: '1',
  edge_top: false,
  edge_bottom: false,
  edge_left: false,
  edge_right: false,
  grain_direction: 'none' as 'length' | 'width' | 'none',
  notes: '',
};

// ── Component ──────────────────────────────────────────────────────────────────

function PartsPage() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const { profile } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [parts, setParts] = useState<ProjectPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingPart, setEditingPart] = useState<ProjectPart | null>(null);
  const [form, setForm] = useState(EMPTY_PART);
  const [saving, setSaving] = useState(false);
  const [bomGenerating, setBomGenerating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [projRes, partsRes] = await Promise.all([
      supabase.from('projects').select('id, reference_code, client_name').eq('id', id).single(),
      supabase.from('project_parts').select('*').eq('project_id', id).order('created_at'),
    ]);
    if (projRes.data) setProject(projRes.data);
    if (partsRes.data) setParts(partsRes.data);
    if (partsRes.error) setError(partsRes.error.message);
    setLoading(false);
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function openAdd() {
    setEditingPart(null);
    setForm(EMPTY_PART);
    setShowModal(true);
  }

  function openEdit(part: ProjectPart) {
    setEditingPart(part);
    setForm({
      part_name: part.part_name,
      material_type: part.material_type,
      thickness_mm: String(part.thickness_mm),
      width_mm: String(part.width_mm),
      height_mm: String(part.height_mm),
      quantity: String(part.quantity),
      edge_top: part.edge_top,
      edge_bottom: part.edge_bottom,
      edge_left: part.edge_left,
      edge_right: part.edge_right,
      grain_direction: part.grain_direction,
      notes: part.notes || '',
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.part_name.trim() || !form.width_mm || !form.height_mm) return;
    setSaving(true);
    setError(null);

    const rawThickness = parseFloat(form.thickness_mm) || 18;
    const payload = {
      project_id: id as string,
      part_name: form.part_name.trim(),
      material_type: form.material_type,
      thickness_mm: enforceThickness(form.material_type, rawThickness),
      width_mm: parseFloat(form.width_mm),
      height_mm: parseFloat(form.height_mm),
      quantity: parseInt(form.quantity) || 1,
      edge_top: form.edge_top,
      edge_bottom: form.edge_bottom,
      edge_left: form.edge_left,
      edge_right: form.edge_right,
      grain_direction: form.grain_direction,
      notes: form.notes || null,
    };

    if (editingPart) {
      const { error: err } = await supabase
        .from('project_parts')
        .update(payload)
        .eq('id', editingPart.id);
      if (err) setError(err.message);
      else setSuccess('Part updated');
    } else {
      const { error: err } = await supabase
        .from('project_parts')
        .insert(payload);
      if (err) setError(err.message);
      else setSuccess('Part added');
    }

    setSaving(false);
    setShowModal(false);
    loadData();
  }

  async function handleDelete(partId: string) {
    if (!confirm('Delete this part?')) return;
    const { error: err } = await supabase.from('project_parts').delete().eq('id', partId);
    if (err) setError(err.message);
    else { setSuccess('Part deleted'); loadData(); }
  }

  async function handleDuplicate(part: ProjectPart) {
    const { id: _id, created_at: _ca, ...rest } = part;
    const { error: err } = await supabase.from('project_parts').insert({
      ...rest,
      part_name: part.part_name + ' (copy)',
    });
    if (err) setError(err.message);
    else { setSuccess('Part duplicated'); loadData(); }
  }

  async function handleGenerateBOM() {
    setBomGenerating(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('generate_project_bom', { p_project_id: id });
      if (err) throw new Error(err.message);

      // Calculate costs + auto-generate quote
      let costMsg = '';
      const costResult = await calculateAndStoreCosts(id as string, profile?.id || '');
      if (costResult.success && costResult.data) {
        costMsg = ` Cost: ${costResult.data.total_cost} MAD.`;
        const quoteResult = await generateAutoQuote(id as string, profile?.id || '', costResult.data);
        if (quoteResult.success && quoteResult.data) {
          costMsg += ` Draft quote v${quoteResult.data.version} created.`;
        }
      }

      setSuccess(`BOM generated: ${data?.materials || 0} material groups, ${data?.panels || 0} panels.${costMsg}`);
    } catch (e: any) {
      setError('BOM generation failed: ' + e.message);
    }
    setBomGenerating(false);
  }

  function exportCSV() {
    if (parts.length === 0) return;
    const headers = ['Name', 'Material', 'Thickness', 'Width', 'Height', 'Qty', 'Edge T', 'Edge B', 'Edge L', 'Edge R', 'Grain', 'Area m²'];
    const rows = parts.map(p => [
      p.part_name, p.material_type, p.thickness_mm,
      p.width_mm, p.height_mm, p.quantity,
      p.edge_top ? '1' : '0', p.edge_bottom ? '1' : '0',
      p.edge_left ? '1' : '0', p.edge_right ? '1' : '0',
      p.grain_direction,
      ((p.width_mm * p.height_mm * p.quantity) / 1_000_000).toFixed(3),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parts_${project?.reference_code || 'export'}.csv`;
    a.click();
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  const totalPanels = parts.reduce((s, p) => s + p.quantity, 0);
  const totalArea = parts.reduce((s, p) => s + (p.width_mm * p.height_mm * p.quantity) / 1_000_000, 0);
  const totalEdge = parts.reduce((s, p) => {
    const edges =
      (p.edge_top ? p.width_mm : 0) +
      (p.edge_bottom ? p.width_mm : 0) +
      (p.edge_left ? p.height_mm : 0) +
      (p.edge_right ? p.height_mm : 0);
    return s + edges * p.quantity;
  }, 0);
  const cutCount = parts.filter(p => p.is_cut).length;
  const materialGroups = [...new Set(parts.map(p => p.material_type))];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(`/projects/${id}`)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <p className="text-xs text-gray-400 font-mono">{project?.reference_code}</p>
          <h1 className="text-xl font-bold text-[#1a1a2e]">Parts List</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={exportCSV} disabled={parts.length === 0}>
            <Download size={14} /> CSV
          </Button>
          <Button variant="primary" size="sm" onClick={openAdd}>
            <Plus size={14} /> Add Part
          </Button>
        </div>
      </div>

      <ProjectMfgTabs projectId={String(id)} />

      <ErrorBanner message={error} type="error" onDismiss={() => setError(null)} />
      <ErrorBanner message={success} type="success" onDismiss={() => setSuccess(null)} autoDismiss={3000} />

      {/* Stats Row */}
      {!loading && parts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 text-center">
            <p className="text-2xl font-bold text-blue-700">{totalPanels}</p>
            <p className="text-xs text-blue-500">Total Panels</p>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-2xl p-3 text-center">
            <p className="text-2xl font-bold text-green-700">{totalArea.toFixed(2)}</p>
            <p className="text-xs text-green-500">Area (m²)</p>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-3 text-center">
            <p className="text-2xl font-bold text-orange-700">{(totalEdge / 1000).toFixed(1)}</p>
            <p className="text-xs text-orange-500">Edge Band (m)</p>
          </div>
          <div className="bg-purple-50 border border-purple-100 rounded-2xl p-3 text-center">
            <p className="text-2xl font-bold text-purple-700">{materialGroups.length}</p>
            <p className="text-xs text-purple-500">Materials</p>
          </div>
        </div>
      )}

      {/* BOM Generation */}
      {!loading && parts.length > 0 && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-2xl p-3">
          <div>
            <p className="text-sm font-semibold text-amber-800">Generate Bill of Materials</p>
            <p className="text-xs text-amber-600">Aggregate parts into material requirements for production</p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleGenerateBOM}
            loading={bomGenerating}
            className="!bg-amber-600 hover:!bg-amber-700"
          >
            <Layers size={14} /> Generate BOM
          </Button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#C9956B] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!loading && parts.length === 0 && (
        <Card>
          <CardContent>
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Box size={32} className="text-gray-300" />
              </div>
              <p className="text-[#1a1a2e] font-semibold mb-1">No parts defined</p>
              <p className="text-sm text-gray-500 mb-4">Add cabinet parts with dimensions, material, and edge banding</p>
              <Button onClick={openAdd}><Plus size={14} /> Add First Part</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Parts Table */}
      {!loading && parts.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3">Part Name</th>
                    <th className="px-3 py-3">Material</th>
                    <th className="px-3 py-3 text-right">W (mm)</th>
                    <th className="px-3 py-3 text-right">H (mm)</th>
                    <th className="px-3 py-3 text-right">Qty</th>
                    <th className="px-3 py-3 text-center">Edges</th>
                    <th className="px-3 py-3 text-center">Grain</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((part) => (
                    <tr key={part.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#1a1a2e]">{part.part_name}</p>
                        {part.part_code && <p className="text-xs text-gray-400">{part.part_code}</p>}
                      </td>
                      <td className="px-3 py-3 text-gray-600">
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded-lg">
                          {MATERIAL_OPTIONS.find(m => m.value === part.material_type)?.label || part.material_type}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-gray-700">{part.width_mm}</td>
                      <td className="px-3 py-3 text-right font-mono text-gray-700">{part.height_mm}</td>
                      <td className="px-3 py-3 text-right font-semibold">{part.quantity}</td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex gap-0.5 justify-center">
                          {['T', 'B', 'L', 'R'].map((e, i) => {
                            const has = [part.edge_top, part.edge_bottom, part.edge_left, part.edge_right][i];
                            return (
                              <span key={e} className={`w-5 h-5 text-[10px] font-bold rounded flex items-center justify-center ${
                                has ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-300'
                              }`}>{e}</span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-gray-500">
                        {part.grain_direction === 'length' ? '↕' : part.grain_direction === 'width' ? '↔' : '—'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex gap-1 justify-center">
                          {part.is_cut && <Scissors size={12} className="text-green-500" />}
                          {part.is_edged && <span className="text-green-500 text-xs font-bold">⬡</span>}
                          {part.is_assembled && <CheckCircle size={12} className="text-green-500" />}
                          {!part.is_cut && !part.is_edged && !part.is_assembled && (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => openEdit(part)} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-500" title="Edit">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => handleDuplicate(part)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400" title="Duplicate">
                            <Copy size={14} />
                          </button>
                          <button onClick={() => handleDelete(part.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-400" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Modal */}
      <FormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingPart ? 'Edit Part' : 'Add Part'}
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              loading={saving}
              disabled={!form.part_name.trim() || !form.width_mm || !form.height_mm}
            >
              {editingPart ? 'Save' : 'Add Part'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Part Name *</label>
            <input
              value={form.part_name}
              onChange={e => setForm(f => ({ ...f, part_name: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              placeholder="e.g. Side Left, Top Panel, Shelf..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Material</label>
            <select
              value={form.material_type}
              onChange={e => setForm(f => ({ ...f, material_type: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
            >
              {MATERIAL_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Width (mm) *</label>
              <input
                type="number"
                value={form.width_mm}
                onChange={e => setForm(f => ({ ...f, width_mm: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                placeholder="600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Height (mm) *</label>
              <input
                type="number"
                value={form.height_mm}
                onChange={e => setForm(f => ({ ...f, height_mm: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                placeholder="720"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Thickness</label>
              <input
                type="number"
                value={form.thickness_mm}
                onChange={e => setForm(f => ({ ...f, thickness_mm: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                placeholder="18"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
              <input
                type="number"
                min="1"
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Grain Direction</label>
              <select
                value={form.grain_direction}
                onChange={e => setForm(f => ({ ...f, grain_direction: e.target.value as any }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
              >
                {GRAIN_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
          </div>

          {/* Edge Banding */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Edge Banding</label>
            <div className="flex gap-3">
              {([
                { key: 'edge_top', label: 'Top' },
                { key: 'edge_bottom', label: 'Bottom' },
                { key: 'edge_left', label: 'Left' },
                { key: 'edge_right', label: 'Right' },
              ] as const).map(edge => (
                <label key={edge.key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(form as any)[edge.key]}
                    onChange={e => setForm(f => ({ ...f, [edge.key]: e.target.checked }))}
                    className="accent-[#C9956B] w-4 h-4"
                  />
                  {edge.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              placeholder="Optional notes..."
            />
          </div>
        </div>
      </FormModal>
    </div>
  );
}

export default function PartsPageWrapper() {
  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker'] as any[]}>
      <PartsPage />
    </RoleGuard>
  );
}
