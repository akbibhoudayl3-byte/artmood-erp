'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { ArrowLeft, Instagram, Facebook, Music2, Check, AlertCircle, Eye, EyeOff, RefreshCw, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

interface SocialCredential {
  id: string;
  platform: string;
  access_token: string | null;
  page_id: string | null;
  account_id: string | null;
  app_id: string | null;
  app_secret: string | null;
  token_expires_at: string | null;
  is_connected: boolean;
  last_sync_at: string | null;
}

const PLATFORM_CONFIG = {
  instagram: {
    label: 'Instagram',
    icon: Instagram,
    color: 'from-pink-500 to-purple-600',
    bgLight: 'bg-pink-50',
    textColor: 'text-pink-600',
    fields: [
      { key: 'access_token', label: 'Long-Lived Access Token', help: 'From Meta Developer Portal > Graph API Explorer' },
      { key: 'account_id', label: 'Instagram Business Account ID', help: 'Your Instagram Business/Creator account ID' },
      { key: 'page_id', label: 'Facebook Page ID', help: 'The Facebook Page connected to your Instagram account' },
    ],
  },
  facebook: {
    label: 'Facebook',
    icon: Facebook,
    color: 'from-blue-600 to-blue-700',
    bgLight: 'bg-blue-50',
    textColor: 'text-blue-600',
    fields: [
      { key: 'access_token', label: 'Page Access Token', help: 'Long-lived Page Access Token from Meta Developer Portal' },
      { key: 'page_id', label: 'Facebook Page ID', help: 'Your Facebook Page ID' },
      { key: 'app_id', label: 'App ID (optional)', help: 'Meta App ID for extended permissions' },
    ],
  },
  tiktok: {
    label: 'TikTok',
    icon: Music2,
    color: 'from-gray-800 to-gray-900',
    bgLight: 'bg-gray-100',
    textColor: 'text-gray-700',
    fields: [
      { key: 'access_token', label: 'Access Token', help: 'From TikTok for Business Developer Portal' },
      { key: 'account_id', label: 'Advertiser / Account ID', help: 'Your TikTok Business account ID' },
    ],
  },
} as const;

const SETUP_GUIDES: Record<string, { steps: string[]; links: { label: string; url: string }[] }> = {
  instagram: {
    steps: [
      'You need a Facebook Page connected to an Instagram Business or Creator account.',
      'Go to Meta for Developers (developers.facebook.com) and create an app (type: Business).',
      'In your app, go to "Add Products" and add "Instagram Graph API".',
      'Go to Graph API Explorer (developers.facebook.com/tools/explorer).',
      'Select your app, then click "Generate Access Token". Grant permissions: instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement.',
      'Copy the short-lived token. To make it long-lived (60 days), use the Access Token Debugger or call: GET /oauth/access_token?grant_type=fb_exchange_token&client_id={APP_ID}&client_secret={APP_SECRET}&fb_exchange_token={SHORT_TOKEN}',
      'To find your Instagram Business Account ID: in Graph API Explorer, query GET /me/accounts to list your Pages, then GET /{page-id}?fields=instagram_business_account to get the IG account ID.',
      'The Facebook Page ID is the "id" field from the /me/accounts response.',
    ],
    links: [
      { label: 'Meta Developer Portal', url: 'https://developers.facebook.com' },
      { label: 'Graph API Explorer', url: 'https://developers.facebook.com/tools/explorer' },
      { label: 'Access Token Debugger', url: 'https://developers.facebook.com/tools/debug/accesstoken' },
    ],
  },
  facebook: {
    steps: [
      'Go to Meta for Developers (developers.facebook.com) and create or select your app.',
      'Go to Graph API Explorer (developers.facebook.com/tools/explorer).',
      'Select your app, then select your Facebook Page (not "User Token" but "Page Token").',
      'Grant permissions: pages_show_list, pages_read_engagement, pages_read_user_content, read_insights.',
      'Click "Generate Access Token". This gives you a Page Access Token.',
      'To make it long-lived: use the Access Token Debugger to extend it, or call the token exchange endpoint (same as Instagram above).',
      'Your Page ID: in Graph API Explorer, query GET /me/accounts — the "id" field is your Page ID.',
      'App ID (optional): found on your app\'s dashboard at developers.facebook.com.',
    ],
    links: [
      { label: 'Meta Developer Portal', url: 'https://developers.facebook.com' },
      { label: 'Graph API Explorer', url: 'https://developers.facebook.com/tools/explorer' },
      { label: 'Access Token Debugger', url: 'https://developers.facebook.com/tools/debug/accesstoken' },
    ],
  },
  tiktok: {
    steps: [
      'Go to TikTok for Business Developer Portal (business-api.tiktok.com).',
      'Create a developer account and register a new app.',
      'Select the "Marketing API" or "Business API" product.',
      'Once your app is approved, go to "App Management" to find your Access Token.',
      'Your Advertiser/Account ID is found in TikTok Ads Manager under "Account Settings".',
      'Note: TikTok API approval can take a few days. The token does not expire but may be revoked if the app is suspended.',
    ],
    links: [
      { label: 'TikTok Business Developer Portal', url: 'https://business-api.tiktok.com' },
      { label: 'TikTok Ads Manager', url: 'https://ads.tiktok.com' },
    ],
  },
};

