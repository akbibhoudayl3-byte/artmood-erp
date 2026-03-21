import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID, sanitizeString, sanitizeNumber } from '@/lib/auth/server';

/**
 * WORKFLOW RULES:
 * - production_out, production_waste, production_use: BLOCKED from manual entry.
 *   These can ONLY be created via /api/production-orders/consume (automatic from production events).
 * - reserve: BLOCKED from manual entry. Created automatically via BOM generation.
 * - Manual movements allowed: 'in' (purchase/receiving), 'out' (non-production), 'adjustment' (inventory correction).
 */

type MovementType = 'in' | 'out' | 'adjustment' | 'reserve' | 'production_out' | 'production_waste';

/** Movement types allowed via this manual endpoint */
const MANUAL_ALLOWED_TYPES: MovementType[] = ['in', 'out', 'adjustment'];

/** Movement types that MUST come from automated production workflows */
const PRODUCTION_ONLY_TYPES: string[] = ['production_out', 'production_waste', 'production_use', 'reserve', 'consume'];

/**
 * POST /api/stock/movements — Record a stock movement with server-side validation.
 *
 * RESTRICTED: Production consumption movements are blocked here.
 * Use /api/production-orders/consume for production-related stock changes.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(['ceo', 'workshop_manager', 'workshop_worker']);
  if (auth instanceof NextResponse) return auth;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    stock_item_id,
    movement_type,
    quantity,
    notes,
    reference_type,
    reference_id,
    project_id,
  } = body;

  // ── Validate ────────────────────────────────────────────────────────────
  if (!isValidUUID(stock_item_id)) {
    return NextResponse.json({ error: 'Valid stock_item_id is required' }, { status: 400 });
  }

  // WORKFLOW ENFORCEMENT: Block production-only movement types from manual entry
  if (PRODUCTION_ONLY_TYPES.includes(movement_type)) {
    return NextResponse.json(
      {
        error: 'Mouvement de production interdit via cette interface',
        message: `Les mouvements de type "${movement_type}" sont automatiques et ne peuvent être créés que via le système de production. Utilisez /api/production-orders/consume pour la consommation de matériaux.`,
        allowed_types: MANUAL_ALLOWED_TYPES,
      },
      { status: 422 },
    );
  }

  if (!movement_type || !MANUAL_ALLOWED_TYPES.includes(movement_type)) {
    return NextResponse.json(
      { error: `Type de mouvement invalide. Types autorisés: ${MANUAL_ALLOWED_TYPES.join(', ')}` },
      { status: 400 },
    );
  }

  const qty = sanitizeNumber(quantity);
  if (qty === null) {
    return NextResponse.json({ error: 'Valid quantity is required' }, { status: 400 });
  }

  // For 'out' and 'production_out', quantity must be negative
  if ((movement_type === 'out' || movement_type === 'production_out') && qty > 0) {
    return NextResponse.json(
      { error: `Quantity must be negative for '${movement_type}' movements` },
      { status: 400 },
    );
  }

  // For 'in', quantity must be positive
  if (movement_type === 'in' && qty <= 0) {
    return NextResponse.json({ error: "Quantity must be positive for 'in' movements" }, { status: 400 });
  }

  const sanitizedNotes = sanitizeString(notes, 2000);
  const sanitizedRefType = sanitizeString(reference_type, 100);
  const sanitizedRefId = reference_id && isValidUUID(reference_id) ? reference_id : null;
  const sanitizedProjectId = project_id && isValidUUID(project_id) ? project_id : null;

  // ── Server-side Supabase ────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );

  // Verify stock item exists
  const { data: item, error: itemErr } = await supabase
    .from('stock_items')
    .select('id, name, current_quantity, unit')
    .eq('id', stock_item_id)
    .single();

  if (itemErr || !item) {
    return NextResponse.json({ error: 'Stock item not found' }, { status: 404 });
  }

  // Pre-check: would this make stock negative? (DB trigger also enforces)
  if (qty < 0 && (item.current_quantity + qty) < 0) {
    return NextResponse.json(
      {
        error: 'Insufficient stock',
        available: item.current_quantity,
        requested: Math.abs(qty),
        unit: item.unit,
      },
      { status: 400 },
    );
  }

  // Insert movement (DB trigger updates current_quantity)
  const { data: movement, error: movErr } = await supabase
    .from('stock_movements')
    .insert({
      stock_item_id,
      movement_type,
      quantity: qty,
      notes: sanitizedNotes,
      reference_type: sanitizedRefType,
      reference_id: sanitizedRefId,
      project_id: sanitizedProjectId,
      created_by: auth.userId,
    })
    .select('id')
    .single();

  if (movErr) {
    if (movErr.message?.includes('negative') || movErr.message?.includes('cannot go')) {
      return NextResponse.json(
        { error: 'Insufficient stock — movement rejected by database', available: item.current_quantity },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: 'Failed to record movement', detail: movErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ movement_id: movement?.id, stock_item_id, quantity: qty }, { status: 201 });
}
