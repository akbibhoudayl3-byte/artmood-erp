'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { RoleGuard } from '@/components/auth/RoleGuard';
import type { Project } from '@/types/database';
import { ArrowLeft, FileText, CheckCircle } from 'lucide-react';

export default function NewProductionSheetPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLocale();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [projectType, setProjectType] = useState('kitchen');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    // Load projects that are in production status or have validated production
    const { data } = await supabase
      .from('projects')
      .select('*')
      .in('status', ['in_production', 'ready_for_production', 'bom_generated', 'design_validated'])
      .order('created_at', { ascending: false });
    setProjects(data || []);
    setLoading(false);
  }

  function onProjectSelect(projectId: string) {
    setSelectedProject(projectId);
    const project = projects.find(p => p.id === projectId);
    if (project) {
      setClientName(project.client_name || '');
      setClientPhone(project.client_phone || '');
      setDeliveryAddress(project.client_address || '');
      setProjectType(project.project_type || 'kitchen');
    }
  }

  async function createSheet() {
    if (!selectedProject) return;
    setSaving(true);

    const { data, error } = await supabase
      .from('production_sheets')
      .insert({
        project_id: selectedProject,
        client_name: clientName,
        client_phone: clientPhone,
        delivery_address: deliveryAddress,
        project_type: projectType,
        filled_by: profile?.id,
        notes,
      })
      .select()
      .single();

    if (data) {
      router.push(`/production/sheets/${data.id}`);
    } else {
      alert(error?.message || 'Error creating sheet');
      setSaving(false);
    }
  }

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'workshop_manager', 'designer'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/production/sheets')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#1a1a2e]">{t('sheets.new_sheet')}</h1>
          <p className="text-sm text-[#64648B]">{t('sheets.select_project')}</p>
        </div>
      </div>

      {/* Select Project */}
      <Card>
        <CardContent>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">{t('sheets.project')}</label>
            <select
              value={selectedProject}
              onChange={e => onProjectSelect(e.target.value)}
              className="w-full border border-[#E8E5E0] rounded-xl px-3 py-3 text-sm"
            >
              <option value="">{t('sheets.select_project')}</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.reference_code} - {p.client_name} ({p.project_type})
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Client Details */}
      {selectedProject && (
        <Card>
          <CardContent>
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">{t('sheets.client_info')}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('sheets.client_name')}</label>
                  <input type="text" value={clientName} onChange={e => setClientName(e.target.value)}
                    className="w-full border border-[#E8E5E0] rounded-xl px-3 py-3 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('sheets.client_phone')}</label>
                  <input type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)}
                    className="w-full border border-[#E8E5E0] rounded-xl px-3 py-3 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('sheets.delivery_address')}</label>
                <input type="text" value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)}
                  className="w-full border border-[#E8E5E0] rounded-xl px-3 py-3 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('sheets.project_type')}</label>
                <select value={projectType} onChange={e => setProjectType(e.target.value)}
                  className="w-full border border-[#E8E5E0] rounded-xl px-3 py-3 text-sm">
                  <option value="kitchen">Kitchen</option>
                  <option value="dressing">Dressing</option>
                  <option value="furniture">Furniture</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.notes')}</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  className="w-full border border-[#E8E5E0] rounded-xl px-3 py-3 text-sm h-20 resize-none" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Button */}
      {selectedProject && (
        <Button className="w-full" onClick={createSheet} loading={saving}>
          <FileText size={16} /> {t('sheets.create_sheet')}
        </Button>
      )}
    </div>
    </RoleGuard>
  );
}
