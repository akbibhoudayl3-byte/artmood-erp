import { NextRequest, NextResponse } from 'next/server';
import { requireRole, isValidUUID } from '@/lib/auth/server';
import { writeAuditLog } from '@/lib/security/audit';
import { createServerSupabase } from '@/lib/supabase/server';
import { COMPANY } from '@/lib/config/company';

function esc(str: string | null | undefined): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['ceo', 'commercial_manager']);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const projectId = request.nextUrl.searchParams.get('project_id');
    if (!isValidUUID(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    }

    const supabase = await createServerSupabase();

    // Fetch project, accepted quote, and payments
    const [projectRes, quoteRes, paymentsRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('quotes')
        .select('*, quote_lines(*)')
        .eq('project_id', projectId)
        .eq('status', 'accepted')
        .order('version', { ascending: false })
        .limit(1)
        .single(),
      supabase.from('payments')
        .select('*')
        .eq('project_id', projectId)
        .order('received_at', { ascending: true }),
    ]);

    if (!projectRes.data) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const project = projectRes.data;
    const quote = quoteRes.data;
    const payments = paymentsRes.data || [];
    const lines = quote?.quote_lines || [];

    // Sort lines by sort_order
    lines.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));

    // Generate invoice number: FAC-{ref_code}-{year}
    const year = new Date().getFullYear();
    const invoiceNum = `FAC-${project.reference_code || 'XXX'}-${year}`;
    const invoiceDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    await writeAuditLog({
      user_id: userId,
      action: 'print',
      entity_type: 'invoice',
      entity_id: projectId!,
      notes: `Generated invoice ${invoiceNum} for ${project.client_name}`,
    });

    const html = generateInvoiceHtml(project, quote, lines, payments, invoiceNum, invoiceDate);

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    console.error('Invoice error:', err);
    return NextResponse.json({ error: 'Failed to generate invoice' }, { status: 500 });
  }
}

