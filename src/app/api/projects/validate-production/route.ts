import { NextRequest, NextResponse } from 'next/server';
import { requireRole, isValidUUID } from '@/lib/auth/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  // ── RBAC: production validation is restricted to managers ──
  const authResult = await requireRole(['ceo', 'workshop_manager', 'commercial_manager']);
  if (authResult instanceof NextResponse) return authResult;
  const { userId, role } = authResult;

  const projectId = req.nextUrl.searchParams.get('id');
  if (!isValidUUID(projectId)) {
    return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Get or create validation record
  let { data: validation } = await supabase
    .from('production_validations')
    .select('*')
    .eq('project_id', projectId)
    .single();

  if (!validation) {
    const { data: newValidation } = await supabase
      .from('production_validations')
      .insert({ project_id: projectId })
      .select()
      .single();
    validation = newValidation;
  }

  // Auto-check deposit
  const depositPercent = project.total_amount > 0
    ? (project.paid_amount / project.total_amount) * 100
    : 0;
  const depositOk = depositPercent >= 50 || project.deposit_paid;

  // Auto-check design
  const designOk = project.design_validated === true;

  // Auto-check measurements
  const measurementsOk = project.measurement_date !== null;

  // Check stock availability
  const { data: stockResult } = await supabase.rpc('check_stock_availability', {
    p_project_id: projectId
  });
  const materialsOk = stockResult?.available ?? false;

  // Update auto-checks in validation record
  if (validation) {
    await supabase
      .from('production_validations')
      .update({
        deposit_check: depositOk,
        measurements_validated: measurementsOk,
        design_validated: designOk,
        materials_available: materialsOk,
      })
      .eq('id', validation.id);
  }

  // Build errors (hard blocks)
  const errors: string[] = [];
  if (!depositOk) errors.push('50% deposit has not been paid');
  if (!measurementsOk) errors.push('Measurements have not been validated');
  if (!designOk) errors.push('Design has not been validated');
  if (!materialsOk) errors.push('Required materials not available in stock');
  if (!validation?.accessories_available) errors.push('Accessories availability not confirmed');
  if (!validation?.installer_validated) errors.push('Installer has not signed off');
  if (!validation?.workshop_manager_validated) errors.push('Workshop manager has not signed off');

  const warnings: string[] = [];
  if (project.total_amount === 0) warnings.push('No quote amount set on project');

  const isCeo = role === 'ceo';
  const hasOverride = validation?.ceo_override === true;
  const allChecksPassed = errors.length === 0;
  const canProceed = allChecksPassed || hasOverride;

  return NextResponse.json({
    valid: allChecksPassed,
    errors,
    warnings,
    canOverride: isCeo,
    canProceed,
    hasOverride,
    validation: validation ? {
      ...validation,
      deposit_check: depositOk,
      measurements_validated: measurementsOk,
      design_validated: designOk,
      materials_available: materialsOk,
    } : null,
    depositPercent: Math.round(depositPercent),
  });
}
