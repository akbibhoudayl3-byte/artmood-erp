'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Input';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  ClipboardList,
  Plus,
  Star,
  MessageCircle,
  Send,
  X,
  Check,
  Copy,
  Filter,
  TrendingUp,
  Users,
  ThumbsUp,
  BarChart3,
} from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Survey {
  id: string;
  project_id: string;
  installation_id: string | null;
  client_name: string;
  client_phone: string | null;
  overall_rating: number | null;
  quality_rating: number | null;
  timeliness_rating: number | null;
  communication_rating: number | null;
  would_recommend: boolean | null;
  feedback_text: string | null;
  sent_at: string | null;
  completed_at: string | null;
  sent_via: 'manual' | 'whatsapp' | 'sms' | null;
  status: 'pending' | 'sent' | 'completed' | 'expired';
  project?: {
    client_name: string;
    reference_code: string;
  };
}

interface SatisfactionStats {
  avg_overall: number | null;
  avg_quality: number | null;
  avg_timeliness: number | null;
  avg_communication: number | null;
  nps_score: number | null;
  total_surveys: number;
  completed_surveys: number;
}

interface EligibleProject {
  id: string;
  client_name: string;
  client_phone: string | null;
  reference_code: string;
}

type StatusFilter = 'all' | 'pending' | 'sent' | 'completed' | 'expired';

// ─── Star Rating Component ──────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
  readonly = false,
  size = 'md',
}: {
  value: number;
  onChange?: (v: number) => void;
  readonly?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-3xl' : 'text-xl';

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager'] as any[]}>
    <span className={`inline-flex gap-0.5 ${sizeClass}`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          onClick={() => !readonly && onChange?.(star)}
          className={`
            ${readonly ? '' : 'cursor-pointer hover:scale-110 transition-transform'}
            ${star <= value ? 'text-amber-400' : 'text-gray-300 dark:text-gray-600'}
          `}
        >
          &#9733;
        </span>
      ))}
    </span>
      </RoleGuard>
  );
}

// ─── NPS Color Helper ────────────────────────────────────────────────────────

