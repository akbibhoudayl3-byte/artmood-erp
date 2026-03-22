'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { MATERIAL_THICKNESS_MAP, enforceThickness, safeEval } from '@/lib/services/kitchen-engine.service'
import { RoleGuard } from '@/components/auth/RoleGuard'
import ProjectMfgTabs from '@/components/projects/ProjectMfgTabs';
import {
  ArrowLeft, ClipboardList, Wrench, Plus, Minus, X,
  CheckCircle, AlertCircle, Clock, Loader2, Search,
  ChevronDown, ChevronRight, RefreshCw, Package
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Project {
  id: string
  reference_code: string
  client_name: string
}

interface ProductModuleCatalog {
  id: string
  code: string
  name: string
  category: string
  width_mm: number | null
  height_mm: number | null
  depth_mm: number | null
}

interface ProjectModule {
  id: string
  project_id: string
  module_id: string
  quantity: number
  custom_width_mm: number | null
  custom_height_mm: number | null
  custom_depth_mm: number | null
  finish: string | null
  position_label: string | null
  bom_generated: boolean
  product_modules: ProductModuleCatalog
}

interface BomSummaryRow {
  material_type: string
  net_area_m2: number
  panels_with_waste: number | null
  edge_banding_ml: number
  status: string
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

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  base_cabinet: 'Caissons bas',
  wall_cabinet: 'Caissons hauts',
  tall_cabinet: 'Colonnes',
  drawer: 'Tiroirs',
  wardrobe: 'Armoires',
  shelf: 'Étagères',
}

const MATERIAL_LABELS: Record<string, string> = {
  mdf_18: 'MDF 18mm',
  mdf_16: 'MDF 16mm',
  mdf_12: 'MDF 12mm',
  stratifie_18: 'Stratifié 18mm',
  stratifie_16: 'Stratifié 16mm',
  back_hdf_5: 'Fond HDF 5mm',
  back_mdf_8: 'Fond MDF 8mm',
}

const PANEL_SIZES: Record<string, [number, number]> = {
  mdf_18: [1220, 2800],
  mdf_16: [1220, 2800],
  mdf_12: [1220, 2800],
  stratifie_18: [1830, 2550],
  stratifie_16: [1830, 2550],
  back_hdf_5: [1220, 2440],
  back_mdf_8: [1220, 2440],
}

const CATEGORY_COLORS: Record<string, string> = {
  base_cabinet: 'bg-blue-100 text-blue-700',
  wall_cabinet: 'bg-purple-100 text-purple-700',
  tall_cabinet: 'bg-indigo-100 text-indigo-700',
  drawer: 'bg-orange-100 text-orange-700',
  wardrobe: 'bg-pink-100 text-pink-700',
  shelf: 'bg-green-100 text-green-700',
}

// safeEval imported from kitchen-engine.service.ts (CSP-safe recursive descent parser)

// ─── Module Config Popover ────────────────────────────────────────────────────

interface ConfigPopoverProps {
  module: ProductModuleCatalog
  onAdd: (config: {
    quantity: number
    custom_width_mm: number | null
    custom_height_mm: number | null
    custom_depth_mm: number | null
    finish: string
    position_label: string
  }) => void
  onClose: () => void
}

function ConfigPopover({ module, onAdd, onClose }: ConfigPopoverProps) {
  const [quantity, setQuantity] = useState(1)
  const [width, setWidth] = useState(module.width_mm != null ? String(module.width_mm) : '')
  const [height, setHeight] = useState(module.height_mm != null ? String(module.height_mm) : '')
  const [depth, setDepth] = useState(module.depth_mm != null ? String(module.depth_mm) : '')
  const [finish, setFinish] = useState('')
  const [positionLabel, setPositionLabel] = useState('')

  const handleAdd = () => {
    onAdd({
      quantity,
      custom_width_mm: width ? parseFloat(width) : null,
      custom_height_mm: height ? parseFloat(height) : null,
      custom_depth_mm: depth ? parseFloat(depth) : null,
      finish,
      position_label: positionLabel,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <p className="font-semibold text-gray-900 text-sm">{module.name}</p>
            <p className="font-mono text-xs text-gray-500 mt-0.5">{module.code}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Quantité</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Minus size={14} />
              </button>
              <span className="w-10 text-center font-semibold text-gray-900">{quantity}</span>
              <button
                onClick={() => setQuantity(q => q + 1)}
                className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Larg. mm</label>
              <input
                type="number"
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={width}
                onChange={e => setWidth(e.target.value)}
                placeholder={module.width_mm != null ? String(module.width_mm) : '—'}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Haut. mm</label>
              <input
                type="number"
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={height}
                onChange={e => setHeight(e.target.value)}
                placeholder={module.height_mm != null ? String(module.height_mm) : '—'}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Prof. mm</label>
              <input
                type="number"
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={depth}
                onChange={e => setDepth(e.target.value)}
                placeholder={module.depth_mm != null ? String(module.depth_mm) : '—'}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Finition</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={finish}
              onChange={e => setFinish(e.target.value)}
              placeholder="Ex: Blanc mat, Chêne..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Position / Étiquette</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={positionLabel}
              onChange={e => setPositionLabel(e.target.value)}
              placeholder="Ex: Zone cuisine gauche..."
            />
          </div>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleAdd}
            className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Ajouter au projet
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page Content ────────────────────────────────────────────────────────

function ProjectModulesContent() {
  const supabase = createClient()
  const { profile } = useAuth()
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [catalog, setCatalog] = useState<ProductModuleCatalog[]>([])
  const [assigned, setAssigned] = useState<ProjectModule[]>([])
  const [bomSummary, setBomSummary] = useState<BomSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogCategory, setCatalogCategory] = useState('all')
  const [configTarget, setConfigTarget] = useState<ProductModuleCatalog | null>(null)

  const [generatingBom, setGeneratingBom] = useState(false)
  const [bomProgress, setBomProgress] = useState('')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [removingId, setRemovingId] = useState<string | null>(null)
  const [savingModuleId, setSavingModuleId] = useState<string | null>(null)

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchAll = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    const [projRes, catalogRes, assignedRes, bomRes] = await Promise.all([
      supabase.from('projects').select('id, reference_code, client_name').eq('id', id).single(),
      supabase.from('product_modules').select('id, code, name, category, width_mm, height_mm, depth_mm').eq('is_active', true).order('category').order('code'),
      supabase.from('project_modules').select('*, product_modules(id, code, name, category, width_mm, height_mm, depth_mm)').eq('project_id', id).order('created_at'),
      supabase.from('project_material_requirements_bom').select('material_type, net_area_m2, panels_with_waste, edge_banding_ml, status').eq('project_id', id).order('material_type'),
    ])
    if (projRes.error) { setError(projRes.error.message) }
    else { setProject(projRes.data) }
    setCatalog((catalogRes.data as ProductModuleCatalog[]) || [])
    setAssigned((assignedRes.data as ProjectModule[]) || [])
    setBomSummary((bomRes.data as BomSummaryRow[]) || [])
    setLoading(false)
  }, [id, supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Catalog helpers ──

  const filteredCatalog = catalog.filter(m => {
    const matchCat = catalogCategory === 'all' || m.category === catalogCategory
    const q = catalogSearch.toLowerCase()
    const matchSearch = !q || m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q)
    return matchCat && matchSearch
  })

  // ── Add module to project ──

  const handleAddModule = async (config: {
    quantity: number
    custom_width_mm: number | null
    custom_height_mm: number | null
    custom_depth_mm: number | null
    finish: string
    position_label: string
  }) => {
    if (!configTarget || !id) return
    const { error: err } = await supabase.from('project_modules').insert({
      project_id: id,
      module_id: configTarget.id,
      quantity: config.quantity,
      custom_width_mm: config.custom_width_mm,
      custom_height_mm: config.custom_height_mm,
      custom_depth_mm: config.custom_depth_mm,
      finish: config.finish || null,
      position_label: config.position_label || null,
      bom_generated: false,
    })
    setConfigTarget(null)
    if (err) { showToast('error', err.message); return }
    showToast('success', `${configTarget.name} ajouté au projet.`)
    fetchAll()
  }

  // ── Inline update for assigned module ──

  const updateAssignedField = (pmId: string, field: string, value: string | number | null) => {
    setAssigned(prev => prev.map(pm =>
      pm.id === pmId ? { ...pm, [field]: value } : pm
    ))
  }

  const saveAssignedModule = async (pm: ProjectModule) => {
    setSavingModuleId(pm.id)
    const { error: err } = await supabase.from('project_modules').update({
      quantity: pm.quantity,
      custom_width_mm: pm.custom_width_mm,
      custom_height_mm: pm.custom_height_mm,
      custom_depth_mm: pm.custom_depth_mm,
      finish: pm.finish,
      position_label: pm.position_label,
    }).eq('id', pm.id)
    setSavingModuleId(null)
    if (err) { showToast('error', err.message) }
  }

  // ── Remove module ──

  const handleRemove = async (pmId: string) => {
    if (!confirm('Retirer ce module du projet ?')) return
    setRemovingId(pmId)
    await supabase.from('project_parts').delete().eq('project_module_id', pmId)
    const { error: err } = await supabase.from('project_modules').delete().eq('id', pmId)
    setRemovingId(null)
    if (err) { showToast('error', err.message); return }
    showToast('success', 'Module retiré.')
    fetchAll()
  }

  // ── Generate BOM ──

  const handleGenerateBom = async () => {
    if (!id || assigned.length === 0) {
      showToast('error', 'Aucun module assigné au projet.')
      return
    }
    setGeneratingBom(true)
    setBomProgress('Récupération des pièces...')

    try {
      // Collect all module IDs (unique)
      const moduleIds = [...new Set(assigned.map(pm => pm.module_id))]

      // Fetch all parts for all modules in one query
      const { data: allParts, error: partsErr } = await supabase
        .from('module_parts')
        .select('*')
        .in('module_id', moduleIds)
      if (partsErr) throw new Error(partsErr.message)
      const partsMap: Record<string, ModulePart[]> = {}
      for (const part of (allParts || []) as ModulePart[]) {
        if (!partsMap[part.module_id]) partsMap[part.module_id] = []
        partsMap[part.module_id].push(part)
      }

      // Aggregate BOM by material_type
      // materialData: { totalAreaMm2, edgeBandingMm, parts_with_waste_factor }
      const materialData: Record<string, { totalAreaMm2: number; edgeBandingMm: number }> = {}
      const allProjectParts: any[] = []
      let totalPiecesCount = 0

      setBomProgress('Calcul des formules...')

      for (const pm of assigned) {
        const mod = pm.product_modules
        const W = pm.custom_width_mm ?? mod.width_mm ?? 0
        const H = pm.custom_height_mm ?? mod.height_mm ?? 0
        const D = pm.custom_depth_mm ?? mod.depth_mm ?? 0
        const parts = partsMap[pm.module_id] || []

        for (const part of parts) {
          if (part.part_type !== 'panel') continue
          const partW = part.width_formula ? safeEval(part.width_formula, W, H, D) : W
          const partH = part.height_formula ? safeEval(part.height_formula, W, H, D) : H
          const qty = part.quantity_formula ? safeEval(part.quantity_formula, W, H, D) : 1
          const totalQty = qty * pm.quantity
          const matType = part.material_type || 'mdf_18'

          if (!materialData[matType]) materialData[matType] = { totalAreaMm2: 0, edgeBandingMm: 0 }

          // Area
          materialData[matType].totalAreaMm2 += partW * partH * totalQty

          // Edge banding (sum of edged side lengths × quantity)
          let edgeMm = 0
          if (part.edge_top) edgeMm += partW
          if (part.edge_bottom) edgeMm += partW
          if (part.edge_left) edgeMm += partH
          if (part.edge_right) edgeMm += partH
          materialData[matType].edgeBandingMm += edgeMm * totalQty

          // project_parts rows (one per unit)
          const validatedThickness = enforceThickness(matType, part.thickness_mm ?? 18);
          for (let i = 0; i < totalQty; i++) {
            allProjectParts.push({
              project_id: id,
              project_module_id: pm.id,
              part_code: part.code,
              part_name: part.name,
              material_type: matType,
              thickness_mm: validatedThickness,
              width_mm: partW,
              height_mm: partH,
              quantity: 1,
              edge_top: part.edge_top,
              edge_bottom: part.edge_bottom,
              edge_left: part.edge_left,
              edge_right: part.edge_right,
              grain_direction: part.grain_direction,
              is_cut: false,
              is_edged: false,
              is_assembled: false,
            })
          }
          totalPiecesCount += totalQty
        }
      }

      setBomProgress('Enregistrement du BOM...')

      // Upsert project_material_requirements_bom
      const bomRows = Object.entries(materialData).map(([matType, data]) => {
        const [panelW, panelH] = PANEL_SIZES[matType] || [1220, 2800]
        const panelAreaMm2 = panelW * panelH
        const netAreaM2 = data.totalAreaMm2 / 1_000_000
        const panelsRequired = data.totalAreaMm2 / panelAreaMm2
        const edgeBandingMl = data.edgeBandingMm / 1000
        return {
          project_id: id,
          material_type: matType,
          panel_width_mm: panelW,
          panel_height_mm: panelH,
          net_area_m2: parseFloat(netAreaM2.toFixed(3)),
          panels_required: parseFloat(panelsRequired.toFixed(2)),
          waste_factor: 1.15,
          edge_banding_ml: parseFloat(edgeBandingMl.toFixed(1)),
          status: 'draft',
        }
      })

      if (bomRows.length > 0) {
        const { error: bomErr } = await supabase
          .from('project_material_requirements_bom')
          .upsert(bomRows, { onConflict: 'project_id,material_type' })
        if (bomErr) throw new Error(bomErr.message)
      }

      setBomProgress('Enregistrement des pièces...')

      // Delete and re-insert project_parts per module
      for (const pm of assigned) {
        await supabase.from('project_parts').delete().eq('project_id', id).eq('project_module_id', pm.id)
      }
      if (allProjectParts.length > 0) {
        // Insert in batches of 200
        for (let i = 0; i < allProjectParts.length; i += 200) {
          const batch = allProjectParts.slice(i, i + 200)
          const { error: pErr } = await supabase.from('project_parts').insert(batch)
          if (pErr) throw new Error(pErr.message)
        }
      }

      // Mark all project_modules bom_generated = true
      const { error: markErr } = await supabase
        .from('project_modules')
        .update({ bom_generated: true })
        .eq('project_id', id)
      if (markErr) throw new Error(markErr.message)

      setBomProgress('')
      setGeneratingBom(false)
      showToast('success', `BOM généré : ${totalPiecesCount} pièces, ${Object.keys(materialData).length} matériaux`)
      fetchAll()
    } catch (err: any) {
      setBomProgress('')
      setGeneratingBom(false)
      showToast('error', err.message || 'Erreur lors de la génération du BOM.')
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 size={24} className="animate-spin" />
          <span className="text-sm">Chargement du projet...</span>
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-red-200 p-8 text-center max-w-sm">
          <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
          <p className="font-semibold text-gray-800 mb-1">Projet introuvable</p>
          <p className="text-sm text-gray-500">{error}</p>
          <button onClick={() => router.back()} className="mt-4 text-sm text-blue-600 hover:underline">
            Retour
          </button>
        </div>
      </div>
    )
  }

  const catalogCategories = [...new Set(catalog.map(m => m.category))]
  const allBomGenerated = assigned.length > 0 && assigned.every(pm => pm.bom_generated)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Config popover */}
      {configTarget && (
        <ConfigPopover
          module={configTarget}
          onAdd={handleAddModule}
          onClose={() => setConfigTarget(null)}
        />
      )}

      {/* BOM generation overlay */}
      {generatingBom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 text-center">
            <Loader2 size={40} className="animate-spin text-green-600 mx-auto mb-4" />
            <p className="font-semibold text-gray-900 mb-1">Génération du BOM en cours...</p>
            <p className="text-sm text-gray-500">{bomProgress}</p>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Modules du Projet — <span className="text-blue-600">{project.reference_code}</span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">{project.client_name}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => router.push(`/projects/${id}`)}
              className="flex items-center gap-2 text-sm text-gray-600 border border-gray-200 bg-white hover:border-gray-300 px-4 py-2 rounded-xl transition-colors"
            >
              <ArrowLeft size={15} />
              Retour projet
            </button>
            <button
              onClick={() => router.push(`/projects/${id}/bom`)}
              className="flex items-center gap-2 text-sm text-gray-700 border border-gray-200 bg-white hover:border-blue-300 hover:text-blue-600 px-4 py-2 rounded-xl transition-colors"
            >
              <ClipboardList size={15} />
              Voir BOM
            </button>
            <button
              onClick={handleGenerateBom}
              disabled={generatingBom || assigned.length === 0}
              className="flex items-center gap-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 px-5 py-2 rounded-xl transition-colors shadow-sm"
            >
              {generatingBom
                ? <><Loader2 size={15} className="animate-spin" /> Génération...</>
                : <><RefreshCw size={15} /> Générer BOM</>
              }
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left panel: catalog */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 sticky top-4">
            <ProjectMfgTabs projectId={id as string} />
            
              <div className="p-5 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900 mb-3">Catalogue de modules</h2>
                <div className="relative mb-3">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Rechercher un module..."
                    value={catalogSearch}
                    onChange={e => setCatalogSearch(e.target.value)}
                  />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={() => setCatalogCategory('all')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${catalogCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    Tous
                  </button>
                  {catalogCategories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCatalogCategory(cat)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${catalogCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {CATEGORY_LABELS[cat] || cat}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-y-auto max-h-[60vh] divide-y divide-gray-50 p-2">
                {filteredCatalog.length === 0 && (
                  <p className="text-xs text-gray-400 italic text-center py-8">Aucun module trouvé.</p>
                )}
                {filteredCatalog.map(m => (
                  <div key={m.id} className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-xs text-gray-400">{m.code}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[m.category] || 'bg-gray-100 text-gray-600'}`}>
                          {CATEGORY_LABELS[m.category] || m.category}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-800 truncate">{m.name}</p>
                      {(m.width_mm || m.height_mm || m.depth_mm) && (
                        <p className="text-xs text-gray-400 font-mono mt-0.5">
                          {m.width_mm ?? '?'} × {m.height_mm ?? '?'} × {m.depth_mm ?? '?'}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setConfigTarget(m)}
                      className="shrink-0 flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      <Plus size={12} />
                      Ajouter
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right panel: assigned modules */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">
                Modules assignés
                <span className="ml-2 text-sm font-normal text-gray-400">({assigned.length})</span>
              </h2>
              {allBomGenerated && assigned.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-full font-medium">
                  <CheckCircle size={12} /> BOM à jour
                </span>
              )}
            </div>

            {assigned.length === 0 && (
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
                <Package size={40} className="mx-auto mb-3 text-gray-300" />
                <p className="font-medium text-gray-500 text-sm">Aucun module assigné</p>
                <p className="text-xs text-gray-400 mt-1">Utilisez le catalogue à gauche pour ajouter des modules.</p>
              </div>
            )}

            {assigned.map(pm => {
              const mod = pm.product_modules
              const effW = pm.custom_width_mm ?? mod.width_mm
              const effH = pm.custom_height_mm ?? mod.height_mm
              const effD = pm.custom_depth_mm ?? mod.depth_mm

              return (
                <div key={pm.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{mod.code}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[mod.category] || 'bg-gray-100 text-gray-600'}`}>
                          {CATEGORY_LABELS[mod.category] || mod.category}
                        </span>
                        {pm.bom_generated ? (
                          <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full font-medium">
                            <CheckCircle size={10} /> BOM généré
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-orange-700 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full font-medium">
                            <Clock size={10} /> En attente
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-gray-900 mt-1 text-base">{mod.name}</p>
                    </div>
                    <button
                      onClick={() => handleRemove(pm.id)}
                      disabled={removingId === pm.id}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="Retirer ce module"
                    >
                      {removingId === pm.id ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {/* Quantity */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Quantité</label>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => updateAssignedField(pm.id, 'quantity', Math.max(1, pm.quantity - 1))}
                          className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
                        >
                          <Minus size={12} />
                        </button>
                        <input
                          type="number"
                          min={1}
                          className="w-12 text-center border border-gray-200 rounded px-1 py-1 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                          value={pm.quantity}
                          onChange={e => updateAssignedField(pm.id, 'quantity', parseInt(e.target.value) || 1)}
                          onBlur={() => saveAssignedModule(pm)}
                        />
                        <button
                          onClick={() => updateAssignedField(pm.id, 'quantity', pm.quantity + 1)}
                          className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                    {/* Width */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Largeur mm</label>
                      <input
                        type="number"
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={pm.custom_width_mm ?? mod.width_mm ?? ''}
                        onChange={e => updateAssignedField(pm.id, 'custom_width_mm', e.target.value ? parseFloat(e.target.value) : null)}
                        onBlur={() => saveAssignedModule(pm)}
                        placeholder={mod.width_mm != null ? String(mod.width_mm) : '—'}
                      />
                    </div>
                    {/* Height */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Hauteur mm</label>
                      <input
                        type="number"
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={pm.custom_height_mm ?? mod.height_mm ?? ''}
                        onChange={e => updateAssignedField(pm.id, 'custom_height_mm', e.target.value ? parseFloat(e.target.value) : null)}
                        onBlur={() => saveAssignedModule(pm)}
                        placeholder={mod.height_mm != null ? String(mod.height_mm) : '—'}
                      />
                    </div>
                    {/* Depth */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Profondeur mm</label>
                      <input
                        type="number"
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={pm.custom_depth_mm ?? mod.depth_mm ?? ''}
                        onChange={e => updateAssignedField(pm.id, 'custom_depth_mm', e.target.value ? parseFloat(e.target.value) : null)}
                        onBlur={() => saveAssignedModule(pm)}
                        placeholder={mod.depth_mm != null ? String(mod.depth_mm) : '—'}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Finition</label>
                      <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={pm.finish || ''}
                        onChange={e => updateAssignedField(pm.id, 'finish', e.target.value)}
                        onBlur={() => saveAssignedModule(pm)}
                        placeholder="Ex: Blanc mat..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Position / Étiquette</label>
                      <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={pm.position_label || ''}
                        onChange={e => updateAssignedField(pm.id, 'position_label', e.target.value)}
                        onBlur={() => saveAssignedModule(pm)}
                        placeholder="Ex: Zone A..."
                      />
                    </div>
                  </div>

                  {savingModuleId === pm.id && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
                      <Loader2 size={11} className="animate-spin" /> Enregistrement...
                    </div>
                  )}
                </div>
              )
            })}

            {/* BOM Summary Table */}
            {bomSummary.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mt-4">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <ClipboardList size={16} />
                  Récapitulatif BOM
                </h3>
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Matériau</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-600">Surface nette</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-600">Panneaux (avec chute)</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-600">Lisière (ml)</th>
                        <th className="text-center px-4 py-3 font-semibold text-gray-600">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {bomSummary.map(row => (
                        <tr key={row.material_type} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-800">
                            {MATERIAL_LABELS[row.material_type] || row.material_type}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600 font-mono">
                            {row.net_area_m2.toFixed(3)} m²
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700 font-mono font-semibold">
                            {row.panels_with_waste != null ? row.panels_with_waste.toFixed(2) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600 font-mono">
                            {row.edge_banding_ml.toFixed(1)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${
                              row.status === 'confirmed'
                                ? 'bg-green-100 text-green-700'
                                : row.status === 'ordered'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-orange-100 text-orange-700'
                            }`}>
                              {row.status === 'draft' ? 'Brouillon'
                                : row.status === 'confirmed' ? 'Confirmé'
                                : row.status === 'ordered' ? 'Commandé'
                                : row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-400 mt-3 italic">
                  Chute de +15% incluse dans le calcul des panneaux.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ProjectModulesPage() {
  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker']}>
      <ProjectModulesContent />
    </RoleGuard>
  )
}
