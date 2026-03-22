'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import { useRealtime } from '@/lib/hooks/useRealtime';
import Button from '@/components/ui/Button';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import type { ProductionValidation, Project } from '@/types/database';
import {
  CheckCircle, XCircle, Clock, ArrowLeft, ShieldCheck,
  AlertTriangle, Ruler, Palette, Package, Wrench as WrenchIcon,
  UserCheck, Factory, DollarSign
} from 'lucide-react';

interface ValidationItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  status: boolean;
  autoCheck: boolean;
  signedBy?: string | null;
  signedAt?: string | null;
}

export default function ProductionChecklistPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const supabase = createClient();
  const { profile, isCeo } = useAuth();
  const { t } = useLocale();

  const [project, setProject] = useState<Project | null>(null);
  const [validation, setValidation] = useState<ProductionValidation | null>(null);
  const [apiResult, setApiResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverride, setShowOverride] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);

    const { data: proj } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();
    setProject(proj);

    // Call validation API
    const res = await fetch(`/api/projects/validate-production?id=${projectId}`);
    const result = await res.json();
    setApiResult(result);
    setValidation(result.validation);

    setLoading(false);
  };

  useEffect(() => { loadData(); }, [projectId]);

  useRealtime('production_validations', () => { loadData(); });

  const handleSignOff = async (field: 'installer_validated' | 'workshop_manager_validated') => {
    if (!validation || !profile) return;
    setSaving(true);

    const byField = field === 'installer_validated' ? 'installer_validated_by' : 'workshop_manager_validated_by';
    const atField = field === 'installer_validated' ? 'installer_validated_at' : 'workshop_manager_validated_at';

    await supabase
      .from('production_validations')
      .update({
        [field]: true,
        [byField]: profile.id,
        [atField]: new Date().toISOString(),
      })
      .eq('id', validation.id);

    await loadData();
    setSaving(false);
  };

  const handleCeoOverride = async () => {
    if (!validation || !profile || !overrideReason.trim()) return;
    setSaving(true);

    await supabase
      .from('production_validations')
      .update({
        ceo_override: true,
        ceo_override_by: profile.id,
        ceo_override_at: new Date().toISOString(),
        ceo_override_reason: overrideReason.trim(),
      })
      .eq('id', validation.id);

    // Log to audit
    await supabase.from('audit_log').insert({
      user_id: profile.id,
      action: 'ceo_production_override',
      table_name: 'production_validations',
      record_id: validation.id,
      new_data: { reason: overrideReason.trim(), project_id: projectId },
    });

    await loadData();
    setSaving(false);
    setShowOverride(false);
  };

  const handleApproveForProduction = async () => {
    if (!project) return;
    setSaving(true);

    await supabase
      .from('projects')
      .update({ status: 'in_production' })
      .eq('id', projectId);

    // Create notification
    await supabase.from('notifications').insert({
      user_id: profile?.id || '',
      title: t('production_approved'),
      body: `${project.reference_code || project.client_name} - ${t('moved_to_production')}`,
      type: 'production',
      severity: 'info',
    });

    router.push(`/projects/${projectId}`);
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-[#C9956B] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const v = validation;
  const items: ValidationItem[] = [
    {
      key: 'deposit',
      label: t('deposit_check_50'),
      icon: <DollarSign className="w-5 h-5" />,
      status: v?.deposit_check ?? false,
      autoCheck: true,
    },
    {
      key: 'measurements',
      label: t('measurements_validated'),
      icon: <Ruler className="w-5 h-5" />,
      status: v?.measurements_validated ?? false,
      autoCheck: true,
    },
    {
      key: 'design',
      label: t('design_validated'),
      icon: <Palette className="w-5 h-5" />,
      status: v?.design_validated ?? false,
      autoCheck: true,
    },
    {
      key: 'materials',
      label: t('materials_available'),
      icon: <Package className="w-5 h-5" />,
      status: v?.materials_available ?? false,
      autoCheck: true,
    },
    {
      key: 'accessories',
      label: t('accessories_available'),
      icon: <WrenchIcon className="w-5 h-5" />,
      status: v?.accessories_available ?? false,
      autoCheck: false,
    },
    {
      key: 'installer',
      label: t('installer_sign_off'),
      icon: <UserCheck className="w-5 h-5" />,
      status: v?.installer_validated ?? false,
      autoCheck: false,
      signedBy: v?.installer_validated_by,
      signedAt: v?.installer_validated_at,
    },
    {
      key: 'workshop',
      label: t('workshop_manager_sign_off'),
      icon: <Factory className="w-5 h-5" />,
      status: v?.workshop_manager_validated ?? false,
      autoCheck: false,
      signedBy: v?.workshop_manager_validated_by,
      signedAt: v?.workshop_manager_validated_at,
    },
  ];

  const allPassed = items.every(i => i.status);
  const hasOverride = v?.ceo_override === true;
  const canApprove = allPassed || hasOverride;
  const passedCount = items.filter(i => i.status).length;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {t('production_checklist')}
          </h1>
          <p className="text-sm text-gray-500">
            {project?.reference_code} — {project?.client_name}
          </p>
        </div>
      </div>

      {/* Progress */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('validation_progress')}
            </span>
            <span className="text-sm font-bold text-[#C9956B]">
              {passedCount}/{items.length}
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
            <div
              className="bg-[#C9956B] h-3 rounded-full transition-all duration-500"
              style={{ width: `${(passedCount / items.length) * 100}%` }}
            />
          </div>
          {apiResult?.depositPercent !== undefined && (
            <p className="text-xs text-gray-500 mt-2">
              {t('deposit_paid')}: {apiResult.depositPercent}%
            </p>
          )}
        </CardContent>
      </Card>

      {/* Checklist Items */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {t('validation_checklist')}
          </h2>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.key} className={`flex items-center gap-3 p-3 rounded-xl border ${
                item.status
                  ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/20'
                  : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20'
              }`}>
                <div className={`p-2 rounded-lg ${
                  item.status ? 'bg-green-100 text-green-600 dark:bg-green-900/40' : 'bg-red-100 text-red-600 dark:bg-red-900/40'
                }`}>
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 dark:text-white">{item.label}</p>
                  {item.autoCheck && (
                    <p className="text-xs text-gray-500">{t('auto_checked')}</p>
                  )}
                  {item.signedAt && (
                    <p className="text-xs text-gray-500">
                      {new Date(item.signedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div>
                  {item.status ? (
                    <CheckCircle className="w-6 h-6 text-green-500" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Sign-off Buttons */}
      {profile && !allPassed && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900 dark:text-white">{t('actions')}</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Accessories toggle */}
              {!v?.accessories_available && (profile.role === 'workshop_manager' || profile.role === 'ceo') && (
                <Button
                  onClick={async () => {
                    if (!v) return;
                    setSaving(true);
                    await supabase.from('production_validations').update({ accessories_available: true }).eq('id', v.id);
                    await loadData();
                    setSaving(false);
                  }}
                  variant="secondary"
                  fullWidth
                  disabled={saving}
                >
                  <Package className="w-4 h-4 mr-2" />
                  {t('confirm_accessories_available')}
                </Button>
              )}

              {/* Installer sign-off */}
              {!v?.installer_validated && (profile.role === 'installer' || profile.role === 'ceo') && (
                <Button
                  onClick={() => handleSignOff('installer_validated')}
                  variant="primary"
                  fullWidth
                  disabled={saving}
                >
                  <UserCheck className="w-4 h-4 mr-2" />
                  {t('sign_off_as_installer')}
                </Button>
              )}

              {/* Workshop manager sign-off */}
              {!v?.workshop_manager_validated && (profile.role === 'workshop_manager' || profile.role === 'ceo') && (
                <Button
                  onClick={() => handleSignOff('workshop_manager_validated')}
                  variant="primary"
                  fullWidth
                  disabled={saving}
                >
                  <Factory className="w-4 h-4 mr-2" />
                  {t('sign_off_as_workshop_manager')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* CEO Override */}
      {isCeo && !allPassed && !hasOverride && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h2 className="font-semibold text-gray-900 dark:text-white">{t('ceo_override')}</h2>
            </div>
          </CardHeader>
          <CardContent>
            {!showOverride ? (
              <Button onClick={() => setShowOverride(true)} variant="ghost" fullWidth>
                <ShieldCheck className="w-4 h-4 mr-2" />
                {t('override_validation')}
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  {t('override_warning')}
                </p>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder={t('override_reason_placeholder')}
                  className="w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-[#C9956B] dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button onClick={() => setShowOverride(false)} variant="ghost" className="flex-1">
                    {t('cancel')}
                  </Button>
                  <Button
                    onClick={handleCeoOverride}
                    variant="danger"
                    className="flex-1"
                    disabled={saving || !overrideReason.trim()}
                  >
                    {t('confirm_override')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Override badge */}
      {hasOverride && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-500" />
            <span className="font-medium text-amber-800 dark:text-amber-200">{t('ceo_override_active')}</span>
          </div>
          {v?.ceo_override_reason && (
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">{v.ceo_override_reason}</p>
          )}
        </div>
      )}

      {/* Approve Button */}
      {canApprove && project?.status !== 'in_production' && (
        <Button
          onClick={handleApproveForProduction}
          variant="primary"
          size="lg"
          fullWidth
          disabled={saving}
        >
          <CheckCircle className="w-5 h-5 mr-2" />
          {t('approve_for_production')}
        </Button>
      )}
    </div>
  );
}
