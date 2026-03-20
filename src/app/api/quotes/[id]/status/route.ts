import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID, sanitizeString } from '@/lib/auth/server';

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent'],
  sent: ['accepted', 'rejected'],
};

/**
 * PATCH /api/quotes/[id]/status — Update quote status (draft→sent→accepted/rejected).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['ceo', 'commercial_manager', 'designer']);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const newStatus = sanitizeString(body.status, 30);
  if (!newStatus || !['sent', 'accepted', 'rejected'].includes(newStatus)) {
    return NextResponse.json({ error: 'Invalid status. Must be: sent, accepted, or rejected' }, { status: 400 });
  }

  // ── Server-side Supabase ────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );

  // Fetch current quote
  const { data: quote, error: fetchErr } = await supabase
    .from('quotes')
    .select('id, status, project_id, total_amount')
    .eq('id', id)
    .single();

  if (fetchErr || !quote) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  }

  // Validate transition
  const allowed = VALID_TRANSITIONS[quote.status];
  if (!allowed || !allowed.includes(newStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from '${quote.status}' to '${newStatus}'` },
      { status: 400 },
    );
  }

  // Build update payload
  const updatePayload: Record<string, any> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (newStatus === 'sent') {
    updatePayload.sent_at = new Date().toISOString();
  }
  if (newStatus === 'accepted' || newStatus === 'rejected') {
    updatePayload.responded_at = new Date().toISOString();
  }

  // Update quote
  const { error: updateErr } = await supabase
    .from('quotes')
    .update(updatePayload)
    .eq('id', id);

  if (updateErr) {
    return NextResponse.json(
      { error: 'Failed to update quote status', detail: updateErr.message },
      { status: 500 },
    );
  }

  // When accepted, sync total_amount to the linked project
  if (newStatus === 'accepted' && quote.project_id && quote.total_amount != null) {
    const { error: projErr } = await supabase
      .from('projects')
      .update({
        total_amount: quote.total_amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', quote.project_id);

    if (projErr) {
      return NextResponse.json(
        { status: newStatus, warning: 'Quote accepted but project total sync failed: ' + projErr.message },
        { status: 200 },
      );
    }
  }

  return NextResponse.json({ status: newStatus, quote_id: id }, { status: 200 });
}
