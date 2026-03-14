'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { RoleGuard } from '@/components/auth/RoleGuard'
import {
  Factory, TrendingUp, AlertTriangle, Clock, ChevronRight,
  Scissors, Box, Wrench, CheckSquare, Package, Truck, Palette,
  X, Loader2, RefreshCw, Check
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

const STAGE_ICONS: Record<string, React.ReactNode> = {
  design: <Palette className="w-4 h-4" />,
  cutting: <Scissors className="w-4 h-4" />,
  edge_banding: <Box className="w-4 h-4" />,
  assembly: <Wrench className="w-4 h-4" />,
  quality_check: <CheckSquare className="w-4 h-4" />,
  ready: <Package className="w-4 h-4" />,
  installation: <Truck className="w-4 h-4" />,
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectProgress {
  project_id: string
  reference_code: string
  client_name: string
  status: string
  cut_pct: number
  edged_pct: number
  assembled_pct: number
  current_stage: string | null
  overall_progress_pct: number
  bom_generated: boolean
}

interface Bottleneck {
  stage: string
  avg_duration_min: number
  currently_blocked: number
  avg_days: number
}

interface WasteAnalysis {
  month: string
  material_name: string
  events: number
  total_waste: number
  avg_waste_pct: number
  critical_events: number
}

interface FactoryEfficiency {
  week_start: string
  stage: string
  projects_processed: number
  avg_duration_min: number
  blocks: number
  workers_active: number
}

interface WasteEvent {
  id: string
  project_id: string
  material_name: string
  waste_qty: number
  waste_pct: number
  severity: 'ok' | 'warning' | 'critical'
  reason: string | null
  resolved: boolean
  projects: { reference_code: string; client_name: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(v: number): string {
  return new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD' }).format(v)
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('fr-MA')
}

function formatMonth(month: string): string {
  try {
    return new Date(month + '-01').toLocaleDateString('fr-MA', { month: 'long', year: 'numeric' })
  } catch {
    return month
  }
}

function formatWeek(weekStart: string): string {
  return `Sem. ${formatDate(weekStart)}`
}

function ProgressBar({ pct, className = '' }: { pct: number; className?: string }) {
  const color = pct >= 60 ? '#22c55e' : pct >= 30 ? '#f97316' : '#ef4444'
  return (
    <div className={`h-2 bg-gray-100 rounded-full w-full min-w-16 ${className}`}>
      <div
        className="h-2 rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color }}
      />
    </div>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    ok: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    critical: 'bg-red-100 text-red-800',
  }
  const labels: Record<string, string> = { ok: 'OK', warning: 'Attention', critical: 'Critique' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[severity] ?? 'bg-gray-100 text-gray-700'}`}>
      {labels[severity] ?? severity}
    </span>
  )
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  color = 'blue',
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  color?: 'blue' | 'green' | 'orange' | 'red' | 'purple'
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 truncate">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`flex-shrink-0 p-2.5 rounded-xl ${colorMap[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

function FactoryIntelligenceContent() {
  const router = useRouter()
  const { loading: authLoading } = useAuth()
  const supabase = createClient()

  const [progressData, setProgressData] = useState<ProjectProgress[]>([])
  const [bottlenecks, setBottlenecks] = useState<Bottleneck[]>([])
  const [wasteAnalysis, setWasteAnalysis] = useState<WasteAnalysis[]>([])
  const [efficiency, setEfficiency] = useState<FactoryEfficiency[]>([])
  const [unresolvedEvents, setUnresolvedEvents] = useState<WasteEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [progressRes, bottleneckRes, wasteRes, efficiencyRes, eventsRes] = await Promise.all([
        supabase.from('v_project_production_progress').select('*').order('overall_progress_pct'),
        supabase.from('v_production_bottlenecks').select('*').order('avg_duration_min', { ascending: false }),
        supabase.from('v_waste_analysis').select('*').order('month', { ascending: false }).limit(30),
        supabase.from('v_factory_efficiency').select('*').order('week_start', { ascending: false }).limit(40),
        supabase.from('material_waste_events').select('*, projects(reference_code, client_name)').eq('resolved', false).order('severity'),
      ])
      setProgressData(progressRes.data ?? [])
      setBottlenecks(bottleneckRes.data ?? [])
      setWasteAnalysis(wasteRes.data ?? [])
      setEfficiency(efficiencyRes.data ?? [])
      setUnresolvedEvents(eventsRes.data ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    if (!authLoading) fetchData()
  }, [authLoading, fetchData])

  const handleResolve = async (id: string) => {
    setResolvingId(id)
    await supabase.from('material_waste_events').update({ resolved: true }).eq('id', id)
    setResolvingId(null)
    await fetchData()
  }

  // Computed KPIs
  const activeProjects = progressData.filter(p => p.overall_progress_pct > 0 && p.overall_progress_pct < 100)
  const avgCutPct = progressData.length > 0
    ? Math.round(progressData.reduce((s, p) => s + (p.cut_pct ?? 0), 0) / progressData.length)
    : 0

  // Last month avg waste
  const lastMonthWaste = wasteAnalysis.length > 0 ? wasteAnalysis[0].avg_waste_pct : 0

  // Worst bottleneck
  const worstBottleneck = bottlenecks[0] ?? null

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-sm text-gray-500">Chargement de l&apos;intelligence usine...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 bg-blue-100 rounded-xl">
                <Factory className="w-5 h-5 text-blue-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Intelligence Usine</h1>
            </div>
            <p className="text-sm text-gray-500">Vue globale de la performance de production</p>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            Actualiser
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Erreur de chargement</p>
              <p className="text-sm mt-0.5">{error}</p>
            </div>
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Projets en production"
            value={activeProjects.length}
            sub={`sur ${progressData.length} total`}
            icon={<Factory className="w-5 h-5" />}
            color="blue"
          />
          <KpiCard
            label="Taux de découpe moyen"
            value={`${avgCutPct}%`}
            sub="tous projets confondus"
            icon={<TrendingUp className="w-5 h-5" />}
            color="green"
          />
          <KpiCard
            label="Taux de déchets moyen"
            value={`${Number(lastMonthWaste).toFixed(1)}%`}
            sub="dernier mois"
            icon={<AlertTriangle className="w-5 h-5" />}
            color={lastMonthWaste >= 20 ? 'red' : lastMonthWaste >= 10 ? 'orange' : 'green'}
          />
          <KpiCard
            label="Goulot principal"
            value={worstBottleneck ? (STAGE_LABELS[worstBottleneck.stage] ?? worstBottleneck.stage) : '—'}
            sub={worstBottleneck ? `${Math.round(worstBottleneck.avg_duration_min)} min en moyenne` : undefined}
            icon={<Clock className="w-5 h-5" />}
            color="orange"
          />
        </div>

        {/* Section 1: Project Progress */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Avancement des projets</h2>
          {progressData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aucun projet trouvé</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Référence</th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Client</th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Stage actuel</th>
                    <th className="text-center py-2.5 px-3 text-xs font-medium text-gray-500 min-w-28">Découpe %</th>
                    <th className="text-center py-2.5 px-3 text-xs font-medium text-gray-500 min-w-28">Chantournage %</th>
                    <th className="text-center py-2.5 px-3 text-xs font-medium text-gray-500 min-w-28">Montage %</th>
                    <th className="text-center py-2.5 px-3 text-xs font-medium text-gray-500 min-w-32">Avancement global</th>
                    <th className="text-center py-2.5 px-3 text-xs font-medium text-gray-500">BOM</th>
                    <th className="py-2.5 px-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {progressData.map(proj => (
                    <tr
                      key={proj.project_id}
                      onClick={() => router.push(`/projects/${proj.project_id}/workflow`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3 font-semibold text-blue-700">{proj.reference_code}</td>
                      <td className="py-2.5 px-3 text-gray-700">{proj.client_name}</td>
                      <td className="py-2.5 px-3">
                        {proj.current_stage ? (
                          <span className="inline-flex items-center gap-1.5 text-gray-600">
                            {STAGE_ICONS[proj.current_stage]}
                            {STAGE_LABELS[proj.current_stage] ?? proj.current_stage}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-medium">{Math.round(proj.cut_pct ?? 0)}%</span>
                          <ProgressBar pct={proj.cut_pct ?? 0} />
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-medium">{Math.round(proj.edged_pct ?? 0)}%</span>
                          <ProgressBar pct={proj.edged_pct ?? 0} />
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-medium">{Math.round(proj.assembled_pct ?? 0)}%</span>
                          <ProgressBar pct={proj.assembled_pct ?? 0} />
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-semibold">{Math.round(proj.overall_progress_pct ?? 0)}%</span>
                          <ProgressBar pct={proj.overall_progress_pct ?? 0} />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {proj.bom_generated ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                            <Check className="w-3 h-3" />
                            BOM
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 2: Bottlenecks */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Analyse des goulots d&apos;étranglement</h2>
          {bottlenecks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aucune donnée disponible</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Étape</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Durée moy. (min)</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Durée moy. (jours)</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Bloqués actuellement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {bottlenecks.map((b, idx) => (
                    <tr
                      key={b.stage}
                      className={idx === 0 ? 'bg-orange-50' : 'hover:bg-gray-50'}
                    >
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center gap-2 font-medium text-gray-900">
                          {STAGE_ICONS[b.stage]}
                          {STAGE_LABELS[b.stage] ?? b.stage}
                          {idx === 0 && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-orange-200 text-orange-800 font-medium">
                              Goulot principal
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold">
                        {b.avg_duration_min != null ? Math.round(b.avg_duration_min) : '—'} min
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-600">
                        {b.avg_days != null ? Number(b.avg_days).toFixed(1) : '—'} j
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {(b.currently_blocked ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            <AlertTriangle className="w-3 h-3" />
                            {b.currently_blocked}
                          </span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 3: Waste Analysis */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Analyse des déchets par matériau</h2>
          <p className="text-xs text-gray-400 mb-4">3 derniers mois — triés par taux de déchets décroissant</p>
          {wasteAnalysis.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aucune donnée disponible</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Mois</th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Matériau</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Événements</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Déchets totaux</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Déchets moy. %</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Événements critiques</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...wasteAnalysis]
                    .sort((a, b) => (b.avg_waste_pct ?? 0) - (a.avg_waste_pct ?? 0))
                    .map((w, idx) => (
                      <tr
                        key={`${w.month}-${w.material_name}-${idx}`}
                        className={(w.critical_events ?? 0) > 0 ? 'bg-red-50' : 'hover:bg-gray-50'}
                      >
                        <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">{formatMonth(w.month)}</td>
                        <td className="py-2.5 px-3 font-medium text-gray-900">{w.material_name}</td>
                        <td className="py-2.5 px-3 text-right">{w.events}</td>
                        <td className="py-2.5 px-3 text-right">{Number(w.total_waste).toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right">
                          <span className={`font-semibold ${
                            (w.avg_waste_pct ?? 0) >= 20 ? 'text-red-600' :
                            (w.avg_waste_pct ?? 0) >= 10 ? 'text-orange-600' : 'text-green-600'
                          }`}>
                            {Number(w.avg_waste_pct).toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {(w.critical_events ?? 0) > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                              <AlertTriangle className="w-3 h-3" />
                              {w.critical_events}
                            </span>
                          ) : (
                            <span className="text-gray-400">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 4: Factory Efficiency */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Efficacité par étape</h2>
          <p className="text-xs text-gray-400 mb-4">4 dernières semaines</p>
          {efficiency.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aucune donnée disponible</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Semaine</th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Étape</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Projets traités</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Durée moy. (min)</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Blocages</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Ouvriers actifs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {efficiency.map((e, idx) => (
                    <tr key={`${e.week_start}-${e.stage}-${idx}`} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">{formatWeek(e.week_start)}</td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center gap-1.5 text-gray-700">
                          {STAGE_ICONS[e.stage]}
                          {STAGE_LABELS[e.stage] ?? e.stage}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium">{e.projects_processed}</td>
                      <td className="py-2.5 px-3 text-right">
                        {e.avg_duration_min != null ? `${Math.round(e.avg_duration_min)} min` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {(e.blocks ?? 0) > 0 ? (
                          <span className="text-red-600 font-semibold">{e.blocks}</span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">{e.workers_active}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 5: Unresolved Waste Events */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Incidents matière non résolus</h2>
              {unresolvedEvents.length > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">{unresolvedEvents.length} incident{unresolvedEvents.length > 1 ? 's' : ''} en attente</p>
              )}
            </div>
            {unresolvedEvents.length > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                {unresolvedEvents.length} ouvert{unresolvedEvents.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {unresolvedEvents.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <p className="text-sm font-medium text-gray-700">Aucun incident en cours</p>
              <p className="text-xs text-gray-400 mt-1">Tous les incidents matière ont été résolus</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Matériau</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Déchets</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">%</th>
                    <th className="text-center py-2.5 px-3 text-xs font-medium text-gray-500">Sévérité</th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Projet</th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Raison</th>
                    <th className="py-2.5 px-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {unresolvedEvents.map(evt => (
                    <tr
                      key={evt.id}
                      className={
                        evt.severity === 'critical' ? 'bg-red-50 hover:bg-red-100' :
                        evt.severity === 'warning' ? 'bg-yellow-50 hover:bg-yellow-100' :
                        'hover:bg-gray-50'
                      }
                    >
                      <td className="py-2.5 px-3 font-medium text-gray-900">{evt.material_name}</td>
                      <td className="py-2.5 px-3 text-right">{Number(evt.waste_qty).toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold">
                        <span className={
                          evt.severity === 'critical' ? 'text-red-600' :
                          evt.severity === 'warning' ? 'text-orange-600' : 'text-green-600'
                        }>
                          {Number(evt.waste_pct).toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <SeverityBadge severity={evt.severity} />
                      </td>
                      <td className="py-2.5 px-3">
                        {evt.projects ? (
                          <button
                            onClick={() => router.push(`/projects/${evt.project_id}/workflow`)}
                            className="text-blue-600 hover:underline text-xs font-medium"
                          >
                            {evt.projects.reference_code} — {evt.projects.client_name}
                          </button>
                        ) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-gray-600 max-w-48 truncate">{evt.reason ?? '—'}</td>
                      <td className="py-2.5 px-3">
                        <button
                          onClick={() => handleResolve(evt.id)}
                          disabled={resolvingId === evt.id}
                          className="flex items-center gap-1 bg-green-600 text-white px-2.5 py-1 rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
                        >
                          {resolvingId === evt.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                          Résoudre
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 pb-2">
          Données calculées en temps réel depuis les vues de production
        </div>
      </div>
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function FactoryIntelligencePage() {
  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'workshop_manager']}>
      <FactoryIntelligenceContent />
    </RoleGuard>
  )
}
