import type { UserRole } from '@/types/database';

// ============================================================
// Role Display Names & Colors
// ============================================================
export const ROLE_LABELS: Record<UserRole, string> = {
  // Original roles
  ceo:               'CEO / Admin',
  commercial_manager:'Commercial Manager',
  designer:          'Interior Designer',
  workshop_manager:  'Workshop Manager',
  workshop_worker:   'Workshop Worker',
  installer:         'Installation Team',
  hr_manager:        'HR Manager',
  community_manager: 'Community Manager',
  // New roles
  owner_admin:        'Owner / Admin',
  operations_manager: 'Operations Manager',
  logistics:          'Logistics',
  worker:             'Workshop Worker',
};

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
    { label: 'Projects', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
    { label: 'Production', href: '/production', icon: 'Factory', i18nKey: 'nav.production' },
    { label: 'Production Sheets', href: '/production/sheets', icon: 'FileText', i18nKey: 'nav.production_sheets' },
    { label: 'Module Library', href: '/production/library', icon: 'BookOpen', i18nKey: 'nav.module_library' },
    { label: 'Catalogue Modules', href: '/catalog/modules', icon: 'Layers', i18nKey: 'nav.catalog_modules' },
    { label: 'Documents', href: '/documents', icon: 'FileText', i18nKey: 'nav.documents' },
    { label: 'Finance', href: '/finance/money-hub', icon: 'Wallet', i18nKey: 'nav.finance' },
    { label: 'Reports', href: '/finance/reports', icon: 'PieChart', i18nKey: 'nav.reports' },
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
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  commercial_manager: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    { label: 'Leads', href: '/leads', icon: 'Users', i18nKey: 'nav.leads' },
    { label: 'Projects', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
    { label: 'Quotes', href: '/quotes', icon: 'FileText', i18nKey: 'nav.quotes' },
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

// Grouped navigation for Sidebar (better visual hierarchy)
export const NAV_GROUPS: Record<UserRole, NavGroup[]> = {
  ceo: [
    { label: '', items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    ]},
    { label: 'CRM', i18nKey: 'nav.group_crm', items: [
      { label: 'Leads', href: '/leads', icon: 'Users', i18nKey: 'nav.leads' },
      { label: 'Projects', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
      { label: 'Calendar', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
    ]},
    { label: 'Factory', i18nKey: 'nav.group_factory', items: [
      { label: 'Production', href: '/production', icon: 'Factory', i18nKey: 'nav.production' },
      { label: 'Installation', href: '/installation', icon: 'Wrench', i18nKey: 'nav.installation' },
      { label: 'Maintenance', href: '/production/maintenance', icon: 'Wrench', i18nKey: 'nav.maintenance' },
    ]},
    { label: 'Inventory', i18nKey: 'nav.group_inventory', items: [
      { label: 'Stock', href: '/stock', icon: 'Package', i18nKey: 'nav.stock' },

      { label: 'Suppliers', href: '/suppliers', icon: 'Truck', i18nKey: 'nav.suppliers' },
      { label: 'Purchase Orders', href: '/purchase-orders', icon: 'ShoppingCart', i18nKey: 'nav.purchase_orders' },
    ]},
    { label: 'Finance', i18nKey: 'nav.group_finance', items: [
      { label: 'Finance', href: '/finance/money-hub', icon: 'Wallet', i18nKey: 'nav.finance' },
      { label: 'Reports', href: '/finance/reports', icon: 'PieChart', i18nKey: 'nav.reports' },
    ]},
    { label: 'Manufacturing', i18nKey: 'nav.group_manufacturing', items: [
      { label: 'Catalogue Modules', href: '/catalog/modules', icon: 'Layers', i18nKey: 'nav.catalog_modules' },
      { label: 'Intelligence Usine', href: '/factory/intelligence', icon: 'BarChart3', i18nKey: 'nav.factory_intelligence' },
    ]},
    { label: 'Organization', i18nKey: 'nav.group_org', items: [
      { label: 'HR', href: '/hr', icon: 'UserCheck', i18nKey: 'nav.hr' },
      { label: 'Leaves', href: '/hr/leaves', icon: 'CalendarOff', i18nKey: 'nav.leaves' },
      { label: 'Marketing', href: '/marketing', icon: 'Megaphone', i18nKey: 'nav.marketing' },
      { label: 'Surveys', href: '/surveys', icon: 'Star', i18nKey: 'nav.surveys' },
      { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },
      { label: 'Rapports Temps', href: '/hr/work-time', icon: 'BarChart2', i18nKey: 'nav.work_time_reports' },
    ]},
    { label: '', items: [

      { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],
  commercial_manager: [
    { label: '', items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    ]},
    { label: 'CRM', i18nKey: 'nav.group_crm', items: [
      { label: 'Leads', href: '/leads', icon: 'Users', i18nKey: 'nav.leads' },
      { label: 'Projects', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
      { label: 'Quotes', href: '/quotes', icon: 'FileText', i18nKey: 'nav.quotes' },
      { label: 'Calendar', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
    ]},
    { label: 'Manufacturing', i18nKey: 'nav.group_manufacturing', items: [
      { label: 'Intelligence Usine', href: '/factory/intelligence', icon: 'BarChart3', i18nKey: 'nav.factory_intelligence' },
    ]},
    { label: '', items: [

      { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],
  designer: [
    { label: '', items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
      { label: 'Projects', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
      { label: 'Quotes', href: '/quotes', icon: 'FileText', i18nKey: 'nav.quotes' },
      { label: 'Calendar', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
    ]},
    { label: 'Manufacturing', i18nKey: 'nav.group_manufacturing', items: [
      { label: 'Catalogue Modules', href: '/catalog/modules', icon: 'Layers', i18nKey: 'nav.catalog_modules' },
    ]},
    { label: '', items: [
      { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },

      { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],
  workshop_manager: [
    { label: '', items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    ]},
    { label: 'Factory', i18nKey: 'nav.group_factory', items: [
      { label: 'Production', href: '/production', icon: 'Factory', i18nKey: 'nav.production' },
      { label: 'Workshop TV', href: '/production/dashboard', icon: 'Monitor', i18nKey: 'nav.workshop_tv' },
    { label: 'Découpe & Chant', href: '/production/cutting', icon: 'Scissors', i18nKey: 'nav.cutting' },
      { label: 'Maintenance', href: '/production/maintenance', icon: 'Wrench', i18nKey: 'nav.maintenance' },
      { label: 'Projects', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
    ]},
    { label: 'Manufacturing', i18nKey: 'nav.group_manufacturing', items: [
      { label: 'Catalogue Modules', href: '/catalog/modules', icon: 'Layers', i18nKey: 'nav.catalog_modules' },
      { label: 'Intelligence Usine', href: '/factory/intelligence', icon: 'BarChart3', i18nKey: 'nav.factory_intelligence' },
    ]},
    { label: 'Inventory', i18nKey: 'nav.group_inventory', items: [
      { label: 'Stock', href: '/stock', icon: 'Package', i18nKey: 'nav.stock' },

      { label: 'Suppliers', href: '/suppliers', icon: 'Truck', i18nKey: 'nav.suppliers' },
      { label: 'Purchase Orders', href: '/purchase-orders', icon: 'ShoppingCart', i18nKey: 'nav.purchase_orders' },
    ]},
    { label: '', items: [
      { label: 'Calendar', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
      { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },
      { label: 'Rapports Temps', href: '/hr/work-time', icon: 'BarChart2', i18nKey: 'nav.work_time_reports' },

      { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],
  workshop_worker: [
    { label: '', items: [
      { label: 'My Tasks', href: '/production', icon: 'ClipboardList', i18nKey: 'nav.my_tasks' },
      { label: 'Scan', href: '/production/scan', icon: 'ScanLine', i18nKey: 'nav.scan' },
    { label: 'Découpe & Chant', href: '/production/cutting', icon: 'Scissors', i18nKey: 'nav.cutting' },
      { label: 'Report Issue', href: '/production/issues', icon: 'AlertTriangle', i18nKey: 'nav.report_issue' },
      { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },

      { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],
  installer: [
    { label: '', items: [
      { label: 'Schedule', href: '/installation', icon: 'Calendar', i18nKey: 'nav.schedule' },
      { label: 'Current Job', href: '/installation/current', icon: 'Wrench', i18nKey: 'nav.current_job' },
      { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },

      { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],
  hr_manager: [
    { label: '', items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    ]},
    { label: 'HR', i18nKey: 'nav.hr', items: [
      { label: 'Attendance', href: '/hr', icon: 'UserCheck', i18nKey: 'nav.attendance' },
      { label: 'Leaves', href: '/hr/leaves', icon: 'CalendarOff', i18nKey: 'nav.leaves' },
      { label: 'Calendar', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
      { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },
      { label: 'Rapports Temps', href: '/hr/work-time', icon: 'BarChart2', i18nKey: 'nav.work_time_reports' },
    ]},
    { label: '', items: [

      { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],
  community_manager: [
    { label: '', items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
      { label: 'Leads', href: '/leads', icon: 'Users', i18nKey: 'nav.leads' },
      { label: 'Marketing', href: '/marketing', icon: 'Megaphone', i18nKey: 'nav.marketing' },

      { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],

  // ─── owner_admin: full access ────────────────────────────────
  owner_admin: [
    { label: '', items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    ]},
    { label: 'CRM', i18nKey: 'nav.group_crm', items: [
      { label: 'Leads', href: '/leads', icon: 'Users', i18nKey: 'nav.leads' },
      { label: 'Projects', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
      { label: 'Calendar', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
    ]},
    { label: 'Factory', i18nKey: 'nav.group_factory', items: [
      { label: 'Production', href: '/production', icon: 'Factory', i18nKey: 'nav.production' },
      { label: 'Installation', href: '/installation', icon: 'Wrench', i18nKey: 'nav.installation' },
      { label: 'Maintenance', href: '/production/maintenance', icon: 'Wrench', i18nKey: 'nav.maintenance' },
    ]},
    { label: 'Inventory', i18nKey: 'nav.group_inventory', items: [
      { label: 'Stock', href: '/stock', icon: 'Package', i18nKey: 'nav.stock' },

      { label: 'Suppliers', href: '/suppliers', icon: 'Truck', i18nKey: 'nav.suppliers' },
      { label: 'Purchase Orders', href: '/purchase-orders', icon: 'ShoppingCart', i18nKey: 'nav.purchase_orders' },
    ]},
    { label: 'Finance', i18nKey: 'nav.group_finance', items: [
      { label: 'Finance', href: '/finance/money-hub', icon: 'Wallet', i18nKey: 'nav.finance' },
      { label: 'Reports', href: '/finance/reports', icon: 'PieChart', i18nKey: 'nav.reports' },
    ]},
    { label: 'Manufacturing', i18nKey: 'nav.group_manufacturing', items: [
      { label: 'Catalogue Modules', href: '/catalog/modules', icon: 'Layers', i18nKey: 'nav.catalog_modules' },
      { label: 'Intelligence Usine', href: '/factory/intelligence', icon: 'BarChart3', i18nKey: 'nav.factory_intelligence' },
    ]},
    { label: 'Organization', i18nKey: 'nav.group_org', items: [
      { label: 'HR', href: '/hr', icon: 'UserCheck', i18nKey: 'nav.hr' },
      { label: 'Leaves', href: '/hr/leaves', icon: 'CalendarOff', i18nKey: 'nav.leaves' },
      { label: 'Marketing', href: '/marketing', icon: 'Megaphone', i18nKey: 'nav.marketing' },
      { label: 'Surveys', href: '/surveys', icon: 'Star', i18nKey: 'nav.surveys' },
      { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },
      { label: 'Rapports Temps', href: '/hr/work-time', icon: 'BarChart2', i18nKey: 'nav.work_time_reports' },
    ]},
    { label: '', items: [

      { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],

  // ─── operations_manager: Nadia — CRM+Ops+HR (no Finance) ─────
  operations_manager: [
    { label: '', items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    ]},
    { label: 'CRM', i18nKey: 'nav.group_crm', items: [
      { label: 'Leads', href: '/leads', icon: 'Users', i18nKey: 'nav.leads' },
      { label: 'Projects', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
      { label: 'Calendar', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
    ]},
    { label: 'Factory', i18nKey: 'nav.group_factory', items: [
      { label: 'Installation', href: '/installation', icon: 'Wrench', i18nKey: 'nav.installation' },
    ]},
    { label: 'Inventory', i18nKey: 'nav.group_inventory', items: [
      { label: 'Stock', href: '/stock', icon: 'Package', i18nKey: 'nav.stock' },
      { label: 'Suppliers', href: '/suppliers', icon: 'Truck', i18nKey: 'nav.suppliers' },
      { label: 'Purchase Orders', href: '/purchase-orders', icon: 'ShoppingCart', i18nKey: 'nav.purchase_orders' },
    ]},
    { label: 'HR', i18nKey: 'nav.hr', items: [
      { label: 'Attendance', href: '/hr', icon: 'UserCheck', i18nKey: 'nav.attendance' },
      { label: 'Leaves', href: '/hr/leaves', icon: 'CalendarOff', i18nKey: 'nav.leaves' },
      { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },
      { label: 'Rapports Temps', href: '/hr/work-time', icon: 'BarChart2', i18nKey: 'nav.work_time_reports' },
    ]},
    { label: '', items: [

      { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],

  // ─── logistics: Jamal — deliveries only ──────────────────────
  logistics: [
    { label: '', items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
      { label: 'Installation', href: '/installation', icon: 'Truck', i18nKey: 'nav.installation' },
      { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },

      { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],

  // ─── worker: generic workshop worker ─────────────────────────
  worker: [
    { label: '', items: [
      { label: 'My Tasks', href: '/production', icon: 'ClipboardList', i18nKey: 'nav.my_tasks' },
      { label: 'Scan', href: '/production/scan', icon: 'ScanLine', i18nKey: 'nav.scan' },
      { label: 'Découpe & Chant', href: '/production/cutting', icon: 'Scissors', i18nKey: 'nav.cutting' },
      { label: 'Report Issue', href: '/production/issues', icon: 'AlertTriangle', i18nKey: 'nav.report_issue' },
      { label: 'Leaves', href: '/hr/leaves', icon: 'CalendarOff', i18nKey: 'nav.leaves' },
      { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },

      { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],
};

// ============================================================
// Pipeline stages
// ============================================================
export const LEAD_STAGES = [
  { key: 'new', label: 'New', color: 'bg-blue-500' },
  { key: 'contacted', label: 'Contacted', color: 'bg-yellow-500' },
  { key: 'visit_scheduled', label: 'Visit Scheduled', color: 'bg-purple-500' },
  { key: 'quote_sent', label: 'Quote Sent', color: 'bg-orange-500' },
  { key: 'won', label: 'Won', color: 'bg-green-500' },
  { key: 'lost', label: 'Lost', color: 'bg-red-500' },
] as const;

export const PROJECT_STAGES = [
  { key: 'measurements', label: 'Measurements', color: 'bg-blue-500' },
  { key: 'design', label: 'Design', color: 'bg-purple-500' },
  { key: 'client_validation', label: 'Validation', color: 'bg-yellow-500' },
  { key: 'production', label: 'Production', color: 'bg-orange-500' },
  { key: 'installation', label: 'Installation', color: 'bg-indigo-500' },
  { key: 'delivered', label: 'Delivered', color: 'bg-green-500' },
] as const;

export const PRODUCTION_STATIONS = [
  { key: 'pending', label: 'Pending', color: 'bg-gray-400' },
  { key: 'saw', label: 'SAW', color: 'bg-red-500' },
  { key: 'cnc', label: 'CNC', color: 'bg-orange-500' },
  { key: 'edge', label: 'EDGE', color: 'bg-yellow-500' },
  { key: 'assembly', label: 'ASSEMBLY', color: 'bg-blue-500' },
  { key: 'qc', label: 'QC', color: 'bg-purple-500' },
  { key: 'packing', label: 'PACKING', color: 'bg-green-500' },
] as const;

export const LEAD_SOURCES = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'google', label: 'Google' },
  { key: 'architect', label: 'Architect' },
  { key: 'referral', label: 'Referral' },
  { key: 'walk_in', label: 'Walk-in' },
  { key: 'website', label: 'Website' },
  { key: 'other', label: 'Other' },
] as const;

export const EXPENSE_CATEGORIES = [
  { group: 'Recurring', items: [
    { key: 'rent', label: 'Rent' },
    { key: 'internet', label: 'Internet' },
    { key: 'phones', label: 'Phones' },
    { key: 'insurance', label: 'Insurance' },
    { key: 'software', label: 'Software' },
    { key: 'subscriptions', label: 'Subscriptions' },
    { key: 'utilities', label: 'Utilities' },
  ]},
  { group: 'Operational', items: [
    { key: 'fuel', label: 'Fuel' },
    { key: 'transport', label: 'Transport' },
    { key: 'maintenance', label: 'Maintenance' },
    { key: 'tools', label: 'Tools' },
    { key: 'spare_parts', label: 'Spare Parts' },
    { key: 'consumables', label: 'Consumables' },
    { key: 'raw_materials', label: 'Raw Materials' },
  ]},
  { group: 'Other', items: [
    { key: 'salary', label: 'Salary' },
    { key: 'bonus', label: 'Bonus' },
    { key: 'tax', label: 'Tax' },
    { key: 'other', label: 'Other' },
  ]},
] as const;

// ============================================================
// Leave Types
// ============================================================
export const LEAVE_TYPES = [
  { key: 'vacation', label: 'Vacation', color: 'bg-blue-500' },
  { key: 'sick', label: 'Sick Leave', color: 'bg-red-500' },
  { key: 'personal', label: 'Personal', color: 'bg-purple-500' },
  { key: 'maternity', label: 'Maternity', color: 'bg-pink-500' },
  { key: 'unpaid', label: 'Unpaid', color: 'bg-gray-500' },
  { key: 'other', label: 'Other', color: 'bg-gray-400' },
] as const;

// ============================================================
// Employee Document Types
// ============================================================
export const EMPLOYEE_DOCUMENT_TYPES = [
  { key: 'contract', label: 'Employment Contract' },
  { key: 'cin', label: 'CIN (National ID)' },
  { key: 'cnss', label: 'CNSS Card' },
  { key: 'certificate', label: 'Certificate' },
  { key: 'diploma', label: 'Diploma' },
  { key: 'work_permit', label: 'Work Permit' },
  { key: 'medical', label: 'Medical Certificate' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'other', label: 'Other' },
] as const;

// ============================================================
// Production Issue Types
// ============================================================
export const PRODUCTION_ISSUE_TYPES = [
  { key: 'missing_material', label: 'Missing Material' },
  { key: 'wrong_dimension', label: 'Wrong Dimension' },
  { key: 'machine_problem', label: 'Machine Problem' },
  { key: 'client_change', label: 'Client Change' },
  { key: 'quality_defect', label: 'Quality Defect' },
  { key: 'other', label: 'Other' },
] as const;

export const ISSUE_SEVERITIES = [
  { key: 'low', label: 'Low', color: 'bg-blue-500' },
  { key: 'medium', label: 'Medium', color: 'bg-yellow-500' },
  { key: 'high', label: 'High', color: 'bg-orange-500' },
  { key: 'critical', label: 'Critical', color: 'bg-red-500' },
] as const;

// ============================================================
// Cabinet Types
// ============================================================
export const CABINET_TYPES = [
  { key: 'base_cabinet', label: 'Base Cabinet' },
  { key: 'wall_cabinet', label: 'Wall Cabinet' },
  { key: 'tall_cabinet', label: 'Tall Cabinet' },
  { key: 'drawer_unit', label: 'Drawer Unit' },
  { key: 'wardrobe', label: 'Wardrobe' },
  { key: 'shelf_unit', label: 'Shelf Unit' },
  { key: 'corner_cabinet', label: 'Corner Cabinet' },
  { key: 'other', label: 'Other' },
] as const;

export const MATERIAL_OPTIONS = [
  { key: 'melamine_white', label: 'Melamine White' },
  { key: 'melamine_oak', label: 'Melamine Oak' },
  { key: 'melamine_walnut', label: 'Melamine Walnut' },
  { key: 'melamine_anthracite', label: 'Melamine Anthracite' },
  { key: 'mdf_raw', label: 'MDF Raw' },
  { key: 'mdf_lacquered', label: 'MDF Lacquered' },
  { key: 'plywood', label: 'Plywood' },
  { key: 'solid_wood', label: 'Solid Wood' },
  { key: 'hpl', label: 'HPL' },
  { key: 'other', label: 'Other' },
] as const;

export const EDGE_BAND_OPTIONS = [
  { key: '0.4mm_pvc', label: '0.4mm PVC' },
  { key: '1mm_pvc', label: '1mm PVC' },
  { key: '2mm_pvc', label: '2mm PVC' },
  { key: '2mm_abs', label: '2mm ABS' },
  { key: '45mm_solid', label: '45mm Solid Edge' },
  { key: 'none', label: 'None' },
] as const;

export const COST_TYPES = [
  { key: 'material', label: 'Material' },
  { key: 'labor', label: 'Labor' },
  { key: 'transport', label: 'Transport' },
  { key: 'installation', label: 'Installation' },
  { key: 'subcontract', label: 'Subcontract' },
  { key: 'overhead', label: 'Overhead' },
  { key: 'other', label: 'Other' },
] as const;

// ============================================================
// Payment rules
// ============================================================
export const PAYMENT_RULES = {
  deposit_percent: 50,
  pre_installation_percent: 40,
  final_percent: 10,
} as const;

// ============================================================
// Page-level Role Access Control
// ============================================================
export const PAGE_ROLES: Record<string, UserRole[]> = {
  '/dashboard': ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker', 'installer', 'hr_manager', 'community_manager', 'owner_admin', 'operations_manager', 'logistics', 'worker'],
  '/leads': ['ceo', 'commercial_manager', 'community_manager', 'owner_admin', 'operations_manager'],
  '/projects': ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'owner_admin', 'operations_manager'],
  '/production': ['ceo', 'workshop_manager', 'workshop_worker', 'owner_admin', 'worker'],
  '/production/scan': ['ceo', 'workshop_manager', 'workshop_worker', 'owner_admin', 'worker'],
  '/production/issues': ['ceo', 'workshop_manager', 'workshop_worker', 'owner_admin', 'worker'],
  '/production/maintenance': ['ceo', 'workshop_manager', 'owner_admin'],
  '/production/dashboard': ['ceo', 'workshop_manager', 'owner_admin'],
  '/production/sheets': ['ceo', 'commercial_manager', 'workshop_manager', 'designer', 'owner_admin', 'operations_manager'],
  '/production/library': ['ceo', 'workshop_manager', 'designer', 'owner_admin'],
  '/production/station': ['ceo', 'workshop_manager', 'workshop_worker', 'owner_admin', 'worker'],
  '/documents': ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker', 'installer', 'owner_admin', 'operations_manager', 'logistics', 'worker'],
  '/documents/scanner': ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker', 'installer', 'owner_admin', 'operations_manager', 'logistics', 'worker'],
  '/production/tracking': ['ceo', 'workshop_manager', 'workshop_worker', 'owner_admin', 'worker'],
  '/production/cutting': ['ceo', 'workshop_manager', 'workshop_worker', 'owner_admin', 'worker'],
  '/installation': ['ceo', 'commercial_manager', 'installer', 'owner_admin', 'operations_manager', 'logistics'],
  '/stock': ['ceo', 'workshop_manager', 'owner_admin', 'operations_manager'],
  '/stock/reservations': ['ceo', 'workshop_manager', 'owner_admin', 'operations_manager'],
  '/stock/alerts': ['ceo', 'workshop_manager', 'owner_admin', 'operations_manager'],
  '/stock/import': ['ceo', 'workshop_manager', 'owner_admin', 'operations_manager'],
  '/suppliers': ['ceo', 'workshop_manager', 'owner_admin', 'operations_manager'],
  '/purchase-orders': ['ceo', 'workshop_manager', 'owner_admin', 'operations_manager'],
  '/finance': ['ceo', 'commercial_manager', 'owner_admin'],
  '/finance/reports': ['ceo', 'commercial_manager', 'owner_admin'],
  '/factory/intelligence': ['ceo', 'commercial_manager', 'workshop_manager', 'owner_admin', 'operations_manager'],
  '/projects/[id]/workflow': ['ceo', 'workshop_manager', 'workshop_worker'],
  '/projects/[id]/cutting-list': ['ceo', 'workshop_manager', 'workshop_worker'],
  '/projects/[id]/bom': ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker'],
  '/projects/[id]/modules': ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker'],
  '/catalog/modules': ['ceo', 'designer', 'workshop_manager', 'owner_admin', 'operations_manager'],
  '/hr/leaves': ['ceo', 'hr_manager', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker', 'installer', 'community_manager', 'owner_admin', 'operations_manager', 'worker', 'logistics'],
  '/hr': ['ceo', 'hr_manager', 'owner_admin', 'operations_manager'],
  '/marketing': ['ceo', 'community_manager'],
  '/surveys': ['ceo', 'commercial_manager'],
  '/calendar': ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'installer', 'hr_manager', 'owner_admin', 'operations_manager', 'logistics'],
  '/settings': ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker', 'installer', 'hr_manager', 'community_manager', 'owner_admin', 'operations_manager', 'logistics', 'worker'],
  '/quotes': ['ceo', 'commercial_manager', 'designer', 'owner_admin', 'operations_manager'],
  '/work-time':    ['workshop_worker','worker','installer','designer','operations_manager','workshop_manager','logistics','ceo','owner_admin','hr_manager'],
  '/hr/work-time': ['workshop_manager','operations_manager','hr_manager','ceo','owner_admin'],

};

// ============================================================
// Production Station Colors
// ============================================================
export const STATION_COLORS: Record<string, string> = {
  pending: '#9CA3AF',
  saw: '#3B82F6',
  cnc: '#8B5CF6',
  edge: '#F97316',
  assembly: '#22C55E',
  qc: '#EAB308',
  packing: '#14B8A6',
};

export const STATION_ORDER = ['pending', 'saw', 'cnc', 'edge', 'assembly', 'qc', 'packing'] as const;
