import { NextRequest, NextResponse } from 'next/server';
import { requireRole, isValidUUID } from '@/lib/auth/server';
import { writeAuditLog } from '@/lib/security/audit';
import { createServerSupabase } from '@/lib/supabase/server';
import { COMPANY } from '@/lib/config/company';

/** Escape HTML to prevent XSS */
function esc(str: string | null | undefined): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['ceo', 'commercial_manager', 'designer']);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const quoteId = request.nextUrl.searchParams.get('id');
    const isInternal = request.nextUrl.searchParams.get('internal') === 'true';
    if (!isValidUUID(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    if (isInternal && !['ceo', 'commercial_manager'].includes(authResult.role || '')) {
      return NextResponse.json({ error: 'Internal view restricted to managers' }, { status: 403 });
    }

    const supabase = await createServerSupabase();

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

    let realCost: any = null;
    if (isInternal) {
      const { data: rc } = await supabase
        .from('v_project_real_cost')
        .select('*')
        .eq('project_id', quote.project_id)
        .maybeSingle();
      realCost = rc;
    }

    await writeAuditLog({
      user_id: userId,
      action: 'print',
      entity_type: 'quotes',
      entity_id: quoteId,
      notes: `Printed/exported quote${isInternal ? ' (INTERNAL)' : ''} for ${project?.reference_code || quoteId}`,
    });

    const html = generateQuoteHtml(quote, lines, project, isInternal, realCost);

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    console.error('Quote PDF error:', err);
    return NextResponse.json({ error: 'Failed to generate quote' }, { status: 500 });
  }
}

