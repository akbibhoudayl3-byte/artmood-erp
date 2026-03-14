'use client';

import { useLocale } from '@/lib/hooks/useLocale';
import { STATION_COLORS } from '@/lib/constants';

interface Panel {
  id?: string;
  panel_name: string;
  length: number;
  width: number;
  quantity: number;
  material: string;
  edge_top: boolean;
  edge_bottom: boolean;
  edge_left: boolean;
  edge_right: boolean;
  current_station?: string;
}

interface PanelTableProps {
  panels: Panel[];
  showStation?: boolean;
}

export default function PanelTable({ panels, showStation = false }: PanelTableProps) {
  const { t } = useLocale();

  if (panels.length === 0) {
    return <p className="text-sm text-[#64648B] text-center py-4">{t('sheets.no_panels')}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-1 font-medium text-[#64648B]">{t('sheets.panel')}</th>
            <th className="text-right py-2 px-1 font-medium text-[#64648B]">L (mm)</th>
            <th className="text-right py-2 px-1 font-medium text-[#64648B]">W (mm)</th>
            <th className="text-right py-2 px-1 font-medium text-[#64648B]">{t('sheets.qty')}</th>
            <th className="text-center py-2 px-1 font-medium text-[#64648B]">{t('sheets.edges')}</th>
            {showStation && <th className="text-center py-2 px-1 font-medium text-[#64648B]">{t('sheets.station')}</th>}
          </tr>
        </thead>
        <tbody>
          {panels.map((panel, idx) => (
            <tr key={panel.id || idx} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-2 px-1 font-medium">{panel.panel_name}</td>
              <td className="py-2 px-1 text-right">{panel.length}</td>
              <td className="py-2 px-1 text-right">{panel.width}</td>
              <td className="py-2 px-1 text-right font-semibold">{panel.quantity}</td>
              <td className="py-2 px-1 text-center">
                {[panel.edge_top && 'T', panel.edge_bottom && 'B', panel.edge_left && 'L', panel.edge_right && 'R']
                  .filter(Boolean).join('') || '-'}
              </td>
              {showStation && (
                <td className="py-2 px-1 text-center">
                  <span
                    className="px-2 py-0.5 rounded-full text-white text-[10px] font-medium"
                    style={{ backgroundColor: STATION_COLORS[panel.current_station || 'pending'] || '#9CA3AF' }}
                  >
                    {(panel.current_station || 'pending').toUpperCase()}
                  </span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
