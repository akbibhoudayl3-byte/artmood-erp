'use client';

import type { BusinessHealth, HealthStatus } from '@/types/database';
import { calculateHealthStatus } from '@/types/database';

const STATUS_CONFIG: Record<HealthStatus, { label: string; color: string; bg: string; dot: string; description: string }> = {
  green: { label: 'Normal', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500', description: 'Operations running smoothly' },
  yellow: { label: 'Attention', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500', description: 'Some items need attention' },
  red: { label: 'Critical', color: 'text-red-700', bg: 'bg-red-50 border-red-200', dot: 'bg-red-500', description: 'Immediate action required' },
};

interface HealthMeterProps {
  health: BusinessHealth;
}

export default function HealthMeter({ health }: HealthMeterProps) {
  const status = calculateHealthStatus(health);
  const config = STATUS_CONFIG[status];

  const indicators = [
    { label: 'Cash Flow (30d)', value: `${health.cashflow_30d?.toLocaleString() || 0} MAD`, bad: (health.cashflow_30d || 0) < 0 },
    { label: 'Overdue Deposits', value: health.overdue_deposits || 0, bad: (health.overdue_deposits || 0) > 0 },
    { label: 'Low Stock Items', value: health.critical_stock_items || 0, bad: (health.critical_stock_items || 0) > 2 },
    { label: 'Delayed Production', value: health.delayed_production || 0, bad: (health.delayed_production || 0) > 0 },
    { label: 'Cheques Due (7d)', value: health.cheques_due_7d || 0, bad: (health.cheques_due_7d || 0) > 3 },
  ];

  return (
    <div className={`rounded-2xl border-2 p-5 ${config.bg}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative">
          <div className={`w-4 h-4 rounded-full ${config.dot}`} />
          <div className={`absolute inset-0 w-4 h-4 rounded-full ${config.dot} animate-ping opacity-30`} />
        </div>
        <div>
          <h3 className={`font-semibold ${config.color}`}>Business Health: {config.label}</h3>
          <p className={`text-xs ${config.color} opacity-75`}>{config.description}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {indicators.map((ind) => (
          <div key={ind.label} className={`text-center p-3 rounded-xl ${ind.bad ? 'bg-white shadow-sm' : 'bg-white/60'}`}>
            <p className={`text-lg font-bold ${ind.bad ? 'text-red-600' : 'text-[#1a1a2e]'}`}>{ind.value}</p>
            <p className="text-[11px] text-[#64648B] font-medium mt-0.5">{ind.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
