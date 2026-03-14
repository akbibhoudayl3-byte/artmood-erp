'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { RoleGuard } from '@/components/auth/RoleGuard'
import ProjectMfgTabs from '@/components/projects/ProjectMfgTabs';
import {
  ArrowLeft, Play, Check, AlertTriangle, RefreshCw,
  Plus, Scissors, Box, Wrench, CheckSquare, Package,
  Truck, Palette, Clock, ChevronRight, X, Loader2
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  design: 'Design',
  cutting: 'Découpe',
  edge_banding: 'Chantournage',
  assembly: 'Montage',
  quality_check: 'Contrôle qualité',
  ready: 'Prêt',
  installation: 'Installation',
}

const STAGE_ORDER = ['design', 'cutting', 'edge_banding', 'assembly', 'quality_check', 'ready', 'installation']

const STAGE_ICONS: Record<string, React.ReactNode> = {
  design: <Palette className="w-5 h-5" />,
  cutting: <Scissors className="w-5 h-5" />,
  edge_banding: <Box className="w-5 h-5" />,
  assembly: <Wrench className="w-5 h-5" />,
  quality_check: <CheckSquare className="w-5 h-5" />,
  ready: <Package className="w-5 h-5" />,
  installation: <Truck className="w-5 h-5" />,
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string
  reference_code: string
  client_name: string
  status: string
}

interface StageLog {
  id: string
  project_id: string
  production_order_id: string | null
  stage: string
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  worker_id: string | null
  started_at: string | null
  completed_at: string | null
  duration_minutes: number | null
  parts_processed: number | null
  notes: string | null
  profiles: { full_name: string } | null
}

interface LaborCost {
  id: string
  project_id: string
  stage: string
  worker_id: string | null
  hours: number
  hourly_rate: number
  total_cost: number
  date: string
  notes: string | null
  profiles: { full_name: string } | null
}

interface WasteEvent {
  id: string
  project_id: string
  stock_item_id: string | null
  material_name: string
  expected_qty: number
  actual_qty: number
  waste_qty: number
  waste_pct: number
  reason: string | null
  severity: 'ok' | 'warning' | 'critical'
  resolved: boolean
}

interface StockItem {
  id: string
  name: string
}

