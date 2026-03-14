
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole, sanitizeString } from '@/lib/auth/server';
import { writeAuditLog } from '@/lib/security/audit';

const ALLOWED_ROLES = ['ceo', 'commercial_manager', 'designer', 'workshop_manager',
  'workshop_worker', 'installer', 'hr_manager', 'community_manager'];

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(request: NextRequest) {
  const auth = await requireRole(['ceo']);
  if (auth instanceof NextResponse) return auth;

  const { data: users, error } = await adminClient.auth.admin.listUsers();
  if (error) return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });

  const { data: profiles } = await adminClient.from('profiles').select('*');
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  const merged = users.users.map(u => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    ...(profileMap.get(u.id) || {}),
  }));

  return NextResponse.json({ users: merged });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(['ceo']);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: 'Missing action' }, { status: 400 });

  if (body.action === 'create') {
    const email = sanitizeString(body.email, 255);
    const password = sanitizeString(body.password, 128);
    const fullName = sanitizeString(body.full_name, 100);
    const role = body.role;

    if (!email || !password || !fullName || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate email
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Validate role — prevent escalation
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email, password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError || !newUser?.user) {
      return NextResponse.json({ error: createError?.message || 'Failed to create user' }, { status: 400 });
    }

    await adminClient.from('profiles').insert({
      id: newUser.user.id,
      email,
      full_name: fullName,
      phone: sanitizeString(body.phone, 20),
      role,
      is_active: true,
      created_at: new Date().toISOString(),
    });

    await writeAuditLog({
      user_id: auth.userId,
      action: 'user_management',
      entity_type: 'profile',
      entity_id: newUser.user.id,
      new_value: { email, full_name: fullName, role },
      notes: 'User created',
    });

    return NextResponse.json({ success: true, userId: newUser.user.id });
  }

  if (body.action === 'update_role') {
    const targetId = sanitizeString(body.user_id, 36);
    const newRole = body.role;

    if (!targetId || !newRole || !ALLOWED_ROLES.includes(newRole)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    // Prevent CEO from demoting themselves
    if (targetId === auth.userId && newRole !== 'ceo') {
      return NextResponse.json({ error: 'Cannot change your own CEO role' }, { status: 400 });
    }

    const { data: oldProfile } = await adminClient.from('profiles').select('role').eq('id', targetId).single();

    await adminClient.from('profiles').update({ role: newRole }).eq('id', targetId);

    await writeAuditLog({
      user_id: auth.userId,
      action: 'user_management',
      entity_type: 'profile',
      entity_id: targetId,
      old_value: { role: oldProfile?.role },
      new_value: { role: newRole },
      notes: 'Role updated',
    });

    return NextResponse.json({ success: true });
  }

  if (body.action === 'deactivate') {
    const targetId = sanitizeString(body.user_id, 36);
    if (!targetId) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    if (targetId === auth.userId) return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 400 });

    await adminClient.from('profiles').update({ is_active: false }).eq('id', targetId);
    await adminClient.auth.admin.updateUserById(targetId, { ban_duration: '876600h' }); // 100 years

    await writeAuditLog({
      user_id: auth.userId,
      action: 'user_management',
      entity_type: 'profile',
      entity_id: targetId,
      notes: 'User deactivated',
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
