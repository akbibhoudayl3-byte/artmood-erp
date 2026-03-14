'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import { useInstallationGeogate } from '@/lib/hooks/useInstallationGeogate';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { RoleGuard } from '@/components/auth/RoleGuard';
import {
  Wrench, MapPin, Phone, Clock, Navigation, CheckCircle,
  Calendar, ArrowRight, LogOut, ShieldAlert,
} from 'lucide-react';

interface CurrentJob {
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
  checkout_at: string | null;
  project?: { client_name: string; reference_code: string } | null;
}

export default function CurrentJobPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { t } = useLocale();
  const supabase = createClient();

  const { geoGate, loading: geoLoading } = useInstallationGeogate();
  const [job, setJob] = useState<CurrentJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Checkout-specific state
  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [showCheckoutNotes, setShowCheckoutNotes] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => { loadCurrentJob(); }, []);

  async function loadCurrentJob() {
    const { data } = await supabase
      .from('installations')
      .select('*, project:projects(client_name, reference_code)')
      .in('status', ['in_progress', 'scheduled'])
      .eq('scheduled_date', today)
      .order('status', { ascending: false })
      .limit(1)
      .maybeSingle();

    setJob(data as CurrentJob | null);
    setLoading(false);
  }

  async function handleCheckin() {
    if (!job || checking) return;
    setChecking(true);
    setGeoError(null);

    // Enforce geo-gate before allowing check-in
    const result = await geoGate(job.project_id, 'checkin', job.id);
    if (!result.allowed) {
      setGeoError(result.reason);
      setChecking(false);
      return;
    }

    await supabase.from('installations').update({
      status: 'in_progress',
      checkin_at: new Date().toISOString(),
    }).eq('id', job.id);

    // Store GPS coords asynchronously
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await supabase.from('installations').update({
            checkin_lat: pos.coords.latitude,
            checkin_lng: pos.coords.longitude,
          }).eq('id', job.id);
        },
        () => {}
      );
    }
    await loadCurrentJob();
    setChecking(false);
  }

  async function handleCheckout() {
    if (!job || checking) return;
    setChecking(true);
    setGeoError(null);

    // Enforce geo-gate before allowing checkout
    const result = await geoGate(job.project_id, 'checkout', job.id);
    if (!result.allowed) {
      setGeoError(result.reason);
      setChecking(false);
      return;
    }

    const updatePayload: Record<string, unknown> = {
      status: 'completed',
      checkout_at: new Date().toISOString(),
      ...(checkoutNotes.trim() ? { completion_notes: checkoutNotes.trim() } : {}),
    };

    const { error } = await supabase
      .from('installations')
      .update(updatePayload)
      .eq('id', job.id);

    if (error) {
      console.error('Checkout failed:', error.message);
      setChecking(false);
      return;
    }

    // Store GPS coords asynchronously
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await supabase.from('installations').update({
            checkout_lat: pos.coords.latitude,
            checkout_lng: pos.coords.longitude,
          }).eq('id', job.id);
        },
        () => {}
      );
    }

    setSuccessMessage('Job completed! ✓');
    setShowCheckoutNotes(false);
    setChecking(false);

    // Reload job state then navigate after 2 s
    await loadCurrentJob();
    setTimeout(() => {
      router.push(`/installation/${job.id}`);
    }, 2000);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 skeleton rounded-lg" />
        <div className="h-64 skeleton rounded-xl" />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager', 'installer'] as any[]}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight flex items-center gap-2">
            <Wrench size={22} className="text-[#C9956B]" />
            {t('install.current_job') || 'Current Job'}
          </h1>
          <p className="text-sm text-[#64648B] mt-0.5">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
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

        {/* Success message banner */}
        {successMessage && (
          <div className="flex items-center gap-2 text-sm font-semibold text-green-700 bg-green-50 border border-green-200 p-3 rounded-xl animate-pulse">
            <CheckCircle size={18} />
            <span>{successMessage}</span>
          </div>
        )}

        {!job ? (
          <Card className="text-center py-16">
            <CardContent>
              <Calendar size={48} className="mx-auto mb-4 text-[#C9956B]/40" />
              <h2 className="text-lg font-semibold text-[#1a1a2e] mb-2">
                {t('install.no_job_today') || 'No job scheduled today'}
              </h2>
              <p className="text-sm text-[#64648B] mb-6">
                {t('install.check_schedule') || 'Check your schedule for upcoming installations'}
              </p>
              <Button variant="secondary" onClick={() => router.push('/installation')}>
                <Calendar size={16} />
                {t('install.view_schedule') || 'View Schedule'}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-2 border-[#C9956B]/30 bg-gradient-to-br from-white to-[#FDF9F6]">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-[#64648B] uppercase tracking-wider mb-1">
                      {job.project?.reference_code}
                    </p>
                    <h2 className="text-xl font-bold text-[#1a1a2e]">
                      {job.project?.client_name || '—'}
                    </h2>
                  </div>
                  <StatusBadge status={job.status} />
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {job.scheduled_time && (
                    <div className="flex items-center gap-3 p-3 bg-[#F5F3F0] rounded-xl">
                      <Clock size={18} className="text-[#C9956B] shrink-0" />
                      <div>
                        <p className="text-xs text-[#64648B]">{t('common.time') || 'Time'}</p>
                        <p className="font-semibold text-[#1a1a2e] text-sm">
                          {job.scheduled_time}
                          {job.estimated_duration_hours ? ` (${job.estimated_duration_hours}h)` : ''}
                        </p>
                      </div>
                    </div>
                  )}

                  {job.client_address && (
                    <div className="flex items-center gap-3 p-3 bg-[#F5F3F0] rounded-xl">
                      <MapPin size={18} className="text-[#C9956B] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-[#64648B]">{t('common.address') || 'Address'}</p>
                        <p className="font-medium text-[#1a1a2e] text-sm">{job.client_address}</p>
                      </div>
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(job.client_address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-white rounded-lg border border-[#E8E5E0] hover:bg-[#F5F3F0] transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        <Navigation size={16} className="text-[#C9956B]" />
                      </a>
                    </div>
                  )}

                  {job.client_phone && (
                    <div className="flex items-center gap-3 p-3 bg-[#F5F3F0] rounded-xl">
                      <Phone size={18} className="text-[#C9956B] shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs text-[#64648B]">{t('common.phone') || 'Phone'}</p>
                        <p className="font-medium text-[#1a1a2e] text-sm">{job.client_phone}</p>
                      </div>
                      <a
                        href={`tel:${job.client_phone}`}
                        className="p-2 bg-white rounded-lg border border-[#E8E5E0] hover:bg-[#F5F3F0] transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        <Phone size={16} className="text-[#C9956B]" />
                      </a>
                    </div>
                  )}

                  {job.notes && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-xs text-amber-600 font-medium mb-1">{t('common.notes') || 'Notes'}</p>
                      <p className="text-sm text-amber-800">{job.notes}</p>
                    </div>
                  )}
                </div>

                {job.checkin_at && (
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 p-3 rounded-xl">
                    <CheckCircle size={16} />
                    <span>
                      {t('install.checked_in') || 'Checked in'} at{' '}
                      {new Date(job.checkin_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}

                {/* Checkout time badge — shown once job is completed */}
                {job.checkout_at && (
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-100 border border-green-300 p-3 rounded-xl font-medium">
                    <LogOut size={16} />
                    <span>
                      Completed at{' '}
                      {new Date(job.checkout_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3">
              {job.status === 'scheduled' && (
                <Button
                  className="w-full py-4 text-base"
                  onClick={handleCheckin}
                  disabled={checking}
                >
                  <CheckCircle size={20} />
                  {checking ? (t('common.loading') || 'Loading...') : (t('install.check_in') || 'Check In')}
                </Button>
              )}

              {/* Checkout section — only for in_progress jobs that haven't checked out yet */}
              {job.status === 'in_progress' && !job.checkout_at && (
                <>
                  {/* Toggle notes textarea */}
                  {showCheckoutNotes && (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-3 space-y-2">
                      <label className="block text-xs font-medium text-green-700">
                        Completion Notes <span className="font-normal text-green-500">(optional)</span>
                      </label>
                      <textarea
                        value={checkoutNotes}
                        onChange={e => setCheckoutNotes(e.target.value)}
                        rows={3}
                        placeholder="Any issues, follow-up needed, client feedback…"
                        className="w-full rounded-lg border border-green-200 bg-white text-sm text-[#1a1a2e] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
                      />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowCheckoutNotes(prev => !prev)}
                      className="px-3 py-2 text-xs font-medium text-[#64648B] bg-[#F5F3F0] rounded-xl hover:bg-[#EBE8E3] transition-colors"
                    >
                      {showCheckoutNotes ? 'Hide Notes' : 'Add Notes'}
                    </button>

                    <Button
                      className="flex-1 py-4 text-base bg-green-600 hover:bg-green-700 text-white"
                      onClick={handleCheckout}
                      disabled={checking}
                    >
                      <LogOut size={20} />
                      {checking ? (t('common.loading') || 'Loading...') : 'Complete Job'}
                    </Button>
                  </div>
                </>
              )}

              <Button
                variant="secondary"
                className="w-full"
                onClick={() => router.push(`/installation/${job.id}`)}
              >
                <ArrowRight size={18} />
                {t('install.view_details') || 'View Full Details'}
              </Button>
            </div>
          </>
        )}
      </div>
    </RoleGuard>
  );
}
