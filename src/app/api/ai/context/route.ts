// GET /api/ai/context
// Returns factory-wide context for AI processing
// RBAC: CEO only

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/security/guardian';

export async function GET(req: NextRequest) {
  const ctx = await guard(['ceo']);
  if (ctx instanceof NextResponse) return ctx;
  const { supabase } = ctx;

  // Parallel fetch all key metrics
  const [
    projectsRes, paymentsRes, expensesRes, stockRes,
    leadsRes, productionRes, installationsRes
  ] = await Promise.all([
    // Active projects summary
    supabase.from('projects')
      .select('id, status, client_name, total_amount, paid_amount, created_at, updated_at')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(50),

    // Recent payments (last 30 days)
    supabase.from('payments')
      .select('amount, payment_type, received_at, project_id')
      .gte('received_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('received_at', { ascending: false }),

    // Expenses this month
    supabase.from('expenses')
      .select('amount, category, date, payment_method')
      .gte('date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]),

    // Stock items (fetch all active, filter low stock client-side)
    supabase.from('stock_items')
      .select('name, current_quantity, minimum_quantity, cost_per_unit, unit')
      .eq('is_active', true),

    // Recent leads
    supabase.from('leads')
      .select('status, city, source, created_at')
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),

    // Active production orders
    supabase.from('production_orders')
      .select('id, name, status, created_at, project:projects(client_name, status)')
      .in('status', ['pending', 'in_progress'])
      .limit(20),

    // Upcoming installations (next 7 days)
    supabase.from('installations')
      .select('status, scheduled_date, project:projects(client_name)')
      .gte('scheduled_date', new Date().toISOString().split('T')[0])
      .lte('scheduled_date', new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0])
      .neq('status', 'cancelled'),
  ]);

  // Compute aggregates
  const projects = projectsRes.data || [];
  const payments = paymentsRes.data || [];
  const expenses = expensesRes.data || [];
  const allStock = stockRes.data || [];
  const leads = leadsRes.data || [];
  const production = productionRes.data || [];
  const installations = installationsRes.data || [];

  const totalMonthRevenue = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalMonthExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const lowStockItems = allStock.filter(s => Number(s.current_quantity) <= Number(s.minimum_quantity));

  const context = {
    timestamp: new Date().toISOString(),
    factory_state: {
      active_projects: projects.filter(p => !['delivered', 'cancelled'].includes(p.status)).length,
      projects_in_production: projects.filter(p => p.status === 'production').length,
      projects_overdue_payment: projects.filter(p => Number(p.paid_amount) < Number(p.total_amount) * 0.5).length,
      pending_installations: installations.length,
      active_production_orders: production.length,
    },
    financials: {
      revenue_this_month: totalMonthRevenue,
      expenses_this_month: totalMonthExpenses,
      net_profit_this_month: totalMonthRevenue - totalMonthExpenses,
      outstanding_pipeline: projects
        .filter(p => !['delivered', 'cancelled'].includes(p.status))
        .reduce((s, p) => s + (Number(p.total_amount) - Number(p.paid_amount)), 0),
    },
    alerts: {
      low_stock_count: lowStockItems.length,
      low_stock_items: lowStockItems.slice(0, 10).map(s => ({
        name: s.name,
        qty: s.current_quantity,
        min: s.minimum_quantity,
        unit: s.unit,
      })),
      new_leads_this_month: leads.length,
      lead_conversion_pending: leads.filter(l => l.status === 'qualified').length,
    },
    recent_activity: {
      recent_payments: payments.slice(0, 5).map(p => ({
        amount: p.amount,
        type: p.payment_type,
        date: p.received_at,
      })),
      upcoming_installations: installations.slice(0, 5).map(i => ({
        date: i.scheduled_date,
        status: i.status,
        client: (i.project as any)?.client_name,
      })),
      active_orders: production.map(po => ({
        name: po.name,
        status: po.status,
        project: (po.project as any)?.client_name,
      })),
    },
  };

  return NextResponse.json(context);
}
