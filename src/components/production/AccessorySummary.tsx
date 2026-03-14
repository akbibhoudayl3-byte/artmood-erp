'use client';

import { useLocale } from '@/lib/hooks/useLocale';
import { CheckCircle, XCircle } from 'lucide-react';

interface AccessoryItem {
  accessory_name: string;
  quantity: number;
  unit: string;
  is_available?: boolean;
}

interface AccessorySummaryProps {
  accessories: AccessoryItem[];
  showAvailability?: boolean;
}

export default function AccessorySummary({ accessories, showAvailability = false }: AccessorySummaryProps) {
  const { t } = useLocale();

  if (accessories.length === 0) {
    return <p className="text-sm text-[#64648B] text-center py-4">{t('sheets.no_accessories')}</p>;
  }

  return (
    <div className="space-y-1">
      {accessories.map((acc, idx) => (
        <div key={idx} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            {showAvailability && (
              acc.is_available
                ? <CheckCircle size={14} className="text-green-500" />
                : <XCircle size={14} className="text-red-500" />
            )}
            <span className="text-sm">{acc.accessory_name}</span>
          </div>
          <span className="text-sm font-semibold">
            {acc.quantity} {acc.unit}
          </span>
        </div>
      ))}
    </div>
  );
}
