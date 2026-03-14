'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { getTemplateName } from '@/lib/utils/template-engine';
import type { ModuleLibrary } from '@/types/database';
import { ArrowLeft, Plus, BookOpen, Grid3X3, Trash2, Edit } from 'lucide-react';

export default function LibraryPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const { t, locale } = useLocale();

  const [templates, setTemplates] = useState<ModuleLibrary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);

  // New template form
  const [formData, setFormData] = useState({
    name_en: '', name_fr: '', name_ar: '',
    category: 'kitchen', module_type: 'base_cabinet',
    default_width: 600, default_height: 720, default_depth: 560,
    default_material: 'melamine_white', default_edge_band: '2mm_pvc',
    has_back_panel: true, has_doors: false, default_door_count: 0,
    has_drawers: false, default_drawer_count: 0,
    has_shelves: true, default_shelf_count: 1,
  });

  useEffect(() => { loadTemplates(); }, []);

  async function loadTemplates() {
    const { data } = await supabase
      .from('module_library')
      .select('*')
      .order('category, sort_order');
    setTemplates((data as ModuleLibrary[]) || []);
    setLoading(false);
  }

  async function createTemplate() {
    if (!formData.name_en.trim()) return;
    await supabase.from('module_library').insert({
      ...formData,
      created_by: profile?.id,
      sort_order: templates.length,
    });
    setShowForm(false);
    setFormData({ name_en: '', name_fr: '', name_ar: '', category: 'kitchen', module_type: 'base_cabinet',
      default_width: 600, default_height: 720, default_depth: 560,
      default_material: 'melamine_white', default_edge_band: '2mm_pvc',
      has_back_panel: true, has_doors: false, default_door_count: 0,
      has_drawers: false, default_drawer_count: 0, has_shelves: true, default_shelf_count: 1 });
    loadTemplates();
  }

  async function toggleActive(id: string, isActive: boolean) {
    await supabase.from('module_library').update({ is_active: !isActive }).eq('id', id);
    loadTemplates();
  }

  async function deleteTemplate(id: string) {
    if (!confirm(t('library.confirm_delete'))) return;
    await supabase.from('module_library').delete().eq('id', id);
    loadTemplates();
  }

  const categories = ['all', ...new Set(templates.map(t => t.category))];
  const filtered = filterCategory === 'all' ? templates : templates.filter(t => t.category === filterCategory);
  const canEdit = profile?.role === 'ceo' || profile?.role === 'workshop_manager' || profile?.role === 'designer';

  if (loading) return <div className="animate-pulse"><div className="h-96 bg-gray-200 rounded-xl" /></div>;

  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager', 'designer'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/production')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[#1a1a2e]">{t('library.title')}</h1>
          <p className="text-sm text-[#64648B]">{templates.length} {t('library.templates')}</p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus size={14} /> {t('library.add_template')}
          </Button>
        )}
      </div>

      {/* Category Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filterCategory === cat ? 'bg-[#1a1a2e] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat === 'all' ? t('common.all') : t('library.cat_' + cat)}
          </button>
        ))}
      </div>

      {/* New Template Form */}
      {showForm && (
        <Card className="border-blue-200">
          <CardContent>
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">{t('library.add_template')}</h3>
              <div className="grid grid-cols-1 gap-2">
                <input type="text" value={formData.name_en} onChange={e => setFormData({...formData, name_en: e.target.value})}
                  placeholder="Name (English)" className="w-full border border-[#E8E5E0] rounded-xl px-3 py-2.5 text-sm" />
                <input type="text" value={formData.name_fr} onChange={e => setFormData({...formData, name_fr: e.target.value})}
                  placeholder="Nom (Francais)" className="w-full border border-[#E8E5E0] rounded-xl px-3 py-2.5 text-sm" />
                <input type="text" value={formData.name_ar} onChange={e => setFormData({...formData, name_ar: e.target.value})}
                  placeholder="الاسم (عربي)" className="w-full border border-[#E8E5E0] rounded-xl px-3 py-2.5 text-sm" dir="rtl" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}
                  className="border border-[#E8E5E0] rounded-xl px-3 py-2.5 text-sm">
                  <option value="kitchen">Kitchen</option>
                  <option value="dressing">Dressing</option>
                  <option value="furniture">Furniture</option>
                  <option value="bathroom">Bathroom</option>
                  <option value="office">Office</option>
                  <option value="other">Other</option>
                </select>
                <select value={formData.module_type} onChange={e => setFormData({...formData, module_type: e.target.value})}
                  className="border border-[#E8E5E0] rounded-xl px-3 py-2.5 text-sm">
                  <option value="base_cabinet">Base Cabinet</option>
                  <option value="wall_cabinet">Wall Cabinet</option>
                  <option value="tall_cabinet">Tall Cabinet</option>
                  <option value="drawer_unit">Drawer Unit</option>
                  <option value="wardrobe">Wardrobe</option>
                  <option value="shelf_unit">Shelf Unit</option>
                  <option value="corner_cabinet">Corner Cabinet</option>
                  <option value="vanity">Vanity</option>
                  <option value="tv_unit">TV Unit</option>
                  <option value="shoe_cabinet">Shoe Cabinet</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500">W (mm)</label>
                  <input type="number" value={formData.default_width} onChange={e => setFormData({...formData, default_width: +e.target.value})}
                    className="w-full border border-[#E8E5E0] rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">H (mm)</label>
                  <input type="number" value={formData.default_height} onChange={e => setFormData({...formData, default_height: +e.target.value})}
                    className="w-full border border-[#E8E5E0] rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">D (mm)</label>
                  <input type="number" value={formData.default_depth} onChange={e => setFormData({...formData, default_depth: +e.target.value})}
                    className="w-full border border-[#E8E5E0] rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={formData.has_doors} onChange={e => setFormData({...formData, has_doors: e.target.checked})} className="w-4 h-4" />
                  Doors ({formData.has_doors ? formData.default_door_count : 0})
                  {formData.has_doors && <input type="number" value={formData.default_door_count} onChange={e => setFormData({...formData, default_door_count: +e.target.value})} min={1} max={6} className="w-16 border rounded px-2 py-1 text-sm" />}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={formData.has_drawers} onChange={e => setFormData({...formData, has_drawers: e.target.checked})} className="w-4 h-4" />
                  Drawers ({formData.has_drawers ? formData.default_drawer_count : 0})
                  {formData.has_drawers && <input type="number" value={formData.default_drawer_count} onChange={e => setFormData({...formData, default_drawer_count: +e.target.value})} min={1} max={8} className="w-16 border rounded px-2 py-1 text-sm" />}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={formData.has_shelves} onChange={e => setFormData({...formData, has_shelves: e.target.checked})} className="w-4 h-4" />
                  Shelves ({formData.has_shelves ? formData.default_shelf_count : 0})
                  {formData.has_shelves && <input type="number" value={formData.default_shelf_count} onChange={e => setFormData({...formData, default_shelf_count: +e.target.value})} min={1} max={10} className="w-16 border rounded px-2 py-1 text-sm" />}
                </label>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setShowForm(false)}>{t('common.cancel')}</Button>
                <Button className="flex-1" onClick={createTemplate}>{t('library.add_template')}</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Template List */}
      {filtered.map(tmpl => (
        <Card key={tmpl.id} className={!tmpl.is_active ? 'opacity-50' : ''}>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                  <Grid3X3 size={18} className="text-[#C9956B]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1a1a2e]">{getTemplateName(tmpl, locale)}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StatusBadge status={tmpl.category} />
                    <span className="text-xs text-[#64648B]">{tmpl.default_width}x{tmpl.default_height}x{tmpl.default_depth}</span>
                  </div>
                </div>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleActive(tmpl.id, tmpl.is_active)}
                    className={`px-2 py-1 rounded text-xs ${tmpl.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                    {tmpl.is_active ? t('common.active') : t('common.inactive')}
                  </button>
                  {profile?.role === 'ceo' && (
                    <button onClick={() => deleteTemplate(tmpl.id)} className="p-1.5 hover:bg-red-50 rounded text-red-400">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <BookOpen size={48} className="mx-auto text-[#E8E5E0] mb-3" />
          <p className="text-[#64648B]">{t('common.no_results')}</p>
        </div>
      )}
    </div>
    </RoleGuard>
  );
}
