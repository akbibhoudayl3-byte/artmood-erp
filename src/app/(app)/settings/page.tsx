'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { ROLE_LABELS } from '@/lib/constants';
import PhotoUpload from '@/components/ui/PhotoUpload';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/lib/hooks/useLocale';
import { LOCALE_LABELS, type Locale } from '@/lib/i18n';
import { User, Shield, LogOut, Moon, Sun, Globe, Share2 } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';

export default function SettingsPage() {
  const { profile, signOut, isCeo } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const [darkMode, setDarkMode] = useState(false);
  const { locale, setLocale, t } = useLocale();

  useEffect(() => {
    setDarkMode(document.documentElement.classList.contains('dark'));
  }, []);

  function toggleDarkMode() {
    const newMode = !darkMode;
    setDarkMode(newMode);
    document.documentElement.classList.toggle('dark', newMode);
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
  }
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');

  async function updateProfile() {
    if (!profile) return;
    setSaving(true);
    await supabase.from('profiles').update({
      full_name: fullName,
      phone: phone,
      avatar_url: avatarUrl || null,
      updated_at: new Date().toISOString(),
    }).eq('id', profile.id);
    setSaving(false);
  }

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker', 'installer', 'hr_manager', 'community_manager'] as any[]}>
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">{t('settings.title')}</h1>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User size={18} className="text-[#64648B]" /> <h2 className="font-semibold text-[#1a1a2e]">{t('settings.profile')}</h2>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#1B2A4A] to-[#2A3F6A] flex items-center justify-center text-white text-xl font-bold overflow-hidden flex-shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                profile?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
              )}
            </div>
            <PhotoUpload
              bucket="avatars"
              pathPrefix={profile?.id || 'unknown'}
              onUpload={(data) => setAvatarUrl(data.url)}
              existingPhotos={[]}
              maxPhotos={1}
              label="Change Photo"
              compact
            />
          </div>
          <Input label="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input label="Email" value={profile?.email || ''} disabled />
          <div>
            <label className="block text-sm font-medium text-[#1a1a2e] mb-1.5">Role</label>
            <p className="text-sm text-[#64648B] bg-[#F5F3F0] px-3.5 py-2.5 rounded-xl">
              {profile?.role ? ROLE_LABELS[profile.role] : '-'}
            </p>
          </div>
          <Button onClick={updateProfile} loading={saving}>{t('common.save')}</Button>
        </CardContent>
      </Card>

      {isCeo && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-[#64648B]" /> <h2 className="font-semibold text-[#1a1a2e]">{t('settings.admin')}</h2>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {[
              { label: t('settings.manage_users'), href: '/settings/users' },
              { label: t('settings.audit_log'), href: '/settings/audit-log' },
              { label: t('settings.recurring_expenses'), href: '/settings/recurring-expenses' },
              { label: 'Social Media Accounts', href: '/settings/social-media', icon: Share2 },
            ].map(item => (
              <button
                key={item.label}
                onClick={() => router.push(item.href)}
                className="w-full text-left px-3.5 py-3 rounded-xl hover:bg-[#F5F3F0] active:bg-[#EBE8E3] text-sm text-[#1a1a2e] dark:text-white font-medium"
              >
                {item.label}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Appearance */}
      <Card>
        <CardContent>
          <button
            onClick={toggleDarkMode}
            className="w-full flex items-center justify-between px-1 py-2"
          >
            <div className="flex items-center gap-3">
              {darkMode ? <Moon size={18} className="text-[#C9956B]" /> : <Sun size={18} className="text-[#C9956B]" />}
              <span className="text-sm font-medium text-[#1a1a2e] dark:text-white">{t('settings.dark_mode')}</span>
            </div>
            <div className={`w-11 h-6 rounded-full p-0.5 ${darkMode ? 'bg-[#C9956B]' : 'bg-[#E8E5E0]'}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${darkMode ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
          </button>
        </CardContent>
      </Card>

      {/* Language */}
      <Card>
        <CardContent>
          <div className="flex items-center gap-3 mb-3">
            <Globe size={18} className="text-[#C9956B]" />
            <span className="text-sm font-medium text-[#1a1a2e] dark:text-white">{t('settings.language')}</span>
          </div>
          <div className="flex gap-2">
            {(Object.entries(LOCALE_LABELS) as [Locale, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setLocale(key)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  locale === key
                    ? 'bg-[#1B2A4A] text-white'
                    : 'bg-[#F5F3F0] text-[#64648B] hover:bg-[#E8E5E0]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button variant="danger" fullWidth onClick={signOut} size="lg">
        <LogOut size={18} /> {t('common.sign_out')}
      </Button>
    </div>
      </RoleGuard>
  );
}
