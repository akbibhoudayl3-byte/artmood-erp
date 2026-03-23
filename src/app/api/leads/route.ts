import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, sanitizeString } from '@/lib/auth/server';
import { writeAuditLog } from '@/lib/security/audit';

export async function POST(request: NextRequest) {
  const auth = await requireRole(['ceo', 'commercial_manager', 'community_manager', 'operations_manager', 'owner_admin']);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();

  const full_name = sanitizeString(body.full_name, 200);
  const phone = sanitizeString(body.phone, 30);

  if (!full_name || !phone) {
    return NextResponse.json({ error: 'Le nom et le téléphone sont obligatoires' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );

  const { data: lead, error } = await supabase.from('leads').insert({
    full_name,
    phone,
    email: sanitizeString(body.email, 200),
    city: sanitizeString(body.city, 100),
    source: body.source || null,
    notes: sanitizeString(body.notes, 2000),
    status: 'new',
    assigned_to: body.assigned_to || null,
    created_by: auth.userId,
  }).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog({
    user_id: auth.userId,
    action: 'create',
    entity_type: 'lead',
    entity_id: lead.id,
    new_value: { full_name, phone },
    notes: 'Lead created via API',
  });

  return NextResponse.json(lead, { status: 201 });
}
