'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { PROJECT_STAGES } from '@/lib/constants';
import type { Project } from '@/types/database';
import { Plus, Search, FolderKanban } from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

export default function ProjectsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { profile } = useAuth();
  const { t } = useLocale();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => { loadProjects(); }, []);

  async function loadProjects() {
    let query = supabase.from('projects').select('*').order('created_at', { ascending: false });

    if (profile?.role === 'designer') {
      query = query.eq('designer_id', profile.id);
    }

    const { data } = await query;
    setProjects(data || []);
    setLoading(false);
  }

  const filtered = projects.filter(p => {
    const matchSearch = !search ||
      p.client_name.toLowerCase().includes(search.toLowerCase()) ||
      p.reference_code?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const getPaymentProgress = (p: Project) => {
    if (!p.total_amount) return 0;
    return Math.round((p.paid_amount / p.total_amount) * 100);
  };

  if (loading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-32 skeleton" />)}</div>;

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">{t('projects.title')}</h1>
          <p className="text-sm text-[#64648B]">{projects.length} total projects</p>
        </div>
        {['ceo', 'commercial_manager'].includes(profile?.role || '') && (
          <Button onClick={() => router.push('/projects/new')}>
            <Plus size={18} /> <span className="hidden sm:inline">{t('projects.new_project')}</span><span className="sm:hidden">New</span>
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64648B]" />
          <input
            type="text"
            placeholder={`${t('common.search')}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20 focus:border-[#C9956B] placeholder:text-gray-400"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3.5 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20 focus:border-[#C9956B]"
        >
          <option value="all">{t('common.all')} {t('common.status')}</option>
          {PROJECT_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {/* Pipeline filter pills - scrollable */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0">
        {PROJECT_STAGES.map(stage => {
          const count = projects.filter(p => p.status === stage.key).length;
          return (
            <button
              key={stage.key}
              onClick={() => setFilterStatus(filterStatus === stage.key ? 'all' : stage.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                filterStatus === stage.key
                  ? 'bg-[#1B2A4A] text-white border-[#1B2A4A]'
                  : 'bg-white text-[#64648B] border-[#E8E5E0] active:bg-[#F5F3F0]'
              }`}
            >
              {stage.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Project Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {filtered.map((project) => (
          <Card key={project.id} className="p-4" onClick={() => router.push(`/projects/${project.id}`)}>
            <div className="flex items-start justify-between mb-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-[#64648B] font-mono">{project.reference_code}</p>
                <p className="text-sm font-semibold text-[#1a1a2e] mt-0.5">{project.client_name}</p>
              </div>
              <StatusBadge status={project.status} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs mb-3">
              <StatusBadge status={project.project_type} />
              {project.priority !== 'normal' && <StatusBadge status={project.priority} />}
            </div>
            {project.total_amount > 0 && (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#64648B]">Payment</span>
                  <span className="font-semibold text-[#1a1a2e]">{getPaymentProgress(project)}%</span>
                </div>
                <div className="w-full h-2 bg-[#F0EDE8] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      getPaymentProgress(project) >= 100 ? 'bg-emerald-500' :
                      getPaymentProgress(project) >= 50 ? 'bg-blue-500' : 'bg-orange-500'
                    }`}
                    style={{ width: `${Math.min(getPaymentProgress(project), 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-[#64648B] mt-1">
                  {project.paid_amount.toLocaleString()} / {project.total_amount.toLocaleString()} MAD
                </p>
              </div>
            )}
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <FolderKanban size={48} className="mx-auto text-[#E8E5E0] mb-3" />
          <p className="text-[#64648B]">{t('common.no_results')}</p>
        </div>
      )}
    </div>
      </RoleGuard>
  );
}
