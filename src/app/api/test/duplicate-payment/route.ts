/**
 * TEMPORARY TEST ENDPOINT — DELETE AFTER TESTING
 * Tests the idempotency duplicate path of record_payment_atomic
 */
import { NextResponse } from 'next/server';
import { guard } from '@/lib/security/guardian';

export async function POST(request: Request) {
  const ctx = await guard(['ceo']);
  if (ctx instanceof NextResponse) return ctx;

  const { idempotency_key, project_id } = await request.json();

  // Call RPC with the provided (duplicate) key
  const { data, error } = await ctx.supabase.rpc('record_payment_atomic', {
    p_project_id: project_id,
    p_amount: 1,
    p_method: 'cash',
    p_type: 'other',
    p_idempotency_key: idempotency_key,
  });

  return NextResponse.json({
    rpc_result: data,
    rpc_error: error?.message || null,
  });
}
