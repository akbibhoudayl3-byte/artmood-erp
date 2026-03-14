'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import Input from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Input';
import { PRODUCTION_ISSUE_TYPES, ISSUE_SEVERITIES } from '@/lib/constants';
import type { ProductionIssue, ProductionIssueType, IssueSeverity } from '@/types/database';
import { AlertTriangle, Plus, Check, ArrowLeft, X } from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

export default function ProductionIssuesPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { t } = useLocale();
  const supabase = createClient();

  const [issues, setIssues] = useState<ProductionIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open');

  // Form state
  const [issueType, setIssueType] = useState<ProductionIssueType>('missing_material');
  const [severity, setSeverity] = useState<IssueSeverity>('medium');
  const [description, setDescription] = useState('');
  const [station, setStation] = useState('');

  useEffect(() => { loadIssues(); }, [filter]);

  async function loadIssues() {
    let query = supabase.from('production_issues')
      .select('*, reporter:profiles!production_issues_reported_by_fkey(full_name), production_order:production_orders(project:projects(client_name, reference_code))')
      .order('created_at', { ascending: false });

    if (filter === 'open') query = query.eq('resolved', false);
    if (filter === 'resolved') query = query.eq('resolved', true);

    const { data } = await query;
    setIssues((data as ProductionIssue[]) || []);
    setLoading(false);
  }

  async function reportIssue() {
    if (!description.trim()) return;

    await supabase.from('production_issues').insert({
      issue_type: issueType,
      severity,
      description: description.trim(),
      station: station || null,
      reported_by: profile?.id,
    });

    setShowNew(false);
    setDescription('');
    setStation('');
    loadIssues();
  }

  async function resolveIssue(issueId: string, notes: string) {
    await supabase.from('production_issues').update({
      resolved: true,
      resolved_by: profile?.id,
      resolved_at: new Date().toISOString(),
      resolution_notes: notes || null,
    }).eq('id', issueId);
    loadIssues();
  }

  const openCount = issues.filter(i => !i.resolved).length;

  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager', 'workshop_worker'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/production')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#1a1a2e]">{t('issues.title')}</h1>
          <p className="text-sm text-[#64648B]">{openCount} {t('issues.open')}</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus size={16} /> {t('issues.report_new')}
        </Button>
      </div>

      {/* Quick Report Form */}
      {showNew && (
        <Card className="border-orange-200 bg-orange-50/30">
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">{t('issues.report_new')}</h3>
                <button onClick={() => setShowNew(false)}><X size={18} className="text-gray-400" /></button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('issues.issue_type')}</label>
                  <select
                    value={issueType}
                    onChange={(e) => setIssueType(e.target.value as ProductionIssueType)}
                    className="w-full border border-[#E8E5E0] rounded-xl px-3 py-2 text-sm"
                  >
                    {PRODUCTION_ISSUE_TYPES.map(t => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('issues.severity')}</label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as IssueSeverity)}
                    className="w-full border border-[#E8E5E0] rounded-xl px-3 py-2 text-sm"
                  >
                    {ISSUE_SEVERITIES.map(s => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <Input
                placeholder="Station (optional)"
                value={station}
                onChange={(e) => setStation(e.target.value)}
              />

              <Textarea
                placeholder="Describe the issue..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />

              <Button fullWidth onClick={reportIssue}>
                <AlertTriangle size={16} /> Submit Issue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['open', 'all', 'resolved'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === f ? 'bg-[#1E2F52] text-white' : 'bg-[#F5F3F0] text-[#64648B] hover:bg-[#EBE8E3]'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Issue list */}
      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 skeleton" />)}</div>
      ) : (
        <div className="space-y-2.5">
          {issues.map(issue => (
            <Card key={issue.id} className={`p-4 ${!issue.resolved && issue.severity === 'critical' ? 'border-red-200 bg-red-50/30' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={issue.issue_type} />
                    <StatusBadge status={issue.severity} />
                    {issue.resolved && <StatusBadge status="completed" />}
                  </div>
                  <p className="text-sm text-[#1a1a2e]">{issue.description}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-[#64648B]">
                    {issue.reporter && <span>By {(issue.reporter as { full_name: string }).full_name}</span>}
                    {issue.station && <span>at {issue.station.toUpperCase()}</span>}
                    <span>{new Date(issue.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {issue.resolution_notes && (
                    <p className="text-xs text-green-700 mt-1">Resolution: {issue.resolution_notes}</p>
                  )}
                </div>
                {!issue.resolved && ['ceo', 'workshop_manager'].includes(profile?.role || '') && (
                  <button
                    onClick={() => {
                      const notes = prompt('Resolution notes (optional):');
                      if (notes !== null) resolveIssue(issue.id, notes);
                    }}
                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg flex-shrink-0"
                    title="Mark as resolved"
                  >
                    <Check size={20} />
                  </button>
                )}
              </div>
            </Card>
          ))}
          {issues.length === 0 && (
            <div className="text-center py-12">
              <AlertTriangle size={48} className="mx-auto text-[#E8E5E0] mb-3" />
              <p className="text-[#64648B]">{t('common.no_results')}</p>
            </div>
          )}
        </div>
      )}
    </div>
      </RoleGuard>
  );
}
