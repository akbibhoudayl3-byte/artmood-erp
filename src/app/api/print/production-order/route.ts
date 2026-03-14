import { NextRequest, NextResponse } from 'next/server';
import { requireRole, isValidUUID } from '@/lib/auth/server';
import { writeAuditLog } from '@/lib/security/audit';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // ── RBAC: only ceo and workshop_manager can print production orders ──
    const authResult = await requireRole(['ceo', 'workshop_manager']);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const orderId = request.nextUrl.searchParams.get('id');
    if (!isValidUUID(orderId)) {
      return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
    }

    const supabase = await createServerSupabase();

    const [orderRes, partsRes] = await Promise.all([
      supabase.from('production_orders')
        .select('*, project:projects(client_name, reference_code, project_type)')
        .eq('id', orderId).single(),
      supabase.from('production_parts').select('*').eq('production_order_id', orderId).order('part_name'),
    ]);

    if (!orderRes.data) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    const order = orderRes.data;
    const parts = partsRes.data || [];
    const project = order.project as any;

    // Audit log
    await writeAuditLog({
      user_id: userId,
      action: 'print',
      entity_type: 'production_orders',
      entity_id: orderId,
      notes: `Printed production order for ${project?.reference_code || orderId}`,
    });

    const partRows = parts.map((p: any) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0ede8;">${p.part_name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0ede8;font-family:monospace;font-size:12px;">${p.part_code || '-'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0ede8;text-align:center;">
          <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#f0ede8;">${p.current_station}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0ede8;text-align:center;">
          <div style="width:20px;height:20px;border:2px solid #d1d5db;border-radius:4px;display:inline-block;"></div>
        </td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Production Order - ${project?.reference_code || orderId}</title>
  <style>
    @media print { body { margin: 0; } .no-print { display: none; } @page { size: A4; margin: 15mm; } }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; margin: 0; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1B2A4A; padding-bottom: 15px; margin-bottom: 20px; }
    .logo h1 { font-size: 22px; color: #1B2A4A; margin: 0; }
    .logo p { color: #C9956B; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; margin: 2px 0 0; }
    .info { text-align: right; }
    .info h2 { font-size: 18px; color: #1B2A4A; margin: 0; }
    .info p { font-size: 12px; color: #64648B; margin: 3px 0; }
    .client-box { background: #F5F3F0; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
    .client-box h3 { font-size: 10px; text-transform: uppercase; color: #64648B; letter-spacing: 1px; margin: 0 0 8px; }
    .client-box .name { font-weight: 700; font-size: 15px; margin: 0; }
    .client-box .detail { font-size: 12px; color: #64648B; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead th { background: #1B2A4A; color: #fff; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
    thead th:first-child { border-radius: 6px 0 0 0; }
    thead th:last-child { border-radius: 0 6px 0 0; text-align: center; }
    .notes { margin-top: 20px; padding: 15px; border: 1px solid #E8E5E0; border-radius: 8px; }
    .notes h4 { font-size: 11px; text-transform: uppercase; color: #64648B; margin: 0 0 8px; }
    .notes-lines { min-height: 60px; border-top: 1px solid #f0ede8; }
    .footer { margin-top: 30px; display: flex; justify-content: space-between; font-size: 11px; color: #64648B; }
    .sig-box { border-top: 1px solid #d1d5db; width: 180px; padding-top: 5px; text-align: center; margin-top: 40px; }
    .print-btn { position: fixed; bottom: 20px; right: 20px; background: #1B2A4A; color: #fff; border: none; padding: 12px 24px; border-radius: 12px; cursor: pointer; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo"><h1>ArtMood</h1><p>Production Order</p></div>
    <div class="info">
      <h2>BON DE PRODUCTION</h2>
      <p><strong>Ref:</strong> ${project?.reference_code || '-'}</p>
      <p><strong>Date:</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
      <p><strong>Status:</strong> ${order.status}</p>
    </div>
  </div>

  <div class="client-box">
    <h3>Client</h3>
    <p class="name">${project?.client_name || '-'}</p>
    <p class="detail">Type: ${project?.project_type || '-'}</p>
    ${order.notes ? `<p class="detail">Notes: ${order.notes}</p>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>Part Name</th>
        <th>Code</th>
        <th style="text-align:center;">Station</th>
        <th style="text-align:center;width:60px;">Done</th>
      </tr>
    </thead>
    <tbody>${partRows}</tbody>
  </table>

  <p style="font-size:12px;color:#64648B;"><strong>${parts.length}</strong> parts total</p>

  <div class="notes">
    <h4>Workshop Notes</h4>
    <div class="notes-lines"></div>
  </div>

  <div class="footer">
    <div class="sig-box">Workshop Manager</div>
    <div class="sig-box">Quality Control</div>
  </div>

  <button class="print-btn no-print" onclick="window.print()">Print</button>
</body>
</html>`;

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (err) {
    console.error('Production order print error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
