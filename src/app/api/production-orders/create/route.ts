import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID, sanitizeString } from '@/lib/auth/server';
import { writeAuditLog } from '@/lib/security/audit';

/**
 * POST /api/production-orders/create — Create a new production order.
 *
 * WORKFLOW RULE: Production orders can ONLY be generated from BOM.
 * Manual creation is blocked. Use /api/bom/generate-production instead.
 *
 * This endpoint is kept for internal/system use only (bom_generated flag required).
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(['ceo', 'workshop_manager']);
  if (auth instanceof NextResponse) return auth;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { project_id, name, notes, _bom_generated } = body;

  // ── WORKFLOW ENFORCEMENT: No manual production orders ──────────────────
  // Production orders MUST originate from BOM generation.
  // The _bom_generated flag is set internally by /api/bom/generate-production.
  if (!_bom_generated) {
    return NextResponse.json(
      {
        error: 'Création manuelle d\'ordres de production interdite',
        message: 'Les ordres de production doivent être générés depuis la nomenclature (BOM). Utilisez le bouton "Générer depuis BOM" dans le projet.',
        action: 'use_bom_generation',
        endpoint: '/api/bom/generate-production',
      },
      { status: 422 },
    );
  }

  if (!isValidUUID(project_id)) {
    return NextResponse.json({ error: 'Valid project_id is required' }, { status: 400 });
  }

  const sanitizedName = sanitizeString(name, 200);
  if (!sanitizedName) {
    return NextResponse.json({ error: 'Order name is required' }, { status: 400 });
  }

  const sanitizedNotes = sanitizeString(notes, 2000);

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );

  // Verify project exists and is in production status
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, status')
    .eq('id', project_id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (project.status !== 'production' && project.status !== 'client_validation') {
    return NextResponse.json(
      {
        error: 'Le projet doit être en statut "production" ou "validation client" pour créer un ordre de production',
        current_status: project.status,
      },
      { status: 422 },
    );
  }

  // Verify BOM exists for this project
  const { data: bomParts } = await supabase
    .from('project_parts')
    .select('id')
    .eq('project_id', project_id)
    .limit(1);

  if (!bomParts || bomParts.length === 0) {
    return NextResponse.json(
      {
        error: 'Aucune nomenclature (BOM) trouvée pour ce projet',
        message: 'Générez d\'abord la BOM depuis l\'onglet Modules avant de créer un ordre de production.',
      },
      { status: 422 },
    );
  }

  // Create production order (linked to BOM)
  const { data: order, error: orderErr } = await supabase
    .from('production_orders')
    .insert({
      project_id,
      name: sanitizedName,
      notes: sanitizedNotes,
      status: 'pending',
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (orderErr || !order) {
    return NextResponse.json(
      { error: 'Failed to create production order', detail: orderErr?.message },
      { status: 500 },
    );
  }

  await writeAuditLog({
    user_id: auth.userId,
    action: 'production_change',
    entity_type: 'production_order',
    entity_id: order.id,
    new_value: { project_id, name: sanitizedName, source: 'bom' },
    notes: `Production order created from BOM for project ${project_id}`,
  });

  return NextResponse.json({ order }, { status: 201 });
}
