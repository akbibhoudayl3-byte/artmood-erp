'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Input';
import Card, { CardContent } from '@/components/ui/Card';
import { LEAD_SOURCES } from '@/lib/constants';
import { ArrowLeft, Instagram, Globe, User, Users, Building2, MapPin } from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  instagram: <Instagram size={20} />,
  facebook: <Globe size={20} />,
  google: <Globe size={20} />,
  architect: <Building2 size={20} />,
  referral: <Users size={20} />,
  walk_in: <User size={20} />,
  website: <Globe size={20} />,
  other: <MapPin size={20} />,
};

export default function NewLeadPage() {
  const router = useRouter();
  const supabase = createClient();
  const { profile } = useAuth();
  const { t } = useLocale();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    city: '',
    source: '' as string,
    notes: '',
  });

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.from('leads').insert({
      full_name: form.full_name,
      phone: form.phone,
      city: form.city || null,
      source: form.source || null,
      notes: form.notes || null,
      status: 'new',
      assigned_to: profile?.role === 'community_manager' ? null : profile?.id,
      created_by: profile?.id,
    });

    setLoading(false);
    if (!error) router.push('/leads');
  }

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'community_manager'] as any[]}>
    <div className="max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900">{t('common.add')}</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardContent className="space-y-4 py-5">
            <Input
              label={`${t('common.name')} *`}
              placeholder={t('common.name')}
              value={form.full_name}
              onChange={(e) => update('full_name', e.target.value)}
              required
              autoFocus
            />

            <Input
              label={`${t('common.phone')} *`}
              type="tel"
              placeholder="+212 6XX XXX XXX"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              required
            />

            <Input
              label={t('common.city')}
              placeholder={t('common.city')}
              value={form.city}
              onChange={(e) => update('city', e.target.value)}
            />

            {/* Source selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Source</label>
              <div className="grid grid-cols-4 gap-2">
                {LEAD_SOURCES.map((src) => (
                  <button
                    key={src.key}
                    type="button"
                    onClick={() => update('source', src.key)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-xs transition-colors ${
                      form.source === src.key
                        ? 'border-[#1B2A4A] bg-[#1B2A4A]/5 text-[#1B2A4A]'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {SOURCE_ICONS[src.key]}
                    {src.label}
                  </button>
                ))}
              </div>
            </div>

            <Textarea
              label={t('common.notes')}
              placeholder="Any notes about this lead..."
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              rows={3}
            />
          </CardContent>
        </Card>

        <div className="flex gap-3 mt-4">
          <Button type="button" variant="secondary" onClick={() => router.back()} className="flex-1">
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={loading} className="flex-1">
            {t('common.save')}
          </Button>
        </div>
      </form>
    </div>
      </RoleGuard>
  );
}
