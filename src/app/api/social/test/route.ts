import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  // ── RBAC: only ceo and community_manager can test social credentials ──
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
    if (platform === 'instagram') {
      const url = `https://graph.facebook.com/v21.0/${cred.account_id}?fields=id,username,media_count,followers_count&access_token=${cred.access_token}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        return NextResponse.json({ success: false, message: data.error.message });
      }
      return NextResponse.json({
        success: true,
        message: `Connected as @${data.username} (${data.followers_count?.toLocaleString()} followers, ${data.media_count} posts)`,
      });
    }

    if (platform === 'facebook') {
      const url = `https://graph.facebook.com/v21.0/${cred.page_id}?fields=id,name,fan_count,followers_count&access_token=${cred.access_token}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        return NextResponse.json({ success: false, message: data.error.message });
      }
      return NextResponse.json({
        success: true,
        message: `Connected to "${data.name}" (${data.followers_count?.toLocaleString()} followers)`,
      });
    }

    if (platform === 'tiktok') {
      const res = await fetch('https://business-api.tiktok.com/open_api/v1.3/user/info/', {
        headers: { 'Access-Token': cred.access_token },
      });
      const data = await res.json();
      if (data.code !== 0) {
        return NextResponse.json({ success: false, message: data.message || 'TikTok API error' });
      }
      return NextResponse.json({ success: true, message: 'TikTok connected successfully' });
    }

    return NextResponse.json({ success: false, message: 'Unknown platform' });
  } catch (err) {
    return NextResponse.json({ success: false, message: `API error: ${(err as Error).message}` });
  }
}
