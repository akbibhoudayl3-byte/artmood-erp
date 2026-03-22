'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import { useInstallationGeogate } from '@/lib/hooks/useInstallationGeogate';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import type { Installation } from '@/types/database';
import { MapPin, Phone, Clock, Navigation, Camera, CheckCircle, CalendarDays, ShieldAlert, Plus, X } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';

export default function InstallationPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLocale();
  const { geoGate, loading: geoLoading } = useInstallationGeogate();
  const [installations, setInstallations] = useState<(Installation & { project?: { client_name: string; reference_code: string } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newForm, setNewForm] = useState({ project_id: '', scheduled_date: '', scheduled_time: '', notes: '' });
  const [projects, setProjects] = useState<{ id: string; client_name: string; reference_code: string; client_address: string | null; client_phone: string | null }[]>([]);
  const [saving, setSaving] = useState(false);

  const isInstaller = profile?.role === 'installer';

  useEffect(() => { loadInstallations(); }, []);

  async function loadInstallations() {
    let query = supabase
      .from('installations')
      .select('*, project:projects(client_name, reference_code)')
      .order('scheduled_date', { ascending: true });

    if (isInstaller) {
      // Only show installations for this team member
      // Would need to join installation_team, simplified here
    }

    const { data } = await query;
    setInstallations((data as typeof installations) || []);
    setLoading(false);
  }

  async function loadProjects() {
    const { data } = await supabase
      .from('projects')
      .select('id, client_name, reference_code, client_address, client_phone')
      .in('status', ['production', 'installation'])
      .order('created_at', { ascending: false });
    setProjects(data || []);
  }

  async function handleCreateInstallation() {
    if (!newForm.project_id || !newForm.scheduled_date) return;
    setSaving(true);
    const proj = projects.find(p => p.id === newForm.project_id);
    const { error } = await supabase.from('installations').insert({
      project_id: newForm.project_id,
      scheduled_date: newForm.scheduled_date,
      scheduled_time: newForm.scheduled_time || null,
      status: 'scheduled',
      client_address: proj?.client_address || null,
      client_phone: proj?.client_phone || null,
      notes: newForm.notes || null,
      estimated_duration_hours: 8,
    });
    setSaving(false);
    if (!error) {
      setShowNewModal(false);
      setNewForm({ project_id: '', scheduled_date: '', scheduled_time: '', notes: '' });
      loadInstallations();
    }
  }

  async function handleCheckin(id: string, projectId: string) {
    setGeoError(null);
    const result = await geoGate(projectId, 'checkin', id);
    if (!result.allowed) {
      setGeoError(result.reason);
      return;
    }
    // Geo-gate passed — record check-in
    await supabase.from('installations').update({
      status: 'in_progress',
      checkin_at: new Date().toISOString(),
    }).eq('id', id);
    // Re-fetch GPS for lat/lng storage (hook already obtained it)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        await supabase.from('installations').update({
          checkin_lat: pos.coords.latitude,
          checkin_lng: pos.coords.longitude,
        }).eq('id', id);
      }, () => {});
    }
    loadInstallations();
  }

  async function handleCheckout(id: string, projectId: string) {
    setGeoError(null);
    const result = await geoGate(projectId, 'checkout', id);
    if (!result.allowed) {
      setGeoError(result.reason);
      return;
    }
    await supabase.from('installations').update({
      status: 'completed',
      checkout_at: new Date().toISOString(),
    }).eq('id', id);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        await supabase.from('installations').update({
          checkout_lat: pos.coords.latitude,
          checkout_lng: pos.coords.longitude,
        }).eq('id', id);
      }, () => {});
    }
    loadInstallations();
  }

  const today = new Date().toISOString().split('T')[0];
  const todayInstalls = installations.filter(i => i.scheduled_date === today);
  const upcomingInstalls = installations.filter(i => i.scheduled_date > today && i.status === 'scheduled');

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;

  // Installer simplified view
  if (isInstaller) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('install.title')}</h1>

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

        {todayInstalls.length > 0 ? (
          <>
            <h2 className="text-sm font-semibold text-gray-600">Today</h2>
            {todayInstalls.map(inst => (
              <Card key={inst.id} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs text-gray-400 font-mono">{inst.project?.reference_code}</p>
                    <p className="font-semibold text-gray-900">{inst.project?.client_name}</p>
                  </div>
                  <StatusBadge status={inst.status} />
                </div>

                {inst.client_address && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                    <MapPin size={16} /> {inst.client_address}
                  </div>
                )}
                {inst.client_phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                    <Phone size={16} />
                    <a href={`tel:${inst.client_phone}`} className="text-blue-600">{inst.client_phone}</a>
                  </div>
                )}

                <div className="flex gap-2">
                  {inst.status === 'scheduled' && (
                    <>
                      {inst.client_address && (
                        <Button variant="secondary" size="lg" className="flex-1"
                          onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(inst.client_address!)}`)}>
                          <Navigation size={18} /> {t('install.location')}
                        </Button>
                      )}
                      <Button variant="success" size="lg" className="flex-1" onClick={() => handleCheckin(inst.id, inst.project_id)} disabled={geoLoading}>
                        <CheckCircle size={18} /> {geoLoading ? t('common.loading') : t('install.check_in')}
                      </Button>
                    </>
                  )}
                  {inst.status === 'in_progress' && (
                    <>
                      <Button variant="secondary" size="lg" className="flex-1"
                        onClick={() => router.push(`/installation/${inst.id}`)}>
                        <Camera size={18} /> {t('install.photos')} & {t('install.checklist')}
                      </Button>
                      <Button variant="primary" size="lg" className="flex-1" onClick={() => handleCheckout(inst.id, inst.project_id)} disabled={geoLoading}>
                        <CheckCircle size={18} /> {geoLoading ? t('common.loading') : t('install.check_out')}
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">No installations scheduled for today</p>
          </div>
        )}

        {upcomingInstalls.length > 0 && (
          <>
            <h2 className="text-sm font-semibold text-gray-600 mt-6">Upcoming</h2>
            {upcomingInstalls.slice(0, 5).map(inst => (
              <Card key={inst.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{inst.project?.client_name}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(inst.scheduled_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <StatusBadge status={inst.status} />
                </div>
              </Card>
            ))}
          </>
        )}
      </div>
    );
  }

  // Manager view
  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'installer'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('install.title')}</h1>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={() => { loadProjects(); setShowNewModal(true); }}>
            <Plus size={14} /> Nouvelle
          </Button>
          <Button variant="secondary" size="sm" onClick={() => router.push('/installation/calendar')}>
            <CalendarDays size={14} /> {t('install.calendar')}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {installations.map(inst => (
          <Link key={inst.id} href={`/installation/${inst.id}`}>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">{inst.project?.reference_code}</p>
                  <p className="text-sm font-semibold">{inst.project?.client_name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(inst.scheduled_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    {inst.scheduled_time ? ` at ${inst.scheduled_time}` : ''}
                  </p>
                </div>
                <StatusBadge status={inst.status} />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>

      {/* New Installation Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Planifier une Installation</h2>
              <button onClick={() => setShowNewModal(false)} className="p-1 hover:bg-gray-100 rounded"><X size={20} /></button>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Projet *</label>
              <select value={newForm.project_id} onChange={e => setNewForm({ ...newForm, project_id: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">-- Sélectionner --</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.reference_code} — {p.client_name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Date *</label>
                <input type="date" value={newForm.scheduled_date} onChange={e => setNewForm({ ...newForm, scheduled_date: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Heure</label>
                <input type="time" value={newForm.scheduled_time} onChange={e => setNewForm({ ...newForm, scheduled_time: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Notes</label>
              <input type="text" value={newForm.notes} onChange={e => setNewForm({ ...newForm, notes: e.target.value })}
                placeholder="Instructions..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <Button variant="primary" className="w-full" onClick={handleCreateInstallation}
              disabled={saving || !newForm.project_id || !newForm.scheduled_date}>
              {saving ? 'Enregistrement...' : 'Planifier'}
            </Button>
          </div>
        </div>
      )}
      </RoleGuard>
  );
}
