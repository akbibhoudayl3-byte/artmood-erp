'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import Input from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Input';
import PhotoUpload from '@/components/ui/PhotoUpload';
import type { InstallationPhoto } from '@/types/database';
import { useInstallationGeogate } from '@/lib/hooks/useInstallationGeogate';
import {
  ArrowLeft, MapPin, Phone, Clock, Navigation, Camera,
  CheckCircle, AlertTriangle, User, Calendar, FileText, ShieldAlert
} from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';

interface InstallationDetail {
  id: string;
  project_id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  estimated_duration_hours: number | null;
  status: string;
  client_address: string | null;
  client_phone: string | null;
  notes: string | null;
  checkin_at: string | null;
  checkin_lat: number | null;
  checkin_lng: number | null;
  checkout_at: string | null;
  checkout_lat: number | null;
  checkout_lng: number | null;
  completion_report: string | null;
  client_satisfaction: number | null;
  team_lead_id: string | null;
  project?: { client_name: string; reference_code: string; address: string | null };
  team_lead?: { full_name: string } | null;
}

interface ChecklistItem {
  id: string;
  item_text: string;
  is_checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
  sort_order: number;
}

interface InstallationIssue {
  id: string;
  description: string;
  severity: string;
  photo_url: string | null;
  resolved: boolean;
  created_at: string;
}

