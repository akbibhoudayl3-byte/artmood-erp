
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/server';
import { writeAuditLog } from '@/lib/security/audit';

export async function POST(req: NextRequest) {
  // Any authenticated role can write an audit log
  const auth = await requireRole([
    'ceo', 'commercial_manager', 'designer', 'workshop_manager',
    'workshop_worker', 'installer', 'hr_manager', 'community_manager',
  ]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  if (!body?.action || !body?.entity_type) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  await writeAuditLog({
    user_id: auth.userId,
    action: body.action,
    entity_type: body.entity_type,
    entity_id: body.entity_id,
    old_value: body.old_value,
    new_value: body.new_value,
    notes: body.notes,
  });

  return NextResponse.json({ ok: true });
}
