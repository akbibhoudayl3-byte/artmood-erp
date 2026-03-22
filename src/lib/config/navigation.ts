import type { UserRole } from '@/types/database';

// ============================================================
// Navigation per role — Workflow-driven sidebar
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

// Flat list for BottomNav (mobile)
export const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  ceo: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    { label: 'Projects', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
    { label: 'Production', href: '/production', icon: 'Factory', i18nKey: 'nav.production' },
    { label: 'Stock', href: '/stock', icon: 'Package', i18nKey: 'nav.stock' },
    { label: 'Finance', href: '/finance/money-hub', icon: 'Wallet', i18nKey: 'nav.finance' },
  ],
  commercial_manager: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    { label: 'Leads', href: '/leads', icon: 'Users', i18nKey: 'nav.leads' },
    { label: 'Projects', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
    { label: 'Quotes', href: '/quotes', icon: 'FileText', i18nKey: 'nav.quotes' },
    { label: 'Calendar', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
  ],
  designer: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    { label: 'Projects', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
    { label: 'Quotes', href: '/quotes', icon: 'FileText', i18nKey: 'nav.quotes' },
    { label: 'Catalogue', href: '/catalog/modules', icon: 'Layers', i18nKey: 'nav.catalog_modules' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  workshop_manager: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    { label: 'Production', href: '/production', icon: 'Factory', i18nKey: 'nav.production' },
    { label: 'SAW', href: '/saw/cutting-list', icon: 'Ruler', i18nKey: 'nav.saw_cutting' },
    { label: 'Stock', href: '/stock', icon: 'Package', i18nKey: 'nav.stock' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  workshop_worker: [
    { label: 'My Tasks', href: '/production/my-tasks', icon: 'ClipboardCheck', i18nKey: 'nav.my_assigned_tasks' },
    { label: 'Task Board', href: '/production/tasks', icon: 'ListTodo', i18nKey: 'nav.task_board' },
    { label: 'Scan', href: '/production/scan', icon: 'ScanLine', i18nKey: 'nav.scan' },
    { label: 'SAW', href: '/saw/cutting-list', icon: 'Ruler', i18nKey: 'nav.saw_cutting' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  installer: [
    { label: 'Planning', href: '/installation', icon: 'Calendar', i18nKey: 'nav.schedule' },
    { label: 'Current Job', href: '/installation/current', icon: 'Wrench', i18nKey: 'nav.current_job' },
    { label: 'SAV', href: '/sav', icon: 'Headset', i18nKey: 'nav.sav' },
    { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  hr_manager: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    { label: 'Employés', href: '/hr', icon: 'UserCheck', i18nKey: 'nav.attendance' },
    { label: 'Congés', href: '/hr/leaves', icon: 'CalendarOff', i18nKey: 'nav.leaves' },
    { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  community_manager: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    { label: 'Leads', href: '/leads', icon: 'Users', i18nKey: 'nav.leads' },
    { label: 'Marketing', href: '/marketing', icon: 'Megaphone', i18nKey: 'nav.marketing' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  owner_admin: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    { label: 'Projects', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
    { label: 'Production', href: '/production', icon: 'Factory', i18nKey: 'nav.production' },
    { label: 'Finance', href: '/finance/money-hub', icon: 'Wallet', i18nKey: 'nav.finance' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  operations_manager: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    { label: 'Projects', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
    { label: 'Installation', href: '/installation', icon: 'Wrench', i18nKey: 'nav.installation' },
    { label: 'Stock', href: '/stock', icon: 'Package', i18nKey: 'nav.stock' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  logistics: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    { label: 'Installation', href: '/installation', icon: 'Truck', i18nKey: 'nav.installation' },
    { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
  worker: [
    { label: 'My Tasks', href: '/production/my-tasks', icon: 'ClipboardCheck', i18nKey: 'nav.my_assigned_tasks' },
    { label: 'Scan', href: '/production/scan', icon: 'ScanLine', i18nKey: 'nav.scan' },
    { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },
    { label: 'Settings', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
  ],
};

// ============================================================
// Grouped navigation for Sidebar — workflow-driven
// ============================================================
export const NAV_GROUPS: Record<UserRole, NavGroup[]> = {
  // ═══════════════════════════════════════════════════════════
  // CEO — Full access, workflow-driven
  // ═══════════════════════════════════════════════════════════
  ceo: [
    { label: '', items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    ]},
    { label: 'CRM', i18nKey: 'nav.group_crm', items: [
      { label: 'Prospects', href: '/leads', icon: 'Users', i18nKey: 'nav.leads' },
      { label: 'Projets', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
      { label: 'Devis', href: '/quotes', icon: 'FileText', i18nKey: 'nav.quotes' },
      { label: '+ Cuisine', href: '/quotes/kitchen-wizard', icon: 'ChefHat', i18nKey: 'nav.kitchen_wizard' },
      { label: 'Calendrier', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
    ]},
    { label: 'Production', i18nKey: 'nav.group_factory', items: [
      { label: 'Ordres', href: '/production', icon: 'Factory', i18nKey: 'nav.production' },
    ]},
    { label: 'Découpe', i18nKey: 'nav.group_cutting', items: [
      { label: 'Scie Panneaux', href: '/saw/cutting-list', icon: 'Ruler', i18nKey: 'nav.saw_cutting' },
      { label: 'CNC', href: '/cutting/jobs', icon: 'Scissors', i18nKey: 'nav.cutting_cnc' },
    ]},
    { label: 'Installation', i18nKey: 'nav.group_installation', items: [
      { label: 'Planning', href: '/installation', icon: 'Wrench', i18nKey: 'nav.installation' },
      { label: 'SAV', href: '/sav', icon: 'Headset', i18nKey: 'nav.sav' },
    ]},
    { label: 'Stock', i18nKey: 'nav.group_inventory', items: [
      { label: 'Matériaux', href: '/stock', icon: 'Package', i18nKey: 'nav.stock' },
      { label: 'Fournisseurs', href: '/suppliers', icon: 'Truck', i18nKey: 'nav.suppliers' },
    ]},
    { label: 'Finance', i18nKey: 'nav.group_finance', items: [
      { label: 'Trésorerie', href: '/finance/money-hub', icon: 'Wallet', i18nKey: 'nav.finance' },
      { label: 'Factures', href: '/finance/invoices', icon: 'FileText', i18nKey: 'nav.invoices' },
      { label: 'Paiements', href: '/finance/payments', icon: 'CreditCard', i18nKey: 'nav.payments' },
      { label: 'Dépenses', href: '/finance/expenses', icon: 'Receipt', i18nKey: 'nav.expenses' },
      { label: 'Rapports', href: '/finance/reports', icon: 'PieChart', i18nKey: 'nav.reports' },
    ]},
    { label: 'RH', i18nKey: 'nav.group_org', items: [
      { label: 'Employés', href: '/hr', icon: 'UserCheck', i18nKey: 'nav.hr' },
      { label: 'Congés', href: '/hr/leaves', icon: 'CalendarOff', i18nKey: 'nav.leaves' },
      { label: 'Pointage', href: '/hr/work-time', icon: 'Clock', i18nKey: 'nav.work_time_reports' },
    ]},
    { label: '', items: [
      { label: 'Paramètres', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],

  // ═══════════════════════════════════════════════════════════
  // COMMERCIAL MANAGER — CRM + Quotes + SAV
  // ═══════════════════════════════════════════════════════════
  commercial_manager: [
    { label: '', items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    ]},
    { label: 'CRM', i18nKey: 'nav.group_crm', items: [
      { label: 'Prospects', href: '/leads', icon: 'Users', i18nKey: 'nav.leads' },
      { label: 'Projets', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
      { label: 'Devis', href: '/quotes', icon: 'FileText', i18nKey: 'nav.quotes' },
      { label: '+ Cuisine', href: '/quotes/kitchen-wizard', icon: 'ChefHat', i18nKey: 'nav.kitchen_wizard' },
      { label: 'Calendrier', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
    ]},
    { label: 'Suivi', i18nKey: 'nav.group_monitoring', items: [
      { label: 'Installation', href: '/installation', icon: 'Wrench', i18nKey: 'nav.installation' },
      { label: 'SAV', href: '/sav', icon: 'Headset', i18nKey: 'nav.sav' },
    ]},
    { label: 'Finance', i18nKey: 'nav.group_finance', items: [
      { label: 'Factures', href: '/finance/invoices', icon: 'FileText', i18nKey: 'nav.invoices' },
      { label: 'Paiements', href: '/finance/payments', icon: 'CreditCard', i18nKey: 'nav.payments' },
      { label: 'Rapports', href: '/finance/reports', icon: 'PieChart', i18nKey: 'nav.reports' },
    ]},
    { label: '', items: [
      { label: 'Paramètres', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],

  // ═══════════════════════════════════════════════════════════
  // DESIGNER — Projects + Quotes + Catalogue
  // ═══════════════════════════════════════════════════════════
  designer: [
    { label: '', items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    ]},
    { label: 'Design', i18nKey: 'nav.group_design', items: [
      { label: 'Projets', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
      { label: 'Devis', href: '/quotes', icon: 'FileText', i18nKey: 'nav.quotes' },
      { label: 'Catalogue', href: '/catalog/modules', icon: 'Layers', i18nKey: 'nav.catalog_modules' },
      { label: 'Calendrier', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
    ]},
    { label: '', items: [
      { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },
      { label: 'Paramètres', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],

  // ═══════════════════════════════════════════════════════════
  // WORKSHOP MANAGER — Production + Cutting + Stock
  // ═══════════════════════════════════════════════════════════
  workshop_manager: [
    { label: '', items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    ]},
    { label: 'Production', i18nKey: 'nav.group_factory', items: [
      { label: 'Ordres', href: '/production', icon: 'Factory', i18nKey: 'nav.production' },
      { label: 'Projets', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
    ]},
    { label: 'Découpe', i18nKey: 'nav.group_cutting', items: [
      { label: 'Scie Panneaux', href: '/saw/cutting-list', icon: 'Ruler', i18nKey: 'nav.saw_cutting' },
      { label: 'CNC', href: '/cutting/jobs', icon: 'Scissors', i18nKey: 'nav.cutting_cnc' },
    ]},
    { label: 'Stock', i18nKey: 'nav.group_inventory', items: [
      { label: 'Matériaux', href: '/stock', icon: 'Package', i18nKey: 'nav.stock' },
      { label: 'Fournisseurs', href: '/suppliers', icon: 'Truck', i18nKey: 'nav.suppliers' },
    ]},
    { label: '', items: [
      { label: 'SAV', href: '/sav', icon: 'Headset', i18nKey: 'nav.sav' },
      { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },
      { label: 'Paramètres', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],

  // ═══════════════════════════════════════════════════════════
  // WORKSHOP WORKER — Tasks + Cutting only
  // ═══════════════════════════════════════════════════════════
  workshop_worker: [
    { label: '', items: [
      { label: 'Mes Tâches', href: '/production/my-tasks', icon: 'ClipboardCheck', i18nKey: 'nav.my_assigned_tasks' },
      { label: 'Tableau Tâches', href: '/production/tasks', icon: 'ListTodo', i18nKey: 'nav.task_board' },
      { label: 'Scanner', href: '/production/scan', icon: 'ScanLine', i18nKey: 'nav.scan' },
      { label: 'Scie Panneaux', href: '/saw/cutting-list', icon: 'Ruler', i18nKey: 'nav.saw_cutting' },
      { label: 'Signaler', href: '/production/issues', icon: 'AlertTriangle', i18nKey: 'nav.report_issue' },
      { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },
      { label: 'Paramètres', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],

  // ═══════════════════════════════════════════════════════════
  // INSTALLER
  // ═══════════════════════════════════════════════════════════
  installer: [
    { label: '', items: [
      { label: 'Planning', href: '/installation', icon: 'Calendar', i18nKey: 'nav.schedule' },
      { label: 'Chantier actuel', href: '/installation/current', icon: 'Wrench', i18nKey: 'nav.current_job' },
      { label: 'SAV', href: '/sav', icon: 'Headset', i18nKey: 'nav.sav' },
      { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },
      { label: 'Paramètres', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],

  // ═══════════════════════════════════════════════════════════
  // HR MANAGER
  // ═══════════════════════════════════════════════════════════
  hr_manager: [
    { label: '', items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    ]},
    { label: 'RH', i18nKey: 'nav.hr', items: [
      { label: 'Employés', href: '/hr', icon: 'UserCheck', i18nKey: 'nav.attendance' },
      { label: 'Congés', href: '/hr/leaves', icon: 'CalendarOff', i18nKey: 'nav.leaves' },
      { label: 'Pointage', href: '/hr/work-time', icon: 'Clock', i18nKey: 'nav.work_time_reports' },
      { label: 'Calendrier', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
    ]},
    { label: '', items: [
      { label: 'Paramètres', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],

  // ═══════════════════════════════════════════════════════════
  // COMMUNITY MANAGER
  // ═══════════════════════════════════════════════════════════
  community_manager: [
    { label: '', items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
      { label: 'Prospects', href: '/leads', icon: 'Users', i18nKey: 'nav.leads' },
      { label: 'Marketing', href: '/marketing', icon: 'Megaphone', i18nKey: 'nav.marketing' },
      { label: 'Paramètres', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],

  // ═══════════════════════════════════════════════════════════
  // OWNER ADMIN — Same as CEO
  // ═══════════════════════════════════════════════════════════
  owner_admin: [
    { label: '', items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    ]},
    { label: 'CRM', i18nKey: 'nav.group_crm', items: [
      { label: 'Prospects', href: '/leads', icon: 'Users', i18nKey: 'nav.leads' },
      { label: 'Projets', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
      { label: 'Devis', href: '/quotes', icon: 'FileText', i18nKey: 'nav.quotes' },
    ]},
    { label: 'Production', i18nKey: 'nav.group_factory', items: [
      { label: 'Ordres', href: '/production', icon: 'Factory', i18nKey: 'nav.production' },
      { label: 'SAV', href: '/sav', icon: 'Headset', i18nKey: 'nav.sav' },
    ]},
    { label: 'Stock', i18nKey: 'nav.group_inventory', items: [
      { label: 'Matériaux', href: '/stock', icon: 'Package', i18nKey: 'nav.stock' },
      { label: 'Fournisseurs', href: '/suppliers', icon: 'Truck', i18nKey: 'nav.suppliers' },
    ]},
    { label: 'Finance', i18nKey: 'nav.group_finance', items: [
      { label: 'Trésorerie', href: '/finance/money-hub', icon: 'Wallet', i18nKey: 'nav.finance' },
      { label: 'Rapports', href: '/finance/reports', icon: 'PieChart', i18nKey: 'nav.reports' },
    ]},
    { label: 'RH', i18nKey: 'nav.group_org', items: [
      { label: 'Employés', href: '/hr', icon: 'UserCheck', i18nKey: 'nav.hr' },
      { label: 'Congés', href: '/hr/leaves', icon: 'CalendarOff', i18nKey: 'nav.leaves' },
    ]},
    { label: '', items: [
      { label: 'Paramètres', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],

  // ═══════════════════════════════════════════════════════════
  // OPERATIONS MANAGER
  // ═══════════════════════════════════════════════════════════
  operations_manager: [
    { label: '', items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
    ]},
    { label: 'CRM', i18nKey: 'nav.group_crm', items: [
      { label: 'Prospects', href: '/leads', icon: 'Users', i18nKey: 'nav.leads' },
      { label: 'Projets', href: '/projects', icon: 'FolderKanban', i18nKey: 'nav.projects' },
      { label: 'Calendrier', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
    ]},
    { label: 'Suivi', i18nKey: 'nav.group_monitoring', items: [
      { label: 'Installation', href: '/installation', icon: 'Wrench', i18nKey: 'nav.installation' },
      { label: 'SAV', href: '/sav', icon: 'Headset', i18nKey: 'nav.sav' },
    ]},
    { label: 'Stock', i18nKey: 'nav.group_inventory', items: [
      { label: 'Matériaux', href: '/stock', icon: 'Package', i18nKey: 'nav.stock' },
      { label: 'Fournisseurs', href: '/suppliers', icon: 'Truck', i18nKey: 'nav.suppliers' },
    ]},
    { label: 'RH', i18nKey: 'nav.hr', items: [
      { label: 'Employés', href: '/hr', icon: 'UserCheck', i18nKey: 'nav.attendance' },
      { label: 'Congés', href: '/hr/leaves', icon: 'CalendarOff', i18nKey: 'nav.leaves' },
      { label: 'Pointage', href: '/hr/work-time', icon: 'Clock', i18nKey: 'nav.work_time_reports' },
    ]},
    { label: '', items: [
      { label: 'Paramètres', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],

  // ═══════════════════════════════════════════════════════════
  // LOGISTICS
  // ═══════════════════════════════════════════════════════════
  logistics: [
    { label: '', items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', i18nKey: 'nav.dashboard' },
      { label: 'Livraisons', href: '/installation', icon: 'Truck', i18nKey: 'nav.installation' },
      { label: 'Calendrier', href: '/calendar', icon: 'Calendar', i18nKey: 'nav.calendar' },
      { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },
      { label: 'Paramètres', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],

  // ═══════════════════════════════════════════════════════════
  // WORKER — Minimal
  // ═══════════════════════════════════════════════════════════
  worker: [
    { label: '', items: [
      { label: 'Mes Tâches', href: '/production/my-tasks', icon: 'ClipboardCheck', i18nKey: 'nav.my_assigned_tasks' },
      { label: 'Scanner', href: '/production/scan', icon: 'ScanLine', i18nKey: 'nav.scan' },
      { label: 'Congés', href: '/hr/leaves', icon: 'CalendarOff', i18nKey: 'nav.leaves' },
      { label: 'Mon Temps', href: '/work-time', icon: 'Clock', i18nKey: 'nav.work_time' },
      { label: 'Paramètres', href: '/settings', icon: 'Settings', i18nKey: 'nav.settings' },
    ]},
  ],
};