function generateQuoteHtml(quote: any, lines: any[], project: any, isInternal = false, realCost: any = null): string {
  const C = COMPANY;
  const costSnapshot = quote.cost_snapshot || {};
  const totalCost = costSnapshot.total_cost || (realCost?.real_cost ?? 0);
  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const createdDate = new Date(quote.created_at).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const tvaRate = 20;
  const totalHT = Number(quote.total_amount);
  const tvaAmount = Math.round(totalHT * tvaRate / 100);
  const totalTTC = totalHT + tvaAmount;

  // Build line rows
  const lineRows = lines.map((line: any, i: number) => {
    const lineCost = quote.subtotal > 0 ? Math.round(totalCost * (line.total_price / quote.subtotal)) : 0;
    const lineMargin = line.total_price > 0 ? Math.round((1 - lineCost / line.total_price) * 100) : 0;
    const bg = i % 2 === 0 ? '#fff' : '#f5f5f5';
    return `<tr style="background:${bg}">
      <td style="padding:10px 12px;border:1px solid #ddd;font-size:12px;vertical-align:top">${esc(line.description)}</td>
      <td style="padding:10px 8px;border:1px solid #ddd;text-align:center;font-size:12px">${line.quantity}</td>
      <td style="padding:10px 8px;border:1px solid #ddd;text-align:right;font-size:12px">${fmt(Number(line.unit_price))}</td>
      <td style="padding:10px 12px;border:1px solid #ddd;text-align:right;font-size:12px;font-weight:600">${fmt(Number(line.total_price))}</td>
      ${isInternal ? `<td style="padding:8px 6px;border:1px solid #93C5FD;text-align:right;color:#2563eb;font-size:10px;background:#f0f4ff">${fmt(lineCost)}</td><td style="padding:8px 6px;border:1px solid #93C5FD;text-align:right;font-weight:700;color:${lineMargin >= 15 ? '#16a34a' : '#dc2626'};font-size:10px;background:#f0f4ff">${lineMargin}%</td>` : ''}
    </tr>`;
  }).join('');

  // Empty filler rows to make the table extend down the page (like the original)
  const minRows = 1;
  const emptyRowCount = Math.max(0, minRows - lines.length);
  const emptyRows = Array(emptyRowCount).fill('').map(() =>
    `<tr><td style="padding:20px 12px;border:1px solid #ddd">&nbsp;</td><td style="border:1px solid #ddd">&nbsp;</td><td style="border:1px solid #ddd">&nbsp;</td><td style="border:1px solid #ddd">&nbsp;</td>${isInternal ? '<td style="border:1px solid #93C5FD;background:#f0f4ff">&nbsp;</td><td style="border:1px solid #93C5FD;background:#f0f4ff">&nbsp;</td>' : ''}</tr>`
  ).join('');

  const discountRow = quote.discount_amount > 0 ? `
    <tr>
      <td colspan="3" style="padding:8px 12px;border:1px solid #ddd;text-align:right;font-size:12px;color:#666">Remise (${quote.discount_percent}%)</td>
      <td style="padding:8px 12px;border:1px solid #ddd;text-align:right;color:#dc2626;font-weight:600;font-size:12px">-${fmt(Number(quote.discount_amount))}</td>
    </tr>` : '';

  // Internal cost analysis block (only for managers)
  const internalBlock = isInternal && totalCost > 0 ? `
  <div style="background:#f0f4ff;border:1px solid #3B82F6;border-radius:4px;padding:10px;margin-top:12px;font-size:10px">
    <div style="font-size:10px;color:#1D4ED8;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:8px">Analyse des Coûts (Confidentiel)</div>
    <div style="display:flex;gap:14px;flex-wrap:wrap">
      <div>Matériaux: <strong>${fmt(Number(costSnapshot.material_cost || 0))}</strong></div>
      <div>Quincaillerie: <strong>${fmt(Number(costSnapshot.hardware_cost || 0))}</strong></div>
      <div>Main d'œuvre: <strong>${fmt(Number(costSnapshot.labor_cost || 0))}</strong></div>
      <div>Usinage: <strong>${fmt(Number(costSnapshot.machine_cost || 0))}</strong></div>
      <div>Transport: <strong>${fmt(Number(costSnapshot.transport_cost || 0))}</strong></div>
    </div>
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid #93C5FD;display:flex;justify-content:space-between;font-size:12px">
      <strong>Coût Total: ${fmt(Number(totalCost))} MAD</strong>
      <strong style="color:${(realCost ? realCost.margin_percent : (1 - totalCost / quote.total_amount) * 100) >= 15 ? '#16a34a' : '#dc2626'}">Marge: ${realCost ? realCost.margin_percent : Math.round((1 - totalCost / quote.total_amount) * 100)}%</strong>
    </div>
  </div>` : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Devis ${esc(project?.reference_code) || ''} - ArtMood</title>
<style>
@media print {
  body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print { display: none !important; }
  @page { size: A4; margin: 0; }
  .page { padding: 0 !important; min-height: 100vh; }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #222; background: #fff; font-size: 13px; line-height: 1.4; }
.page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 0; position: relative; display: flex; flex-direction: column; }
.print-btn { position: fixed; bottom: 24px; right: 24px; background: #1a1a1a; color: #fff; border: none; padding: 14px 32px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; box-shadow: 0 4px 20px rgba(0,0,0,.25); z-index: 100; }
.print-btn:hover { background: #333; }
</style>
</head>
<body>
<div class="page">

  <!-- ═══ TOP BLACK BAR ═══ -->
  <div style="background:#1a1a1a;height:6px;width:100%"></div>

  <!-- ═══ HEADER ═══ -->
  <div style="padding:20px 32px 0;display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <img src="/logo-artmood.png" alt="ArtMood" style="width:120px;height:120px;border-radius:50%;object-fit:cover">
    </div>
    <div style="text-align:right;padding-top:20px">
      <div style="font-size:14px;font-weight:600;color:#1a1a1a;text-decoration:underline;letter-spacing:1px">PRODUCTION &nbsp;&nbsp; MEUBLES-IMPORT-EXPORT</div>
      <div style="font-size:12px;color:#555;margin-top:4px">${C.contact.website}</div>
    </div>
  </div>

  <!-- ═══ DEVIS INFO + CLIENT ═══ -->
  <div style="padding:20px 32px 0;display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div style="font-size:20px;font-weight:700;color:#1a1a1a">DEVIS${isInternal ? ' <span style="color:#dc2626;font-size:12px;background:#fecaca;padding:2px 8px;border-radius:3px;vertical-align:middle">INTERNE</span>' : ''}</div>
      <div style="font-size:13px;color:#333;margin-top:4px">
        N° : <strong>${esc(project?.reference_code) || 'N/A'}</strong>-v${quote.version}
      </div>
      <div style="font-size:13px;color:#333">Du : ${createdDate}</div>
    </div>
    <div style="text-align:right;padding-top:6px">
      <div style="font-size:15px;color:#1a1a1a"><strong>Client : ${esc(project?.client_name) || 'N/A'}</strong></div>
      ${project?.client_phone ? `<div style="font-size:12px;color:#555;margin-top:2px">${esc(project.client_phone)}</div>` : ''}
      ${project?.client_address ? `<div style="font-size:11px;color:#888;margin-top:2px">${esc(project.client_address)}${project.client_city ? ', ' + esc(project.client_city) : ''}</div>` : ''}
    </div>
  </div>

  <!-- ═══ TABLE ═══ -->
  <div style="padding:16px 32px 0;flex:1">
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr>
          <th style="background:#1a1a1a;color:#fff;padding:10px 12px;text-align:center;font-size:13px;font-weight:600;border:1px solid #1a1a1a">Désignation</th>
          <th style="background:#1a1a1a;color:#fff;padding:10px 8px;text-align:center;font-size:13px;font-weight:600;width:80px;border:1px solid #1a1a1a">Quantité</th>
          <th style="background:#1a1a1a;color:#fff;padding:10px 8px;text-align:center;font-size:13px;font-weight:600;width:120px;border:1px solid #1a1a1a">PU HT</th>
          <th style="background:#1a1a1a;color:#fff;padding:10px 12px;text-align:center;font-size:13px;font-weight:600;width:140px;border:1px solid #1a1a1a">Montant HT</th>
          ${isInternal ? '<th style="background:#2563eb;color:#fff;padding:8px 6px;text-align:center;font-size:10px;font-weight:600;width:80px;border:1px solid #2563eb">Coût</th><th style="background:#2563eb;color:#fff;padding:8px 6px;text-align:center;font-size:10px;font-weight:600;width:55px;border:1px solid #2563eb">Marge</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${lineRows}
        ${emptyRows}
      </tbody>
    </table>

    ${discountRow ? `<table style="width:100%;border-collapse:collapse">${discountRow}</table>` : ''}

    <!-- ═══ TOTALS ═══ -->
    <table style="width:100%;border-collapse:collapse;margin-top:-1px">
      <tr>
        <td style="background:#1a1a1a;color:#fff;padding:10px 12px;font-size:14px;font-weight:700;text-align:center;border:1px solid #1a1a1a" colspan="3">Total HT</td>
        <td style="padding:10px 12px;text-align:right;font-size:14px;font-weight:600;border:1px solid #ddd;width:140px">${fmt(totalHT)}</td>
      </tr>
      <tr>
        <td style="background:#1a1a1a;color:#fff;padding:10px 12px;font-size:14px;font-weight:700;text-align:center;border:1px solid #1a1a1a" colspan="3">TVA ${tvaRate}%</td>
        <td style="padding:10px 12px;text-align:right;font-size:14px;font-weight:600;border:1px solid #ddd;width:140px">${fmt(tvaAmount)}</td>
      </tr>
      <tr>
        <td style="background:#1a1a1a;color:#fff;padding:10px 12px;font-size:14px;font-weight:700;text-align:center;border:1px solid #1a1a1a" colspan="3">Total TTC</td>
        <td style="padding:10px 12px;text-align:right;font-size:15px;font-weight:700;border:1px solid #ddd;width:140px">${fmt(totalTTC)}</td>
      </tr>
    </table>

    ${internalBlock}
  </div>

  <!-- ═══ FOOTER ═══ -->
  <div style="padding:0 32px 16px;margin-top:auto">
    <!-- Legal line -->
    <div style="text-align:center;font-size:9px;color:#666;padding:8px 0;border-top:1px solid #ccc">
      Capital: ${C.capital} / RC: ${C.rc} / IF: ${C.identifiantFiscal} / TP: ${C.taxeProfessionnelle} / ICE: ${C.ice}
    </div>
    <div style="border-top:1px solid #eee;padding-top:8px;display:flex;justify-content:center;gap:40px;font-size:11px;color:#333">
      <span style="display:flex;align-items:center;gap:6px">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:1px solid #ccc;border-radius:4px">&#9742;</span>
        ${C.contact.fixe}
      </span>
      <span style="display:flex;align-items:center;gap:6px">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:1px solid #ccc;border-radius:4px">&#9993;</span>
        ${C.contact.email}
      </span>
      <span style="display:flex;align-items:center;gap:6px">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:1px solid #ccc;border-radius:4px">&#9906;</span>
        ZONE INDUSTRIELLE GZENAYA N 436 TANGER
      </span>
    </div>
    <!-- Bank RIB -->
    <div style="text-align:center;font-size:9px;color:#888;margin-top:6px">
      ${C.bank.name} — Agence: ${C.bank.agency} — RIB: ${C.bank.rib} — SWIFT: ${C.bank.swift}
    </div>
    <!-- Payment terms -->
    <div style="text-align:center;font-size:8px;color:#999;margin-top:4px">
      ${C.paymentTerms.join(' | ')}
    </div>
  </div>

</div>
<button class="print-btn no-print" onclick="window.print()">&#128438; Imprimer / PDF</button>
</body>
</html>`;
}
