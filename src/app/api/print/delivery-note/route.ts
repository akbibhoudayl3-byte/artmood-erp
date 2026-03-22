
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID } from '@/lib/auth/server';
import { writeAuditLog } from '@/lib/security/audit';
import { COMPANY, getCompanyHeaderHtml, getLegalFooterHtml } from '@/lib/config/company';

/** Escape HTML to prevent XSS */
function esc(str: string | null | undefined): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function GET(request: NextRequest) {
  // ── Auth + role ──────────────────────────────────────────────────────────
  const auth = await requireRole(['ceo', 'commercial_manager']);
  if (auth instanceof NextResponse) return auth;

  const projectId = request.nextUrl.searchParams.get('id');
  if (!isValidUUID(projectId)) {
    return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );

  const [projRes, paymentsRes] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).single(),
    supabase.from('payments').select('*').eq('project_id', projectId).order('received_at'),
  ]);

  if (!projRes.data) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Audit
  await writeAuditLog({
    user_id: auth.userId,
    action: 'print',
    entity_type: 'project',
    entity_id: projectId,
    notes: 'delivery-note printed',
  });

  const project = projRes.data;
  const payments = paymentsRes.data || [];
  const totalPaid = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const remaining = Number(project.total_amount) - totalPaid;

  const paymentRows = payments.map((p: any) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0ede8;">${new Date(p.received_at).toLocaleDateString('fr-FR')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0ede8;">${esc(p.payment_type)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0ede8;">${esc(p.payment_method) || '-'}</td>
      <td style="text-align:right;padding:8px 12px;border-bottom:1px solid #f0ede8;font-weight:600;color:#16a34a;">+${Number(p.amount).toLocaleString('fr-MA')} MAD</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Bon de Livraison — ${esc(project.reference_code)}</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; margin: 0; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .logo { font-size: 28px; font-weight: 800; color: #C9956B; }
    .logo span { color: #1a1a2e; font-weight: 300; }
    .doc-title { font-size: 13px; color: #64648B; text-transform: uppercase; letter-spacing: 2px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { text-align: left; padding: 10px 12px; background: #f5f3f0; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64648B; }
    .total-row td { padding: 12px; background: #1a1a2e; color: white; font-weight: 700; font-size: 15px; }
    .footer { margin-top: 60px; font-size: 11px; color: #9ca3af; text-align: center; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">${COMPANY.name}</div>
      <div class="doc-title">Bon de Livraison</div>
    </div>
    <div style="text-align:right;">
      <h1>${esc(project.reference_code)}</h1>
      <p style="margin:2px 0;color:#64648B;">${new Date().toLocaleDateString('fr-FR', { year:'numeric', month:'long', day:'numeric' })}</p>
    </div>
  </div>

  <table>
    <tr>
      <th>Client</th><th>Adresse</th><th>Téléphone</th>
    </tr>
    <tr>
      <td style="padding:10px 12px;font-weight:600">${esc(project.client_name)}</td>
      <td style="padding:10px 12px;color:#64648B">${esc(project.address) || '—'}</td>
      <td style="padding:10px 12px;color:#64648B">${esc(project.phone) || '—'}</td>
    </tr>
  </table>

  <h3 style="margin: 24px 0 8px;">Paiements reçus</h3>
  <table>
    <thead><tr><th>Date</th><th>Type</th><th>Mode</th><th style="text-align:right">Montant</th></tr></thead>
    <tbody>${paymentRows || '<tr><td colspan="4" style="padding:12px;color:#9ca3af">Aucun paiement enregistré</td></tr>'}</tbody>
    <tr class="total-row">
      <td colspan="3">Montant total projet</td>
      <td style="text-align:right">${Number(project.total_amount).toLocaleString('fr-MA')} MAD</td>
    </tr>
    <tr class="total-row">
      <td colspan="3" style="background:#16a34a">Total payé</td>
      <td style="text-align:right;background:#16a34a">+${totalPaid.toLocaleString('fr-MA')} MAD</td>
    </tr>
    <tr class="total-row">
      <td colspan="3" style="background:${remaining > 0 ? '#dc2626' : '#16a34a'}">Solde restant</td>
      <td style="text-align:right;background:${remaining > 0 ? '#dc2626' : '#16a34a'}">${remaining.toLocaleString('fr-MA')} MAD</td>
    </tr>
  </table>
  <div class="footer">${COMPANY.name} — ${COMPANY.fullAddress} — RC: ${COMPANY.rc} — ICE: ${COMPANY.ice}</div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
