import type { UserRole } from '@/types/database';

// ============================================================
// Navigation per role
// ============================================================
export interface NavItem {
  label: string;
  href: string;
  icon: string; // lucide icon name
  i18nKey?: string;
}

export interface NavGroup {
  label: string;
  i18nKey?: string;
  items: NavItem[];
}

// Flat list for BottomNav (unchanged)
export const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  ceo: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    { label: 'Leads', href: '/leads', icon: 'Users', i18nKey: 'nav.leads' },
    { label: 'Cuisines', href: '/kitchen', icon: 'ChefHat', i18nKey: 'nav.kitchen' },
    { label: 'Projects', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
    { label: 'Production', href: '/production', icon: 'Factory', i18nKey: 'nav.production' },
    { label: 'Production Sheets', href: '/production/sheets', icon: 'FileText', i18nKey: 'nav.production_sheets' },
    { label: 'Module Library', href: '/production/library', icon: 'BookOpen', i18nKey: 'nav.module_library' },
    { label: 'Catalogue Modules', href: '/catalog/modules', icon: 'Layers', i18nKey: 'nav.catalog_modules' },
    { label: 'Documents', href: '/documents', icon: 'FileText', i18nKey: 'nav.documents' },
    { label: 'Finance', href: '/finance/money-hub', icon: 'Wallet', i18nKey: 'nav.finance' },
    { label: 'Reports', href: '/finance/reports', icon: 'PieChart', i18nKey: 'nav.reports' },
    { label: 'Invoices', href: '/invoices', icon: 'Receipt', i18nKey: 'nav.invoices' },
    { label: 'Intelligence Usine', href: '/factory/intelligence', icon: 'BarChart3', i18nKey: 'nav.factory_intelligence' },
    { label: 'Stock', href: '/stock', icon: 'Package', i18nKey: 'nav.stock' },
    { label: 'Suppliers', href: '/suppliers', icon: 'Truck', i18nKey: 'nav.suppliers' },
    { label: 'Purchase Orders', href: '/purchase-orders', icon: 'ShoppingCart', i18nKey: 'nav.purchase_orders' },
    { label: 'Calendar', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
    { label: 'Installation', href: '/installation', icon: 'Wrench', i18nKey: 'nav.installation' },
    { label: 'HR', href: '/hr', icon: 'UserCheck', i18nKey: 'nav.hr' },
    { label: 'Leaves', href: '/hr/leaves', icon: 'CalendarOff', i18nKey: 'nav.leaves' },
    { label: 'Marketing', href: '/marketing', icon: 'Megaphone', i18nKey: 'nav.marketing' },
    { label: 'Surveys', href: '/surveys', icon: 'Star', i18nKey: 'nav.surveys' },
    { label: 'Maintenance', href: '/production/maintenance', icon: 'Wrench', i18nKey: 'nav.maintenance' },
    { label: 'Exceptions', href: '/projects/exceptions', icon: 'ShieldAlert', i18nKey: 'nav.exceptions' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  commercial_manager: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    { label: 'Leads', href: '/leads', icon: 'Users', i18nKey: 'nav.leads' },
    { label: 'Projects', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
    { label: 'Quotes', href: '/quotes', icon: 'FileText', i18nKey: 'nav.quotes' },
    { label: 'Invoices', href: '/invoices', icon: 'Receipt', i18nKey: 'nav.invoices' },
    { label: 'Calendar', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
    { label: 'Intelligence Usine', href: '/factory/intelligence', icon: 'BarChart3', i18nKey: 'nav.factory_intelligence' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  designer: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    { label: 'Projects', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
    { label: 'Quotes', href: '/quotes', icon: 'FileText', i18nKey: 'nav.quotes' },
    { label: 'Catalogue Modules', href: '/catalog/modules', icon: 'Layers', i18nKey: 'nav.catalog_modules' },
    { label: 'Calendar', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  workshop_manager: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    { label: 'Production', href: '/production', icon: 'Factory', i18nKey: 'nav.production' },
    { label: 'Workshop TV', href: '/production/dashboard', icon: 'Monitor', i18nKey: 'nav.workshop_tv' },
    { label: 'Découpe & Chant', href: '/production/cutting', icon: 'Scissors', i18nKey: 'nav.cutting' },
    { label: 'Maintenance', href: '/production/maintenance', icon: 'Wrench', i18nKey: 'nav.maintenance' },
    { label: 'Catalogue Modules', href: '/catalog/modules', icon: 'Layers', i18nKey: 'nav.catalog_modules' },
    { label: 'Stock', href: '/stock', icon: 'Package', i18nKey: 'nav.stock' },
    { label: 'Suppliers', href: '/suppliers', icon: 'Truck', i18nKey: 'nav.suppliers' },
    { label: 'Purchase Orders', href: '/purchase-orders', icon: 'ShoppingCart', i18nKey: 'nav.purchase_orders' },
    { label: 'Projects', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
    { label: 'Intelligence Usine', href: '/factory/intelligence', icon: 'BarChart3', i18nKey: 'nav.factory_intelligence' },
    { label: 'Calendar', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  workshop_worker: [
    { label: 'My Tasks', href: '/production', icon: 'ClipboardList', i18nKey: 'nav.my_tasks' },
    { label: 'Scan', href: '/production/scan', icon: 'ScanLine', i18nKey: 'nav.scan' },
    { label: 'Découpe & Chant', href: '/production/cutting', icon: 'Scissors', i18nKey: 'nav.cutting' },
    { label: 'Report Issue', href: '/production/issues', icon: 'AlertTriangle', i18nKey: 'nav.report_issue' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  installer: [
    { label: 'Schedule', href: '/installation', icon: 'Calendar', i18nKey: 'nav.schedule' },
    { label: 'Current Job', href: '/installation/current', icon: 'Wrench', i18nKey: 'nav.current_job' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  hr_manager: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    { label: 'Attendance', href: '/hr', icon: 'UserCheck', i18nKey: 'nav.attendance' },
    { label: 'Leaves', href: '/hr/leaves', icon: 'CalendarOff', i18nKey: 'nav.leaves' },
    { label: 'Calendar', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  community_manager: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    { label: 'Leads', href: '/leads', icon: 'Users', i18nKey: 'nav.leads' },
    { label: 'Marketing', href: '/marketing', icon: 'Megaphone', i18nKey: 'nav.marketing' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  // ─── New operational roles ──────────────────────────
  owner_admin: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    { label: 'Leads', href: '/leads', icon: 'Users', i18nKey: 'nav.leads' },
    { label: 'Projects', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
    { label: 'Production', href: '/production', icon: 'Factory', i18nKey: 'nav.production' },
    { label: 'Stock', href: '/stock', icon: 'Package', i18nKey: 'nav.stock' },
    { label: 'Finance', href: '/finance/money-hub', icon: 'Wallet', i18nKey: 'nav.finance' },
    { label: 'Invoices', href: '/invoices', icon: 'Receipt', i18nKey: 'nav.invoices' },
    { label: 'HR', href: '/hr', icon: 'UserCheck', i18nKey: 'nav.hr' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  operations_manager: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    { label: 'Leads', href: '/leads', icon: 'Users', i18nKey: 'nav.leads' },
    { label: 'Projects', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
    { label: 'Production', href: '/production', icon: 'Factory', i18nKey: 'nav.production' },
    { label: 'Installation', href: '/installation', icon: 'Wrench', i18nKey: 'nav.installation' },
    { label: 'Stock', href: '/stock', icon: 'Package', i18nKey: 'nav.stock' },
    { label: 'HR', href: '/hr', icon: 'UserCheck', i18nKey: 'nav.hr' },
    { label: 'Calendar', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  logistics: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    { label: 'Installation', href: '/installation', icon: 'Wrench', i18nKey: 'nav.installation' },
    { label: 'Calendar', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  worker: [
    { label: 'My Tasks', href: '/production', icon: 'ClipboardList', i18nKey: 'nav.my_tasks' },
    { label: 'Scan', href: '/production/scan', icon: 'ScanLine', i18nKey: 'nav.scan' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
};

// Grouped navigation for Sidebar — strict operational workflow order:
// Sales → Projects → Production → Stock → Finance → Installation → RH → System
//
// STABILIZATION MODE: All roles use the same full sidebar.
// Role-based filtering is disabled until full system validation is complete.
// To restore per-role views, replace FULL_SIDEBAR references with role-specific arrays.

const FULL_SIDEBAR: NavGroup[] = [
  { label: '', items: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
  ]},
  { label: 'Sales', i18nKey: 'nav.group_sales', items: [
    { label: 'Leads', href: '/leads', icon: 'Users', i18nKey: 'nav.leads' },
    { label: 'Cuisines', href: '/kitchen', icon: 'ChefHat', i18nKey: 'nav.kitchen' },
    { label: 'Marketing', href: '/marketing', icon: 'Megaphone', i18nKey: 'nav.marketing' },
    { label: 'Surveys', href: '/surveys', icon: 'Star', i18nKey: 'nav.surveys' },
  ]},
  { label: 'Projects', i18nKey: 'nav.group_projects', items: [
    { label: 'Projects', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
    { label: 'Exceptions', href: '/projects/exceptions', icon: 'ShieldAlert', i18nKey: 'nav.exceptions' },
    { label: 'Calendar', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
    { label: 'Catalogue Modules', href: '/catalog/modules', icon: 'Layers', i18nKey: 'nav.catalog_modules' },
  ]},
  { label: 'Production', i18nKey: 'nav.group_production', items: [
    { label: 'Production', href: '/production', icon: 'Factory', i18nKey: 'nav.production' },
    { label: 'Intelligence Usine', href: '/factory/intelligence', icon: 'BarChart3', i18nKey: 'nav.factory_intelligence' },
    { label: 'Maintenance', href: '/production/maintenance', icon: 'Wrench', i18nKey: 'nav.maintenance' },
  ]},
  { label: 'Stock', i18nKey: 'nav.group_stock', items: [
    { label: 'Stock', href: '/stock', icon: 'Package', i18nKey: 'nav.stock' },
    { label: 'Suppliers', href: '/suppliers', icon: 'Truck', i18nKey: 'nav.suppliers' },
    { label: 'Purchase Orders', href: '/purchase-orders', icon: 'ShoppingCart', i18nKey: 'nav.purchase_orders' },
  ]},
  { label: 'Finance', i18nKey: 'nav.group_finance', items: [
    { label: 'Finance', href: '/finance/money-hub', icon: 'Wallet', i18nKey: 'nav.finance' },
    { label: 'Invoices', href: '/invoices', icon: 'FileText', i18nKey: 'nav.invoices' },
    { label: 'Reports', href: '/finance/reports', icon: 'PieChart', i18nKey: 'nav.reports' },
  ]},
  { label: 'Installation', i18nKey: 'nav.group_installation', items: [
    { label: 'Installation', href: '/installation', icon: 'Wrench', i18nKey: 'nav.installation' },
  ]},
  { label: 'RH', i18nKey: 'nav.group_rh', items: [
    { label: 'HR', href: '/hr', icon: 'UserCheck', i18nKey: 'nav.hr' },
    { label: 'Leaves', href: '/hr/leaves', icon: 'CalendarOff', i18nKey: 'nav.leaves' },
    { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },
    { label: 'Rapports Temps', href: '/hr/work-time', icon: 'BarChart2', i18nKey: 'nav.work_time_reports' },
  ]},
  { label: 'System', i18nKey: 'nav.group_system', items: [
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ]},
];

export const NAV_GROUPS: Record<UserRole, NavGroup[]> = {
  ceo: FULL_SIDEBAR,
  commercial_manager: FULL_SIDEBAR,
  designer: FULL_SIDEBAR,
  workshop_manager: FULL_SIDEBAR,
  workshop_worker: FULL_SIDEBAR,
  installer: FULL_SIDEBAR,
  hr_manager: FULL_SIDEBAR,
  community_manager: FULL_SIDEBAR,
  owner_admin: FULL_SIDEBAR,
  operations_manager: FULL_SIDEBAR,
  logistics: FULL_SIDEBAR,
  worker: FULL_SIDEBAR,
};
