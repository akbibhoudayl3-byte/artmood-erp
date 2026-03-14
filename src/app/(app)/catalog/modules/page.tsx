'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { RoleGuard } from '@/components/auth/RoleGuard'
import {
  Plus, ChevronDown, ChevronUp, Edit2, Copy, Power, Package,
  Wrench, AlertCircle, CheckCircle, X, Loader2, Layers
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductModule {
  id: string
  code: string
  name: string
  category: string
  width_mm: number | null
  height_mm: number | null
  depth_mm: number | null
  description: string | null
  is_active: boolean
  module_parts: { count: number }[]
  module_hardware: { count: number }[]
}

interface ModulePart {
  id: string
  module_id: string
  code: string
  name: string
  part_type: string
  width_formula: string | null
  height_formula: string | null
  quantity_formula: string | null
  material_type: string | null
  thickness_mm: number | null
  edge_top: boolean
  edge_bottom: boolean
  edge_left: boolean
  edge_right: boolean
  grain_direction: string | null
  sort_order: number
}

interface ModuleHardware {
  id: string
  module_id: string
  hardware_type: string
  name: string
  quantity_formula: string | null
  unit: string | null
  stock_item_id: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  base_cabinet: 'Caissons bas',
  wall_cabinet: 'Caissons hauts',
  tall_cabinet: 'Colonnes',
  drawer: 'Tiroirs',
  wardrobe: 'Armoires',
  shelf: 'Étagères',
}

const CATEGORY_COLORS: Record<string, string> = {
  base_cabinet: 'bg-blue-100 text-blue-800',
  wall_cabinet: 'bg-purple-100 text-purple-800',
  tall_cabinet: 'bg-indigo-100 text-indigo-800',
  drawer: 'bg-orange-100 text-orange-800',
  wardrobe: 'bg-pink-100 text-pink-800',
  shelf: 'bg-green-100 text-green-800',
}

const MATERIAL_OPTIONS = [
  { value: 'mdf_18', label: 'MDF 18mm' },
  { value: 'mdf_16', label: 'MDF 16mm' },
  { value: 'mdf_12', label: 'MDF 12mm' },
  { value: 'stratifie_18', label: 'Stratifié 18mm' },
  { value: 'stratifie_16', label: 'Stratifié 16mm' },
  { value: 'back_hdf_5', label: 'Fond HDF 5mm' },
  { value: 'back_mdf_8', label: 'Fond MDF 8mm' },
]

const PART_TYPE_OPTIONS = [
  { value: 'panel', label: 'Panneau' },
  { value: 'hardware', label: 'Quincaillerie' },
  { value: 'solid_wood', label: 'Bois massif' },
]

const GRAIN_OPTIONS = [
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'vertical', label: 'Vertical' },
  { value: 'none', label: 'Sans fil' },
]

// ─── Module Form Modal ────────────────────────────────────────────────────────

interface ModuleFormData {
  code: string
  name: string
  category: string
  width_mm: string
  height_mm: string
  depth_mm: string
  description: string
}

const emptyModuleForm: ModuleFormData = {
  code: '', name: '', category: 'base_cabinet',
  width_mm: '', height_mm: '', depth_mm: '', description: '',
}

interface ModuleModalProps {
  open: boolean
  initial: ModuleFormData
  editing: ProductModule | null
  onClose: () => void
  onSave: (data: ModuleFormData) => Promise<void>
  saving: boolean
}

