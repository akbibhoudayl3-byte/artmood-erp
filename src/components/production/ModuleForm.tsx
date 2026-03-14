'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import NumberStepper from '@/components/ui/NumberStepper';
import { CABINET_TYPES, MATERIAL_OPTIONS, EDGE_BAND_OPTIONS } from '@/lib/constants';
import { useLocale } from '@/lib/hooks/useLocale';
import { Package, X, BookOpen } from 'lucide-react';
import ModuleSelector from '@/components/production/ModuleSelector';
import { applyTemplate } from '@/lib/utils/template-engine';
import type { ModuleLibrary } from '@/types/database';

interface ModuleFormData {
  module_name: string;
  module_type: string;
  width: number;
  height: number;
  depth: number;
  material: string;
  edge_band_type: string;
  has_back_panel: boolean;
  has_doors: boolean;
  door_count: number;
  has_drawers: boolean;
  drawer_count: number;
  has_shelves: boolean;
  shelf_count: number;
  notes: string;
}

interface ModuleFormProps {
  onSubmit: (data: ModuleFormData) => void;
  onCancel: () => void;
  initialData?: Partial<ModuleFormData>;
}

export default function ModuleForm({ onSubmit, onCancel, initialData }: ModuleFormProps) {
  const { t, locale } = useLocale();
  const [showLibrary, setShowLibrary] = useState(false);

  const [data, setData] = useState<ModuleFormData>({
    module_name: initialData?.module_name || '',
    module_type: initialData?.module_type || 'base_cabinet',
    width: initialData?.width || 600,
    height: initialData?.height || 720,
    depth: initialData?.depth || 560,
    material: initialData?.material || 'melamine_white',
    edge_band_type: initialData?.edge_band_type || '2mm_pvc',
    has_back_panel: initialData?.has_back_panel ?? true,
    has_doors: initialData?.has_doors ?? false,
    door_count: initialData?.door_count || 1,
    has_drawers: initialData?.has_drawers ?? false,
    drawer_count: initialData?.drawer_count || 0,
    has_shelves: initialData?.has_shelves ?? true,
    shelf_count: initialData?.shelf_count || 1,
    notes: initialData?.notes || '',
  });

  const handleTemplateSelect = (template: ModuleLibrary) => {
    const result = applyTemplate(template, undefined, locale);
    setData({
      module_name: result.module_name,
      module_type: result.module_type,
      width: result.width,
      height: result.height,
      depth: result.depth,
      material: result.material,
      edge_band_type: result.edge_band_type,
      has_back_panel: result.has_back_panel,
      has_doors: result.has_doors,
      door_count: result.door_count,
      has_drawers: result.has_drawers,
      drawer_count: result.drawer_count,
      has_shelves: result.has_shelves,
      shelf_count: result.shelf_count,
      notes: '',
    });
    setShowLibrary(false);
  };

  const update = (field: keyof ModuleFormData, value: any) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!data.module_name.trim()) return;
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package size={18} className="text-[#C9956B]" />
          <h3 className="font-semibold text-sm">{initialData ? t('sheets.edit_module') : t('sheets.add_module')}</h3>
        </div>
        <div className="flex items-center gap-2">
          {!initialData && (
            <button type="button" onClick={() => setShowLibrary(!showLibrary)} className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-50 text-[#C9956B] rounded-lg hover:bg-orange-100">
              <BookOpen size={12} /> {t('library.from_library')}
            </button>
          )}
          <button type="button" onClick={onCancel} className="p-1 hover:bg-gray-100 rounded">
            <X size={16} />
          </button>
        </div>
      </div>

      {showLibrary && (
        <div className="border border-orange-200 rounded-xl p-3 bg-orange-50/50">
          <ModuleSelector onSelect={handleTemplateSelect} onCancel={() => setShowLibrary(false)} />
        </div>
      )}

      {/* Module Name */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">{t('sheets.module_name')}</label>
        <input
          type="text"
          value={data.module_name}
          onChange={e => update('module_name', e.target.value)}
          placeholder="e.g. Base Cabinet 1"
          className="w-full border border-[#E8E5E0] rounded-xl px-3 py-3 text-sm"
          required
        />
      </div>

      {/* Module Type */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">{t('sheets.module_type')}</label>
        <select
          value={data.module_type}
          onChange={e => update('module_type', e.target.value)}
          className="w-full border border-[#E8E5E0] rounded-xl px-3 py-3 text-sm"
        >
          {CABINET_TYPES.map(ct => (
            <option key={ct.key} value={ct.key}>{ct.label}</option>
          ))}
          <option value="vanity">Vanity</option>
          <option value="tv_unit">TV Unit</option>
          <option value="shoe_cabinet">Shoe Cabinet</option>
        </select>
      </div>

      {/* Dimensions */}
      <div className="grid grid-cols-3 gap-3">
        <NumberStepper label={t('sheets.width_mm')} value={data.width} onChange={v => update('width', v)} min={100} max={3000} step={10} unit="mm" />
        <NumberStepper label={t('sheets.height_mm')} value={data.height} onChange={v => update('height', v)} min={100} max={3000} step={10} unit="mm" />
        <NumberStepper label={t('sheets.depth_mm')} value={data.depth} onChange={v => update('depth', v)} min={100} max={1200} step={10} unit="mm" />
      </div>

      {/* Material & Edge Band */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('sheets.material')}</label>
          <select
            value={data.material}
            onChange={e => update('material', e.target.value)}
            className="w-full border border-[#E8E5E0] rounded-xl px-3 py-3 text-sm"
          >
            {MATERIAL_OPTIONS.map(m => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('sheets.edge_band')}</label>
          <select
            value={data.edge_band_type}
            onChange={e => update('edge_band_type', e.target.value)}
            className="w-full border border-[#E8E5E0] rounded-xl px-3 py-3 text-sm"
          >
            {EDGE_BAND_OPTIONS.map(e => (
              <option key={e.key} value={e.key}>{e.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-3">
        <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer">
          <span className="text-sm font-medium">{t('sheets.back_panel')}</span>
          <input type="checkbox" checked={data.has_back_panel} onChange={e => update('has_back_panel', e.target.checked)} className="w-5 h-5 rounded" />
        </label>

        <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer">
          <span className="text-sm font-medium">{t('sheets.has_doors')}</span>
          <input type="checkbox" checked={data.has_doors} onChange={e => update('has_doors', e.target.checked)} className="w-5 h-5 rounded" />
        </label>
        {data.has_doors && (
          <NumberStepper label={t('sheets.door_count')} value={data.door_count} onChange={v => update('door_count', v)} min={1} max={6} />
        )}

        <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer">
          <span className="text-sm font-medium">{t('sheets.has_drawers')}</span>
          <input type="checkbox" checked={data.has_drawers} onChange={e => update('has_drawers', e.target.checked)} className="w-5 h-5 rounded" />
        </label>
        {data.has_drawers && (
          <NumberStepper label={t('sheets.drawer_count')} value={data.drawer_count} onChange={v => update('drawer_count', v)} min={1} max={8} />
        )}

        <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer">
          <span className="text-sm font-medium">{t('sheets.has_shelves')}</span>
          <input type="checkbox" checked={data.has_shelves} onChange={e => update('has_shelves', e.target.checked)} className="w-5 h-5 rounded" />
        </label>
        {data.has_shelves && (
          <NumberStepper label={t('sheets.shelf_count')} value={data.shelf_count} onChange={v => update('shelf_count', v)} min={1} max={10} />
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.notes')}</label>
        <textarea
          value={data.notes}
          onChange={e => update('notes', e.target.value)}
          className="w-full border border-[#E8E5E0] rounded-xl px-3 py-3 text-sm h-20 resize-none"
          placeholder={t('common.notes')}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" className="flex-1">{initialData ? t('common.save') : t('sheets.add_module')}</Button>
      </div>
    </form>
  );
}