export default function InstallationDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = createClient();
  const { t } = useLocale();

  const { geoGate, loading: geoLoading } = useInstallationGeogate();
  const [installation, setInstallation] = useState<InstallationDetail | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [issues, setIssues] = useState<InstallationIssue[]>([]);
  const [photos, setPhotos] = useState<InstallationPhoto[]>([]);
  const [photoTab, setPhotoTab] = useState<'before' | 'during' | 'after'>('before');
  const [loading, setLoading] = useState(true);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [newIssue, setNewIssue] = useState('');
  const [issueSeverity, setIssueSeverity] = useState('minor');
  const [completionReport, setCompletionReport] = useState('');
  const [satisfaction, setSatisfaction] = useState(5);

  useEffect(() => { loadAll(); }, [id]);

  async function loadAll() {
    setLoading(true);
    const [instRes, checkRes, issueRes, photoRes] = await Promise.all([
      supabase
        .from('installations')
        .select('*, project:projects(client_name, reference_code, address), team_lead:profiles!installations_team_lead_id_fkey(full_name)')
        .eq('id', id)
        .single(),
      supabase
        .from('installation_checklist')
        .select('*')
        .eq('installation_id', id)
        .order('sort_order'),
      supabase
        .from('installation_issues')
        .select('*')
        .eq('installation_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('installation_photos')
        .select('*')
        .eq('installation_id', id)
        .order('created_at', { ascending: false }),
    ]);

    if (instRes.data) {
      setInstallation(instRes.data as InstallationDetail);
      setCompletionReport(instRes.data.completion_report || '');
      setSatisfaction(instRes.data.client_satisfaction || 5);
    }
    setChecklist((checkRes.data as ChecklistItem[]) || []);
    setIssues((issueRes.data as InstallationIssue[]) || []);
    setPhotos((photoRes.data as InstallationPhoto[]) || []);
    setLoading(false);
  }

  async function handleCheckin() {
    if (!installation) return;
    setGeoError(null);
    const result = await geoGate(installation.project_id, 'checkin', installation.id);
    if (!result.allowed) {
      setGeoError(result.reason);
      return;
    }
    await supabase.from('installations').update({
      status: 'in_progress',
      checkin_at: new Date().toISOString(),
    }).eq('id', id);
    // Store GPS coords asynchronously
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        await supabase.from('installations').update({
          checkin_lat: pos.coords.latitude,
          checkin_lng: pos.coords.longitude,
        }).eq('id', id);
      }, () => {});
    }
    loadAll();
  }

  async function handleCheckout() {
    if (!installation) return;
    setGeoError(null);
    const result = await geoGate(installation.project_id, 'checkout', installation.id);
    if (!result.allowed) {
      setGeoError(result.reason);
      return;
    }
    await supabase.from('installations').update({
      status: 'completed',
      checkout_at: new Date().toISOString(),
      completion_report: completionReport || null,
      client_satisfaction: satisfaction,
    }).eq('id', id);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        await supabase.from('installations').update({
          checkout_lat: pos.coords.latitude,
          checkout_lng: pos.coords.longitude,
        }).eq('id', id);
      }, () => {});
    }
    loadAll();
  }

  async function toggleCheckItem(item: ChecklistItem) {
    await supabase.from('installation_checklist').update({
      is_checked: !item.is_checked,
      checked_by: item.is_checked ? null : profile?.id,
      checked_at: item.is_checked ? null : new Date().toISOString(),
    }).eq('id', item.id);
    loadAll();
  }

  async function addCheckItem() {
    if (!newCheckItem.trim()) return;
    await supabase.from('installation_checklist').insert({
      installation_id: id,
      item_text: newCheckItem.trim(),
      sort_order: checklist.length,
    });
    setNewCheckItem('');
    loadAll();
  }

  async function handlePhotoUpload(data: { url: string; path: string }) {
    await supabase.from('installation_photos').insert({
      installation_id: id,
      photo_url: data.url,
      photo_type: photoTab,
      uploaded_by: profile?.id,
    });
    loadAll();
  }

  async function removePhoto(index: number) {
    const photo = filteredPhotos[index];
    if (!photo) return;
    if (!confirm('Delete this photo?')) return;
    await supabase.from('installation_photos').delete().eq('id', photo.id);
    loadAll();
  }

  async function addIssue() {
    if (!newIssue.trim() || !installation) return;
    setGeoError(null);
    const result = await geoGate(installation.project_id, 'report_issue', installation.id);
    if (!result.allowed) {
      setGeoError(result.reason);
      return;
    }
    await supabase.from('installation_issues').insert({
      installation_id: id,
      description: newIssue.trim(),
      severity: issueSeverity,
    });
    setNewIssue('');
    // Also update installation status
    await supabase.from('installations').update({ status: 'issue_reported' }).eq('id', id);
    loadAll();
  }

  async function resolveIssue(issueId: string) {
    await supabase.from('installation_issues').update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: profile?.id,
    }).eq('id', issueId);
    loadAll();
  }

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;
  if (!installation) return <div className="text-center py-12 text-gray-500">{t('common.no_results')}</div>;

  const checkedCount = checklist.filter(c => c.is_checked).length;
  const filteredPhotos = photos.filter(p => p.photo_type === photoTab);

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'installer'] as any[]}>
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/installation')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <p className="text-xs text-gray-400 font-mono">{installation.project?.reference_code}</p>
          <h1 className="text-xl font-bold text-gray-900">{installation.project?.client_name}</h1>
        </div>
        <StatusBadge status={installation.status} />
      </div>

      {/* Geo-gate error banner */}
      {geoError && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-xl">
          <ShieldAlert size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Location check failed</p>
            <p>{geoError}</p>
          </div>
          <button onClick={() => setGeoError(null)} className="ml-auto text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
        </div>
      )}

      {/* Info Card */}
      <Card>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Calendar size={16} className="text-gray-400" />
              <span>
                {new Date(installation.scheduled_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                {installation.scheduled_time ? ` - ${installation.scheduled_time}` : ''}
              </span>
            </div>
            {installation.estimated_duration_hours && (
              <div className="flex items-center gap-2 text-sm">
                <Clock size={16} className="text-gray-400" />
                <span>{installation.estimated_duration_hours}h estimated</span>
              </div>
            )}
            {(installation.client_address || installation.project?.address) && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin size={16} className="text-gray-400" />
                <span>{installation.client_address || installation.project?.address}</span>
              </div>
            )}
            {installation.client_phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone size={16} className="text-gray-400" />
                <a href={`tel:${installation.client_phone}`} className="text-blue-600">{installation.client_phone}</a>
              </div>
            )}
            {installation.team_lead && (
              <div className="flex items-center gap-2 text-sm">
                <User size={16} className="text-gray-400" />
                <span>{t('install.team')}: {installation.team_lead.full_name}</span>
              </div>
            )}
            {installation.notes && (
              <div className="flex items-start gap-2 text-sm">
                <FileText size={16} className="text-gray-400 mt-0.5" />
                <span className="text-gray-600">{installation.notes}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      {installation.status === 'scheduled' && (
        <div className="flex gap-2">
          {(installation.client_address || installation.project?.address) && (
            <Button variant="secondary" size="lg" className="flex-1"
              onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(installation.client_address || installation.project?.address || '')}`)}>
              <Navigation size={18} /> {t('install.location')}
            </Button>
          )}
          <Button variant="success" size="lg" className="flex-1" onClick={handleCheckin} disabled={geoLoading}>
            <CheckCircle size={18} /> {geoLoading ? t('common.loading') : t('install.check_in')}
          </Button>
        </div>
      )}

      {/* Check-in/out times */}
      {installation.checkin_at && (
        <Card>
          <CardContent>
            <div className="flex justify-between text-sm">
              <div>
                <p className="text-gray-400">{t('install.check_in')}</p>
                <p className="font-medium">{new Date(installation.checkin_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              {installation.checkout_at && (
                <div className="text-right">
                  <p className="text-gray-400">{t('install.check_out')}</p>
                  <p className="font-medium">{new Date(installation.checkout_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Checklist */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t('install.checklist')}</h2>
            {checklist.length > 0 && (
              <span className="text-xs text-gray-500">{checkedCount}/{checklist.length}</span>
            )}
          </div>
          {checklist.length > 0 && (
            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
              <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${(checkedCount / checklist.length) * 100}%` }} />
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {checklist.map(item => (
              <label key={item.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.is_checked}
                  onChange={() => toggleCheckItem(item)}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600"
                />
                <span className={item.is_checked ? 'line-through text-gray-400' : 'text-gray-700'}>{item.item_text}</span>
              </label>
            ))}
            {checklist.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">No checklist items yet</p>
            )}
          </div>

          {(installation.status === 'in_progress' || installation.status === 'scheduled') && (
            <div className="flex gap-2 mt-3 pt-3 border-t">
              <Input
                value={newCheckItem}
                onChange={(e) => setNewCheckItem(e.target.value)}
                placeholder={`${t('common.add')} ${t('install.checklist')}...`}
                onKeyDown={(e) => e.key === 'Enter' && addCheckItem()}
              />
              <Button variant="secondary" onClick={addCheckItem}>{t('common.add')}</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photos */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold flex items-center gap-2">
            <Camera size={16} className="text-[#C9956B]" />
            {t('install.photos')}
            {photos.length > 0 && (
              <span className="text-xs text-[#64648B] font-normal">{photos.length} total</span>
            )}
          </h2>
        </CardHeader>
        <CardContent>
          <div className="flex bg-[#F0EDE8] rounded-xl p-1 mb-3">
            {(['before', 'during', 'after'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setPhotoTab(tab)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold ${
                  photoTab === tab
                    ? 'bg-white text-[#1a1a2e] shadow-sm'
                    : 'text-[#64648B]'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {photos.filter(p => p.photo_type === tab).length > 0 && (
                  <span className="ml-1 text-[#C9956B]">({photos.filter(p => p.photo_type === tab).length})</span>
                )}
              </button>
            ))}
          </div>
          <PhotoUpload
            bucket="installations"
            pathPrefix={`${id}/${photoTab}`}
            onUpload={handlePhotoUpload}
            existingPhotos={filteredPhotos.map(p => ({ url: p.photo_url, id: p.id }))}
            onRemove={removePhoto}
            maxPhotos={20}
            label={`Add ${photoTab} photos`}
          />
        </CardContent>
      </Card>

      {/* Issues */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold flex items-center gap-2">
            <AlertTriangle size={16} className="text-orange-500" />
            Issues
            {issues.filter(i => !i.resolved).length > 0 && (
              <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">
                {issues.filter(i => !i.resolved).length} open
              </span>
            )}
          </h2>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {issues.map(issue => (
              <div key={issue.id} className={`p-3 rounded-lg border ${issue.resolved ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={issue.severity} />
                      {issue.resolved && <span className="text-xs text-green-600 font-medium">Resolved</span>}
                    </div>
                    <p className={`text-sm mt-1 ${issue.resolved ? 'text-gray-400' : 'text-gray-700'}`}>{issue.description}</p>
                  </div>
                  {!issue.resolved && (
                    <Button variant="ghost" size="sm" onClick={() => resolveIssue(issue.id)}>
                      <CheckCircle size={16} /> {t('install.completed')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {issues.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">No issues reported</p>
            )}
          </div>

          {installation.status === 'in_progress' && (
            <div className="mt-3 pt-3 border-t space-y-2">
              <Textarea
                value={newIssue}
                onChange={(e) => setNewIssue(e.target.value)}
                placeholder="Describe the issue..."
                rows={2}
              />
              <div className="flex gap-2 items-center">
                <select
                  value={issueSeverity}
                  onChange={(e) => setIssueSeverity(e.target.value)}
                  className="text-sm border rounded-lg px-3 py-2 bg-white"
                >
                  <option value="minor">Minor</option>
                  <option value="major">Major</option>
                  <option value="critical">Critical</option>
                </select>
                <Button variant="danger" size="sm" onClick={addIssue} disabled={geoLoading}>
                  <AlertTriangle size={14} /> {geoLoading ? t('common.loading') : t('install.report_issue')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Completion Section - only when in_progress */}
      {installation.status === 'in_progress' && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">{t('install.completed')}</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Textarea
                label="Completion Report"
                value={completionReport}
                onChange={(e) => setCompletionReport(e.target.value)}
                placeholder="Describe the work completed..."
                rows={3}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client Satisfaction</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setSatisfaction(n)}
                      className={`w-10 h-10 rounded-lg font-bold text-sm ${
                        satisfaction >= n
                          ? 'bg-yellow-400 text-white'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <Button variant="success" size="lg" className="w-full" onClick={handleCheckout} disabled={geoLoading}>
                <CheckCircle size={18} /> {geoLoading ? t('common.loading') : `${t('install.completed')} & ${t('install.check_out')}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completed Summary */}
      {installation.status === 'completed' && installation.completion_report && (
        <Card>
          <CardHeader><h2 className="font-semibold text-green-700">{t('install.completed')}</h2></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700">{installation.completion_report}</p>
            {installation.client_satisfaction && (
              <div className="mt-2 flex items-center gap-1">
                <span className="text-sm text-gray-500">Satisfaction:</span>
                {[1, 2, 3, 4, 5].map(n => (
                  <span key={n} className={`text-lg ${n <= installation.client_satisfaction! ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
      </RoleGuard>
  );
}
