import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID } from '@/lib/auth/server';

/**
 * POST /api/quotes/[id]/duplicate — Duplicate a quote as a new draft version.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['ceo', 'commercial_manager', 'designer']);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );

  // Fetch source quote
  const { data: source, error: fetchErr } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !source) {
    return NextResponse.json({ error: 'Source quote not found' }, { status: 404 });
  }

  // Fetch lines
  const { data: sourceLines } = await supabase
    .from('quote_lines')
    .select('*')
    .eq('quote_id', id)
    .order('sort_order');

  // Get next version
  const { data: existingQuotes } = await supabase
    .from('quotes')
    .select('version')
    .eq('project_id', source.project_id)
    .order('version', { ascending: false })
    .limit(1);

  const nextVersion = existingQuotes && existingQuotes.length > 0
    ? existingQuotes[0].version + 1
    : source.version + 1;

  // Create duplicate
  const { data: newQuote, error: insertErr } = await supabase
    .from('quotes')
    .insert({
      project_id: source.project_id,
      version: nextVersion,
      status: 'draft',
      subtotal: source.subtotal,
      discount_percent: source.discount_percent,
      discount_amount: source.discount_amount,
      total_amount: source.total_amount,
      notes: source.notes,
      valid_until: source.valid_until,
      created_by: auth.userId,
    })
    .select('id, version')
    .single();

  if (insertErr || !newQuote) {
    return NextResponse.json(
      { error: 'Failed to duplicate quote', detail: insertErr?.message },
      { status: 500 },
    );
  }

  // Duplicate lines
  if (sourceLines && sourceLines.length > 0) {
    const duplicatedLines = sourceLines.map((line: any) => ({
      quote_id: newQuote.id,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unit_price: line.unit_price,
      total_price: line.total_price,
      sort_order: line.sort_order,
    }));

    const { error: linesErr } = await supabase
      .from('quote_lines')
      .insert(duplicatedLines);

    if (linesErr) {
      return NextResponse.json(
        { error: 'Quote duplicated but lines failed to copy', detail: linesErr.message },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ quote: newQuote }, { status: 201 });
}