function npsColor(score: number | null): string {
  if (score === null) return 'text-[#64648B]';
  if (score >= 50) return 'text-emerald-600';
  if (score >= 0) return 'text-amber-500';
  return 'text-red-500';
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function SurveysPage() {
  const { profile, loading: authLoading, hasRole } = useAuth();
  const { t } = useLocale();
  const supabase = createClient();

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [stats, setStats] = useState<SatisfactionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Create survey state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [eligibleProjects, setEligibleProjects] = useState<EligibleProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [createClientName, setCreateClientName] = useState('');
  const [createClientPhone, setCreateClientPhone] = useState('');
  const [creating, setCreating] = useState(false);

  // Record response state
  const [respondingSurvey, setRespondingSurvey] = useState<Survey | null>(null);
  const [responseOverall, setResponseOverall] = useState(0);
  const [responseQuality, setResponseQuality] = useState(0);
  const [responseTimeliness, setResponseTimeliness] = useState(0);
  const [responseCommunication, setResponseCommunication] = useState(0);
  const [responseRecommend, setResponseRecommend] = useState<boolean | null>(null);
  const [responseFeedback, setResponseFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Clipboard toast
  const [copied, setCopied] = useState(false);

  const canManage = hasRole(['ceo', 'commercial_manager']);

  // ─── Data Loading ────────────────────────────────────────────────────────

  const loadSurveys = useCallback(async () => {
    const { data } = await supabase
      .from('client_surveys')
      .select('*, project:projects(client_name, reference_code)')
      .order('sent_at', { ascending: false, nullsFirst: false });

    setSurveys((data as Survey[]) || []);
  }, []);

  const loadStats = useCallback(async () => {
    const { data } = await supabase
      .from('v_client_satisfaction')
      .select('*')
      .single();

    if (data) {
      setStats(data as SatisfactionStats);
    }
  }, []);

  const loadEligibleProjects = useCallback(async () => {
    // Projects with completed installations that don't already have a survey
    const { data: existingProjectIds } = await supabase
      .from('client_surveys')
      .select('project_id');

    const excluded = (existingProjectIds || []).map((r) => r.project_id);

    let query = supabase
      .from('projects')
      .select('id, client_name, client_phone, reference_code')
      .eq('status', 'delivered');

    if (excluded.length > 0) {
      query = query.not('id', 'in', `(${excluded.join(',')})`);
    }

    const { data } = await query.order('created_at', { ascending: false });
    setEligibleProjects((data as EligibleProject[]) || []);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    Promise.all([loadSurveys(), loadStats()]).then(() => setLoading(false));
  }, [authLoading]);

  // ─── Filtered surveys ────────────────────────────────────────────────────

  const filtered = statusFilter === 'all'
    ? surveys
    : surveys.filter((s) => s.status === statusFilter);

  // ─── Create Survey ───────────────────────────────────────────────────────

  function openCreateForm() {
    setShowCreateForm(true);
    setSelectedProjectId('');
    setCreateClientName('');
    setCreateClientPhone('');
    loadEligibleProjects();
  }

  function onProjectSelect(projectId: string) {
    setSelectedProjectId(projectId);
    const proj = eligibleProjects.find((p) => p.id === projectId);
    if (proj) {
      setCreateClientName(proj.client_name);
      setCreateClientPhone(proj.client_phone || '');
    }
  }

  async function handleCreateSurvey() {
    if (!selectedProjectId || !createClientName) return;
    setCreating(true);

    const { error } = await supabase.from('client_surveys').insert({
      project_id: selectedProjectId,
      client_name: createClientName,
      client_phone: createClientPhone || null,
      status: 'pending',
    });

    if (!error) {
      setShowCreateForm(false);
      await Promise.all([loadSurveys(), loadStats()]);
    }
    setCreating(false);
  }

  // ─── Send via WhatsApp ───────────────────────────────────────────────────

  async function handleMarkSentWhatsApp(survey: Survey) {
    await supabase
      .from('client_surveys')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_via: 'whatsapp',
      })
      .eq('id', survey.id);

    await loadSurveys();
  }

  // ─── WhatsApp Message Copy ───────────────────────────────────────────────

  function copyWhatsAppMessage(clientName: string) {
    const message = `Bonjour ${clientName}, merci d'avoir choisi ArtMood! Nous aimerions avoir votre avis sur notre service. Pouvez-vous noter de 1 a 5: Qualite, Ponctualite, Communication. Recommanderiez-vous ArtMood? Merci!`;
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ─── Record Response ─────────────────────────────────────────────────────

  function openResponseForm(survey: Survey) {
    setRespondingSurvey(survey);
    setResponseOverall(survey.overall_rating || 0);
    setResponseQuality(survey.quality_rating || 0);
    setResponseTimeliness(survey.timeliness_rating || 0);
    setResponseCommunication(survey.communication_rating || 0);
    setResponseRecommend(survey.would_recommend);
    setResponseFeedback(survey.feedback_text || '');
  }

  async function handleSubmitResponse() {
    if (!respondingSurvey || responseOverall === 0 || responseQuality === 0 || responseTimeliness === 0 || responseCommunication === 0) return;
    setSubmitting(true);

    const { error } = await supabase
      .from('client_surveys')
      .update({
        overall_rating: responseOverall,
        quality_rating: responseQuality,
        timeliness_rating: responseTimeliness,
        communication_rating: responseCommunication,
        would_recommend: responseRecommend,
        feedback_text: responseFeedback || null,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', respondingSurvey.id);

    if (!error) {
      setRespondingSurvey(null);
      await Promise.all([loadSurveys(), loadStats()]);
    }
    setSubmitting(false);
  }

  // ─── Guards ──────────────────────────────────────────────────────────────

  if (authLoading || loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-gray-200 dark:bg-white/10 rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-gray-200 dark:bg-white/10 rounded-2xl" />
          ))}
        </div>
        <div className="h-96 bg-gray-200 dark:bg-white/10 rounded-2xl" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <ClipboardList size={48} className="text-[#64648B] mb-4" />
        <p className="text-[#64648B] text-lg">Access restricted to CEO and Commercial Manager.</p>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a2e] dark:text-white">{t('surveys.title')}</h1>
          <p className="text-sm text-[#64648B] mt-1">Post-installation survey management</p>
        </div>
        <Button onClick={openCreateForm}>
          <Plus size={18} /> {t('surveys.new_survey')}
        </Button>
      </div>

      {/* NPS Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {/* NPS Score */}
        <Card className="col-span-2">
          <CardContent className="flex flex-col items-center justify-center py-6">
            <p className="text-xs font-semibold text-[#64648B] uppercase tracking-wider mb-1">{t('surveys.nps_score')}</p>
            <p className={`text-5xl font-bold ${npsColor(stats?.nps_score ?? null)}`}>
              {stats?.nps_score !== null && stats?.nps_score !== undefined ? Math.round(stats.nps_score) : '--'}
            </p>
            <p className="text-[11px] text-[#64648B] mt-1">Net Promoter Score</p>
          </CardContent>
        </Card>

        {/* Average Ratings */}
        <Card>
          <CardContent className="flex flex-col items-center py-4">
            <p className="text-[11px] font-semibold text-[#64648B] uppercase tracking-wider mb-1">Overall</p>
            <p className="text-2xl font-bold text-[#1a1a2e] dark:text-white">
              {stats?.avg_overall ? stats.avg_overall.toFixed(1) : '--'}
            </p>
            <StarRating value={Math.round(stats?.avg_overall || 0)} readonly size="sm" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col items-center py-4">
            <p className="text-[11px] font-semibold text-[#64648B] uppercase tracking-wider mb-1">Quality</p>
            <p className="text-2xl font-bold text-[#1a1a2e] dark:text-white">
              {stats?.avg_quality ? stats.avg_quality.toFixed(1) : '--'}
            </p>
            <StarRating value={Math.round(stats?.avg_quality || 0)} readonly size="sm" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col items-center py-4">
            <p className="text-[11px] font-semibold text-[#64648B] uppercase tracking-wider mb-1">Timeliness</p>
            <p className="text-2xl font-bold text-[#1a1a2e] dark:text-white">
              {stats?.avg_timeliness ? stats.avg_timeliness.toFixed(1) : '--'}
            </p>
            <StarRating value={Math.round(stats?.avg_timeliness || 0)} readonly size="sm" />
          </CardContent>
        </Card>

        <Card className="col-span-2 md:col-span-1">
          <CardContent className="flex flex-col items-center py-4">
            <p className="text-[11px] font-semibold text-[#64648B] uppercase tracking-wider mb-1">Communication</p>
            <p className="text-2xl font-bold text-[#1a1a2e] dark:text-white">
              {stats?.avg_communication ? stats.avg_communication.toFixed(1) : '--'}
            </p>
            <StarRating value={Math.round(stats?.avg_communication || 0)} readonly size="sm" />
          </CardContent>
        </Card>

        {/* Completion Rate */}
        <Card className="col-span-2 md:col-span-1">
          <CardContent className="flex flex-col items-center py-4">
            <p className="text-[11px] font-semibold text-[#64648B] uppercase tracking-wider mb-1">Completion</p>
            <p className="text-2xl font-bold text-[#1a1a2e] dark:text-white">
              {stats && stats.total_surveys > 0
                ? `${Math.round((stats.completed_surveys / stats.total_surveys) * 100)}%`
                : '--'}
            </p>
            <p className="text-[11px] text-[#64648B]">
              {stats ? `${stats.completed_surveys}/${stats.total_surveys}` : '0/0'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Filter size={16} className="text-[#64648B] flex-shrink-0" />
        {(['all', 'pending', 'sent', 'completed', 'expired'] as StatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`
              px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors
              ${statusFilter === f
                ? 'bg-[#C9956B] text-white'
                : 'bg-[#F5F3F0] dark:bg-white/5 text-[#64648B] hover:bg-[#EBE8E3] dark:hover:bg-white/10'}
            `}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'all' && ` (${surveys.length})`}
            {f !== 'all' && ` (${surveys.filter((s) => s.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Survey List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <ClipboardList size={40} className="text-[#64648B] mb-3" />
            <p className="text-[#64648B]">{t('common.no_results')}</p>
            <p className="text-xs text-[#64648B] mt-1">Create a survey for a completed installation</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((survey) => (
            <Card key={survey.id}>
              <CardContent>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-[#1a1a2e] dark:text-white truncate">
                        {survey.client_name}
                      </p>
                      <StatusBadge status={survey.status} />
                    </div>
                    <p className="text-xs text-[#64648B] font-mono">
                      {survey.project?.reference_code || '--'}
                    </p>

                    {/* Ratings (if completed) */}
                    {survey.status === 'completed' && survey.overall_rating && (
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-[#64648B] w-24">Overall</span>
                          <StarRating value={survey.overall_rating} readonly size="sm" />
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-[#64648B] w-24">Quality</span>
                          <StarRating value={survey.quality_rating || 0} readonly size="sm" />
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-[#64648B] w-24">Timeliness</span>
                          <StarRating value={survey.timeliness_rating || 0} readonly size="sm" />
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-[#64648B] w-24">Communication</span>
                          <StarRating value={survey.communication_rating || 0} readonly size="sm" />
                        </div>
                        {survey.would_recommend !== null && (
                          <div className="flex items-center gap-2 text-xs mt-1">
                            <ThumbsUp size={14} className={survey.would_recommend ? 'text-emerald-500' : 'text-red-400'} />
                            <span className={survey.would_recommend ? 'text-emerald-600' : 'text-red-500'}>
                              {survey.would_recommend ? 'Would recommend' : 'Would not recommend'}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Feedback preview */}
                    {survey.feedback_text && (
                      <p className="text-xs text-[#64648B] mt-2 line-clamp-2 italic">
                        &ldquo;{survey.feedback_text}&rdquo;
                      </p>
                    )}

                    {/* Date info */}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-[#64648B]">
                      {survey.sent_at && (
                        <span>Sent: {new Date(survey.sent_at).toLocaleDateString('fr-FR')}</span>
                      )}
                      {survey.completed_at && (
                        <span>Completed: {new Date(survey.completed_at).toLocaleDateString('fr-FR')}</span>
                      )}
                      {survey.sent_via && (
                        <span className="capitalize">via {survey.sent_via}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {(survey.status === 'pending' || survey.status === 'sent') && (
                      <>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => openResponseForm(survey)}
                        >
                          <Star size={14} /> Record
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyWhatsAppMessage(survey.client_name)}
                        >
                          <Copy size={14} /> Message
                        </Button>
                      </>
                    )}
                    {survey.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleMarkSentWhatsApp(survey)}
                      >
                        <Send size={14} /> WhatsApp
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Create Survey Modal ──────────────────────────────────────────── */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#1a1a2e] dark:text-white">{t('surveys.new_survey')}</h2>
                <button onClick={() => setShowCreateForm(false)} className="text-[#64648B] hover:text-[#1a1a2e]">
                  <X size={20} />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Project Select */}
              <div className="w-full">
                <label className="block text-sm font-medium text-[#1a1a2e] dark:text-white mb-1.5">
                  {t('surveys.project')}
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => onProjectSelect(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-[#E8E5E0] dark:border-white/10 rounded-xl text-sm bg-white dark:bg-white/5 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20 focus:border-[#C9956B]"
                >
                  <option value="">Select a project...</option>
                  {eligibleProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.reference_code} - {p.client_name}
                    </option>
                  ))}
                </select>
                {eligibleProjects.length === 0 && (
                  <p className="text-xs text-[#64648B] mt-1">No eligible projects (delivered without survey)</p>
                )}
              </div>

              <Input
                label={t('surveys.client')}
                value={createClientName}
                onChange={(e) => setCreateClientName(e.target.value)}
                placeholder="Client name"
              />

              <Input
                label="Client Phone"
                value={createClientPhone}
                onChange={(e) => setCreateClientPhone(e.target.value)}
                placeholder="+212 6XX XXX XXX"
              />

              {/* WhatsApp message preview */}
              {createClientName && (
                <div className="bg-[#F5F3F0] dark:bg-white/5 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-[#64648B]">WhatsApp Message</p>
                    <button
                      onClick={() => copyWhatsAppMessage(createClientName)}
                      className="text-[#C9956B] hover:text-[#B07F5A] text-xs font-semibold flex items-center gap-1"
                    >
                      <Copy size={12} /> {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-xs text-[#64648B] leading-relaxed">
                    Bonjour {createClientName}, merci d&apos;avoir choisi ArtMood! Nous aimerions avoir votre avis sur notre service. Pouvez-vous noter de 1 a 5: Qualite, Ponctualite, Communication. Recommanderiez-vous ArtMood? Merci!
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" onClick={() => setShowCreateForm(false)} fullWidth>
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleCreateSurvey}
                  loading={creating}
                  disabled={!selectedProjectId || !createClientName}
                  fullWidth
                >
                  <Plus size={16} /> Create
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Record Response Modal ────────────────────────────────────────── */}
      {respondingSurvey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#1a1a2e] dark:text-white">Record Response</h2>
                  <p className="text-xs text-[#64648B] mt-0.5">{respondingSurvey.client_name}</p>
                </div>
                <button onClick={() => setRespondingSurvey(null)} className="text-[#64648B] hover:text-[#1a1a2e]">
                  <X size={20} />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Rating inputs */}
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-[#1a1a2e] dark:text-white mb-2">{t('surveys.rating')}</p>
                  <StarRating value={responseOverall} onChange={setResponseOverall} size="lg" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1a1a2e] dark:text-white mb-2">Quality Rating</p>
                  <StarRating value={responseQuality} onChange={setResponseQuality} size="lg" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1a1a2e] dark:text-white mb-2">Timeliness Rating</p>
                  <StarRating value={responseTimeliness} onChange={setResponseTimeliness} size="lg" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1a1a2e] dark:text-white mb-2">Communication Rating</p>
                  <StarRating value={responseCommunication} onChange={setResponseCommunication} size="lg" />
                </div>
              </div>

              {/* Would recommend toggle */}
              <div>
                <p className="text-sm font-medium text-[#1a1a2e] dark:text-white mb-2">Would Recommend ArtMood?</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setResponseRecommend(true)}
                    className={`
                      flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors
                      ${responseRecommend === true
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400'
                        : 'bg-white dark:bg-white/5 border-[#E8E5E0] dark:border-white/10 text-[#64648B] hover:bg-[#F5F3F0] dark:hover:bg-white/10'}
                    `}
                  >
                    <ThumbsUp size={16} className="inline mr-2" />
                    Yes
                  </button>
                  <button
                    onClick={() => setResponseRecommend(false)}
                    className={`
                      flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors
                      ${responseRecommend === false
                        ? 'bg-red-50 border-red-300 text-red-700 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400'
                        : 'bg-white dark:bg-white/5 border-[#E8E5E0] dark:border-white/10 text-[#64648B] hover:bg-[#F5F3F0] dark:hover:bg-white/10'}
                    `}
                  >
                    <X size={16} className="inline mr-2" />
                    No
                  </button>
                </div>
              </div>

              {/* Feedback text */}
              <Textarea
                label={t('surveys.feedback')}
                value={responseFeedback}
                onChange={(e) => setResponseFeedback(e.target.value)}
                placeholder="Client feedback or comments..."
                rows={3}
              />

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" onClick={() => setRespondingSurvey(null)} fullWidth>
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleSubmitResponse}
                  loading={submitting}
                  disabled={responseOverall === 0 || responseQuality === 0 || responseTimeliness === 0 || responseCommunication === 0}
                  fullWidth
                >
                  <Check size={16} /> Submit Response
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Copied toast */}
      {copied && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1a1a2e] text-white px-4 py-2 rounded-xl text-sm font-medium shadow-lg flex items-center gap-2">
          <Check size={16} className="text-emerald-400" />
          Message copied to clipboard
        </div>
      )}
    </div>
  );
}
