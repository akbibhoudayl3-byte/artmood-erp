import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/server';
import { createServerSupabase } from '@/lib/supabase/server';

interface MediaInsight {
  name: string;
  values: { value: number }[];
}

export async function POST(req: NextRequest) {
  // ── RBAC: only ceo and community_manager can sync social media ──
  const authResult = await requireRole(['ceo', 'community_manager']);
  if (authResult instanceof NextResponse) return authResult;

  const platform = req.nextUrl.searchParams.get('platform');
  if (!platform || !['instagram', 'facebook', 'tiktok'].includes(platform)) {
    return NextResponse.json({ success: false, message: 'Invalid or missing platform' }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  const { data: cred } = await supabase.from('social_credentials').select('*').eq('platform', platform).single();
  if (!cred?.access_token) {
    return NextResponse.json({ success: false, message: 'No access token configured' });
  }

  try {
    let synced = 0;

    if (platform === 'instagram') {
      // Fetch recent media from Instagram Graph API
      const mediaUrl = `https://graph.facebook.com/v21.0/${cred.account_id}/media?fields=id,caption,media_type,media_url,timestamp,like_count,comments_count&limit=50&access_token=${cred.access_token}`;
      const mediaRes = await fetch(mediaUrl);
      const mediaData = await mediaRes.json();

      if (mediaData.error) {
        return NextResponse.json({ success: false, message: mediaData.error.message });
      }

      const posts = mediaData.data || [];

      for (const post of posts) {
        // Get insights for each post
        let insights: Record<string, number> = {};
        try {
          const insightUrl = `https://graph.facebook.com/v21.0/${post.id}/insights?metric=reach,impressions,engagement&access_token=${cred.access_token}`;
          const insightRes = await fetch(insightUrl);
          const insightData = await insightRes.json();
          if (insightData.data) {
            insightData.data.forEach((insight: MediaInsight) => {
              insights[insight.name] = insight.values?.[0]?.value || 0;
            });
          }
        } catch {}

        await supabase.from('marketing_posts').upsert({
          platform: 'instagram',
          post_id: post.id,
          content: post.caption || '',
          media_type: post.media_type?.toLowerCase() || 'post',
          media_url: post.media_url || null,
          published_at: post.timestamp,
          likes_count: post.like_count || 0,
          comments_count: post.comments_count || 0,
          reach: insights['reach'] || 0,
          impressions: insights['impressions'] || 0,
          status: 'published',
        }, { onConflict: 'post_id' });
        synced++;
      }

      // Update account info
      const accountUrl = `https://graph.facebook.com/v21.0/${cred.account_id}?fields=followers_count,media_count&access_token=${cred.access_token}`;
      const accountRes = await fetch(accountUrl);
      const accountData = await accountRes.json();

      if (!accountData.error) {
        await supabase.from('social_credentials').update({
          followers_count: accountData.followers_count || 0,
          posts_count: accountData.media_count || 0,
          last_synced_at: new Date().toISOString(),
        }).eq('platform', 'instagram');
      }
    }

    if (platform === 'facebook') {
      // Fetch Facebook Page posts
      const postsUrl = `https://graph.facebook.com/v21.0/${cred.page_id}/posts?fields=id,message,created_time,likes.summary(true),comments.summary(true)&limit=50&access_token=${cred.access_token}`;
      const postsRes = await fetch(postsUrl);
      const postsData = await postsRes.json();

      if (postsData.error) {
        return NextResponse.json({ success: false, message: postsData.error.message });
      }

      for (const post of (postsData.data || [])) {
        await supabase.from('marketing_posts').upsert({
          platform: 'facebook',
          post_id: post.id,
          content: post.message || '',
          media_type: 'post',
          published_at: post.created_time,
          likes_count: post.likes?.summary?.total_count || 0,
          comments_count: post.comments?.summary?.total_count || 0,
          status: 'published',
        }, { onConflict: 'post_id' });
        synced++;
      }

      // Update page info
      const pageUrl = `https://graph.facebook.com/v21.0/${cred.page_id}?fields=followers_count,fan_count&access_token=${cred.access_token}`;
      const pageRes = await fetch(pageUrl);
      const pageData = await pageRes.json();

      if (!pageData.error) {
        await supabase.from('social_credentials').update({
          followers_count: pageData.followers_count || pageData.fan_count || 0,
          last_synced_at: new Date().toISOString(),
        }).eq('platform', 'facebook');
      }
    }

    if (platform === 'tiktok') {
      return NextResponse.json({ success: true, message: 'TikTok sync not yet implemented', synced: 0 });
    }

    return NextResponse.json({ success: true, message: `Synced ${synced} posts`, synced });
  } catch (err) {
    console.error('Social sync error:', err);
    return NextResponse.json({ success: false, message: `Sync error: ${(err as Error).message}` }, { status: 500 });
  }
}
