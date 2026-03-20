import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireRole, isValidUUID } from '@/lib/auth/server';
import { writeAuditLog } from '@/lib/security/audit';

function esc(str: string | null | undefined): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * GET /api/invoices/[id]/pdf — Generate PDF/HTML for a real invoice record.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['ceo', 'commercial_manager']);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );

  // Fetch invoice with lines and project
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('*, invoice_lines(*)')
    .eq('id', id)
    .single();

  if (invErr || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', invoice.project_id)
    .single();

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Fetch linked payments
  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('invoice_id', id)
    .order('received_at');

  await writeAuditLog({
    user_id: auth.userId,
    action: 'print',
    entity_type: 'invoice',
    entity_id: id,
    notes: `Invoice ${invoice.invoice_number} printed`,
  });

  const lines = ((invoice.invoice_lines || []) as any[]).sort((a: any, b: any) => a.sort_order - b.sort_order);
  const paymentList = payments || [];
  const remaining = invoice.total_amount - invoice.paid_amount;

  const lineRows = lines.map((l: any, i: number) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f0ede8;color:#64648B;">${i + 1}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0ede8;">${esc(l.description)}</td>
      <td style="text-align:center;padding:10px 12px;border-bottom:1px solid #f0ede8;">${l.quantity} ${esc(l.unit)}</td>
      <td style="text-align:right;padding:10px 12px;border-bottom:1px solid #f0ede8;">${Number(l.unit_price).toLocaleString('fr-MA')} MAD</td>
      <td style="text-align:right;padding:10px 12px;border-bottom:1px solid #f0ede8;font-weight:600;">${Number(l.total_price).toLocaleString('fr-MA')} MAD</td>
    </tr>
  `).join('');

  const paymentRows = paymentList.map((p: any) => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #f0ede8;font-size:12px;">${new Date(p.received_at).toLocaleDateString('fr-FR')}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f0ede8;font-size:12px;">${esc(p.payment_type)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f0ede8;font-size:12px;">${esc(p.payment_method) || '-'}</td>
      <td style="text-align:right;padding:6px 12px;border-bottom:1px solid #f0ede8;font-size:12px;font-weight:600;color:#16a34a;">+${Number(p.amount).toLocaleString('fr-MA')} MAD</td>
    </tr>
  `).join('');

  const statusLabel: Record<string, string> = {
    draft: 'Brouillon',
    issued: 'Émise',
    partial: 'Partiellement payée',
    paid: 'Payée',
    cancelled: 'Annulée',
  };

  const statusColor: Record<string, string> = {
    draft: '#9ca3af',
    issued: '#2563eb',
    partial: '#f59e0b',
    paid: '#16a34a',
    cancelled: '#dc2626',
  };

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Facture ${esc(invoice.invoice_number)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; padding: 40px; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid #C9956B; }
    .logo { font-size: 28px; font-weight: 800; color: #C9956B; }
    .logo span { color: #1a1a2e; font-weight: 300; }
    .doc-type { font-size: 24px; font-weight: 700; color: #1a1a2e; margin-bottom: 4px; }
    .invoice-num { font-size: 14px; color: #C9956B; font-weight: 600; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 600; color: white; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
    .meta-box { background: #faf9f7; border-radius: 8px; padding: 16px; }
    .meta-box h4 { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #9ca3af; margin-bottom: 8px; }
    .meta-box p { font-size: 13px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { text-align: left; padding: 10px 12px; background: #1a1a2e; color: white; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
    th:last-child, th:nth-child(4) { text-align: right; }
    th:nth-child(3) { text-align: center; }
    .totals { margin-top: 16px; display: flex; justify-content: flex-end; }
    .totals-table { width: 280px; }
    .totals-table tr td { padding: 6px 12px; font-size: 13px; }
    .totals-table tr td:last-child { text-align: right; font-weight: 600; }
    .totals-table .grand-total td { background: #1a1a2e; color: white; font-size: 16px; font-weight: 700; padding: 12px; }
    .totals-table .remaining td { background: ${remaining > 0 ? '#dc2626' : '#16a34a'}; color: white; font-size: 14px; font-weight: 700; padding: 10px 12px; }
    .section-title { font-size: 14px; font-weight: 700; color: #1a1a2e; margin: 30px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #f0ede8; }
    .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; line-height: 1.6; }
    @media print { body { padding: 20px; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">ArtMood <span>Factory OS</span></div>
      <p style="font-size:11px;color:#64648B;margin-top:4px;">Fabrication de meubles sur mesure</p>
    </div>
    <div style="text-align:right;">
      <div class="doc-type">FACTURE</div>
      <div class="invoice-num">${esc(invoice.invoice_number)}</div>
      <div style="margin-top:8px;">
        <span class="status-badge" style="background:${statusColor[invoice.status] || '#9ca3af'}">
          ${statusLabel[invoice.status] || invoice.status}
        </span>
      </div>
      <p style="font-size:12px;color:#64648B;margin-top:8px;">
        Émise : ${invoice.issue_date ? new Date(invoice.issue_date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}
      </p>
      <p style="font-size:12px;color:#64648B;">
        Échéance : ${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}
      </p>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-box">
      <h4>Client</h4>
      <p><strong>${esc(project.client_name)}</strong></p>
      ${project.client_address ? `<p>${esc(project.client_address)}</p>` : ''}
      ${project.client_city ? `<p>${esc(project.client_city)}</p>` : ''}
      ${project.client_phone ? `<p>T\u00E9l: ${esc(project.client_phone)}</p>` : ''}
      ${project.client_email ? `<p>${esc(project.client_email)}</p>` : ''}
    </div>
    <div class="meta-box">
      <h4>Projet</h4>
      <p><strong>${esc(project.reference_code)}</strong></p>
      <p>Statut : ${esc(project.status)}</p>
      ${project.estimated_installation_date ? `<p>Installation : ${new Date(project.estimated_installation_date).toLocaleDateString('fr-FR')}</p>` : ''}
    </div>
  </div>

  ${lines.length > 0 ? `
  <h3 class="section-title">D\u00E9tail des prestations</h3>
  <table>
    <thead>
      <tr>
        <th style="width:40px">#</th>
        <th>Description</th>
        <th style="text-align:center">Quantit\u00E9</th>
        <th style="text-align:right">Prix unit.</th>
        <th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows}
    </tbody>
  </table>
  ` : `
  <h3 class="section-title">Montant</h3>
  <p style="padding:12px;color:#64648B;">Montant total : <strong>${Number(invoice.total_amount).toLocaleString('fr-MA')} MAD</strong></p>
  `}

  <div class="totals">
    <table class="totals-table">
      <tr><td>Sous-total HT</td><td>${Number(invoice.subtotal).toLocaleString('fr-MA')} MAD</td></tr>
      ${invoice.discount_amount > 0 ? `<tr><td>Remise (${invoice.discount_percent}%)</td><td style="color:#dc2626;">-${Number(invoice.discount_amount).toLocaleString('fr-MA')} MAD</td></tr>` : ''}
      <tr class="grand-total"><td>TOTAL TTC</td><td>${Number(invoice.total_amount).toLocaleString('fr-MA')} MAD</td></tr>
      <tr><td style="padding-top:12px;">Total pay\u00E9</td><td style="padding-top:12px;color:#16a34a;">+${Number(invoice.paid_amount).toLocaleString('fr-MA')} MAD</td></tr>
      <tr class="remaining"><td>Solde restant</td><td>${remaining.toLocaleString('fr-MA')} MAD</td></tr>
    </table>
  </div>

  ${paymentList.length > 0 ? `
  <h3 class="section-title">Historique des paiements</h3>
  <table>
    <thead><tr><th>Date</th><th>Type</th><th>Mode</th><th style="text-align:right">Montant</th></tr></thead>
    <tbody>${paymentRows}</tbody>
  </table>
  ` : ''}

  <div class="footer">
    <p><strong>ArtMood</strong> \u2014 Fabrication de meubles sur mesure</p>
    <p>Facture ${esc(invoice.invoice_number)} \u2014 Document g\u00E9n\u00E9r\u00E9 automatiquement</p>
  </div>
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
