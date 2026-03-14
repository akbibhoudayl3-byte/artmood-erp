'use client';

import { useLocale } from '@/lib/hooks/useLocale';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import { Layers, Ruler } from 'lucide-react';

interface MaterialUsage {
  material: string;
  materialLabel: string;
  totalAreaM2: number;
  totalPanels: number;
  sheetsNeeded: number;
}

interface EdgeBandUsage {
  type: string;
  totalMeters: number;
  rollsNeeded: number;
}

interface MaterialSummaryProps {
  materials: MaterialUsage[];
  edgeBand?: EdgeBandUsage;
}

export default function MaterialSummary({ materials, edgeBand }: MaterialSummaryProps) {
  const { t } = useLocale();

  return (
    <div className="space-y-3">
      {/* Material breakdown */}
      {materials.map((m, idx) => (
        <div key={idx} className="flex items-center justify-between py-2 px-3 bg-blue-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-blue-500" />
            <div>
              <span className="text-sm font-medium">{m.materialLabel}</span>
              <span className="text-xs text-gray-500 ml-2">{m.totalPanels} {t('sheets.panels')}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold">{m.totalAreaM2} m²</p>
            <p className="text-xs text-gray-500">{m.sheetsNeeded} {t('sheets.sheets')}</p>
          </div>
        </div>
      ))}

      {/* Edge band */}
      {edgeBand && edgeBand.totalMeters > 0 && (
        <div className="flex items-center justify-between py-2 px-3 bg-orange-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Ruler size={14} className="text-orange-500" />
            <span className="text-sm font-medium">{t('sheets.edge_banding')} ({edgeBand.type})</span>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold">{edgeBand.totalMeters} m</p>
            <p className="text-xs text-gray-500">{edgeBand.rollsNeeded} {t('sheets.rolls')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
