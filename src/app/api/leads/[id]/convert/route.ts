import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID, sanitizeString, sanitizeNumber } from '@/lib/auth/server';
import { writeAuditLog } from '@/lib/security/audit';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(['ceo', 'commercial_manager', 'operations_manager', 'owner_admin']);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid lead ID' }, { status: 400 });
  }

  const body = await request.json();

  const client_name = sanitizeString(body.client_name, 200);
  const client_phone = sanitizeString(body.client_phone, 30);

  if (!client_name || !client_phone) {
    return NextResponse.json({ error: 'Le nom et le téléphone client sont obligatoires' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );

  // Verify lead exists and is in a convertible state
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, status, full_name')
    .eq('id', id)
    .single();

  if (!lead || leadErr) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  if (lead.status === 'lost') {
    return NextResponse.json({ error: 'Cannot convert a lost lead' }, { status: 400 });
  }

  // Create project
  const { data: project, error: projectErr } = await supabase.from('projects').insert({
    client_name,
    client_phone,
    client_email: sanitizeString(body.client_email, 200),
    client_city: sanitizeString(body.client_city, 100),
    total_amount: sanitizeNumber(body.budget, { min: 0 }) || 0,
    status: 'measurements',
    notes: sanitizeString(body.notes, 2000),
    source_lead_id: id,
    created_by: auth.userId,
  }).select().single();

  if (projectErr || !project) {
    return NextResponse.json({ error: 'Project creation failed: ' + (projectErr?.message || 'Unknown') }, { status: 500 });
  }

  // Update lead status to 'won' and link project
  await supabase.from('leads').update({
    status: 'won',
    project_id: project.id,
  }).eq('id', id);

  await writeAuditLog({
    user_id: auth.userId,
    action: 'create',
    entity_type: 'lead',
    entity_id: id,
    new_value: { project_id: project.id },
    notes: `Lead converted to project ${project.reference_code || project.id}`,
  });

  return NextResponse.json({ lead_id: id, project }, { status: 201 });
}
