'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Input';
import StatusBadge from '@/components/ui/StatusBadge';
import PhotoUpload from '@/components/ui/PhotoUpload';
import { Plus, Instagram, Eye, Heart, MessageCircle, X, Edit2, Trash2, Send, Calendar, RefreshCw } from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

interface Post {
  id: string;
  title: string;
  platform: string;
  content_type: string;
  caption: string | null;
  media_url: string | null;
  scheduled_date: string | null;
  published_date: string | null;
  status: string;
  likes: number | null;
  comments: number | null;
  reach: number | null;
  created_at: string;
}

const PLATFORMS = ['instagram', 'facebook', 'tiktok', 'website', 'other'];
const CONTENT_TYPES = ['photo', 'video', 'carousel', 'reel', 'story', 'article', 'other'];
const STATUSES = ['draft', 'scheduled', 'published', 'archived'];

export default function MarketingPage() {
  const { profile } = useAuth();
  const { t } = useLocale();
  const supabase = createClient();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [filter, setFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  // Form
  const [formTitle, setFormTitle] = useState('');
  const [formCaption, setFormCaption] = useState('');
  const [formPlatform, setFormPlatform] = useState('instagram');
  const [formContentType, setFormContentType] = useState('photo');
  const [formScheduledDate, setFormScheduledDate] = useState('');
  const [formMediaUrl, setFormMediaUrl] = useState('');

  useEffect(() => { loadPosts(); }, []);

  async function loadPosts() {
    const { data } = await supabase.from('marketing_posts').select('*').order('created_at', { ascending: false });
    setPosts(data || []);
    setLoading(false);
  }

  function openNew() {
    setEditingPost(null);
    setFormTitle('');
    setFormCaption('');
    setFormPlatform('instagram');
    setFormContentType('photo');
    setFormScheduledDate('');
    setFormMediaUrl('');
    setShowForm(true);
  }

  function openEdit(post: Post) {
    setEditingPost(post);
    setFormTitle(post.title);
    setFormCaption(post.caption || '');
    setFormPlatform(post.platform);
    setFormContentType(post.content_type);
    setFormScheduledDate(post.scheduled_date || '');
    setFormMediaUrl(post.media_url || '');
    setShowForm(true);
  }

  async function savePost() {
    if (!formTitle.trim()) return;
    setSaving(true);

    const payload = {
      title: formTitle.trim(),
      caption: formCaption || null,
      platform: formPlatform,
      content_type: formContentType,
      scheduled_date: formScheduledDate || null,
      media_url: formMediaUrl || null,
      status: formScheduledDate ? 'scheduled' : 'draft',
    };

    if (editingPost) {
      await supabase.from('marketing_posts').update(payload).eq('id', editingPost.id);
    } else {
      await supabase.from('marketing_posts').insert(payload);
    }

    setShowForm(false);
    setSaving(false);
    await loadPosts();
  }

  async function updatePostStatus(postId: string, status: string) {
    const updates: Record<string, unknown> = { status };
    if (status === 'published') updates.published_date = new Date().toISOString();
    await supabase.from('marketing_posts').update(updates).eq('id', postId);
    await loadPosts();
  }

  async function deletePost(postId: string) {
    if (!confirm('Delete this post?')) return;
    await supabase.from('marketing_posts').delete().eq('id', postId);
    await loadPosts();
  }

  async function syncFromApi() {
    setSyncing(true);
    setSyncMsg(null);
    let totalSynced = 0;
    const errors: string[] = [];

    for (const platform of ['instagram', 'facebook', 'tiktok']) {
      try {
        const res = await fetch(`/api/social/sync?platform=${platform}`, { method: 'POST' });
        const data = await res.json();
        if (data.success) totalSynced += data.synced || 0;
        else if (data.message && !data.message.includes('No access token')) errors.push(`${platform}: ${data.message}`);
      } catch { /* skip */ }
    }

    await loadPosts();
    setSyncing(false);
    setSyncMsg({
      ok: errors.length === 0,
      msg: errors.length > 0 ? errors.join('; ') : `Synced ${totalSynced} posts from connected platforms`,
    });
    setTimeout(() => setSyncMsg(null), 5000);
  }

  async function updateEngagement(postId: string, field: 'likes' | 'comments' | 'reach', value: string) {
    await supabase.from('marketing_posts').update({ [field]: parseInt(value) || 0 }).eq('id', postId);
    await loadPosts();
  }

  const filtered = posts.filter(p => filter === 'all' || p.status === filter);
  const totalReach = posts.reduce((s, p) => s + (p.reach || 0), 0);
  const totalLikes = posts.reduce((s, p) => s + (p.likes || 0), 0);
  const publishedCount = posts.filter(p => p.status === 'published').length;
  const scheduledCount = posts.filter(p => p.status === 'scheduled').length;

  if (loading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 skeleton" />)}</div>;

  return (
    <RoleGuard allowedRoles={['ceo', 'community_manager'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1a1a2e] tracking-tight">{t('marketing.title')}</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={syncFromApi} loading={syncing} size="sm">
            <RefreshCw size={14} /> {t('marketing.sync_api')}
          </Button>
          <Button onClick={openNew}><Plus size={18} /> {t('marketing.new_post')}</Button>
        </div>
      </div>

      {syncMsg && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-medium ${
          syncMsg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
        }`}>
          <RefreshCw size={14} /> {syncMsg.msg}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 sm:p-4 text-center">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-1.5">
            <Eye size={18} className="text-blue-500" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-[#1a1a2e]">{totalReach.toLocaleString()}</p>
          <p className="text-[10px] sm:text-xs text-[#64648B] font-medium">{t('marketing.reach')}</p>
        </Card>
        <Card className="p-3 sm:p-4 text-center">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-red-50 flex items-center justify-center mx-auto mb-1.5">
            <Heart size={18} className="text-red-500" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-[#1a1a2e]">{totalLikes.toLocaleString()}</p>
          <p className="text-[10px] sm:text-xs text-[#64648B] font-medium">{t('marketing.likes')}</p>
        </Card>
        <Card className="p-3 sm:p-4 text-center">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-violet-50 flex items-center justify-center mx-auto mb-1.5">
            <Instagram size={18} className="text-violet-500" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-[#1a1a2e]">{publishedCount}</p>
          <p className="text-[10px] sm:text-xs text-[#64648B] font-medium">{t('marketing.published')}</p>
        </Card>
        <Card className="p-3 sm:p-4 text-center">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-1.5">
            <Calendar size={18} className="text-amber-500" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-[#1a1a2e]">{scheduledCount}</p>
          <p className="text-[10px] sm:text-xs text-[#64648B] font-medium">{t('marketing.scheduled')}</p>
        </Card>
      </div>

      {/* Post Form */}
      {showForm && (
        <Card className="border-blue-200">
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">{editingPost ? `${t('common.edit')} ${t('marketing.posts')}` : t('marketing.new_post')}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <Input label="Title *" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Post title..." />
            <Textarea label="Caption" value={formCaption} onChange={e => setFormCaption(e.target.value)} rows={3} placeholder="Write your caption..." />
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-[#1a1a2e] mb-1.5">{t('marketing.platform')}</label>
                <select value={formPlatform} onChange={e => setFormPlatform(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-[#E8E5E0] rounded-xl text-sm">
                  {PLATFORMS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1a1a2e] mb-1.5">{t('marketing.content')}</label>
                <select value={formContentType} onChange={e => setFormContentType(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-[#E8E5E0] rounded-xl text-sm">
                  {CONTENT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <Input label={t('marketing.scheduled')} type="date" value={formScheduledDate} onChange={e => setFormScheduledDate(e.target.value)} />
            </div>
            <PhotoUpload
              bucket="projects"
              pathPrefix="marketing"
              onUpload={(data) => setFormMediaUrl(data.url)}
              existingPhotos={formMediaUrl ? [{ url: formMediaUrl }] : []}
              maxPhotos={1}
              label="Media"
            />
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setShowForm(false)}>{t('common.cancel')}</Button>
              <Button className="flex-1" onClick={savePost} loading={saving} disabled={!formTitle.trim()}>
                {editingPost ? t('common.save') : `${t('common.save')} ${t('marketing.posts')}`}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Filter */}
      <div className="flex gap-2 overflow-x-auto">
        {['all', ...STATUSES].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              filter === f ? 'bg-[#1E2F52] text-white' : 'bg-[#F5F3F0] text-[#64648B] hover:bg-[#EBE8E3]'
            }`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Posts */}
      <div className="space-y-2.5">
        {filtered.map(post => (
          <Card key={post.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[#1a1a2e] text-sm">{post.title}</p>
                {post.caption && <p className="text-xs text-[#64648B] mt-1 line-clamp-2">{post.caption}</p>}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <StatusBadge status={post.platform || 'other'} />
                  <StatusBadge status={post.status} />
                  {post.content_type && <span className="text-[11px] text-[#64648B] bg-gray-100 px-2 py-0.5 rounded-lg">{post.content_type}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {post.scheduled_date && (
                  <p className="text-[11px] text-[#64648B]">
                    {new Date(post.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                )}
                <div className="flex items-center gap-1">
                  {post.status === 'draft' && (
                    <button onClick={() => updatePostStatus(post.id, 'published')}
                      className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg" title="Publish">
                      <Send size={13} />
                    </button>
                  )}
                  <button onClick={() => openEdit(post)} className="p-1.5 text-[#64648B] hover:bg-gray-100 rounded-lg">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => deletePost(post.id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>

            {/* Engagement metrics for published posts */}
            {post.status === 'published' && (
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#F0EDE8]">
                <div className="flex items-center gap-1.5">
                  <Heart size={13} className="text-red-400" />
                  <input type="number" value={post.likes || 0}
                    onChange={e => updateEngagement(post.id, 'likes', e.target.value)}
                    className="w-16 text-xs text-center border border-[#E8E5E0] rounded-lg py-1 focus:outline-none focus:ring-1 focus:ring-[#C9956B]" />
                </div>
                <div className="flex items-center gap-1.5">
                  <MessageCircle size={13} className="text-blue-400" />
                  <input type="number" value={post.comments || 0}
                    onChange={e => updateEngagement(post.id, 'comments', e.target.value)}
                    className="w-16 text-xs text-center border border-[#E8E5E0] rounded-lg py-1 focus:outline-none focus:ring-1 focus:ring-[#C9956B]" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Eye size={13} className="text-[#64648B]" />
                  <input type="number" value={post.reach || 0}
                    onChange={e => updateEngagement(post.id, 'reach', e.target.value)}
                    className="w-16 text-xs text-center border border-[#E8E5E0] rounded-lg py-1 focus:outline-none focus:ring-1 focus:ring-[#C9956B]" />
                </div>
              </div>
            )}
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-[#64648B]">
            <Instagram size={48} className="mx-auto text-[#E8E5E0] mb-3" />
            <p>{t('common.no_results')}</p>
            <Button variant="secondary" className="mt-3" onClick={openNew}>
              <Plus size={14} /> {t('marketing.new_post')}
            </Button>
          </div>
        )}
      </div>
    </div>
      </RoleGuard>
  );
}
