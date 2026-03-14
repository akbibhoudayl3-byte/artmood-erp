'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { STATION_COLORS, STATION_ORDER } from '@/lib/constants';
import type { ProductionSheetPanel } from '@/types/database';
import { ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react';

export default function StationDashboardPage() {
  const { station } = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = createClient();
  const { t } = useLocale();

  const [panels, setPanels] = useState<(ProductionSheetPanel & { module?: { module_name: string }; sheet?: { sheet_number: string } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState<string | null>(null);

  useEffect(() => { loadPanels(); }, [station]);

  async function loadPanels() {
    const { data } = await supabase
      .from('production_sheet_panels')
      .select('*, module:production_sheet_modules(module_name), sheet:production_sheets(sheet_number)')
      .eq('current_station', station)
      .order('created_at');
    setPanels(data as any || []);
    setLoading(false);
  }

  async function advancePanel(panelId: string) {
    setAdvancing(panelId);
    const stationIdx = STATION_ORDER.indexOf(station as any);
    if (stationIdx < 0 || stationIdx >= STATION_ORDER.length - 1) return;

    const nextStation = STATION_ORDER[stationIdx + 1];
    const { data } = await supabase.rpc('advance_panel_station', {
      p_panel_id: panelId,
      p_next_station: nextStation,
      p_scanned_by: profile?.id,
    });

    if (data?.success) {
      loadPanels();
    } else {
      alert(data?.error || 'Error advancing panel');
    }
    setAdvancing(null);
  }

  const stationIdx = STATION_ORDER.indexOf(station as string as any);
  const nextStation = stationIdx < STATION_ORDER.length - 1 ? STATION_ORDER[stationIdx + 1] : null;
  const stationColor = STATION_COLORS[station as string] || '#9CA3AF';

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;

  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager', 'workshop_worker'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/production')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stationColor }} />
            <h1 className="text-xl font-bold text-[#1a1a2e]">{t('sheets.station')}: {(station as string).toUpperCase()}</h1>
          </div>
          <p className="text-sm text-[#64648B]">{panels.length} {t('sheets.panels')} {t('sheets.at_station')}</p>
        </div>
      </div>

      {/* Station Navigation */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {STATION_ORDER.map(s => (
          <button
            key={s}
            onClick={() => router.push(`/production/station/${s}`)}
            className={`px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              s === station ? 'text-white shadow-sm' : 'text-gray-600 bg-gray-100'
            }`}
            style={s === station ? { backgroundColor: STATION_COLORS[s] } : undefined}
          >
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Panel List */}
      {panels.map(panel => (
        <Card key={panel.id}>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#1a1a2e]">{panel.panel_name}</p>
                <p className="text-xs text-[#64648B]">{(panel.sheet as any)?.sheet_number} / {(panel.module as any)?.module_name}</p>
                <p className="text-xs text-[#64648B] mt-0.5">{panel.length} x {panel.width} mm (x{panel.quantity})</p>
              </div>
              {nextStation && (
                <Button
                  size="sm"
                  onClick={() => advancePanel(panel.id)}
                  loading={advancing === panel.id}
                >
                  <ArrowRight size={14} /> {nextStation.toUpperCase()}
                </Button>
              )}
              {!nextStation && (
                <div className="flex items-center gap-1 text-green-500">
                  <CheckCircle size={16} />
                  <span className="text-xs font-medium">{t('sheets.complete')}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      {panels.length === 0 && (
        <div className="text-center py-12">
          <CheckCircle size={48} className="mx-auto text-[#E8E5E0] mb-3" />
          <p className="text-[#64648B]">{t('sheets.no_panels_at_station')}</p>
        </div>
      )}
    </div>
    </RoleGuard>
  );
}
