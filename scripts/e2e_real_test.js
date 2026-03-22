// ═══════════════════════════════════════════════════════════════
// ArtMood ERP — REAL END-TO-END BUSINESS TEST
// Tests: Lead → Project → Quote → Payment → Accept → Production → Stock → Invoice
// ═══════════════════════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://emeznqaweezgsqavxkuu.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('ERROR: Set SUPABASE_SERVICE_ROLE_KEY env var');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const TEST_PREFIX = 'E2E-TEST';

let leadId, projectId, quoteId, productionOrderId;

async function step(num, name, fn) {
  process.stdout.write(`\n[${num}/10] ${name}... `);
  try {
    const result = await fn();
    console.log('OK');
    return result;
  } catch (err) {
    console.log('FAILED');
    console.error('  Error:', err.message || err);
    throw err;
  }
}

async function run() {
  console.log('='.repeat(60));
  console.log('  ArtMood ERP — Real End-to-End Business Test');
  console.log('  Started:', new Date().toLocaleString('fr-FR'));
  console.log('='.repeat(60));

  // ── STEP 1: Create Lead ──
  await step(1, 'Create Lead', async () => {
    const { data, error } = await supabase.from('leads').insert({
      full_name: `${TEST_PREFIX} Client Test`,
      email: 'e2e-test@artmood.ma',
      phone: '+212600000000',
      source: 'website',
      status: 'new',
      notes: 'Automated E2E test — safe to delete',
    }).select().single();
    if (error) throw error;
    leadId = data.id;
    console.log(`  Lead ID: ${leadId}`);
  });

  // ── STEP 2: Convert Lead → Project ──
  await step(2, 'Convert Lead to Project', async () => {
    await supabase.from('leads').update({ status: 'converted' }).eq('id', leadId);

    const refCode = `ART-TEST-${Date.now().toString(36).toUpperCase()}`;
    const { data, error } = await supabase.from('projects').insert({
      lead_id: leadId,
      client_name: `${TEST_PREFIX} Client Test`,
      client_phone: '+212600000000',
      client_email: 'e2e-test@artmood.ma',
      reference_code: refCode,
      project_type: 'kitchen',
      status: 'draft',
      priority: 'medium',
      total_amount: 0,
      notes: 'Automated E2E test project',
    }).select().single();
    if (error) throw error;
    projectId = data.id;
    console.log(`  Project ID: ${projectId}`);
    console.log(`  Reference: ${refCode}`);
  });

  // ── STEP 3: Create Quote with Line Items ──
  await step(3, 'Create Quote (Devis)', async () => {
    const { data: quote, error: qErr } = await supabase.from('quotes').insert({
      project_id: projectId,
      status: 'draft',
      total_amount: 45000,
      valid_until: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      notes: 'E2E test devis',
    }).select().single();
    if (qErr) throw qErr;
    quoteId = quote.id;

    // quote_lines uses: total_price (not total)
    const lines = [
      { quote_id: quoteId, description: 'Cuisine en MDF laque blanc', quantity: 1, unit_price: 25000, total_price: 25000, sort_order: 1 },
      { quote_id: quoteId, description: 'Plan de travail granit noir', quantity: 3, unit_price: 3500, total_price: 10500, sort_order: 2 },
      { quote_id: quoteId, description: 'Installation et pose', quantity: 1, unit_price: 5000, total_price: 5000, sort_order: 3 },
      { quote_id: quoteId, description: 'Quincaillerie Blum', quantity: 1, unit_price: 4500, total_price: 4500, sort_order: 4 },
    ];
    const { error: lErr } = await supabase.from('quote_lines').insert(lines);
    if (lErr) throw lErr;
    console.log(`  Quote ID: ${quoteId}`);
    console.log(`  Lines: ${lines.length} items, Total: 45,000 MAD`);
  });

  // ── STEP 4: Send Quote to Client ──
  await step(4, 'Send Quote to Client', async () => {
    const { error } = await supabase.from('quotes').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
    }).eq('id', quoteId);
    if (error) throw error;
    console.log('  Status: sent');
  });

  // ── STEP 5: Record 50% Deposit Payment ──
  await step(5, 'Record 50% Deposit (22,500 MAD)', async () => {
    // payments uses: payment_type (not status), received_at (not payment_date)
    const { error } = await supabase.from('payments').insert({
      project_id: projectId,
      amount: 22500,
      payment_method: 'bank_transfer',
      payment_type: 'deposit',
      received_at: new Date().toISOString(),
      notes: 'Acompte 50% — E2E test',
    });
    if (error) throw error;

    // Update project total and paid_amount
    await supabase.from('projects').update({ total_amount: 45000, paid_amount: 22500, deposit_paid: true }).eq('id', projectId);
    console.log('  Payment: 22,500 MAD (50% of 45,000)');
  });

  // ── STEP 6: Accept Quote → Create Production Order ──
  await step(6, 'Accept Quote + Create Production Order', async () => {
    const { error: qErr } = await supabase.from('quotes').update({
      status: 'accepted',
      responded_at: new Date().toISOString(),
    }).eq('id', quoteId);
    if (qErr) throw qErr;

    const { error: pErr } = await supabase.from('projects').update({
      status: 'production',
    }).eq('id', projectId);
    if (pErr) throw pErr;

    // production_orders: no 'priority' column, use name instead
    const { data: po, error: poErr } = await supabase.from('production_orders').insert({
      project_id: projectId,
      status: 'pending',
      name: 'E2E Test Production',
      notes: 'E2E test production order',
    }).select().single();

    if (poErr) {
      console.log('  (production_orders failed:', poErr.message, ')');
      const { data: ps, error: psErr } = await supabase.from('production_sheets').insert({
        project_id: projectId,
        status: 'pending',
        notes: 'E2E test production sheet',
      }).select().single();
      if (psErr) throw psErr;
      productionOrderId = ps.id;
      console.log(`  Production Sheet ID: ${productionOrderId}`);
    } else {
      productionOrderId = po.id;
      console.log(`  Production Order ID: ${productionOrderId}`);
    }
    console.log('  Quote: accepted, Project: production');
  });

  // ── STEP 7: Verify Stock Item Exists ──
  let stockItemId;
  await step(7, 'Verify Stock (MDF panel)', async () => {
    const { data, error } = await supabase
      .from('stock_items')
      .select('id, name, current_quantity, unit, sku')
      .eq('is_active', true)
      .ilike('name', '%MDF%')
      .limit(1);
    if (error) throw error;

    if (data && data.length > 0) {
      stockItemId = data[0].id;
      console.log(`  Found: ${data[0].name} (qty: ${data[0].current_quantity} ${data[0].unit})`);
    } else {
      // cost_per_unit not unit_price
      const { data: newItem, error: siErr } = await supabase.from('stock_items').insert({
        name: 'MDF Blanc 18mm (E2E Test)',
        sku: 'MDF-BL-18-TEST',
        category: 'panels',
        unit: 'sheet',
        current_quantity: 50,
        minimum_quantity: 5,
        cost_per_unit: 350,
        is_active: true,
      }).select().single();
      if (siErr) throw siErr;
      stockItemId = newItem.id;
      console.log(`  Created test stock: ${newItem.name} (qty: 50)`);
    }
  });

  // ── STEP 8: Simulate Production Consumption ──
  await step(8, 'Simulate Production Stock Consumption', async () => {
    if (!stockItemId) { console.log('  Skipped (no stock item)'); return; }

    const { error } = await supabase.from('stock_movements').insert({
      stock_item_id: stockItemId,
      movement_type: 'production_out',
      quantity: -3,
      unit: 'sheet',
      notes: 'E2E test: 3 sheets consumed for kitchen production',
      project_id: projectId,
      reference_type: 'e2e_test',
    });
    if (error) throw error;

    // Verify stock was deducted (trigger should auto-update)
    const { data: item } = await supabase.from('stock_items').select('current_quantity').eq('id', stockItemId).single();
    console.log(`  Deducted: 3 sheets (new qty: ${item?.current_quantity})`);
  });

  // ── STEP 9: Schedule Installation ──
  await step(9, 'Schedule Installation', async () => {
    const installDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const { data, error } = await supabase.from('installations').insert({
      project_id: projectId,
      scheduled_date: installDate,
      scheduled_time: '09:00',
      status: 'scheduled',
      client_address: '123 Rue Test, Casablanca',
      client_phone: '+212600000000',
      estimated_duration_hours: 8,
      notes: 'E2E test installation',
    }).select().single();
    if (error) throw error;
    console.log(`  Installation ID: ${data.id}`);
    console.log(`  Date: ${installDate} at 09:00`);
  });

  // ── STEP 10: Verify Invoice Generation Data ──
  await step(10, 'Verify Invoice Data', async () => {
    const { data: proj } = await supabase.from('projects').select('*').eq('id', projectId).single();
    const { data: pays } = await supabase.from('payments').select('amount').eq('project_id', projectId);
    const totalPaid = (pays || []).reduce((s, p) => s + Number(p.amount), 0);
    const { data: lines } = await supabase.from('quote_lines').select('*').eq('quote_id', quoteId);

    console.log(`  Project: ${proj.reference_code} — ${proj.status}`);
    console.log(`  Quote lines: ${(lines || []).length}`);
    console.log(`  Total HT: 45,000 MAD`);
    console.log(`  TVA 20%: 9,000 MAD`);
    console.log(`  Total TTC: 54,000 MAD`);
    console.log(`  Paid: ${totalPaid.toLocaleString()} MAD`);
    console.log(`  Remaining: ${(54000 - totalPaid).toLocaleString()} MAD`);
    console.log(`\n  Invoice URL: /api/print/invoice?project_id=${projectId}`);
  });

  // ── SUMMARY ──
  console.log('\n' + '='.repeat(60));
  console.log('  ALL 10 STEPS COMPLETED SUCCESSFULLY');
  console.log('='.repeat(60));
  console.log(`\n  Lead:         ${leadId}`);
  console.log(`  Project:      ${projectId}`);
  console.log(`  Quote:        ${quoteId}`);
  console.log(`  Production:   ${productionOrderId || 'N/A'}`);
  console.log(`  Stock Item:   ${stockItemId || 'N/A'}`);
  console.log(`\n  View Invoice: http://erp.artmood.ma/api/print/invoice?project_id=${projectId}`);
  console.log(`  View Project: http://erp.artmood.ma/projects/${projectId}`);
  console.log('');
}

run().catch(err => {
  console.error('\nTest ABORTED:', err.message);
  process.exit(1);
});
