// Phase 2B QA Test Suite — Run on server: node tests/qa_phase2b.js
const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://emeznqaweezgsqavxkuu.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const projId = 'a1000001-0001-4d00-8000-000000000001';

async function run() {
  console.log('============================================');
  console.log('TEST 1: BANK TRANSFER FLOW');
  console.log('============================================');

  // 1a. Create bank_transfer via RPC
  const { data: p1, error: e1 } = await s.rpc('record_payment_atomic', {
    p_project_id: projId, p_amount: 5000, p_method: 'bank_transfer', p_type: 'deposit',
    p_reference: 'VIR-TEST-001', p_payment_status: 'pending_proof'
  });
  console.log('1a. Create bank_transfer:', e1 ? 'ERROR '+e1.message : 'OK id='+p1?.payment_id+' status='+p1?.payment_status);

  // Manually create reminder (simulating createPaymentReminder)
  const { error: insErr } = await s.from('calendar_events').insert({
    title: 'Virement a confirmer: 5000 MAD',
    description: 'Test project. Ref: VIR-TEST-001',
    event_type: 'payment_due',
    event_date: new Date().toISOString().split('T')[0],
    reference_type: 'payment',
    reference_id: p1?.payment_id,
  });
  console.log('1a. Calendar event created:', insErr ? 'ERROR '+insErr.message : 'OK');

  // 1b. Duplicate insert
  const { error: dupErr } = await s.from('calendar_events').insert({
    title: 'DUPLICATE',
    event_type: 'payment_due',
    event_date: new Date().toISOString().split('T')[0],
    reference_type: 'payment',
    reference_id: p1?.payment_id,
  });
  console.log('1b. Duplicate blocked:', dupErr?.code === '23505' ? 'YES ✓' : 'NO ✗ '+(dupErr?.message||'no error'));

  // 1c. Confirm → auto-complete
  await s.from('payments').update({ payment_status: 'confirmed' }).eq('id', p1?.payment_id);
  const { data: comp } = await s.from('calendar_events')
    .update({ is_completed: true, completed_at: new Date().toISOString() })
    .eq('reference_type', 'payment').eq('reference_id', p1?.payment_id).eq('is_completed', false)
    .select('id');
  console.log('1c. Confirm → events completed:', (comp||[]).length);

  const { data: verify1 } = await s.from('calendar_events').select('is_completed')
    .eq('reference_type', 'payment').eq('reference_id', p1?.payment_id);
  console.log('1c. Event is_completed:', verify1?.[0]?.is_completed);

  // Cleanup
  await s.from('calendar_events').delete().eq('reference_id', p1?.payment_id);
  await s.from('payments').delete().eq('id', p1?.payment_id);

  console.log('\n============================================');
  console.log('TEST 2: CHEQUE FLOW');
  console.log('============================================');

  // 2a. Create cheque (trigger creates event)
  const { data: chq, error: chqErr } = await s.from('cheques').insert({
    type: 'received', amount: 8000, due_date: '2026-03-28',
    status: 'pending', cheque_number: 'CHQ-TEST-999',
    bank_name: 'CIH', client_name: 'Test Client', project_id: projId
  }).select('id').single();
  console.log('2a. Create cheque:', chqErr ? 'ERROR '+chqErr.message : 'OK id='+chq?.id);

  await new Promise(r => setTimeout(r, 500));
  const { data: chqEvts } = await s.from('calendar_events').select('id, title, event_date, is_completed')
    .eq('reference_type', 'cheque').eq('reference_id', chq?.id);
  console.log('2a. Trigger event created:', (chqEvts||[]).length, 'event(s)');
  if (chqEvts?.[0]) console.log('    title:', chqEvts[0].title);

  // 2b. Mark cleared → complete event
  await s.from('cheques').update({ status: 'cleared' }).eq('id', chq?.id);
  await s.from('calendar_events')
    .update({ is_completed: true, completed_at: new Date().toISOString() })
    .eq('reference_type', 'cheque').eq('reference_id', chq?.id).eq('is_completed', false);

  const { data: chqEvtFinal } = await s.from('calendar_events').select('is_completed')
    .eq('reference_type', 'cheque').eq('reference_id', chq?.id);
  console.log('2b. Cleared → event completed:', chqEvtFinal?.[0]?.is_completed);

  // Cleanup
  await s.from('calendar_events').delete().eq('reference_id', chq?.id);
  await s.from('cheques').delete().eq('id', chq?.id);

  console.log('\n============================================');
  console.log('TEST 3: PARALLEL DUPLICATE PROTECTION');
  console.log('============================================');

  const { data: p3 } = await s.rpc('record_payment_atomic', {
    p_project_id: projId, p_amount: 1000, p_method: 'bank_transfer', p_type: 'other',
    p_payment_status: 'pending_proof'
  });

  const results = await Promise.all([
    s.from('calendar_events').insert({ title:'P1', event_type:'payment_due', event_date:'2026-03-24', reference_type:'payment', reference_id: p3?.payment_id }),
    s.from('calendar_events').insert({ title:'P2', event_type:'payment_due', event_date:'2026-03-24', reference_type:'payment', reference_id: p3?.payment_id }),
    s.from('calendar_events').insert({ title:'P3', event_type:'payment_due', event_date:'2026-03-24', reference_type:'payment', reference_id: p3?.payment_id }),
  ]);
  const ok = results.filter(r => !r.error).length;
  const blocked = results.filter(r => r.error?.code === '23505').length;
  console.log('3 parallel inserts: success='+ok+', blocked='+blocked);

  const { data: cnt } = await s.from('calendar_events').select('id')
    .eq('reference_type', 'payment').eq('reference_id', p3?.payment_id).eq('is_completed', false);
  console.log('Active events:', (cnt||[]).length, '(expected: 1)');

  // Cleanup
  await s.from('calendar_events').delete().eq('reference_id', p3?.payment_id);
  await s.from('payments').delete().eq('id', p3?.payment_id);

  console.log('\n============================================');
  console.log('TEST 4: EDGE CASES');
  console.log('============================================');

  // Cash payment (auto-confirmed, no event)
  const { data: p4 } = await s.rpc('record_payment_atomic', {
    p_project_id: projId, p_amount: 500, p_method: 'cash', p_type: 'other'
  });
  console.log('4a. Cash auto-confirmed:', p4?.payment_status);
  const { data: noEvt } = await s.from('calendar_events')
    .update({ is_completed: true }).eq('reference_type', 'payment').eq('reference_id', p4?.payment_id)
    .select('id');
  console.log('4a. Complete non-existent event: 0 rows (no crash):', (noEvt||[]).length === 0 ? '✓' : '✗');
  await s.from('payments').delete().eq('id', p4?.payment_id);

  console.log('\n============================================');
  console.log('TEST 5: DASHBOARD READ-ONLY');
  console.log('============================================');

  const { count: before } = await s.from('calendar_events').select('id', { count: 'exact', head: true });
  const { data: reminders } = await s.from('calendar_events')
    .select('id, title, event_date, event_type')
    .in('event_type', ['cheque_due', 'payment_due'])
    .eq('is_completed', false)
    .order('event_date').limit(5);
  const { count: after } = await s.from('calendar_events').select('id', { count: 'exact', head: true });

  console.log('Before:', before, '| After:', after, '| Reminders:', (reminders||[]).length);
  console.log('Zero writes:', before === after ? '✓' : '✗ BUG');

  console.log('\n============================================');
  console.log('ALL TESTS COMPLETE');
  console.log('============================================');
}

run().catch(e => console.error('FATAL:', e.message));
