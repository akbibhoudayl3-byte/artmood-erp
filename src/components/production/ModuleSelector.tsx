'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLocale } from '@/lib/hooks/useLocale';
import type { ModuleLibrary } from '@/types/database';
import { getTemplateName } from '@/lib/utils/template-engine';
import { BookOpen, Search, Grid3X3 } from 'lucide-react';

interface ModuleSelectorProps {
  onSelect: (template: ModuleLibrary) => void;
  onCancel: () => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  kitchen: '🍳',
  dressing: '👔',
  furniture: '🛋️',
  bathroom: '🚿',
  living: '🛋️',
  office: '💼',
  other: '📦',
};

export default function ModuleSelector({ onSelect, onCancel }: ModuleSelectorProps) {
  const supabase = createClient();
  const { t, locale } = useLocale();

  const [templates, setTemplates] = useState<ModuleLibrary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    const { data } = await supabase
      .from('module_library')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    setTemplates((data as ModuleLibrary[]) || []);
    setLoading(false);
  }

  const categories = ['all', ...new Set(templates.map(t => t.category))];

  const filtered = templates.filter(t => {
    if (filterCategory !== 'all' && t.category !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = getTemplateName(t, locale);
      return name.toLowerCase().includes(q) || t.module_type.toLowerCase().includes(q);
    }
    return true;
  });

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={18} className="text-[#C9956B]" />
          <h3 className="font-semibold text-sm">{t('library.select_template')}</h3>
        </div>
        <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">
          {t('common.cancel')}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('common.search')}
          className="w-full pl-8 pr-3 py-2 border border-[#E8E5E0] rounded-xl text-sm"
        />
      </div>

      {/* Category Filters */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filterCategory === cat ? 'bg-[#1a1a2e] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat === 'all' ? t('common.all') : (CATEGORY_ICONS[cat] || '') + ' ' + (t('library.cat_' + cat) || cat)}
          </button>
        ))}
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
        {filtered.map(template => (
          <button
            key={template.id}
            onClick={() => onSelect(template)}
            className="p-3 border border-[#E8E5E0] rounded-xl text-left hover:border-[#C9956B] hover:bg-orange-50 transition-all"
          >
            <div className="flex items-center gap-2 mb-1">
              <Grid3X3 size={14} className="text-[#C9956B]" />
              <span className="text-xs font-semibold text-[#1a1a2e] truncate">
                {getTemplateName(template, locale)}
              </span>
            </div>
            <p className="text-[10px] text-[#64648B]">
              {template.default_width} x {template.default_height} x {template.default_depth} mm
            </p>
            <div className="flex gap-1 mt-1">
              {template.has_doors && <span className="text-[9px] bg-blue-50 text-blue-600 px-1 rounded">{template.default_door_count}D</span>}
              {template.has_drawers && <span className="text-[9px] bg-purple-50 text-purple-600 px-1 rounded">{template.default_drawer_count}T</span>}
              {template.has_shelves && <span className="text-[9px] bg-green-50 text-green-600 px-1 rounded">{template.default_shelf_count}S</span>}
            </div>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-sm text-[#64648B] py-4">{t('common.no_results')}</p>
      )}
    </div>
  );
}