interface PartCounts {
  total: number
  cut: number
  edged: number
  assembled: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function minutesAgo(startedAt: string): number {
  return Math.round((Date.now() - new Date(startedAt).getTime()) / 60000)
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('fr-MA')
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    ok: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    critical: 'bg-red-100 text-red-800',
  }
  const labels: Record<string, string> = {
    ok: 'OK',
    warning: 'Attention',
    critical: 'Critique',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[severity] ?? 'bg-gray-100 text-gray-700'}`}>
      {labels[severity] ?? severity}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'in_progress') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        En cours
      </span>
    )
  }
  const map: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-600',
    completed: 'bg-green-100 text-green-800',
    blocked: 'bg-red-100 text-red-800',
  }
  const labels: Record<string, string> = {
    pending: 'En attente',
    completed: 'Terminé',
    blocked: 'Bloqué',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {labels[status] ?? status}
    </span>
  )
}

// ─── Modals ───────────────────────────────────────────────────────────────────

interface CompleteModalProps {
  stage: string
  onConfirm: (parts: number, notes: string) => void
  onClose: () => void
}

function CompleteModal({ stage, onConfirm, onClose }: CompleteModalProps) {
  const [parts, setParts] = useState(0)
  const [notes, setNotes] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Terminer — {STAGE_LABELS[stage]}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pièces traitées</label>
            <input
              type="number"
              min={0}
              value={parts}
              onChange={e => setParts(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optionnel)</label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Observations, remarques..."
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 rounded-xl py-2 text-sm font-medium hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={() => onConfirm(parts, notes)}
            className="flex-1 bg-green-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-green-700"
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  )
}

interface BlockModalProps {
  stage: string
  onConfirm: (notes: string) => void
  onClose: () => void
}

function BlockModal({ stage, onConfirm, onClose }: BlockModalProps) {
  const [notes, setNotes] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Bloquer — {STAGE_LABELS[stage]}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Raison du blocage</label>
          <textarea
            rows={4}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            placeholder="Décrivez le problème..."
          />
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 rounded-xl py-2 text-sm font-medium hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={() => onConfirm(notes)}
            disabled={!notes.trim()}
            className="flex-1 bg-red-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            Bloquer
          </button>
        </div>
      </div>
    </div>
  )
}

interface WasteModalProps {
  projectId: string
  stockItems: StockItem[]
  workerId: string
  onClose: () => void
  onSaved: () => void
}

function WasteModal({ projectId, stockItems, workerId, onClose, onSaved }: WasteModalProps) {
  const supabase = createClient()
  const [stockItemId, setStockItemId] = useState('')
  const [materialName, setMaterialName] = useState('')
  const [expectedQty, setExpectedQty] = useState('')
  const [actualQty, setActualQty] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const handleSave = async () => {
    if (!materialName.trim() || !expectedQty || !actualQty) {
      setErr('Veuillez remplir tous les champs obligatoires.')
      return
    }
    setSaving(true)
    setErr('')
    const { error } = await supabase.from('material_waste_events').insert({
      project_id: projectId,
      stock_item_id: stockItemId || null,
      material_name: materialName.trim(),
      expected_qty: Number(expectedQty),
      actual_qty: Number(actualQty),
      reason: reason.trim() || null,
      flagged_by: workerId,
      resolved: false,
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Signaler un incident matière</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        {err && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{err}</div>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Article stock (optionnel)</label>
            <select
              value={stockItemId}
              onChange={e => {
                setStockItemId(e.target.value)
                const item = stockItems.find(s => s.id === e.target.value)
                if (item) setMaterialName(item.name)
              }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Sélectionner —</option>
              {stockItems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom du matériau *</label>
            <input
              type="text"
              value={materialName}
              onChange={e => setMaterialName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: MDF 18mm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Qté prévue *</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={expectedQty}
                onChange={e => setExpectedQty(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Qté utilisée *</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={actualQty}
                onChange={e => setActualQty(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Raison</label>
            <textarea
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Cause du surplus..."
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 rounded-xl py-2 text-sm font-medium hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-orange-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Signaler
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

function ProductionWorkflowContent() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { profile, loading: authLoading } = useAuth()
  const supabase = createClient()

  const [project, setProject] = useState<Project | null>(null)
  const [stages, setStages] = useState<StageLog[]>([])
  const [laborCosts, setLaborCosts] = useState<LaborCost[]>([])
  const [wasteEvents, setWasteEvents] = useState<WasteEvent[]>([])
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [partCounts, setPartCounts] = useState<PartCounts>({ total: 0, cut: 0, edged: 0, assembled: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Modals
  const [completeModal, setCompleteModal] = useState<string | null>(null)
  const [blockModal, setBlockModal] = useState<string | null>(null)
  const [showWasteModal, setShowWasteModal] = useState(false)

  // Labor cost form
  const [showLaborForm, setShowLaborForm] = useState(false)
  const [laborStage, setLaborStage] = useState('cutting')
  const [laborHours, setLaborHours] = useState('')
  const [laborRate, setLaborRate] = useState('80')
  const [laborDate, setLaborDate] = useState(new Date().toISOString().split('T')[0])
  const [laborNotes, setLaborNotes] = useState('')
  const [laborSaving, setLaborSaving] = useState(false)

  const canAct = profile?.role === 'workshop_manager' || profile?.role === 'workshop_worker'

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [projectRes, stagesRes, partsRes, laborRes, wasteRes, stockRes] = await Promise.all([
        supabase.from('projects').select('id, reference_code, client_name, status').eq('id', id).single(),
        supabase.from('production_stage_log').select('*, profiles(full_name)').eq('project_id', id).order('stage'),
        supabase.from('project_parts').select('is_cut, is_edged, is_assembled').eq('project_id', id),
        supabase.from('project_labor_costs').select('*, profiles(full_name)').eq('project_id', id).order('date', { ascending: false }),
        supabase.from('material_waste_events').select('*').eq('project_id', id).order('created_at', { ascending: false }),
        supabase.from('stock_items').select('id, name').eq('is_active', true).order('name'),
      ])

      if (projectRes.error) throw new Error(projectRes.error.message)
      setProject(projectRes.data)

      const stageMap = new Map<string, StageLog>()
      ;(stagesRes.data ?? []).forEach((s: StageLog) => stageMap.set(s.stage, s))
      const fullStages = STAGE_ORDER.map(stageKey => stageMap.get(stageKey) ?? {
        id: '',
        project_id: id,
        production_order_id: null,
        stage: stageKey,
        status: 'pending' as const,
        worker_id: null,
        started_at: null,
        completed_at: null,
        duration_minutes: null,
        parts_processed: null,
        notes: null,
        profiles: null,
      })
      setStages(fullStages)

      const parts = partsRes.data ?? []
      setPartCounts({
        total: parts.length,
        cut: parts.filter((p: { is_cut: boolean }) => p.is_cut).length,
        edged: parts.filter((p: { is_edged: boolean }) => p.is_edged).length,
        assembled: parts.filter((p: { is_assembled: boolean }) => p.is_assembled).length,
      })

      setLaborCosts(laborRes.data ?? [])
      setWasteEvents(wasteRes.data ?? [])
      setStockItems(stockRes.data ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }, [id, supabase])

  useEffect(() => {
    if (!authLoading) fetchData()
  }, [authLoading, fetchData])

  const updateStage = async (stage: string, updates: Record<string, unknown>) => {
    setActionLoading(stage)
    const { error } = await supabase
      .from('production_stage_log')
      .upsert({ project_id: id, stage, ...updates }, { onConflict: 'project_id,stage' })
    setActionLoading(null)
    if (error) { setError(error.message); return }
    await fetchData()
  }

  const handleStart = (stage: string) => {
    updateStage(stage, {
      status: 'in_progress',
      started_at: new Date().toISOString(),
      worker_id: profile?.id ?? null,
    })
  }

  const handleComplete = async (stage: string, parts: number, notes: string) => {
    setCompleteModal(null)
    await updateStage(stage, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      parts_processed: parts || null,
      notes: notes || null,
    })
  }

  const handleBlock = async (stage: string, notes: string) => {
    setBlockModal(null)
    await updateStage(stage, { status: 'blocked', notes })
  }

  const handleResume = (stage: string) => {
    updateStage(stage, { status: 'in_progress', started_at: new Date().toISOString() })
  }

  const handleAddLabor = async () => {
    if (!laborHours || Number(laborHours) <= 0) return
    setLaborSaving(true)
    const { error } = await supabase.from('project_labor_costs').insert({
      project_id: id,
      stage: laborStage,
      worker_id: profile?.id ?? null,
      hours: Number(laborHours),
      hourly_rate: Number(laborRate) || 80,
      date: laborDate,
      notes: laborNotes.trim() || null,
    })
    setLaborSaving(false)
    if (error) { setError(error.message); return }
    setLaborHours('')
    setLaborNotes('')
    setShowLaborForm(false)
    await fetchData()
  }

  const pct = (n: number, total: number) => total > 0 ? Math.round((n / total) * 100) : 0

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-sm text-gray-500">Chargement du suivi de production...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Modals */}
      {completeModal && (
        <CompleteModal
          stage={completeModal}
          onConfirm={(parts, notes) => handleComplete(completeModal, parts, notes)}
          onClose={() => setCompleteModal(null)}
        />
      )}
      {blockModal && (
        <BlockModal
          stage={blockModal}
          onConfirm={(notes) => handleBlock(blockModal, notes)}
          onClose={() => setBlockModal(null)}
        />
      )}
      {showWasteModal && profile && (
        <WasteModal
          projectId={id}
          stockItems={stockItems}
          workerId={profile.id}
          onClose={() => setShowWasteModal(false)}
          onSaved={fetchData}
        />
      )}

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/projects/${id}`)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
          <ChevronRight className="w-4 h-4 text-gray-300" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Suivi de Production
              {project && (
                <span className="text-blue-600 ml-2">
                  — {project.reference_code} — {project.client_name}
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Pipeline de production par étape</p>
          </div>
        </div>

        {/* Error Banner */}
        <ProjectMfgTabs projectId={id as string} />
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Erreur</p>
              <p className="text-sm mt-0.5">{error}</p>
            </div>
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Parts Progress Summary */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Pièces découpées', value: partCounts.cut, icon: <Scissors className="w-5 h-5 text-blue-500" /> },
            { label: 'Pièces chantournées', value: partCounts.edged, icon: <Box className="w-5 h-5 text-purple-500" /> },
            { label: 'Pièces montées', value: partCounts.assembled, icon: <Wrench className="w-5 h-5 text-green-500" /> },
          ].map(({ label, value, icon }) => {
            const p = pct(value, partCounts.total)
            return (
              <div key={label} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center gap-2 mb-2">
                  {icon}
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {value}<span className="text-sm font-normal text-gray-400"> / {partCounts.total}</span>
                </p>
                <div className="mt-2 h-2 bg-gray-100 rounded-full">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${p}%`,
                      backgroundColor: p >= 60 ? '#22c55e' : p >= 30 ? '#f97316' : '#ef4444',
                    }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">{p}%</p>
              </div>
            )
          })}
        </div>

        {/* Pipeline */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-5">Pipeline de production</h2>

          {/* Horizontal connector visualization */}
          <div className="hidden md:flex items-center mb-6 overflow-x-auto pb-2">
            {STAGE_ORDER.map((stage, idx) => {
              const s = stages.find(st => st.stage === stage)
              const status = s?.status ?? 'pending'
              const dotColor =
                status === 'completed' ? 'bg-green-500' :
                status === 'in_progress' ? 'bg-blue-500' :
                status === 'blocked' ? 'bg-red-500' : 'bg-gray-300'
              return (
                <div key={stage} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${dotColor} text-white`}>
                      {status === 'completed' ? <Check className="w-4 h-4" /> : <span className="text-xs">{idx + 1}</span>}
                    </div>
                    <span className="text-xs text-gray-500 mt-1 whitespace-nowrap">{STAGE_LABELS[stage]}</span>
                  </div>
                  {idx < STAGE_ORDER.length - 1 && (
                    <div className="w-8 h-0.5 bg-gray-200 mx-1 flex-shrink-0" />
                  )}
                </div>
              )
            })}
          </div>

          {/* Stage Cards */}
          <div className="space-y-3">
            {stages.map((stage) => {
              const isActing = actionLoading === stage.stage
              return (
                <div
                  key={stage.stage}
                  className={`border rounded-xl p-4 transition-colors ${
                    stage.status === 'blocked' ? 'border-red-200 bg-red-50' :
                    stage.status === 'in_progress' ? 'border-blue-200 bg-blue-50' :
                    stage.status === 'completed' ? 'border-green-200 bg-green-50' :
                    'border-gray-100 bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`flex-shrink-0 ${
                        stage.status === 'in_progress' ? 'text-blue-600' :
                        stage.status === 'completed' ? 'text-green-600' :
                        stage.status === 'blocked' ? 'text-red-600' : 'text-gray-400'
                      }`}>
                        {STAGE_ICONS[stage.stage]}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 text-sm">{STAGE_LABELS[stage.stage]}</span>
                          <StatusBadge status={stage.status} />
                        </div>
                        <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                          {stage.profiles && (
                            <p>Ouvrier : <span className="font-medium">{stage.profiles.full_name}</span></p>
                          )}
                          {stage.status === 'in_progress' && stage.started_at && (
                            <p className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Commencé il y a {minutesAgo(stage.started_at)} min
                            </p>
                          )}
                          {stage.status === 'completed' && (
                            <p>
                              {stage.duration_minutes != null && `Durée : ${Math.round(stage.duration_minutes)} min — `}
                              {stage.completed_at && `Terminé le ${formatDate(stage.completed_at)}`}
                            </p>
                          )}
                          {stage.parts_processed != null && stage.parts_processed > 0 && (
                            <p>Pièces traitées : {stage.parts_processed}</p>
                          )}
                          {stage.notes && (
                            <p className="italic">{stage.notes}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    {canAct && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isActing && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                        {!isActing && stage.status === 'pending' && (
                          <button
                            onClick={() => handleStart(stage.stage)}
                            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700"
                          >
                            <Play className="w-3 h-3" />
                            Démarrer
                          </button>
                        )}
                        {!isActing && stage.status === 'in_progress' && (
                          <>
                            <button
                              onClick={() => setCompleteModal(stage.stage)}
                              className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700"
                            >
                              <Check className="w-3 h-3" />
                              Terminer
                            </button>
                            <button
                              onClick={() => setBlockModal(stage.stage)}
                              className="flex items-center gap-1.5 bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-700"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              Bloquer
                            </button>
                          </>
                        )}
                        {!isActing && stage.status === 'blocked' && (
                          <button
                            onClick={() => handleResume(stage.stage)}
                            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Reprendre
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Labor Costs */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Coûts main d&apos;œuvre</h2>
            {canAct && (
              <button
                onClick={() => setShowLaborForm(!showLaborForm)}
                className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Ajouter
              </button>
            )}
          </div>

          {showLaborForm && (
            <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 mb-4">
              <h3 className="text-sm font-medium text-blue-900 mb-3">Nouvelle saisie de temps</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Étape</label>
                  <select
                    value={laborStage}
                    onChange={e => setLaborStage(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {STAGE_ORDER.map(s => (
                      <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={laborDate}
                    onChange={e => setLaborDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Heures</label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={laborHours}
                    onChange={e => setLaborHours(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Taux horaire (MAD/h)</label>
                  <input
                    type="number"
                    min={0}
                    value={laborRate}
                    onChange={e => setLaborRate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optionnel)</label>
                  <input
                    type="text"
                    value={laborNotes}
                    onChange={e => setLaborNotes(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    placeholder="Observations..."
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setShowLaborForm(false)}
                  className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2 text-sm hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  onClick={handleAddLabor}
                  disabled={laborSaving}
                  className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {laborSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                  Enregistrer
                </button>
              </div>
            </div>
          )}

          {laborCosts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucune saisie de temps enregistrée</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Étape</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Ouvrier</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Heures</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Taux</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Coût</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {laborCosts.map(lc => (
                    <tr key={lc.id} className="hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium">{STAGE_LABELS[lc.stage] ?? lc.stage}</td>
                      <td className="py-2 px-3 text-gray-600">{lc.profiles?.full_name ?? '—'}</td>
                      <td className="py-2 px-3 text-right">{lc.hours}h</td>
                      <td className="py-2 px-3 text-right">{lc.hourly_rate} MAD</td>
                      <td className="py-2 px-3 text-right font-semibold text-gray-900">
                        {new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD' }).format(lc.total_cost)}
                      </td>
                      <td className="py-2 px-3 text-gray-500">{formatDate(lc.date)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td colSpan={4} className="py-2 px-3 text-right text-sm">Total</td>
                    <td className="py-2 px-3 text-right text-sm text-gray-900">
                      {new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD' }).format(
                        laborCosts.reduce((sum, lc) => sum + (lc.total_cost ?? 0), 0)
                      )}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Waste Events */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Incidents matière</h2>
            {canAct && (
              <button
                onClick={() => setShowWasteModal(true)}
                className="flex items-center gap-1.5 bg-orange-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-orange-700"
              >
                <Plus className="w-4 h-4" />
                Signaler un incident
              </button>
            )}
          </div>

          {wasteEvents.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucun incident matière pour ce projet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Matériau</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Qté gaspillée</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">%</th>
                    <th className="text-center py-2 px-3 text-xs font-medium text-gray-500">Sévérité</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Raison</th>
                    <th className="text-center py-2 px-3 text-xs font-medium text-gray-500">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {wasteEvents.map(evt => (
                    <tr
                      key={evt.id}
                      className={
                        evt.severity === 'critical' ? 'bg-red-50' :
                        evt.severity === 'warning' ? 'bg-yellow-50' : ''
                      }
                    >
                      <td className="py-2 px-3 font-medium">{evt.material_name}</td>
                      <td className="py-2 px-3 text-right">{Number(evt.waste_qty).toFixed(2)}</td>
                      <td className="py-2 px-3 text-right">{Number(evt.waste_pct).toFixed(1)}%</td>
                      <td className="py-2 px-3 text-center"><SeverityBadge severity={evt.severity} /></td>
                      <td className="py-2 px-3 text-gray-600">{evt.reason ?? '—'}</td>
                      <td className="py-2 px-3 text-center">
                        {evt.resolved ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Résolu</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Ouvert</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function ProductionWorkflowPage() {
  return (
    <RoleGuard roles={['ceo', 'workshop_manager', 'workshop_worker']}>
      <ProductionWorkflowContent />
    </RoleGuard>
  )
}
