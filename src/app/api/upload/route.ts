import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Buckets and which roles can write to them
// 'any' means any authenticated user (e.g., avatars)
const BUCKET_ROLES: Record<string, string[] | 'any'> = {
  installations: ['ceo', 'workshop_manager', 'installer'],
  invoices:      ['ceo', 'commercial_manager'],
  cheques:       ['ceo', 'commercial_manager'],
  projects:      ['ceo', 'commercial_manager', 'designer', 'workshop_manager'],
  avatars:       'any',
};

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
  'application/pdf',
  'text/csv',
];

function sanitizePath(p: string): string | null {
  if (!p) return null;
  // Reject any path with directory traversal
  if (p.includes('..') || p.includes('//') || p.startsWith('/')) return null;
  // Reject null bytes and control chars
  if (/[\x00-\x1f]/.test(p)) return null;
  // Normalise and return
  return p.replace(/\\/g, '/');
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() {},
        },
      }
    );

    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user role
    const { data: profile } = await authClient.from('profiles').select('role, is_active').eq('id', user.id).single();
    if (!profile?.is_active) {
      return NextResponse.json({ error: 'Account deactivated' }, { status: 403 });
    }
    const userRole = profile?.role as string | null;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const bucket = formData.get('bucket') as string;
    const rawPath = formData.get('path') as string;

    if (!file || !bucket || !rawPath) {
      return NextResponse.json({ error: 'Missing file, bucket, or path' }, { status: 400 });
    }

    // Validate bucket
    if (!Object.keys(BUCKET_ROLES).includes(bucket)) {
      return NextResponse.json({ error: 'Invalid bucket' }, { status: 400 });
    }

    // Validate role for bucket
    const allowedRoles = BUCKET_ROLES[bucket];
    if (allowedRoles !== 'any') {
      if (!userRole || !allowedRoles.includes(userRole)) {
        return NextResponse.json({ error: 'Forbidden: insufficient role for this bucket' }, { status: 403 });
      }
    }

    // Sanitize path — prevent directory traversal
    const safePath = sanitizePath(rawPath);
    if (!safePath) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }

    // Validate content type
    if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
    }

    // File size limits
    const maxSize = bucket === 'invoices' || bucket === 'cheques'
      ? 5 * 1024 * 1024   // 5MB for documents
      : 10 * 1024 * 1024; // 10MB for photos

    if (file.size > maxSize) {
      return NextResponse.json({ error: `File too large (max ${maxSize / 1024 / 1024}MB)` }, { status: 400 });
    }

    // Use service role client to upload (bypasses storage RLS)
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const buffer = await file.arrayBuffer();
    const { data, error } = await adminClient.storage
      .from(bucket)
      .upload(safePath, buffer, {
        contentType: file.type,
        upsert: false,   // Do NOT silently overwrite — caller should use unique paths
      });

    if (error) {
      // If file already exists (upsert:false), return a clean error
      if (error.message.includes('already exists') || error.message.includes('Duplicate')) {
        return NextResponse.json({ error: 'File already exists at this path. Use a unique filename.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: urlData } = adminClient.storage.from(bucket).getPublicUrl(data.path);

    return NextResponse.json({
      path: data.path,
      url: urlData.publicUrl,
      bucket,
    });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
