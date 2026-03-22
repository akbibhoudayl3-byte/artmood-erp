'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { RoleGuard } from '@/components/auth/RoleGuard';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { ArrowLeft, CheckCircle, AlertCircle, Settings, DollarSign, Wrench, Truck, ShieldCheck } from 'lucide-react';
import { getCostSettings, updateCostSettings } from '@/lib/services/cost-engine.service';
import type { CostSettings } from '@/types/finance';

export default function CostEnginePage() {
  const router = useRouter();
  const { profile } = useAuth();

  const [settings, setSettings] = useState<CostSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Form state
  const [laborRate, setLaborRate] = useState('');
  const [hoursPerPanel, setHoursPerPanel] = useState('');
  const [machineRate, setMachineRate] = useState('');
  const [machineHoursPerPanel, setMachineHoursPerPanel] = useState('');
  const [transportCost, setTransportCost] = useState('');
  const [minMargin, setMinMargin] = useState('');
  const [recommendedMargin, setRecommendedMargin] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const result = await getCostSettings();
    if (result.success && result.data) {
      const s = result.data;
      setSettings(s);
      setLaborRate(String(s.labor_rate_per_hour));
      setHoursPerPanel(String(s.avg_hours_per_panel));
      setMachineRate(String(s.machine_rate_per_hour));
      setMachineHoursPerPanel(String(s.avg_machine_hours_per_panel));
      setTransportCost(String(s.default_transport_cost));
      setMinMargin(String(s.min_margin_percent));
      setRecommendedMargin(String(s.recommended_margin_percent));
    } else {
      setError(result.error || 'Failed to load settings');
    }
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');

    const result = await updateCostSettings({
      labor_rate_per_hour: parseFloat(laborRate) || 50,
      avg_hours_per_panel: parseFloat(hoursPerPanel) || 0.5,
      machine_rate_per_hour: parseFloat(machineRate) || 30,
      avg_machine_hours_per_panel: parseFloat(machineHoursPerPanel) || 0.25,
      default_transport_cost: parseFloat(transportCost) || 500,
      min_margin_percent: parseFloat(minMargin) || 15,
      recommended_margin_percent: parseFloat(recommendedMargin) || 30,
    }, profile?.id || '');

    if (result.success) {
      setSuccess('Settings saved successfully.');
      setTimeout(() => setSuccess(''), 4000);
    } else {
      setError(result.error || 'Failed to save settings');
    }
    setSaving(false);
  }

  // Example calculation
  const examplePanels = 40;
  const exLaborCost = examplePanels * (parseFloat(hoursPerPanel) || 0) * (parseFloat(laborRate) || 0);
  const exMachineCost = examplePanels * (parseFloat(machineHoursPerPanel) || 0) * (parseFloat(machineRate) || 0);
  const exTransport = parseFloat(transportCost) || 0;

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;

  return (
    <RoleGuard allowedRoles={['ceo', 'commercial_manager'] as any[]}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">Cost Engine Settings</h1>
            <p className="text-sm text-gray-500">Configure labor, machine, transport rates and margin rules</p>
          </div>
          <Settings size={20} className="text-gray-400" />
        </div>

        {success && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
            <CheckCircle size={16} className="shrink-0" /> {success}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="shrink-0" /> {error}
          </div>
        )}

        {/* Labor Section */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-sm flex items-center gap-1.5"><DollarSign size={14} /> Labor Costs</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Rate per Hour (MAD)</label>
                <input
                  type="number" min="0" step="1"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  value={laborRate} onChange={e => setLaborRate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Avg Hours per Panel</label>
                <input
                  type="number" min="0" step="0.1"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  value={hoursPerPanel} onChange={e => setHoursPerPanel(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Machine Section */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-sm flex items-center gap-1.5"><Wrench size={14} /> Machine Costs</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Rate per Hour (MAD)</label>
                <input
                  type="number" min="0" step="1"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  value={machineRate} onChange={e => setMachineRate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Avg Machine Hours per Panel</label>
                <input
                  type="number" min="0" step="0.05"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  value={machineHoursPerPanel} onChange={e => setMachineHoursPerPanel(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transport Section */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-sm flex items-center gap-1.5"><Truck size={14} /> Transport</h2>
          </CardHeader>
          <CardContent>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Default Transport Cost (MAD)</label>
              <input
                type="number" min="0" step="50"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                value={transportCost} onChange={e => setTransportCost(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Flat cost applied per project</p>
            </div>
          </CardContent>
        </Card>

        {/* Margin Rules */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-sm flex items-center gap-1.5"><ShieldCheck size={14} /> Margin Rules (Price Protection)</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Minimum Margin %</label>
                <input
                  type="number" min="0" max="100" step="1"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  value={minMargin} onChange={e => setMinMargin(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">Quotes below this margin are blocked (unless manager override)</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Recommended Margin %</label>
                <input
                  type="number" min="0" max="100" step="1"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  value={recommendedMargin} onChange={e => setRecommendedMargin(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">Used for auto-generated quotes from BOM</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Example Calculation */}
        <Card>
          <CardHeader><h2 className="font-semibold text-sm">Example: 40-panel project</h2></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Labor</p>
                <p className="font-bold">{exLaborCost.toLocaleString()} MAD</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Machine</p>
                <p className="font-bold">{exMachineCost.toLocaleString()} MAD</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Transport</p>
                <p className="font-bold">{exTransport.toLocaleString()} MAD</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Total overhead: {(exLaborCost + exMachineCost + exTransport).toLocaleString()} MAD (add material costs from BOM)
            </p>
          </CardContent>
        </Card>

        <Button variant="primary" className="w-full" loading={saving} onClick={handleSave}>
          Save Settings
        </Button>

        {settings?.updated_at && (
          <p className="text-xs text-gray-400 text-center">
            Last updated: {new Date(settings.updated_at).toLocaleString('fr-FR')}
          </p>
        )}
      </div>
    </RoleGuard>
  );
}
