import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/security/guardian';
import { isValidUUID, sanitizeString, sanitizeNumber } from '@/lib/auth/server';

/**
 * POST /api/installation/complete — Complete an installation with checklist validation.
 *
 * WORKFLOW RULES:
 *   - All checklist items must be checked before completion
 *   - Installation must be in 'in_progress' status
 *   - Completion report is required
 *   - Client satisfaction rating is required
 *
 * Body: { installation_id, completion_report, client_satisfaction }
 */
export async function POST(request: NextRequest) {
  const ctx = await guard(['ceo', 'workshop_manager', 'installer']);
  if (ctx instanceof NextResponse) return ctx;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { installation_id, completion_report, client_satisfaction } = body;

  if (!isValidUUID(installation_id)) {
    return NextResponse.json({ error: 'Valid installation_id is required' }, { status: 400 });
  }

  const report = sanitizeString(completion_report, 2000);
  if (!report?.trim()) {
    return NextResponse.json(
      { error: 'Un rapport de complétion est obligatoire pour finaliser l\'installation' },
      { status: 422 },
    );
  }

  const satisfaction = sanitizeNumber(client_satisfaction, { min: 1, max: 5 });
  if (satisfaction === null) {
    return NextResponse.json(
      { error: 'Une note de satisfaction client (1-5) est obligatoire' },
      { status: 422 },
    );
  }

  // ── Fetch installation ──────────────────────────────────────────────────
  const { data: installation, error: instErr } = await ctx.supabase
    .from('installations')
    .select('id, status, project_id')
    .eq('id', installation_id)
    .single();

  if (instErr || !installation) {
    return NextResponse.json({ error: 'Installation not found' }, { status: 404 });
  }

  if (installation.status !== 'in_progress') {
    return NextResponse.json(
      {
        error: 'L\'installation doit être en cours pour être complétée',
        current_status: installation.status,
        required_status: 'in_progress',
      },
      { status: 422 },
    );
  }

  // ── WORKFLOW RULE: Validate all checklist items are checked ─────────────
  const { data: checklist, error: checkErr } = await ctx.supabase
    .from('installation_checklist')
    .select('id, item_name, is_checked')
    .eq('installation_id', installation_id);

  if (checkErr) {
    return NextResponse.json(
      { error: 'Failed to verify checklist', detail: checkErr.message },
      { status: 500 },
    );
  }

  if (checklist && checklist.length > 0) {
    const unchecked = checklist.filter((item: any) => !item.is_checked);
    if (unchecked.length > 0) {
      return NextResponse.json(
        {
          error: 'Tous les éléments de la checklist doivent être validés avant de compléter l\'installation',
          unchecked_items: unchecked.map((item: any) => item.item_name),
          total: checklist.length,
          completed: checklist.length - unchecked.length,
          remaining: unchecked.length,
        },
        { status: 422 },
      );
    }
  }

  // ── Check no unresolved issues ─────────────────────────────────────────
  const { data: issues } = await ctx.supabase
    .from('installation_issues')
    .select('id, description')
    .eq('installation_id', installation_id)
    .eq('resolved', false);

  if (issues && issues.length > 0) {
    return NextResponse.json(
      {
        error: 'Des problèmes non résolus empêchent la complétion de l\'installation',
        unresolved_issues: issues.length,
      },
      { status: 422 },
    );
  }

  // ── Complete the installation ──────────────────────────────────────────
  const { data: updated, error: updateErr } = await ctx.supabase
    .from('installations')
    .update({
      status: 'completed',
      checkout_at: new Date().toISOString(),
      completion_report: report,
      client_satisfaction: satisfaction,
      updated_at: new Date().toISOString(),
    })
    .eq('id', installation_id)
    .select('id, status, project_id')
    .single();

  if (updateErr || !updated) {
    return NextResponse.json(
      { error: 'Failed to complete installation', detail: updateErr?.message },
      { status: 500 },
    );
  }

  // ── Audit log ─────────────────────────────────────────────────────────
  await ctx.audit({
    action: 'status_change',
    entity_type: 'installation',
    entity_id: installation_id,
    old_value: { status: 'in_progress' },
    new_value: { status: 'completed', satisfaction, checklist_items: checklist?.length || 0 },
    notes: `Installation completed. Satisfaction: ${satisfaction}/5. Report: ${report.substring(0, 100)}`,
  });

  return NextResponse.json({
    ok: true,
    installation: updated,
    message: 'Installation complétée avec succès',
  });
}
