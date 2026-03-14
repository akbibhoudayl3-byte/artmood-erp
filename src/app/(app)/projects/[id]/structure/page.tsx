'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardHeader, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import StatusBadge from '@/components/ui/StatusBadge';
import { RoleGuard } from '@/components/auth/RoleGuard';
import {
  ArrowLeft, Layers, Package, Ruler, Wrench,
  ChevronDown, ChevronUp, CheckCircle, Square,
  Box, LayoutGrid, Grid3X3, AlertTriangle, Plus,
  X, Zap, Factory, RefreshCw, Pencil, Trash2,
  TrendingUp, ShoppingCart
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PanelRow {
  id: string;
  panel_name: string;
  length: number;
  width: number;
  quantity: number;
  material: string;
  edge_top: boolean;
  edge_bottom: boolean;
  edge_left: boolean;
  edge_right: boolean;
  grain_direction: string | null;
  notes: string | null;
  sort_order: number;
}

interface AccessoryRow {
  id: string;
  accessory_name: string;
  quantity: number;
  unit_price: number | null;
}

interface CabinetSpec {
  id: string;
  cabinet_name: string;
  cabinet_type: string;
  width: number;
  height: number;
  depth: number;
  material: string;
  edge_band_type: string | null;
  notes: string | null;
  sort_order: number;
  panels: PanelRow[];
  accessories: AccessoryRow[];
}

interface StockItem {
  id: string;
  name: string;
  unit: string;
  current_quantity: number;
  reserved_quantity: number;
  cost_per_unit: number | null;
  category: string;
  thickness_mm: number | null;
}

interface BomLine {
  material: string;
  area_m2: number;
  sheets_needed: number;
  pieces: number;
  stockItem?: StockItem;
  estimated_cost: number;
}

interface EdgeBomLine {
  edge_type: string;
  meters: number;
  meters_with_margin: number;
  stockItem?: StockItem;
  estimated_cost: number;
}

type TabKey = 'modules' | 'pieces' | 'materials' | 'hardware' | 'bom';

// ── Kitchen module presets ──────────────────────────────────────────────────────

interface ModulePreset {
  id: string;
  label: string;
  cabinet_type: string;
  width: number;
  height: number;
  depth: number;
  category: 'kitchen' | 'wardrobe' | 'furniture';
  panels: Array<{
    panel_name: string;
    lengthExpr: (w: number, h: number, d: number) => number;
    widthExpr: (w: number, h: number, d: number) => number;
    quantity: number;
    material: 'board' | 'back';
    edge_top: boolean;
    edge_bottom: boolean;
    edge_left: boolean;
    edge_right: boolean;
  }>;
  accessories: Array<{ accessory_name: string; quantity: number }>;
}

const KITCHEN_PRESETS: ModulePreset[] = [
  {
    id: 'kitchen_base',
    label: 'Meuble Bas Standard',
    cabinet_type: 'base_cabinet',
    width: 600, height: 720, depth: 560,
    category: 'kitchen',
    panels: [
      { panel_name: 'Joue Gauche',   lengthExpr: (_,h,d)=>h,    widthExpr: (_,_h,d)=>d,     quantity:1, material:'board', edge_top:false,edge_bottom:true,edge_left:true,edge_right:false },
      { panel_name: 'Joue Droite',   lengthExpr: (_,h,d)=>h,    widthExpr: (_,_h,d)=>d,     quantity:1, material:'board', edge_top:false,edge_bottom:true,edge_left:false,edge_right:true },
      { panel_name: 'Tablette Haute',lengthExpr: (w,_,d)=>w-36, widthExpr: (_,_h,d)=>d,     quantity:1, material:'board', edge_top:true, edge_bottom:false,edge_left:false,edge_right:false },
      { panel_name: 'Tablette Basse',lengthExpr: (w,_,d)=>w-36, widthExpr: (_,_h,d)=>d,     quantity:1, material:'board', edge_top:false,edge_bottom:false,edge_left:false,edge_right:false },
      { panel_name: 'Fond',          lengthExpr: (w,h,_)=>w-36, widthExpr: (_,h,_h)=>h-36,  quantity:1, material:'back',  edge_top:false,edge_bottom:false,edge_left:false,edge_right:false },
    ],
    accessories: [
      { accessory_name: 'Charnière Blum 35mm', quantity: 4 },
      { accessory_name: 'Pied réglable', quantity: 4 },
    ],
  },
  {
    id: 'kitchen_wall',
    label: 'Meuble Haut Standard',
    cabinet_type: 'wall_cabinet',
    width: 600, height: 720, depth: 320,
    category: 'kitchen',
    panels: [
      { panel_name: 'Joue Gauche',   lengthExpr: (_,h,d)=>h,    widthExpr: (_,_h,d)=>d,     quantity:1, material:'board', edge_top:false,edge_bottom:false,edge_left:true,edge_right:false },
      { panel_name: 'Joue Droite',   lengthExpr: (_,h,d)=>h,    widthExpr: (_,_h,d)=>d,     quantity:1, material:'board', edge_top:false,edge_bottom:false,edge_left:false,edge_right:true },
      { panel_name: 'Tablette Haute',lengthExpr: (w,_,d)=>w-36, widthExpr: (_,_h,d)=>d,     quantity:1, material:'board', edge_top:true, edge_bottom:false,edge_left:false,edge_right:false },
      { panel_name: 'Tablette Basse',lengthExpr: (w,_,d)=>w-36, widthExpr: (_,_h,d)=>d,     quantity:1, material:'board', edge_top:false,edge_bottom:true,edge_left:false,edge_right:false },
      { panel_name: 'Tablette',      lengthExpr: (w,_,d)=>w-36, widthExpr: (_,_h,d)=>d-20,  quantity:1, material:'board', edge_top:false,edge_bottom:false,edge_left:false,edge_right:false },
      { panel_name: 'Fond',          lengthExpr: (w,h,_)=>w-36, widthExpr: (_,h,_h)=>h-36,  quantity:1, material:'back',  edge_top:false,edge_bottom:false,edge_left:false,edge_right:false },
    ],
    accessories: [
      { accessory_name: 'Charnière Blum 35mm', quantity: 4 },
    ],
  },
  {
    id: 'kitchen_tall',
    label: 'Colonne Four / Frigo',
    cabinet_type: 'tall_cabinet',
    width: 600, height: 2150, depth: 560,
    category: 'kitchen',
    panels: [
      { panel_name: 'Joue Gauche',    lengthExpr: (_,h,d)=>h,    widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:false,edge_bottom:true,edge_left:true,edge_right:false },
      { panel_name: 'Joue Droite',    lengthExpr: (_,h,d)=>h,    widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:false,edge_bottom:true,edge_left:false,edge_right:true },
      { panel_name: 'Tablette Haute', lengthExpr: (w,_,d)=>w-36, widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:true, edge_bottom:false,edge_left:false,edge_right:false },
      { panel_name: 'Tablette Basse', lengthExpr: (w,_,d)=>w-36, widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:false,edge_bottom:false,edge_left:false,edge_right:false },
      { panel_name: 'Séparation',     lengthExpr: (w,_,d)=>w-36, widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:false,edge_bottom:false,edge_left:false,edge_right:false },
      { panel_name: 'Fond',           lengthExpr: (w,h,_)=>w-36, widthExpr: (_,h,_h)=>h-36, quantity:1, material:'back',  edge_top:false,edge_bottom:false,edge_left:false,edge_right:false },
    ],
    accessories: [
      { accessory_name: 'Charnière Blum 35mm', quantity: 6 },
      { accessory_name: 'Pied réglable', quantity: 4 },
    ],
  },
  {
    id: 'kitchen_drawer',
    label: 'Bloc Tiroirs (3T)',
    cabinet_type: 'drawer_unit',
    width: 600, height: 720, depth: 560,
    category: 'kitchen',
    panels: [
      { panel_name: 'Joue Gauche',     lengthExpr: (_,h,d)=>h,    widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:false,edge_bottom:true,edge_left:true,edge_right:false },
      { panel_name: 'Joue Droite',     lengthExpr: (_,h,d)=>h,    widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:false,edge_bottom:true,edge_left:false,edge_right:true },
      { panel_name: 'Tablette Haute',  lengthExpr: (w,_,d)=>w-36, widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:true, edge_bottom:false,edge_left:false,edge_right:false },
      { panel_name: 'Tablette Basse',  lengthExpr: (w,_,d)=>w-36, widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:false,edge_bottom:false,edge_left:false,edge_right:false },
      { panel_name: 'Façade Tiroir',   lengthExpr: (w,_,d)=>w-4,  widthExpr: (_,h,_d)=>Math.round(h/3)-4, quantity:3, material:'board', edge_top:true,edge_bottom:true,edge_left:true,edge_right:true },
      { panel_name: 'Fond Tiroir',     lengthExpr: (w,_,d)=>w-36, widthExpr: (_,_h,d)=>d-100, quantity:3, material:'back',  edge_top:false,edge_bottom:false,edge_left:false,edge_right:false },
      { panel_name: 'Fond Caisson',    lengthExpr: (w,h,_)=>w-36, widthExpr: (_,h,_h)=>h-36, quantity:1, material:'back',  edge_top:false,edge_bottom:false,edge_left:false,edge_right:false },
    ],
    accessories: [
      { accessory_name: 'Coulisse Tandem 450mm', quantity: 6 },
      { accessory_name: 'Pied réglable', quantity: 4 },
    ],
  },
  {
    id: 'kitchen_corner',
    label: 'Meuble Angle',
    cabinet_type: 'corner_cabinet',
    width: 900, height: 720, depth: 900,
    category: 'kitchen',
    panels: [
      { panel_name: 'Joue Gauche',   lengthExpr: (_,h,d)=>h,    widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:false,edge_bottom:true,edge_left:true,edge_right:false },
      { panel_name: 'Joue Droite',   lengthExpr: (_,h,d)=>h,    widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:false,edge_bottom:true,edge_left:false,edge_right:true },
      { panel_name: 'Tablette',      lengthExpr: (w,_,d)=>w-36, widthExpr: (_,_h,d)=>d,    quantity:2, material:'board', edge_top:true, edge_bottom:false,edge_left:false,edge_right:false },
    ],
    accessories: [
      { accessory_name: 'Étagère tournante Le Mans', quantity: 1 },
      { accessory_name: 'Pied réglable', quantity: 4 },
    ],
  },
];

const WARDROBE_PRESETS: ModulePreset[] = [
  {
    id: 'wardrobe_single',
    label: 'Penderie Simple',
    cabinet_type: 'wardrobe',
    width: 600, height: 2400, depth: 600,
    category: 'wardrobe',
    panels: [
      { panel_name: 'Joue Gauche',     lengthExpr: (_,h,d)=>h,    widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:false,edge_bottom:false,edge_left:true,edge_right:false },
      { panel_name: 'Joue Droite',     lengthExpr: (_,h,d)=>h,    widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:false,edge_bottom:false,edge_left:false,edge_right:true },
      { panel_name: 'Tablette Haute',  lengthExpr: (w,_,d)=>w-36, widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:true, edge_bottom:false,edge_left:false,edge_right:false },
      { panel_name: 'Tablette Basse',  lengthExpr: (w,_,d)=>w-36, widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:false,edge_bottom:false,edge_left:false,edge_right:false },
      { panel_name: 'Fond',            lengthExpr: (w,h,_)=>w-36, widthExpr: (_,h,_h)=>h-36, quantity:1, material:'back',  edge_top:false,edge_bottom:false,edge_left:false,edge_right:false },
    ],
    accessories: [
      { accessory_name: 'Tringle penderie', quantity: 1 },
      { accessory_name: 'Support tringle', quantity: 2 },
    ],
  },
  {
    id: 'wardrobe_double',
    label: 'Penderie Double',
    cabinet_type: 'wardrobe',
    width: 1200, height: 2400, depth: 600,
    category: 'wardrobe',
    panels: [
      { panel_name: 'Joue Gauche',     lengthExpr: (_,h,d)=>h,    widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:false,edge_bottom:false,edge_left:true,edge_right:false },
      { panel_name: 'Joue Droite',     lengthExpr: (_,h,d)=>h,    widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:false,edge_bottom:false,edge_left:false,edge_right:true },
      { panel_name: 'Séparation',      lengthExpr: (_,h,d)=>h,    widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:false,edge_bottom:false,edge_left:false,edge_right:false },
      { panel_name: 'Tablette Haute',  lengthExpr: (w,_,d)=>w-36, widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:true, edge_bottom:false,edge_left:false,edge_right:false },
      { panel_name: 'Tablettes',       lengthExpr: (w,_,d)=>Math.round(w/2)-36, widthExpr: (_,_h,d)=>d, quantity:4, material:'board', edge_top:false,edge_bottom:false,edge_left:false,edge_right:false },
      { panel_name: 'Fond',            lengthExpr: (w,h,_)=>w-36, widthExpr: (_,h,_h)=>h-36, quantity:1, material:'back',  edge_top:false,edge_bottom:false,edge_left:false,edge_right:false },
    ],
    accessories: [
      { accessory_name: 'Tringle penderie', quantity: 2 },
      { accessory_name: 'Support tringle', quantity: 4 },
    ],
  },
  {
    id: 'wardrobe_drawers',
    label: 'Module Tiroirs (4T)',
    cabinet_type: 'drawer_unit',
    width: 600, height: 1200, depth: 580,
    category: 'wardrobe',
    panels: [
      { panel_name: 'Joue Gauche',    lengthExpr: (_,h,d)=>h,    widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:false,edge_bottom:false,edge_left:true,edge_right:false },
      { panel_name: 'Joue Droite',    lengthExpr: (_,h,d)=>h,    widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:false,edge_bottom:false,edge_left:false,edge_right:true },
      { panel_name: 'Tablette Haute', lengthExpr: (w,_,d)=>w-36, widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:true, edge_bottom:false,edge_left:false,edge_right:false },
      { panel_name: 'Tablette Basse', lengthExpr: (w,_,d)=>w-36, widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:false,edge_bottom:false,edge_left:false,edge_right:false },
      { panel_name: 'Façade Tiroir',  lengthExpr: (w,_,d)=>w-4,  widthExpr: (_,h,_d)=>Math.round(h/4)-4, quantity:4, material:'board', edge_top:true,edge_bottom:true,edge_left:true,edge_right:true },
      { panel_name: 'Fond Tiroir',    lengthExpr: (w,_,d)=>w-36, widthExpr: (_,_h,d)=>d-100, quantity:4, material:'back', edge_top:false,edge_bottom:false,edge_left:false,edge_right:false },
    ],
    accessories: [
      { accessory_name: 'Coulisse Tandem 500mm', quantity: 8 },
    ],
  },
  {
    id: 'wardrobe_shelf',
    label: 'Module Étagères',
    cabinet_type: 'shelf_unit',
    width: 600, height: 2400, depth: 400,
    category: 'wardrobe',
    panels: [
      { panel_name: 'Joue Gauche',     lengthExpr: (_,h,d)=>h,    widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:false,edge_bottom:false,edge_left:true,edge_right:false },
      { panel_name: 'Joue Droite',     lengthExpr: (_,h,d)=>h,    widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:false,edge_bottom:false,edge_left:false,edge_right:true },
      { panel_name: 'Tablette Haute',  lengthExpr: (w,_,d)=>w-36, widthExpr: (_,_h,d)=>d,    quantity:1, material:'board', edge_top:true, edge_bottom:false,edge_left:false,edge_right:false },
      { panel_name: 'Étagères',        lengthExpr: (w,_,d)=>w-36, widthExpr: (_,_h,d)=>d-5,  quantity:5, material:'board', edge_top:false,edge_bottom:false,edge_left:false,edge_right:false },
      { panel_name: 'Fond',            lengthExpr: (w,h,_)=>w-36, widthExpr: (_,h,_h)=>h-36, quantity:1, material:'back',  edge_top:false,edge_bottom:false,edge_left:false,edge_right:false },
    ],
    accessories: [],
  },
];

const CABINET_TYPE_LABELS: Record<string, string> = {
  base_cabinet:   'Meuble Bas',
  wall_cabinet:   'Meuble Haut',
  tall_cabinet:   'Colonne',
  drawer_unit:    'Bloc Tiroirs',
  corner_cabinet: 'Meuble Angle',
  wardrobe:       'Penderie',
  shelf_unit:     'Étagères',
  tv_unit:        'Meuble TV',
  other:          'Autre',
};

const CABINET_TYPE_COLORS: Record<string, string> = {
  base_cabinet:   'bg-blue-100 text-blue-700',
  wall_cabinet:   'bg-purple-100 text-purple-700',
  tall_cabinet:   'bg-indigo-100 text-indigo-700',
  drawer_unit:    'bg-orange-100 text-orange-700',
  corner_cabinet: 'bg-yellow-100 text-yellow-700',
  wardrobe:       'bg-green-100 text-green-700',
  shelf_unit:     'bg-teal-100 text-teal-700',
  tv_unit:        'bg-pink-100 text-pink-700',
  other:          'bg-gray-100 text-gray-700',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function edgeLabel(p: PanelRow): string {
  const sides = [p.edge_top&&'H',p.edge_bottom&&'B',p.edge_left&&'G',p.edge_right&&'D'].filter(Boolean);
  return sides.length === 0 ? '—' : sides.join('+');
}

function edgeMeters(panels: PanelRow[]): number {
  let total = 0;
  for (const p of panels) {
    const l = p.length / 1000;
    const w = p.width / 1000;
    if (p.edge_top)    total += l * p.quantity;
    if (p.edge_bottom) total += l * p.quantity;
    if (p.edge_left)   total += w * p.quantity;
    if (p.edge_right)  total += w * p.quantity;
  }
  return total;
}

function materialShort(mat: string): string {
  if (mat.includes('HDF')) return 'HDF 5mm';
  if (mat.includes('Hydro')) return 'MDF Hydro 18';
  if (mat.includes('Stratifié')) return 'Stratifié 16 Chêne';
  if (mat.includes('16mm')) return 'MDF 16mm';
  if (mat.includes('18mm') || mat.includes('Vortex')) return 'MDF 18mm';
  return mat.length > 20 ? mat.substring(0,20)+'…' : mat;
}

// Standard sheet size: 2880×2070mm = 5.9616 m² gross, ~2.88 m² after waste factor
const SHEET_GROSS_M2 = (2880 * 2070) / 1e6;  // 5.9616 m²
const SHEET_YIELD_M2 = 2.88;                   // usable after waste/nesting

// ── Component ──────────────────────────────────────────────────────────────────

export default function ProjectStructurePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = createClient();

  const canWrite = ['ceo', 'workshop_manager', 'designer'].includes(profile?.role || '');

  const [tab, setTab]               = useState<TabKey>('modules');
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [cabinets, setCabinets]     = useState<CabinetSpec[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [projectName, setProjectName] = useState('');
  const [projectType, setProjectType] = useState('');
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());

  // Add Module modal
  const [showAddModule, setShowAddModule]     = useState(false);
  const [addMode, setAddMode]                 = useState<'preset' | 'manual'>('preset');
  const [selectedCategory, setSelectedCategory] = useState<'kitchen' | 'wardrobe' | 'furniture'>('kitchen');
  const [selectedPreset, setSelectedPreset]   = useState<ModulePreset | null>(null);
  const [presetW, setPresetW]                 = useState('');
  const [presetH, setPresetH]                 = useState('');
  const [presetD, setPresetD]                 = useState('');
  const [presetMaterial, setPresetMaterial]   = useState('MDF 18mm Vortex Blanc');
  const [presetBackMat, setPresetBackMat]     = useState('HDF 5mm');
  const [presetEdgeBand, setPresetEdgeBand]   = useState('Chant ABS Blanc 1mm');
  const [presetName, setPresetName]           = useState('');
  // Manual module fields
  const [manCabinetName, setManCabinetName]   = useState('');
  const [manCabinetType, setManCabinetType]   = useState('base_cabinet');
  const [manW, setManW]                       = useState('600');
  const [manH, setManH]                       = useState('720');
  const [manD, setManD]                       = useState('560');
  const [manMaterial, setManMaterial]         = useState('MDF 18mm Vortex Blanc');
  const [manEdgeBand, setManEdgeBand]         = useState('Chant ABS Blanc 1mm');

  // BOM + generate order state
  const [generatingOrder, setGeneratingOrder] = useState(false);
  const [generatedOrderId, setGeneratedOrderId] = useState<string | null>(null);
  const [existingOrders, setExistingOrders]   = useState<Array<{id:string;name:string;status:string}>>([]);

  const load = useCallback(async () => {
    const [projRes, specRes, stockRes, ordersRes] = await Promise.all([
      supabase.from('projects').select('client_name, reference_code, project_type').eq('id', id).single(),
      supabase
        .from('cabinet_specs')
        .select('*, panels:panel_list(*), accessories:cabinet_accessories(*)')
        .eq('project_id', id)
        .order('sort_order'),
      supabase
        .from('stock_items')
        .select('id, name, unit, current_quantity, reserved_quantity, cost_per_unit, category, thickness_mm')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('production_orders')
        .select('id, name, status')
        .eq('project_id', id)
        .order('created_at', { ascending: false }),
    ]);
    if (projRes.data) {
      setProjectName(`${projRes.data.reference_code} — ${projRes.data.client_name}`);
      setProjectType(projRes.data.project_type || '');
    }
    const raw = (specRes.data || []) as CabinetSpec[];
    raw.forEach(c => { c.panels.sort((a,b) => a.sort_order - b.sort_order); });
    setCabinets(raw);
    setStockItems((stockRes.data || []) as StockItem[]);
    setExistingOrders((ordersRes.data || []) as Array<{id:string;name:string;status:string}>);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── Computed stats ─────────────────────────────────────────────────────────
  const allPanels   = cabinets.flatMap(c => c.panels);
  const totalPieces = allPanels.reduce((s,p) => s+p.quantity, 0);
  const totalEdgeM  = edgeMeters(allPanels);

  const accMap: Record<string, number> = {};
  cabinets.flatMap(c => c.accessories).forEach(a => {
    accMap[a.accessory_name] = (accMap[a.accessory_name]||0) + a.quantity;
  });

  const matMap: Record<string, { pieces: number; area_m2: number }> = {};
  allPanels.forEach(p => {
    const mat = materialShort(p.material);
    if (!matMap[mat]) matMap[mat] = { pieces: 0, area_m2: 0 };
    matMap[mat].pieces += p.quantity;
    matMap[mat].area_m2 += (p.length * p.width * p.quantity) / 1e6;
  });

  // Edge banding grouped by edge_band_type per cabinet
  const edgeByType: Record<string, number> = {};
  cabinets.forEach(c => {
    const type = c.edge_band_type || 'Non défini';
    const meters = edgeMeters(c.panels);
    edgeByType[type] = (edgeByType[type] || 0) + meters;
  });

  // BOM lines — match materials to stock_items by fuzzy name
  function matchStockItem(materialName: string): StockItem | undefined {
    const lower = materialName.toLowerCase();
    return stockItems.find(s =>
      s.name.toLowerCase().includes(lower.split(' ')[0]) ||
      lower.includes(s.name.toLowerCase().split(' ')[0]) ||
      ((s as any).normalized_name && lower.includes((s as any).normalized_name.substring(0,8)))
    ) ?? stockItems.find(s => {
      if (lower.includes('hdf') && s.name.toLowerCase().includes('hdf')) return true;
      if (lower.includes('mdf') && !lower.includes('hdf') && s.name.toLowerCase().includes('mdf') && !s.name.toLowerCase().includes('hdf')) return true;
      if ((lower.includes('stratifié') || lower.includes('stratifie')) && s.name.toLowerCase().includes('stratif')) return true;
      return false;
    });
  }

  function matchEdgeStockItem(edgeType: string): StockItem | undefined {
    const lower = edgeType.toLowerCase();
    return stockItems.find(s =>
      s.category === 'edge_banding' && (
        s.name.toLowerCase().includes(lower.split(' ')[0]) ||
        lower.includes(s.name.toLowerCase().split(' ')[0])
      )
    ) ?? stockItems.find(s => s.category === 'edge_banding');
  }

  const bomLines: BomLine[] = Object.entries(matMap).map(([mat, stats]) => {
    const stockItem = matchStockItem(mat);
    const sheets = Math.ceil(stats.area_m2 / SHEET_YIELD_M2);
    const estimated_cost = stockItem?.cost_per_unit
      ? stockItem.cost_per_unit * sheets
      : 0;
    return { material: mat, ...stats, sheets_needed: sheets, stockItem, estimated_cost };
  });

  const edgeBomLines: EdgeBomLine[] = Object.entries(edgeByType).map(([type, meters]) => {
    const mWithMargin = Math.ceil(meters * 1.15);
    const stockItem = matchEdgeStockItem(type);
    const estimated_cost = stockItem?.cost_per_unit
      ? stockItem.cost_per_unit * mWithMargin
      : 0;
    return { edge_type: type, meters, meters_with_margin: mWithMargin, stockItem, estimated_cost };
  });

  const totalEstimatedCost = [...bomLines, ...edgeBomLines].reduce((s,l) => s + l.estimated_cost, 0);

  function toggleExpand(cabId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(cabId) ? next.delete(cabId) : next.add(cabId);
      return next;
    });
  }

  // ── Add module from preset ─────────────────────────────────────────────────

  async function addModuleFromPreset() {
    if (!selectedPreset) return;
    setSaving(true);

    const w = parseInt(presetW) || selectedPreset.width;
    const h = parseInt(presetH) || selectedPreset.height;
    const d = parseInt(presetD) || selectedPreset.depth;
    const name = presetName || `${selectedPreset.label} ${w}×${h}`;

    const nextSort = cabinets.length > 0
      ? Math.max(...cabinets.map(c => c.sort_order)) + 1
      : 1;

    // Insert cabinet_spec
    const { data: spec, error: specErr } = await supabase
      .from('cabinet_specs')
      .insert({
        project_id: id,
        cabinet_name: name,
        cabinet_type: selectedPreset.cabinet_type,
        width: w, height: h, depth: d,
        material: presetMaterial,
        edge_band_type: presetEdgeBand,
        notes: null,
        sort_order: nextSort,
      })
      .select('id')
      .single();

    if (specErr || !spec) {
      alert('Erreur: ' + (specErr?.message || 'Unknown'));
      setSaving(false);
      return;
    }

    // Insert panels from preset
    const panelInserts = selectedPreset.panels.map((p, idx) => ({
      cabinet_spec_id: spec.id,
      panel_name: p.panel_name,
      length: p.lengthExpr(w, h, d),
      width: p.widthExpr(w, h, d),
      quantity: p.quantity,
      material: p.material === 'back' ? presetBackMat : presetMaterial,
      edge_top: p.edge_top,
      edge_bottom: p.edge_bottom,
      edge_left: p.edge_left,
      edge_right: p.edge_right,
      grain_direction: 'none',
      sort_order: idx + 1,
    }));

    if (panelInserts.length > 0) {
      const { error: panelErr } = await supabase.from('panel_list').insert(panelInserts);
      if (panelErr) console.error('Panel insert error:', panelErr.message);
    }

    // Insert accessories
    if (selectedPreset.accessories.length > 0) {
      const { error: accErr } = await supabase.from('cabinet_accessories').insert(
        selectedPreset.accessories.map(a => ({ cabinet_spec_id: spec.id, ...a, unit_price: null }))
      );
      if (accErr) console.error('Accessory insert error:', accErr.message);
    }

    await load();
    setShowAddModule(false);
    setSelectedPreset(null);
    setPresetName('');
    setSaving(false);
  }

  async function addManualModule() {
    if (!manCabinetName.trim()) return;
    setSaving(true);

    const nextSort = cabinets.length > 0
      ? Math.max(...cabinets.map(c => c.sort_order)) + 1
      : 1;

    const { error } = await supabase.from('cabinet_specs').insert({
      project_id: id,
      cabinet_name: manCabinetName.trim(),
      cabinet_type: manCabinetType,
      width: parseInt(manW) || 600,
      height: parseInt(manH) || 720,
      depth: parseInt(manD) || 560,
      material: manMaterial,
      edge_band_type: manEdgeBand,
      sort_order: nextSort,
    });

    if (error) {
      alert('Erreur: ' + error.message);
    } else {
      await load();
      setShowAddModule(false);
      setManCabinetName('');
    }
    setSaving(false);
  }

  async function deleteModule(cabId: string) {
    if (!confirm('Supprimer ce module et toutes ses pièces?')) return;
    await supabase.from('cabinet_specs').delete().eq('id', cabId);
    await load();
  }

  // ── Generate Production Order from BOM ────────────────────────────────────

  async function generateProductionOrder() {
    if (bomLines.length === 0) return;
    setGeneratingOrder(true);

    // 1. Create production order
    const { data: order, error: orderErr } = await supabase
      .from('production_orders')
      .insert({
        project_id: id,
        name: `BOM — ${projectName}`,
        status: 'pending',
        notes: `Généré depuis structure fabrication. ${cabinets.length} modules, ${totalPieces} pièces.`,
        created_by: profile?.id,
      })
      .select('id')
      .single();

    if (orderErr || !order) {
      alert('Erreur création ordre: ' + (orderErr?.message || 'Unknown'));
      setGeneratingOrder(false);
      return;
    }

    // 2. Create material requirements for each BOM line with matching stock item
    const requirements = [];

    for (const line of bomLines) {
      if (line.stockItem) {
        requirements.push({
          production_order_id: order.id,
          material_id: line.stockItem.id,
          planned_qty: line.sheets_needed,
          unit: 'panel',
          status: 'planned',
          notes: `BOM: ${line.material} — ${line.area_m2.toFixed(2)} m² → ${line.sheets_needed} feuilles`,
        });
      } else {
        // No stock match — create with null material_id as placeholder
        requirements.push({
          production_order_id: order.id,
          material_id: null,
          planned_qty: line.sheets_needed,
          unit: 'panel',
          status: 'planned',
          notes: `BOM: ${line.material} [MATIÈRE NON TROUVÉE] — ${line.area_m2.toFixed(2)} m² → ${line.sheets_needed} feuilles`,
        });
      }
    }

    for (const line of edgeBomLines) {
      if (line.stockItem) {
        requirements.push({
          production_order_id: order.id,
          material_id: line.stockItem.id,
          planned_qty: line.meters_with_margin,
          unit: 'meter',
          status: 'planned',
          notes: `BOM: ${line.edge_type} — ${line.meters.toFixed(0)} m + 15% = ${line.meters_with_margin} m`,
        });
      }
    }

    // Hardware from accessories
    for (const [name, qty] of Object.entries(accMap)) {
      const stockMatch = stockItems.find(s =>
        s.name.toLowerCase().includes(name.toLowerCase().split(' ')[0]) ||
        name.toLowerCase().includes(s.name.toLowerCase().split(' ')[0])
      );
      requirements.push({
        production_order_id: order.id,
        material_id: stockMatch?.id || null,
        planned_qty: qty,
        unit: 'piece',
        status: 'planned',
        notes: `BOM Hardware: ${name}${!stockMatch ? ' [NON TROUVÉ EN STOCK]' : ''}`,
      });
    }

    if (requirements.length > 0) {
      const { error: reqErr } = await supabase
        .from('production_material_requirements')
        .insert(requirements);
      if (reqErr) {
        alert('Erreur besoins matières: ' + reqErr.message);
      }
    }

    setGeneratedOrderId(order.id);
    await load(); // refresh existing orders list
    setGeneratingOrder(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const presets = selectedCategory === 'kitchen' ? KITCHEN_PRESETS
    : selectedCategory === 'wardrobe' ? WARDROBE_PRESETS
    : [];

  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager', 'designer', 'commercial_manager', 'workshop_worker']}>
      <div className="space-y-4 pb-24">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 rounded-xl bg-white shadow-sm border border-gray-100">
            <ArrowLeft size={18} className="text-[#1a1a2e]" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-[#1a1a2e]">Structure Fabrication</h1>
            <p className="text-xs text-[#64648B] truncate">{projectName}</p>
          </div>
          {canWrite && (
            <Button size="sm" onClick={() => setShowAddModule(true)}>
              <Plus size={14} /> Module
            </Button>
          )}
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Modules',   value: cabinets.length,          icon: Box },
            { label: 'Pièces',    value: totalPieces,               icon: Grid3X3 },
            { label: 'Chant (m)', value: totalEdgeM.toFixed(0),     icon: Ruler },
            { label: 'Quincail.', value: Object.keys(accMap).length, icon: Wrench },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-2.5 text-center">
              <Icon size={16} className="text-[#64648B] mx-auto mb-1" />
              <p className="text-base font-bold text-[#1a1a2e]">{value}</p>
              <p className="text-[10px] text-[#64648B]">{label}</p>
            </div>
          ))}
        </div>

        {/* Existing production orders strip */}
        {existingOrders.length > 0 && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center gap-2">
            <Factory size={16} className="text-blue-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-blue-800">Ordres de production existants</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {existingOrders.map(o => (
                  <button
                    key={o.id}
                    onClick={() => router.push(`/projects/${id}/production`)}
                    className="text-[10px] bg-white border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full hover:bg-blue-100"
                  >
                    {o.name || `Ordre #${o.id.slice(-6)}`} — {o.status}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
          {([
            ['modules',   'Modules',  Box],
            ['pieces',    'Pièces',   Grid3X3],
            ['materials', 'Matières', Layers],
            ['hardware',  'Quincail.',Wrench],
            ['bom',       'BOM',      TrendingUp],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key as TabKey)}
              className={`flex-shrink-0 flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                tab === key ? 'bg-white shadow text-[#1a1a2e]' : 'text-gray-500'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-10 text-sm text-gray-400">Chargement…</div>
        ) : cabinets.length === 0 ? (
          <Card><CardContent>
            <div className="text-center py-8 space-y-3">
              <AlertTriangle size={32} className="text-amber-400 mx-auto" />
              <p className="text-sm font-medium text-[#1a1a2e]">Aucune structure définie</p>
              <p className="text-xs text-gray-400">Ajoutez des modules pour construire la structure de fabrication.</p>
              {canWrite && (
                <Button onClick={() => setShowAddModule(true)} size="sm">
                  <Plus size={14} /> Ajouter le premier module
                </Button>
              )}
            </div>
          </CardContent></Card>
        ) : (
          <>
            {/* ── TAB: Modules ────────────────────────────────────────────── */}
            {tab === 'modules' && (
              <div className="space-y-2">
                {cabinets.map(cab => {
                  const isOpen = expanded.has(cab.id);
                  const pieceCt = cab.panels.reduce((s,p) => s+p.quantity, 0);
                  return (
                    <Card key={cab.id}>
                      <button onClick={() => toggleExpand(cab.id)} className="w-full text-left">
                        <CardContent>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CABINET_TYPE_COLORS[cab.cabinet_type] || CABINET_TYPE_COLORS.other}`}>
                                  {CABINET_TYPE_LABELS[cab.cabinet_type] || cab.cabinet_type}
                                </span>
                                <p className="text-sm font-semibold text-[#1a1a2e] truncate">{cab.cabinet_name}</p>
                              </div>
                              <div className="flex gap-3 mt-1 text-xs text-[#64648B]">
                                <span className="flex items-center gap-1"><Ruler size={10}/>{cab.width}×{cab.height}×{cab.depth} mm</span>
                                <span>{pieceCt} pièces</span>
                                {cab.accessories.length > 0 && <span className="text-amber-600">{cab.accessories.reduce((s,a)=>s+a.quantity,0)} acces.</span>}
                              </div>
                              <p className="text-[10px] text-gray-400 mt-0.5 truncate">{cab.material}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {canWrite && (
                                <button
                                  onClick={e => { e.stopPropagation(); deleteModule(cab.id); }}
                                  className="text-gray-300 hover:text-red-400 p-1"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                              {isOpen ? <ChevronUp size={16} className="text-gray-400"/> : <ChevronDown size={16} className="text-gray-400"/>}
                            </div>
                          </div>
                        </CardContent>
                      </button>

                      {isOpen && (
                        <div className="border-t border-gray-50 px-4 pb-3">
                          <div className="overflow-x-auto -mx-1 mt-2">
                            <table className="w-full text-xs border-collapse min-w-[480px]">
                              <thead>
                                <tr className="bg-gray-50 text-[#64648B]">
                                  <th className="text-left px-2 py-1.5 font-medium rounded-l-lg">Pièce</th>
                                  <th className="text-right px-2 py-1.5 font-medium">L×l (mm)</th>
                                  <th className="text-center px-2 py-1.5 font-medium">Qté</th>
                                  <th className="text-center px-2 py-1.5 font-medium">Chant</th>
                                  <th className="text-left px-2 py-1.5 font-medium rounded-r-lg">Matière</th>
                                </tr>
                              </thead>
                              <tbody>
                                {cab.panels.map(p => (
                                  <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                                    <td className="px-2 py-1.5 font-medium text-[#1a1a2e]">{p.panel_name}</td>
                                    <td className="px-2 py-1.5 text-right text-[#64648B] font-mono">{p.length}×{p.width}</td>
                                    <td className="px-2 py-1.5 text-center">
                                      <span className="bg-[#1E2F52] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">×{p.quantity}</span>
                                    </td>
                                    <td className="px-2 py-1.5 text-center">
                                      <span className={`text-[10px] font-medium ${edgeLabel(p)==='—'?'text-gray-300':'text-blue-600'}`}>{edgeLabel(p)}</span>
                                    </td>
                                    <td className="px-2 py-1.5 text-gray-500 text-[10px]">{materialShort(p.material)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {cab.accessories.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {cab.accessories.map(a => (
                                <span key={a.id} className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                                  {a.accessory_name} ×{a.quantity}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setExpanded(new Set(cabinets.map(c=>c.id)))}
                    className="flex-1 text-xs text-[#64648B] border border-gray-200 rounded-lg py-1.5 hover:bg-gray-50">
                    Tout développer
                  </button>
                  <button onClick={() => setExpanded(new Set())}
                    className="flex-1 text-xs text-[#64648B] border border-gray-200 rounded-lg py-1.5 hover:bg-gray-50">
                    Tout réduire
                  </button>
                </div>
              </div>
            )}

            {/* ── TAB: Pièces ─────────────────────────────────────────────── */}
            {tab === 'pieces' && (
              <Card>
                <CardHeader>
                  <h2 className="font-semibold text-sm flex items-center gap-2">
                    <Grid3X3 size={15}/> Liste Pièces — {totalPieces} pièces totales
                  </h2>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-xs border-collapse min-w-[500px]">
                      <thead>
                        <tr className="bg-gray-50 text-[#64648B]">
                          <th className="text-left px-2 py-1.5 font-medium">Module</th>
                          <th className="text-left px-2 py-1.5 font-medium">Pièce</th>
                          <th className="text-right px-2 py-1.5 font-medium">L×l (mm)</th>
                          <th className="text-center px-2 py-1.5 font-medium">Qté</th>
                          <th className="text-center px-2 py-1.5 font-medium">Chant</th>
                          <th className="text-left px-2 py-1.5 font-medium">Matière</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cabinets.flatMap(c =>
                          c.panels.map(p => (
                            <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                              <td className="px-2 py-1.5 text-[10px] text-gray-400 max-w-[100px] truncate">{c.cabinet_name}</td>
                              <td className="px-2 py-1.5 font-medium text-[#1a1a2e]">{p.panel_name}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-[#64648B]">{p.length}×{p.width}</td>
                              <td className="px-2 py-1.5 text-center">
                                <span className="bg-[#1E2F52] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">×{p.quantity}</span>
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                <span className={`text-[10px] font-medium ${edgeLabel(p)==='—'?'text-gray-300':'text-blue-600'}`}>{edgeLabel(p)}</span>
                              </td>
                              <td className="px-2 py-1.5 text-gray-500 text-[10px]">{materialShort(p.material)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── TAB: Matières ───────────────────────────────────────────── */}
            {tab === 'materials' && (
              <div className="space-y-3">
                <Card>
                  <CardHeader><h2 className="font-semibold text-sm flex items-center gap-2"><Layers size={15}/> Matières Principales</h2></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(matMap).sort((a,b)=>b[1].pieces-a[1].pieces).map(([mat, stats]) => (
                        <div key={mat} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                          <div>
                            <p className="text-sm font-medium text-[#1a1a2e]">{mat}</p>
                            <p className="text-xs text-[#64648B]">{stats.pieces} pièces</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-[#1E2F52]">{stats.area_m2.toFixed(2)} m²</p>
                            <p className="text-[10px] text-gray-400">≈ {Math.ceil(stats.area_m2/SHEET_YIELD_M2)} feuilles <span className="text-gray-300">(2880×2070)</span></p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><h2 className="font-semibold text-sm flex items-center gap-2"><Ruler size={15}/> Chant estimé</h2></CardHeader>
                  <CardContent>
                    {Object.entries(edgeByType).map(([type, meters]) => (
                      <div key={type} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-[#1a1a2e]">{type}</p>
                          <p className="text-xs text-[#64648B]">Net: {meters.toFixed(1)} m</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-amber-600">{(meters * 1.15).toFixed(0)} m</p>
                          <p className="text-[10px] text-gray-400">+15% marge</p>
                        </div>
                      </div>
                    ))}
                    <div className="mt-3 bg-[#1E2F52]/5 rounded-xl p-3">
                      <p className="text-xs font-semibold text-[#1E2F52]">Total chant requis: {(totalEdgeM * 1.15).toFixed(0)} m</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><h2 className="font-semibold text-sm flex items-center gap-2"><LayoutGrid size={15}/> Répartition par Type</h2></CardHeader>
                  <CardContent>
                    <div className="space-y-1.5">
                      {Object.entries(cabinets.reduce((acc,c) => {
                        const type = CABINET_TYPE_LABELS[c.cabinet_type]||c.cabinet_type;
                        if (!acc[type]) acc[type] = {count:0,pieces:0};
                        acc[type].count++;
                        acc[type].pieces += c.panels.reduce((s,p)=>s+p.quantity,0);
                        return acc;
                      },{} as Record<string,{count:number;pieces:number}>)).sort((a,b)=>b[1].count-a[1].count).map(([type,{count,pieces}]) => (
                        <div key={type} className="flex justify-between items-center text-sm">
                          <span className="text-[#1a1a2e]">{type}</span>
                          <span className="text-[#64648B]">{count} module{count>1?'s':''} · {pieces} pièces</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── TAB: Quincaillerie ──────────────────────────────────────── */}
            {tab === 'hardware' && (
              <Card>
                <CardHeader><h2 className="font-semibold text-sm flex items-center gap-2"><Wrench size={15}/> Quincaillerie — {Object.values(accMap).reduce((s,n)=>s+n,0)} pièces totales</h2></CardHeader>
                <CardContent>
                  {Object.keys(accMap).length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Aucune quincaillerie définie.</p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(accMap).sort((a,b)=>b[1]-a[1]).map(([name, qty]) => {
                        const inStock = stockItems.find(s =>
                          s.name.toLowerCase().includes(name.toLowerCase().split(' ')[0]) ||
                          name.toLowerCase().includes(s.name.toLowerCase().split(' ')[0])
                        );
                        return (
                          <div key={name} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                            <div className="flex items-center gap-2">
                              {inStock ? <CheckCircle size={14} className="text-green-500 flex-shrink-0"/> : <AlertTriangle size={14} className="text-amber-400 flex-shrink-0"/>}
                              <div>
                                <p className="text-sm text-[#1a1a2e]">{name}</p>
                                {inStock && <p className="text-[10px] text-gray-400">Stock: {inStock.current_quantity} {inStock.unit}</p>}
                                {!inStock && <p className="text-[10px] text-amber-500">Non trouvé en stock</p>}
                              </div>
                            </div>
                            <span className="text-base font-bold text-[#1E2F52] flex-shrink-0 ml-2">×{qty}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {cabinets.some(c=>c.accessories.length>0) && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-xs font-semibold text-[#64648B] mb-2">Par module:</p>
                      <div className="space-y-1">
                        {cabinets.filter(c=>c.accessories.length>0).map(c=>(
                          <div key={c.id} className="text-xs">
                            <span className="font-medium text-[#1a1a2e]">{c.cabinet_name}</span>
                            <span className="text-gray-400 ml-2">{c.accessories.map(a=>`${a.accessory_name} ×${a.quantity}`).join(' · ')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── TAB: BOM ────────────────────────────────────────────────── */}
            {tab === 'bom' && (
              <div className="space-y-3">

                {/* Cost summary */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white border border-gray-100 shadow-sm rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-[#1E2F52]">{totalEstimatedCost.toLocaleString('fr-MA')} MAD</p>
                    <p className="text-[10px] text-[#64648B]">Coût estimé total matières</p>
                  </div>
                  <div className="bg-white border border-gray-100 shadow-sm rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-[#1E2F52]">{bomLines.reduce((s,l)=>s+l.sheets_needed,0)}</p>
                    <p className="text-[10px] text-[#64648B]">Feuilles totales requises</p>
                  </div>
                </div>

                {/* Panel materials BOM */}
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-sm flex items-center gap-2"><Package size={15}/> Panneaux</h2>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {bomLines.map(line => (
                        <div key={line.material} className="border-b border-gray-50 pb-3 last:border-0">
                          <div className="flex justify-between items-start mb-1">
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-[#1a1a2e]">{line.material}</p>
                              <p className="text-xs text-[#64648B]">{line.area_m2.toFixed(2)} m² — {line.pieces} pièces</p>
                            </div>
                            <div className="text-right flex-shrink-0 ml-3">
                              <p className="text-sm font-bold text-[#1E2F52]">{line.sheets_needed} feuilles</p>
                              {line.estimated_cost > 0 && (
                                <p className="text-xs text-[#64648B]">{line.estimated_cost.toLocaleString('fr-MA')} MAD</p>
                              )}
                            </div>
                          </div>
                          {line.stockItem ? (
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <CheckCircle size={11} className="text-green-500"/>
                              <span className="text-green-700">{line.stockItem.name}</span>
                              <span className="text-gray-400">• Stock: {line.stockItem.current_quantity - line.stockItem.reserved_quantity} {line.stockItem.unit}</span>
                              {(line.stockItem.current_quantity - line.stockItem.reserved_quantity) < line.sheets_needed && (
                                <span className="text-red-500 font-medium ml-1">⚠ Insuffisant</span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-[10px] text-amber-600">
                              <AlertTriangle size={11}/>
                              <span>Matière non trouvée en stock — à assigner manuellement</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Edge banding BOM */}
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-sm flex items-center gap-2"><Ruler size={15}/> Chant</h2>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {edgeBomLines.map(line => (
                        <div key={line.edge_type} className="flex justify-between items-start border-b border-gray-50 pb-2 last:border-0">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-[#1a1a2e]">{line.edge_type}</p>
                            <p className="text-xs text-[#64648B]">{line.meters.toFixed(0)} m net → {line.meters_with_margin} m (+15%)</p>
                            {line.stockItem ? (
                              <div className="flex items-center gap-1 text-[10px] text-green-700 mt-0.5">
                                <CheckCircle size={10}/> {line.stockItem.name} • Stock: {line.stockItem.current_quantity} {line.stockItem.unit}
                              </div>
                            ) : (
                              <p className="text-[10px] text-amber-500 mt-0.5">Non trouvé en stock</p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            <p className="text-sm font-bold text-[#1E2F52]">{line.meters_with_margin} m</p>
                            {line.estimated_cost > 0 && (
                              <p className="text-xs text-[#64648B]">{line.estimated_cost.toLocaleString('fr-MA')} MAD</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Hardware BOM */}
                {Object.keys(accMap).length > 0 && (
                  <Card>
                    <CardHeader><h2 className="font-semibold text-sm flex items-center gap-2"><Wrench size={15}/> Quincaillerie</h2></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {Object.entries(accMap).sort((a,b)=>b[1]-a[1]).map(([name, qty]) => {
                          const si = stockItems.find(s => s.name.toLowerCase().includes(name.toLowerCase().split(' ')[0]));
                          return (
                            <div key={name} className="flex justify-between items-center text-sm py-1 border-b border-gray-50 last:border-0">
                              <div>
                                <p className="text-[#1a1a2e]">{name}</p>
                                {si && <p className="text-[10px] text-gray-400">Stock: {si.current_quantity} {si.unit}</p>}
                              </div>
                              <span className="font-bold text-[#1E2F52]">×{qty}</span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Generate production order */}
                {canWrite && (
                  <div className="space-y-2">
                    {generatedOrderId ? (
                      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center space-y-2">
                        <CheckCircle size={24} className="text-green-500 mx-auto"/>
                        <p className="text-sm font-semibold text-green-800">Ordre de production créé!</p>
                        <Button
                          variant="secondary" size="sm"
                          onClick={() => router.push(`/projects/${id}/production`)}
                        >
                          <Factory size={14}/> Voir l'ordre de production
                        </Button>
                      </div>
                    ) : (
                      <Button
                        className="w-full"
                        disabled={generatingOrder || bomLines.length === 0}
                        onClick={generateProductionOrder}
                      >
                        {generatingOrder
                          ? <><RefreshCw size={14} className="animate-spin"/> Génération en cours…</>
                          : <><Zap size={14}/> Générer Ordre de Production depuis BOM</>
                        }
                      </Button>
                    )}
                    <p className="text-[10px] text-gray-400 text-center">
                      Crée un ordre de production avec {bomLines.length + edgeBomLines.length + Object.keys(accMap).length} besoins matières
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Modal: Add Module ──────────────────────────────────────────── */}
        {showAddModule && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-0 sm:p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex justify-between items-center">
                <h3 className="font-bold text-[#1a1a2e]">Ajouter un Module</h3>
                <button onClick={() => { setShowAddModule(false); setSelectedPreset(null); setPresetName(''); }}><X size={20}/></button>
              </div>

              <div className="p-5 space-y-4">
                {/* Mode toggle */}
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                  {(['preset', 'manual'] as const).map(m => (
                    <button key={m} onClick={() => setAddMode(m)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${addMode===m?'bg-white shadow text-[#1a1a2e]':'text-gray-500'}`}>
                      {m === 'preset' ? '⚡ Gabarit rapide' : '✏️ Manuel'}
                    </button>
                  ))}
                </div>

                {addMode === 'preset' ? (
                  <>
                    {/* Category selector */}
                    <div className="flex gap-2">
                      {(['kitchen', 'wardrobe'] as const).map(cat => (
                        <button key={cat} onClick={() => { setSelectedCategory(cat); setSelectedPreset(null); }}
                          className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                            selectedCategory===cat ? 'bg-[#1E2F52] text-white border-[#1E2F52]' : 'bg-white text-[#64648B] border-gray-200'
                          }`}>
                          {cat === 'kitchen' ? '🍳 Cuisine' : '🚪 Dressing'}
                        </button>
                      ))}
                    </div>

                    {/* Preset cards */}
                    <div className="space-y-2">
                      {presets.map(preset => (
                        <button key={preset.id} onClick={() => {
                          setSelectedPreset(preset);
                          setPresetW(String(preset.width));
                          setPresetH(String(preset.height));
                          setPresetD(String(preset.depth));
                          setPresetName(`${preset.label} ${preset.width}×${preset.height}`);
                        }}
                          className={`w-full text-left border rounded-xl p-3 transition-all ${
                            selectedPreset?.id===preset.id
                              ? 'border-[#1E2F52] bg-[#1E2F52]/5'
                              : 'border-gray-100 hover:border-gray-200 bg-white'
                          }`}>
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="text-sm font-semibold text-[#1a1a2e]">{preset.label}</p>
                              <p className="text-[10px] text-[#64648B]">
                                {preset.width}×{preset.height}×{preset.depth} mm •
                                {preset.panels.length} panneaux • {preset.accessories.length} accessoires
                              </p>
                            </div>
                            {selectedPreset?.id===preset.id && <CheckCircle size={16} className="text-[#1E2F52] flex-shrink-0"/>}
                          </div>
                        </button>
                      ))}
                    </div>

                    {selectedPreset && (
                      <div className="space-y-3 border-t border-gray-100 pt-3">
                        <Input label="Nom du module" value={presetName} onChange={e=>setPresetName(e.target.value)} placeholder={`${selectedPreset.label} ${presetW}×${presetH}`}/>
                        <div className="grid grid-cols-3 gap-2">
                          <Input label="Largeur (mm)" type="number" value={presetW} onChange={e=>setPresetW(e.target.value)}/>
                          <Input label="Hauteur (mm)" type="number" value={presetH} onChange={e=>setPresetH(e.target.value)}/>
                          <Input label="Profondeur (mm)" type="number" value={presetD} onChange={e=>setPresetD(e.target.value)}/>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">Matière principale</label>
                          <select value={presetMaterial} onChange={e=>setPresetMaterial(e.target.value)}
                            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white">
                            <option>MDF 18mm Vortex Blanc</option>
                            <option>MDF 18mm Hydrophobe</option>
                            <option>Stratifié 16mm Chêne</option>
                            <option>Stratifié 18mm Blanc</option>
                            <option>MDF 16mm Vortex Blanc</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">Matière fond (dos)</label>
                          <select value={presetBackMat} onChange={e=>setPresetBackMat(e.target.value)}
                            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white">
                            <option>HDF 5mm</option>
                            <option>MDF 8mm</option>
                            <option>Contreplaqué 9mm</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">Chant</label>
                          <select value={presetEdgeBand} onChange={e=>setPresetEdgeBand(e.target.value)}
                            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white">
                            <option>Chant ABS Blanc 1mm</option>
                            <option>Chant ABS Blanc 2mm</option>
                            <option>Chant ABS Chêne 1mm</option>
                            <option>Chant ABS Chêne 2mm</option>
                            <option>Chant PVC Blanc 0.4mm</option>
                          </select>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button variant="secondary" className="flex-1" onClick={() => { setShowAddModule(false); setSelectedPreset(null); }}>Annuler</Button>
                          <Button className="flex-1" disabled={saving} onClick={addModuleFromPreset}>
                            {saving ? <RefreshCw size={13} className="animate-spin"/> : <Plus size={13}/>}
                            {saving ? 'Ajout…' : `Ajouter ${selectedPreset.label}`}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  /* Manual entry */
                  <div className="space-y-3">
                    <Input label="Nom du module *" value={manCabinetName} onChange={e=>setManCabinetName(e.target.value)} placeholder="ex: Meuble bas cuisine 60cm"/>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Type</label>
                      <select value={manCabinetType} onChange={e=>setManCabinetType(e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white">
                        {Object.entries(CABINET_TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Input label="Largeur (mm)" type="number" value={manW} onChange={e=>setManW(e.target.value)}/>
                      <Input label="Hauteur (mm)" type="number" value={manH} onChange={e=>setManH(e.target.value)}/>
                      <Input label="Profondeur (mm)" type="number" value={manD} onChange={e=>setManD(e.target.value)}/>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Matière</label>
                      <select value={manMaterial} onChange={e=>setManMaterial(e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white">
                        <option>MDF 18mm Vortex Blanc</option>
                        <option>MDF 18mm Hydrophobe</option>
                        <option>Stratifié 16mm Chêne</option>
                        <option>Stratifié 18mm Blanc</option>
                        <option>MDF 16mm Vortex Blanc</option>
                        <option>Contreplaqué 18mm</option>
                        <option>Bois Massif</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Type de chant</label>
                      <select value={manEdgeBand} onChange={e=>setManEdgeBand(e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white">
                        <option>Chant ABS Blanc 1mm</option>
                        <option>Chant ABS Blanc 2mm</option>
                        <option>Chant ABS Chêne 1mm</option>
                        <option>Chant ABS Chêne 2mm</option>
                        <option>Chant PVC Blanc 0.4mm</option>
                        <option>Chant Massif 45mm</option>
                      </select>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button variant="secondary" className="flex-1" onClick={() => setShowAddModule(false)}>Annuler</Button>
                      <Button className="flex-1" disabled={!manCabinetName || saving} onClick={addManualModule}>
                        {saving ? <RefreshCw size={13} className="animate-spin"/> : <Plus size={13}/>}
                        {saving ? 'Ajout…' : 'Ajouter Module'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
