import { NextRequest, NextResponse } from 'next/server';
import { requireRole, isValidUUID } from '@/lib/auth/server';
import { writeAuditLog } from '@/lib/security/audit';
import { createServerSupabase } from '@/lib/supabase/server';

/** Escape HTML to prevent XSS */
function esc(str: string | null | undefined): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function GET(request: NextRequest) {
  try {
    // ── RBAC: only ceo, commercial_manager, and designer can view/print quotes ──
    const authResult = await requireRole(['ceo', 'commercial_manager', 'designer']);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const quoteId = request.nextUrl.searchParams.get('id');
    if (!isValidUUID(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const supabase = await createServerSupabase();

    // Fetch quote data
    const [quoteRes, linesRes] = await Promise.all([
      supabase.from('quotes')
        .select('*, project:projects(client_name, client_phone, client_email, client_address, client_city, reference_code)')
        .eq('id', quoteId).single(),
      supabase.from('quote_lines').select('*').eq('quote_id', quoteId).order('sort_order'),
    ]);

    if (!quoteRes.data) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const quote = quoteRes.data;
    const lines = linesRes.data || [];
    const project = quote.project as any;

    // Audit log
    await writeAuditLog({
      user_id: userId,
      action: 'print',
      entity_type: 'quotes',
      entity_id: quoteId,
      notes: `Printed/exported quote for ${project?.reference_code || quoteId}`,
    });

    const html = generateQuoteHtml(quote, lines, project);

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    console.error('Quote PDF error:', err);
    return NextResponse.json({ error: 'Failed to generate quote' }, { status: 500 });
  }
}

function generateQuoteHtml(quote: any, lines: any[], project: any): string {
  const lineRows = lines.map(line => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f0ede8;color:#1a1a2e;">${esc(line.description)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0ede8;text-align:center;color:#64648B;">${line.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0ede8;text-align:center;color:#64648B;">${line.unit}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0ede8;text-align:right;color:#64648B;">${Number(line.unit_price).toLocaleString('fr-MA')} MAD</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0ede8;text-align:right;font-weight:600;color:#1a1a2e;">${Number(line.total_price).toLocaleString('fr-MA')} MAD</td>
    </tr>
  `).join('');

  const discountRow = quote.discount_amount > 0 ? `
    <tr>
      <td colspan="4" style="padding:8px 12px;text-align:right;color:#64648B;">Discount (${quote.discount_percent}%)</td>
      <td style="padding:8px 12px;text-align:right;color:#dc2626;font-weight:600;">-${Number(quote.discount_amount).toLocaleString('fr-MA')} MAD</td>
    </tr>
  ` : '';

  const validUntil = quote.valid_until
    ? new Date(quote.valid_until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const createdDate = new Date(quote.created_at).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Devis ${esc(project?.reference_code) || ''} - ArtMood</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; margin: 0; padding: 0; background: #fff; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px solid #1B2A4A; padding-bottom: 20px; }
    .logo-section h1 { font-size: 28px; color: #1B2A4A; margin: 0; letter-spacing: -0.5px; }
    .logo-section p { color: #C9956B; font-size: 12px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; margin: 4px 0 0; }
    .quote-info { text-align: right; }
    .quote-info h2 { font-size: 22px; color: #C9956B; margin: 0; }
    .quote-info p { color: #64648B; font-size: 13px; margin: 4px 0; }
    .client-section { background: #F5F3F0; border-radius: 12px; padding: 20px; margin-bottom: 30px; }
    .client-section h3 { font-size: 11px; text-transform: uppercase; color: #64648B; letter-spacing: 1px; margin: 0 0 10px; }
    .client-section p { margin: 4px 0; font-size: 14px; }
    .client-section .name { font-weight: 700; font-size: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead th { background: #1B2A4A; color: #fff; padding: 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    thead th:first-child { border-radius: 8px 0 0 0; }
    thead th:last-child { border-radius: 0 8px 0 0; }
    .totals { margin-left: auto; width: 300px; }
    .totals table { margin-bottom: 0; }
    .totals td { padding: 8px 12px; }
    .total-row { background: #1B2A4A; color: #fff; font-weight: 700; font-size: 16px; }
    .total-row td:first-child { border-radius: 0 0 0 8px; }
    .total-row td:last-child { border-radius: 0 0 8px 0; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #E8E5E0; display: flex; justify-content: space-between; }
    .footer-section h4 { font-size: 11px; text-transform: uppercase; color: #64648B; letter-spacing: 1px; margin: 0 0 8px; }
    .footer-section p { font-size: 13px; color: #64648B; margin: 3px 0; }
    .notes { background: #FFF7ED; border: 1px solid #FED7AA; border-radius: 8px; padding: 16px; margin-top: 20px; }
    .notes h4 { font-size: 12px; color: #C2410C; margin: 0 0 8px; }
    .notes p { font-size: 13px; color: #9A3412; margin: 0; }
    .print-btn { position: fixed; bottom: 20px; right: 20px; background: #1B2A4A; color: #fff; border: none; padding: 12px 24px; border-radius: 12px; cursor: pointer; font-size: 14px; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
    .print-btn:hover { background: #243660; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-section">
        <h1>ArtMood</h1>
        <p>Kitchen Manufacturing</p>
      </div>
      <div class="quote-info">
        <h2>DEVIS</h2>
        <p><strong>N°:</strong> ${esc(project?.reference_code) || 'N/A'}-v${quote.version}</p>
        <p><strong>Date:</strong> ${createdDate}</p>
        ${validUntil ? `<p><strong>Valide jusqu'au:</strong> ${validUntil}</p>` : ''}
      </div>
    </div>

    <div class="client-section">
      <h3>Client</h3>
      <p class="name">${esc(project?.client_name) || 'N/A'}</p>
      ${project?.client_phone ? `<p>Tél: ${esc(project.client_phone)}</p>` : ''}
      ${project?.client_email ? `<p>Email: ${esc(project.client_email)}</p>` : ''}
      ${project?.client_address ? `<p>${esc(project.client_address)}${project.client_city ? `, ${esc(project.client_city)}` : ''}</p>` : ''}
    </div>

    <table>
      <thead>
        <tr>
          <th style="text-align:left;">Description</th>
          <th style="text-align:center;">Qté</th>
          <th style="text-align:center;">Unité</th>
          <th style="text-align:right;">Prix Unit.</th>
          <th style="text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
      </tbody>
    </table>

    <div class="totals">
      <table>
        <tr>
          <td style="color:#64648B;">Sous-total</td>
          <td style="text-align:right;font-weight:600;">${Number(quote.subtotal).toLocaleString('fr-MA')} MAD</td>
        </tr>
        ${discountRow}
        <tr class="total-row">
          <td style="padding:12px;">TOTAL TTC</td>
          <td style="padding:12px;text-align:right;">${Number(quote.total_amount).toLocaleString('fr-MA')} MAD</td>
        </tr>
      </table>
    </div>

    ${quote.notes ? `
    <div class="notes">
      <h4>Notes</h4>
      <p>${esc(quote.notes)}</p>
    </div>
    ` : ''}

    <div class="footer">
      <div class="footer-section">
        <h4>Conditions de Paiement</h4>
        <p>50% à la commande</p>
        <p>40% avant installation</p>
        <p>10% à la livraison</p>
      </div>
      <div class="footer-section" style="text-align:right;">
        <h4>Contact</h4>
        <p>ArtMood Factory</p>
        <p>Casablanca, Maroc</p>
      </div>
    </div>
  </div>

  <button class="print-btn no-print" onclick="window.print()">Imprimer / PDF</button>
</body>
</html>`;
}