export default function SocialMediaSettingsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { t } = useLocale();
  const supabase = createClient();

  const [credentials, setCredentials] = useState<SocialCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);

  // Form state per platform
  const [forms, setForms] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => { loadCredentials(); }, []);

  async function loadCredentials() {
    const { data } = await supabase.from('social_credentials').select('*').order('platform');
    const creds = (data as SocialCredential[]) || [];
    setCredentials(creds);

    // Init forms
    const f: Record<string, Record<string, string>> = {};
    creds.forEach(c => {
      f[c.platform] = {
        access_token: c.access_token || '',
        page_id: c.page_id || '',
        account_id: c.account_id || '',
        app_id: c.app_id || '',
        app_secret: c.app_secret || '',
      };
    });
    setForms(f);
    setLoading(false);
  }

  function updateForm(platform: string, field: string, value: string) {
    setForms(prev => ({
      ...prev,
      [platform]: { ...prev[platform], [field]: value },
    }));
  }

  async function saveCredentials(platform: string) {
    setSaving(platform);
    const form = forms[platform];
    const hasToken = !!form?.access_token?.trim();

    await supabase.from('social_credentials')
      .update({
        access_token: form?.access_token?.trim() || null,
        page_id: form?.page_id?.trim() || null,
        account_id: form?.account_id?.trim() || null,
        app_id: form?.app_id?.trim() || null,
        app_secret: form?.app_secret?.trim() || null,
        is_connected: hasToken,
        updated_at: new Date().toISOString(),
      })
      .eq('platform', platform);

    await loadCredentials();
    setSaving(null);
  }

  async function testConnection(platform: string) {
    setTesting(platform);
    setTestResult(prev => ({ ...prev, [platform]: { ok: false, msg: 'Testing...' } }));

    try {
      const res = await fetch(`/api/social/test?platform=${platform}`);
      const data = await res.json();
      setTestResult(prev => ({
        ...prev,
        [platform]: { ok: data.success, msg: data.message || (data.success ? 'Connected!' : 'Failed') },
      }));
    } catch {
      setTestResult(prev => ({
        ...prev,
        [platform]: { ok: false, msg: 'Request failed' },
      }));
    }
    setTesting(null);
  }

  async function syncPlatform(platform: string) {
    setTesting(platform);
    try {
      const res = await fetch(`/api/social/sync?platform=${platform}`, { method: 'POST' });
      const data = await res.json();
      setTestResult(prev => ({
        ...prev,
        [platform]: { ok: data.success, msg: data.message || `Synced ${data.synced || 0} posts` },
      }));
    } catch {
      setTestResult(prev => ({
        ...prev,
        [platform]: { ok: false, msg: 'Sync failed' },
      }));
    }
    setTesting(null);
  }

  if (profile?.role !== 'ceo') {
    return <div className="text-center py-12 text-[#64648B]">Only CEO can manage social media settings</div>;
  }

  if (loading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-40 skeleton" />)}</div>;

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker', 'installer', 'hr_manager', 'community_manager'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/settings')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#1a1a2e]">{t('social.title')}</h1>
          <p className="text-sm text-[#64648B]">Connect your accounts to auto-sync engagement data</p>
        </div>
      </div>

      {/* How it works */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <h3 className="text-sm font-semibold text-blue-800 mb-2">How it works</h3>
        <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
          <li>Follow the setup guide for each platform below to get your API credentials</li>
          <li>Paste your tokens and IDs in the fields below, then click <strong>Save</strong></li>
          <li>Click <strong>Test Connection</strong> to verify everything works</li>
          <li>Go to the <strong>Marketing</strong> page and click <strong>Sync API</strong> to auto-pull likes, comments &amp; reach</li>
        </ol>
        <p className="text-[10px] text-blue-600 mt-2">Tokens expire periodically. If syncing stops working, generate a new token and update it here.</p>
      </Card>

      {/* Platform Cards */}
      {(['instagram', 'facebook', 'tiktok'] as const).map(platform => {
        const config = PLATFORM_CONFIG[platform];
        const cred = credentials.find(c => c.platform === platform);
        const Icon = config.icon;
        const form = forms[platform] || {};
        const result = testResult[platform];

        return (
          <Card key={platform}>
            <div className={`p-4 bg-gradient-to-r ${config.color} rounded-t-2xl flex items-center gap-3`}>
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Icon size={20} className="text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-white">{config.label}</h3>
                <p className="text-xs text-white/70">
                  {cred?.is_connected ? t('social.connect') : t('social.disconnect')}
                  {cred?.last_sync_at && ` — Last sync: ${new Date(cred.last_sync_at).toLocaleDateString('fr-FR')}`}
                </p>
              </div>
              {cred?.is_connected && (
                <div className="w-6 h-6 bg-emerald-400 rounded-full flex items-center justify-center">
                  <Check size={14} className="text-white" />
                </div>
              )}
            </div>

            {/* Setup Guide */}
            <button
              onClick={() => setExpandedGuide(expandedGuide === platform ? null : platform)}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold ${config.bgLight} ${config.textColor} hover:opacity-80 transition-opacity`}
            >
              <span>{t('social.setup_guide')} — {config.label}</span>
              {expandedGuide === platform ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {expandedGuide === platform && (
              <div className={`px-4 py-3 ${config.bgLight} border-t border-white/50`}>
                <ol className="text-xs text-gray-700 space-y-2 list-decimal list-inside">
                  {SETUP_GUIDES[platform].steps.map((step, i) => (
                    <li key={i} className="leading-relaxed">{step}</li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-2 mt-3">
                  {SETUP_GUIDES[platform].links.map(link => (
                    <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1 text-[11px] font-medium ${config.textColor} underline underline-offset-2 hover:opacity-70`}>
                      <ExternalLink size={10} /> {link.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <CardContent>
              <div className="space-y-3 pt-2">
                {config.fields.map(field => (
                  <div key={field.key}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-[#1a1a2e]">{field.label}</label>
                      {field.key === 'access_token' && (
                        <button onClick={() => setShowTokens(prev => ({ ...prev, [platform]: !prev[platform] }))}
                          className="text-[#64648B] hover:text-[#1a1a2e]">
                          {showTokens[platform] ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      )}
                    </div>
                    <input
                      type={field.key === 'access_token' && !showTokens[platform] ? 'password' : 'text'}
                      value={form[field.key] || ''}
                      onChange={e => updateForm(platform, field.key, e.target.value)}
                      placeholder={field.help}
                      className="w-full px-3.5 py-2.5 border border-[#E8E5E0] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C9956B]/20 focus:border-[#C9956B] placeholder:text-gray-400"
                    />
                  </div>
                ))}

                {/* Result message */}
                {result && (
                  <div className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-medium ${
                    result.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                  }`}>
                    {result.ok ? <Check size={14} /> : <AlertCircle size={14} />}
                    {result.msg}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button variant="secondary" size="sm" className="flex-1"
                    onClick={() => testConnection(platform)}
                    loading={testing === platform}
                    disabled={!form.access_token?.trim()}>
                    Test Connection
                  </Button>
                  <Button variant="secondary" size="sm"
                    onClick={() => syncPlatform(platform)}
                    loading={testing === platform}
                    disabled={!cred?.is_connected}>
                    <RefreshCw size={12} /> Sync
                  </Button>
                  <Button size="sm" className="flex-1"
                    onClick={() => saveCredentials(platform)}
                    loading={saving === platform}>
                    {t('common.save')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
      </RoleGuard>
  );
}