function generateInvoiceHtml(
  project: any, quote: any, lines: any[], payments: any[],
  invoiceNum: string, invoiceDate: string,
): string {
  const C = COMPANY;
  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const totalHT = Number(quote?.total_amount || project.total_amount || 0);
  const tvaRate = 20;
  const tvaAmount = Math.round(totalHT * tvaRate / 100);
  const totalTTC = totalHT + tvaAmount;

  const totalPaid = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const remaining = totalTTC - totalPaid;

  // Build line items from quote lines (or single line from project total)
  let lineRows: string;
  if (lines.length > 0) {
    lineRows = lines.map((line: any, i: number) => {
      const bg = i % 2 === 0 ? '#fff' : '#f7f7f7';
      return `<tr style="background:${bg}">
        <td style="padding:8px 12px;border:1px solid #ddd;font-size:12px">${esc(line.description)}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:center;font-size:12px">${line.quantity}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;font-size:12px">${fmt(Number(line.unit_price))}</td>
        <td style="padding:8px 12px;border:1px solid #ddd;text-align:right;font-size:12px;font-weight:600">${fmt(Number(line.total_price))}</td>
      </tr>`;
    }).join('');
  } else {
    lineRows = `<tr>
      <td style="padding:8px 12px;border:1px solid #ddd;font-size:12px">Prestation globale — ${esc(project.project_type || 'Mobilier')}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center;font-size:12px">1</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:right;font-size:12px">${fmt(totalHT)}</td>
      <td style="padding:8px 12px;border:1px solid #ddd;text-align:right;font-size:12px;font-weight:600">${fmt(totalHT)}</td>
    </tr>`;
  }

  // Payment history rows
  const paymentRows = payments.length > 0 ? payments.map((p: any) => {
    const typeLabel: Record<string, string> = { deposit: 'Acompte', pre_installation: 'Pré-installation', final: 'Solde', other: 'Autre' };
    const methodLabel: Record<string, string> = { cash: 'Espèces', cheque: 'Chèque', bank_transfer: 'Virement', card: 'Carte' };
    return `<tr>
      <td style="padding:6px 10px;border:1px solid #ddd;font-size:11px">${new Date(p.received_at).toLocaleDateString('fr-FR')}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;font-size:11px">${typeLabel[p.payment_type] || p.payment_type}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;font-size:11px">${methodLabel[p.payment_method] || p.payment_method || '-'}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;font-size:11px;font-weight:600">${fmt(Number(p.amount))}</td>
    </tr>`;
  }).join('') : '';

  const discountRow = quote?.discount_amount > 0 ? `
    <tr>
      <td colspan="3" style="padding:8px 12px;border:1px solid #ddd;text-align:right;font-size:12px;color:#666">Remise (${quote.discount_percent}%)</td>
      <td style="padding:8px 12px;border:1px solid #ddd;text-align:right;color:#dc2626;font-weight:600;font-size:12px">-${fmt(Number(quote.discount_amount))}</td>
    </tr>` : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Facture ${esc(invoiceNum)} - ArtMood</title>
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

  <div style="background:#1a1a1a;height:6px;width:100%"></div>

  <!-- HEADER -->
  <div style="padding:20px 32px 0;display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <img src="/logo-artmood.png" alt="ArtMood" style="width:100px;height:100px;border-radius:50%;object-fit:cover">
    </div>
    <div style="text-align:right;padding-top:20px">
      <div style="font-size:14px;font-weight:600;color:#1a1a1a;letter-spacing:1px">PRODUCTION &nbsp;&nbsp; MEUBLES-IMPORT-EXPORT</div>
      <div style="font-size:12px;color:#555;margin-top:4px">${C.contact.website}</div>
    </div>
  </div>

  <!-- INVOICE INFO + CLIENT -->
  <div style="padding:20px 32px 0;display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div style="font-size:22px;font-weight:700;color:#1a1a1a">FACTURE</div>
      <div style="font-size:13px;color:#333;margin-top:4px">N° : <strong>${esc(invoiceNum)}</strong></div>
      <div style="font-size:13px;color:#333">Date : ${invoiceDate}</div>
      <div style="font-size:12px;color:#888;margin-top:2px">Réf. projet : ${esc(project.reference_code)}</div>
    </div>
    <div style="text-align:right;padding-top:6px">
      <div style="font-size:15px;color:#1a1a1a"><strong>Client : ${esc(project.client_name)}</strong></div>
      ${project.client_phone ? `<div style="font-size:12px;color:#555;margin-top:2px">${esc(project.client_phone)}</div>` : ''}
      ${project.client_address ? `<div style="font-size:11px;color:#888;margin-top:2px">${esc(project.client_address)}${project.client_city ? ', ' + esc(project.client_city) : ''}</div>` : ''}
    </div>
  </div>

  <!-- LINE ITEMS TABLE -->
  <div style="padding:16px 32px 0;flex:1">
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr>
          <th style="background:#1a1a1a;color:#fff;padding:10px 12px;text-align:center;font-size:12px;font-weight:600;border:1px solid #1a1a1a">Désignation</th>
          <th style="background:#1a1a1a;color:#fff;padding:10px 8px;text-align:center;font-size:12px;font-weight:600;width:70px;border:1px solid #1a1a1a">Qté</th>
          <th style="background:#1a1a1a;color:#fff;padding:10px 8px;text-align:center;font-size:12px;font-weight:600;width:110px;border:1px solid #1a1a1a">PU HT</th>
          <th style="background:#1a1a1a;color:#fff;padding:10px 12px;text-align:center;font-size:12px;font-weight:600;width:130px;border:1px solid #1a1a1a">Montant HT</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
      </tbody>
    </table>

    ${discountRow ? `<table style="width:100%;border-collapse:collapse">${discountRow}</table>` : ''}

    <!-- TOTALS -->
    <table style="width:100%;border-collapse:collapse;margin-top:-1px">
      <tr>
        <td style="background:#1a1a1a;color:#fff;padding:8px 12px;font-size:13px;font-weight:700;text-align:center;border:1px solid #1a1a1a" colspan="3">Total HT</td>
        <td style="padding:8px 12px;text-align:right;font-size:13px;font-weight:600;border:1px solid #ddd;width:130px">${fmt(totalHT)} MAD</td>
      </tr>
      <tr>
        <td style="background:#1a1a1a;color:#fff;padding:8px 12px;font-size:13px;font-weight:700;text-align:center;border:1px solid #1a1a1a" colspan="3">TVA ${tvaRate}%</td>
        <td style="padding:8px 12px;text-align:right;font-size:13px;font-weight:600;border:1px solid #ddd;width:130px">${fmt(tvaAmount)} MAD</td>
      </tr>
      <tr>
        <td style="background:#1a1a1a;color:#fff;padding:8px 12px;font-size:14px;font-weight:700;text-align:center;border:1px solid #1a1a1a" colspan="3">Total TTC</td>
        <td style="padding:8px 12px;text-align:right;font-size:14px;font-weight:700;border:1px solid #ddd;width:130px">${fmt(totalTTC)} MAD</td>
      </tr>
    </table>

    <!-- PAYMENTS SUMMARY -->
    ${payments.length > 0 ? `
    <div style="margin-top:16px">
      <div style="font-size:12px;font-weight:700;color:#1a1a1a;margin-bottom:6px">Paiements Reçus</div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr>
            <th style="background:#f5f5f5;padding:6px 10px;text-align:left;font-size:10px;font-weight:600;border:1px solid #ddd">Date</th>
            <th style="background:#f5f5f5;padding:6px 10px;text-align:left;font-size:10px;font-weight:600;border:1px solid #ddd">Type</th>
            <th style="background:#f5f5f5;padding:6px 10px;text-align:left;font-size:10px;font-weight:600;border:1px solid #ddd">Mode</th>
            <th style="background:#f5f5f5;padding:6px 10px;text-align:right;font-size:10px;font-weight:600;border:1px solid #ddd;width:110px">Montant</th>
          </tr>
        </thead>
        <tbody>
          ${paymentRows}
          <tr style="background:#f0fdf4">
            <td colspan="3" style="padding:6px 10px;border:1px solid #ddd;font-size:11px;font-weight:700;text-align:right">Total Payé</td>
            <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;font-size:11px;font-weight:700;color:#16a34a">${fmt(totalPaid)} MAD</td>
          </tr>
          <tr style="background:${remaining > 0 ? '#fef2f2' : '#f0fdf4'}">
            <td colspan="3" style="padding:6px 10px;border:1px solid #ddd;font-size:11px;font-weight:700;text-align:right">Reste à Payer</td>
            <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;font-size:12px;font-weight:700;color:${remaining > 0 ? '#dc2626' : '#16a34a'}">${fmt(remaining)} MAD</td>
          </tr>
        </tbody>
      </table>
    </div>
    ` : ''}
  </div>

  <!-- FOOTER -->
  <div style="padding:0 32px 16px;margin-top:auto">
    <!-- Bank details -->
    <div style="background:#f5f5f5;padding:10px 14px;border-radius:6px;margin-bottom:8px;font-size:11px;color:#333">
      <strong>Coordonnées Bancaires :</strong> ${C.bank.name} — Agence: ${C.bank.agency}<br/>
      RIB: <strong>${C.bank.rib}</strong> — SWIFT: ${C.bank.swift}
    </div>

    <!-- Legal -->
    <div style="text-align:center;font-size:9px;color:#666;padding:8px 0;border-top:1px solid #ccc">
      Capital: ${C.capital} / RC: ${C.rc} / IF: ${C.identifiantFiscal} / TP: ${C.taxeProfessionnelle} / ICE: ${C.ice}
    </div>
    <div style="border-top:1px solid #eee;padding-top:6px;display:flex;justify-content:center;gap:30px;font-size:10px;color:#333">
      <span>${C.fullAddress}</span>
      <span>Tél: ${C.contact.fixe}</span>
      <span>${C.contact.email}</span>
    </div>
  </div>

  <div style="background:#1a1a1a;height:4px;width:100%"></div>
</div>

<button class="print-btn no-print" onclick="window.print()">Imprimer / PDF</button>
</body>
</html>`;
}
