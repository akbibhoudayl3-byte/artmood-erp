import { createClient } from '@/lib/supabase/client';

interface LedgerParams {
  date: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  description?: string | null;
  project_id?: string | null;
  source_module: string;
  source_id?: string | null;
  payment_method?: string | null;
  created_by?: string | null;
}

/**
 * Creates a ledger entry for financial tracking.
 * Called after recording a payment or expense.
 */
export async function createLedgerEntry(params: LedgerParams) {
  const supabase = createClient();

  const { error } = await supabase.from('ledger').insert({
    date: params.date,
    type: params.type,
    category: params.category,
    amount: params.amount,
    description: params.description || null,
    project_id: params.project_id || null,
    source_module: params.source_module,
    source_id: params.source_id || null,
    payment_method: params.payment_method || null,
    created_by: params.created_by || null,
  });

  if (error) {
    console.error('Ledger entry creation failed:', error.message);
  }

  return { error };
}