function ModuleModal({ open, initial, editing, onClose, onSave, saving }: ModuleModalProps) {
  const [form, setForm] = useState<ModuleFormData>(initial)

  useEffect(() => { setForm(initial) }, [initial, open])

  if (!open) return null

  const set = (k: keyof ModuleFormData, v: string) => setForm(prev => ({ ...prev, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {editing ? 'Modifier le module' : 'Nouveau module'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.code}
                onChange={e => set('code', e.target.value.toUpperCase())}
                placeholder="CB-60"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie *</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.category}
                onChange={e => set('category', e.target.value)}
              >
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Caisson bas 60cm"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Largeur mm</label>
              <input
                type="number"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.width_mm}
                onChange={e => set('width_mm', e.target.value)}
                placeholder="600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hauteur mm</label>
              <input
                type="number"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.height_mm}
                onChange={e => set('height_mm', e.target.value)}
                placeholder="720"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Profondeur mm</label>
              <input
                type="number"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.depth_mm}
                onChange={e => set('depth_mm', e.target.value)}
                placeholder="580"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Description optionnelle..."
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.code.trim() || !form.name.trim()}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {editing ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Part Form Modal ──────────────────────────────────────────────────────────

interface PartFormData {
  code: string
  name: string
  part_type: string
  width_formula: string
  height_formula: string
  quantity_formula: string
  material_type: string
  thickness_mm: string
  edge_top: boolean
  edge_bottom: boolean
  edge_left: boolean
  edge_right: boolean
  grain_direction: string
}

const emptyPartForm: PartFormData = {
  code: '', name: '', part_type: 'panel',
  width_formula: '{W}', height_formula: '{H}', quantity_formula: '1',
  material_type: 'mdf_18', thickness_mm: '18',
  edge_top: false, edge_bottom: false, edge_left: false, edge_right: false,
  grain_direction: 'vertical',
}

interface PartModalProps {
  open: boolean
  moduleId: string
  onClose: () => void
  onSaved: () => void
}

function PartModal({ open, moduleId, onClose, onSaved }: PartModalProps) {
  const supabase = createClient()
  const [form, setForm] = useState<PartFormData>(emptyPartForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (open) { setForm(emptyPartForm); setError(null) } }, [open])

  if (!open) return null

  const set = (k: keyof PartFormData, v: string | boolean) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError('Code et nom sont obligatoires.')
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('module_parts').insert({
      module_id: moduleId,
      code: form.code.trim(),
      name: form.name.trim(),
      part_type: form.part_type,
      width_formula: form.width_formula.trim() || null,
      height_formula: form.height_formula.trim() || null,
      quantity_formula: form.quantity_formula.trim() || null,
      material_type: form.material_type || null,
      thickness_mm: form.thickness_mm ? parseFloat(form.thickness_mm) : null,
      edge_top: form.edge_top,
      edge_bottom: form.edge_bottom,
      edge_left: form.edge_left,
      edge_right: form.edge_right,
      grain_direction: form.grain_direction || null,
      sort_order: 999,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-lg font-semibold text-gray-900">Ajouter une pièce</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              <AlertCircle size={16} /> {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.code}
                onChange={e => set('code', e.target.value)}
                placeholder="FOND"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.part_type}
                onChange={e => set('part_type', e.target.value)}
              >
                {PART_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Fond de caisson"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Formule Largeur *</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.width_formula}
                onChange={e => set('width_formula', e.target.value)}
                placeholder="{W}-4"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Formule Hauteur *</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.height_formula}
                onChange={e => set('height_formula', e.target.value)}
                placeholder="{H}"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Formule Qté *</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.quantity_formula}
                onChange={e => set('quantity_formula', e.target.value)}
                placeholder="1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Matériau</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.material_type}
                onChange={e => set('material_type', e.target.value)}
              >
                {MATERIAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Épaisseur mm</label>
              <input
                type="number"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.thickness_mm}
                onChange={e => set('thickness_mm', e.target.value)}
                placeholder="18"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Chants</label>
            <div className="flex gap-4">
              {(['edge_top', 'edge_bottom', 'edge_left', 'edge_right'] as const).map((edge, i) => {
                const labels = ['Haut', 'Bas', 'Gauche', 'Droite']
                return (
                  <label key={edge} className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={form[edge]}
                      onChange={e => set(edge, e.target.checked)}
                    />
                    {labels[i]}
                  </label>
                )
              })}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fil de bois</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.grain_direction || 'none'}
              onChange={e => set('grain_direction', e.target.value)}
            >
              {GRAIN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 pb-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Ajouter
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page Content ────────────────────────────────────────────────────────

function CatalogModulesContent() {
  const supabase = createClient()
  const { profile } = useAuth()

  const [modules, setModules] = useState<ProductModule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('all')

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedParts, setExpandedParts] = useState<ModulePart[]>([])
  const [expandedHardware, setExpandedHardware] = useState<ModuleHardware[]>([])
  const [expandLoading, setExpandLoading] = useState(false)

  // Module modal
  const [moduleModalOpen, setModuleModalOpen] = useState(false)
  const [editingModule, setEditingModule] = useState<ProductModule | null>(null)
  const [moduleFormInitial, setModuleFormInitial] = useState<ModuleFormData>(emptyModuleForm)
  const [moduleSaving, setModuleSaving] = useState(false)

  // Part modal
  const [partModalOpen, setPartModalOpen] = useState(false)
  const [partModalModuleId, setPartModalModuleId] = useState<string>('')

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [duplicating, setDuplicating] = useState<string | null>(null)
  const [deactivating, setDeactivating] = useState<string | null>(null)

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3500)
  }

  const fetchModules = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('product_modules')
      .select('*, module_parts(count), module_hardware(count)')
      .eq('is_active', true)
      .order('category')
      .order('code')
    if (err) { setError(err.message) } else { setModules((data as ProductModule[]) || []) }
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchModules() }, [fetchModules])

  const fetchExpanded = async (moduleId: string) => {
    setExpandLoading(true)
    const [partsRes, hwRes] = await Promise.all([
      supabase.from('module_parts').select('*').eq('module_id', moduleId).order('sort_order'),
      supabase.from('module_hardware').select('*').eq('module_id', moduleId),
    ])
    setExpandedParts((partsRes.data as ModulePart[]) || [])
    setExpandedHardware((hwRes.data as ModuleHardware[]) || [])
    setExpandLoading(false)
  }

  const handleExpand = async (moduleId: string) => {
    if (expandedId === moduleId) {
      setExpandedId(null)
      return
    }
    setExpandedId(moduleId)
    await fetchExpanded(moduleId)
  }

  const openNewModule = () => {
    setEditingModule(null)
    setModuleFormInitial(emptyModuleForm)
    setModuleModalOpen(true)
  }

  const openEditModule = (m: ProductModule) => {
    setEditingModule(m)
    setModuleFormInitial({
      code: m.code,
      name: m.name,
      category: m.category,
      width_mm: m.width_mm != null ? String(m.width_mm) : '',
      height_mm: m.height_mm != null ? String(m.height_mm) : '',
      depth_mm: m.depth_mm != null ? String(m.depth_mm) : '',
      description: m.description || '',
    })
    setModuleModalOpen(true)
  }

  const handleSaveModule = async (form: ModuleFormData) => {
    setModuleSaving(true)
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      category: form.category,
      width_mm: form.width_mm ? parseFloat(form.width_mm) : null,
      height_mm: form.height_mm ? parseFloat(form.height_mm) : null,
      depth_mm: form.depth_mm ? parseFloat(form.depth_mm) : null,
      description: form.description.trim() || null,
    }
    let err: { message: string } | null = null
    if (editingModule) {
      const res = await supabase.from('product_modules').update(payload).eq('id', editingModule.id)
      err = res.error
    } else {
      const res = await supabase.from('product_modules').insert({ ...payload, is_active: true })
      err = res.error
    }
    setModuleSaving(false)
    if (err) { showToast('error', err.message); return }
    showToast('success', editingModule ? 'Module modifié.' : 'Module créé.')
    setModuleModalOpen(false)
    fetchModules()
  }

  const handleDuplicate = async (m: ProductModule) => {
    setDuplicating(m.id)
    const newCode = m.code + '_COPY'
    const { data: newModule, error: mErr } = await supabase
      .from('product_modules')
      .insert({
        code: newCode,
        name: m.name + ' (copie)',
        category: m.category,
        width_mm: m.width_mm,
        height_mm: m.height_mm,
        depth_mm: m.depth_mm,
        description: m.description,
        is_active: true,
      })
      .select()
      .single()
    if (mErr || !newModule) {
      showToast('error', mErr?.message || 'Erreur lors de la duplication.')
      setDuplicating(null)
      return
    }
    const [partsRes, hwRes] = await Promise.all([
      supabase.from('module_parts').select('*').eq('module_id', m.id),
      supabase.from('module_hardware').select('*').eq('module_id', m.id),
    ])
    if (partsRes.data && partsRes.data.length > 0) {
      const newParts = partsRes.data.map(({ id, module_id, ...rest }: any) => ({
        ...rest,
        module_id: newModule.id,
      }))
      await supabase.from('module_parts').insert(newParts)
    }
    if (hwRes.data && hwRes.data.length > 0) {
      const newHw = hwRes.data.map(({ id, module_id, ...rest }: any) => ({
        ...rest,
        module_id: newModule.id,
      }))
      await supabase.from('module_hardware').insert(newHw)
    }
    setDuplicating(null)
    showToast('success', `Module dupliqué : ${newCode}`)
    fetchModules()
  }

  const handleDeactivate = async (m: ProductModule) => {
    if (!confirm(`Désactiver le module "${m.name}" ? Cette action est réversible.`)) return
    setDeactivating(m.id)
    const { error: err } = await supabase.from('product_modules').update({ is_active: false }).eq('id', m.id)
    setDeactivating(null)
    if (err) { showToast('error', err.message); return }
    showToast('success', 'Module désactivé.')
    if (expandedId === m.id) setExpandedId(null)
    fetchModules()
  }

  const filtered = activeCategory === 'all'
    ? modules
    : modules.filter(m => m.category === activeCategory)

  const partsCount = (m: ProductModule) => m.module_parts?.[0]?.count ?? 0
  const hwCount = (m: ProductModule) => m.module_hardware?.[0]?.count ?? 0

  const materialLabel = (mat: string | null) =>
    MATERIAL_OPTIONS.find(o => o.value === mat)?.label ?? mat ?? '—'

  const grainLabel = (g: string | null) =>
    GRAIN_OPTIONS.find(o => o.value === g)?.label ?? '—'

  const edgeSummary = (p: ModulePart) => {
    const edges: string[] = []
    if (p.edge_top) edges.push('H')
    if (p.edge_bottom) edges.push('B')
    if (p.edge_left) edges.push('G')
    if (p.edge_right) edges.push('D')
    return edges.length > 0 ? edges.join(' ') : '—'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Modals */}
      <ModuleModal
        open={moduleModalOpen}
        initial={moduleFormInitial}
        editing={editingModule}
        onClose={() => setModuleModalOpen(false)}
        onSave={handleSaveModule}
        saving={moduleSaving}
      />
      <PartModal
        open={partModalOpen}
        moduleId={partModalModuleId}
        onClose={() => setPartModalOpen(false)}
        onSaved={() => {
          if (expandedId === partModalModuleId) fetchExpanded(partModalModuleId)
          fetchModules()
        }}
      />

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Catalogue de Modules</h1>
            <p className="text-sm text-gray-500 mt-1">Bibliothèque de caissons et éléments standard</p>
          </div>
          <button
            onClick={openNewModule}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={16} />
            Nouveau module
          </button>
        </div>

        {/* Category filter tabs */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {[
            { value: 'all', label: 'Tous' },
            ...Object.entries(CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l })),
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveCategory(tab.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeCategory === tab.value
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 mb-6 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <div className="h-5 bg-gray-200 rounded w-20" />
                      <div className="h-5 bg-gray-200 rounded w-28" />
                    </div>
                    <div className="h-5 bg-gray-200 rounded w-48" />
                    <div className="h-4 bg-gray-100 rounded w-64" />
                  </div>
                  <div className="flex gap-2">
                    <div className="h-8 w-24 bg-gray-200 rounded-lg" />
                    <div className="h-8 w-8 bg-gray-200 rounded-lg" />
                    <div className="h-8 w-8 bg-gray-200 rounded-lg" />
                    <div className="h-8 w-8 bg-gray-200 rounded-lg" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-24 text-gray-400">
            <Layers size={56} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium text-gray-500">Aucun module dans cette catégorie</p>
            <p className="text-sm mt-1">Créez votre premier module avec le bouton ci-dessus.</p>
          </div>
        )}

        {/* Module list */}
        {!loading && filtered.length > 0 && (
          <div className="space-y-4">
            {filtered.map(m => (
              <div key={m.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Module card row */}
                <div className="p-5 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <span className="font-mono text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        {m.code}
                      </span>
                      <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${CATEGORY_COLORS[m.category] || 'bg-gray-100 text-gray-700'}`}>
                        {CATEGORY_LABELS[m.category] || m.category}
                      </span>
                    </div>
                    <div className="font-semibold text-gray-900 text-base">{m.name}</div>
                    {m.description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{m.description}</p>
                    )}
                    <div className="flex items-center gap-5 mt-2 text-xs text-gray-500 flex-wrap">
                      {(m.width_mm != null || m.height_mm != null || m.depth_mm != null) && (
                        <span className="font-mono">
                          {m.width_mm ?? '?'} × {m.height_mm ?? '?'} × {m.depth_mm ?? '?'} mm
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Package size={12} /> {partsCount(m)} pièce{partsCount(m) !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <Wrench size={12} /> {hwCount(m)} accessoire{hwCount(m) !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    <button
                      onClick={() => handleExpand(m.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
                    >
                      {expandedId === m.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      Voir détails
                    </button>
                    <button
                      onClick={() => openEditModule(m)}
                      title="Modifier"
                      className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDuplicate(m)}
                      disabled={duplicating === m.id}
                      title="Dupliquer"
                      className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-green-600 hover:border-green-300 transition-colors disabled:opacity-50"
                    >
                      {duplicating === m.id ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
                    </button>
                    <button
                      onClick={() => handleDeactivate(m)}
                      disabled={deactivating === m.id}
                      title="Désactiver"
                      className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-300 transition-colors disabled:opacity-50"
                    >
                      {deactivating === m.id ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                    </button>
                  </div>
                </div>

                {/* Accordion detail panel */}
                {expandedId === m.id && (
                  <div className="border-t border-gray-100 bg-gray-50/70 p-6 space-y-6">
                    {expandLoading ? (
                      <div className="flex items-center justify-center py-10 text-gray-400">
                        <Loader2 size={20} className="animate-spin mr-2" />
                        Chargement des données...
                      </div>
                    ) : (
                      <>
                        {/* Parts table */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                              <Package size={15} /> Pièces ({expandedParts.length})
                            </h3>
                            <button
                              onClick={() => { setPartModalModuleId(m.id); setPartModalOpen(true) }}
                              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                            >
                              <Plus size={13} /> Ajouter pièce
                            </button>
                          </div>
                          {expandedParts.length === 0 ? (
                            <p className="text-xs text-gray-400 italic py-4 text-center">Aucune pièce définie pour ce module.</p>
                          ) : (
                            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                              <table className="w-full text-xs min-w-[700px]">
                                <thead>
                                  <tr className="bg-gray-50 border-b border-gray-200">
                                    {['Code', 'Nom', 'Type', 'Formule L', 'Formule H', 'Qté', 'Matériau', 'Ép.', 'Chants', 'Fil'].map(h => (
                                      <th key={h} className="text-left px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {expandedParts.map(p => (
                                    <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                                      <td className="px-3 py-2 font-mono text-gray-600">{p.code}</td>
                                      <td className="px-3 py-2 text-gray-800 font-medium">{p.name}</td>
                                      <td className="px-3 py-2 text-gray-500">
                                        {PART_TYPE_OPTIONS.find(o => o.value === p.part_type)?.label ?? p.part_type}
                                      </td>
                                      <td className="px-3 py-2 font-mono text-blue-600">{p.width_formula ?? '—'}</td>
                                      <td className="px-3 py-2 font-mono text-blue-600">{p.height_formula ?? '—'}</td>
                                      <td className="px-3 py-2 font-mono text-gray-600">{p.quantity_formula ?? '—'}</td>
                                      <td className="px-3 py-2 text-gray-600">{materialLabel(p.material_type)}</td>
                                      <td className="px-3 py-2 text-gray-500">{p.thickness_mm ?? '—'}</td>
                                      <td className="px-3 py-2 font-mono text-gray-500">{edgeSummary(p)}</td>
                                      <td className="px-3 py-2 text-gray-500">{grainLabel(p.grain_direction)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* Hardware table */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                              <Wrench size={15} /> Accessoires ({expandedHardware.length})
                            </h3>
                            <button
                              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                              onClick={() => showToast('error', 'Formulaire accessoires à venir.')}
                            >
                              <Plus size={13} /> Ajouter accessoire
                            </button>
                          </div>
                          {expandedHardware.length === 0 ? (
                            <p className="text-xs text-gray-400 italic py-4 text-center">Aucun accessoire défini pour ce module.</p>
                          ) : (
                            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-gray-50 border-b border-gray-200">
                                    {['Type', 'Désignation', 'Qté', 'Unité'].map(h => (
                                      <th key={h} className="text-left px-3 py-2.5 font-semibold text-gray-500">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {expandedHardware.map(hw => (
                                    <tr key={hw.id} className="hover:bg-gray-50/50 transition-colors">
                                      <td className="px-3 py-2 text-gray-600">{hw.hardware_type}</td>
                                      <td className="px-3 py-2 text-gray-800 font-medium">{hw.name}</td>
                                      <td className="px-3 py-2 font-mono text-gray-600">{hw.quantity_formula ?? '—'}</td>
                                      <td className="px-3 py-2 text-gray-500">{hw.unit ?? '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CatalogModulesPage() {
  return (
    <RoleGuard allowedRoles={['ceo', 'designer', 'workshop_manager']}>
      <CatalogModulesContent />
    </RoleGuard>
  )
}
