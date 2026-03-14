'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { Layers, ClipboardList, Scissors, CheckSquare } from 'lucide-react';

interface Props {
  projectId: string;
}

/**
 * ProjectMfgTabs — Manufacturing Intelligence tab strip
 * Renders role-gated navigation tabs for the 4 manufacturing sub-pages.
 * Include this component in any project sub-page to give users
 * in-context navigation without going back to the project overview.
 *
 * Role visibility:
 *   Modules      → ceo, commercial_manager, designer, workshop_manager, workshop_worker
 *   BOM          → ceo, commercial_manager, designer, workshop_manager, workshop_worker
 *   Cutting List → ceo, workshop_manager, workshop_worker
 *   Workflow     → ceo, workshop_manager, workshop_worker
 */
const TABS = [
  {
    label: 'Modules',
    href: (pid: string) => `/projects/${pid}/modules`,
    Icon: Layers,
    roles: ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker'],
  },
  {
    label: 'BOM',
    href: (pid: string) => `/projects/${pid}/bom`,
    Icon: ClipboardList,
    roles: ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker'],
  },
  {
    label: 'Cutting List',
    href: (pid: string) => `/projects/${pid}/cutting-list`,
    Icon: Scissors,
    roles: ['ceo', 'workshop_manager', 'workshop_worker'],
  },
  {
    label: 'Workflow',
    href: (pid: string) => `/projects/${pid}/workflow`,
    Icon: CheckSquare,
    roles: ['ceo', 'workshop_manager', 'workshop_worker'],
  },
];

export default function ProjectMfgTabs({ projectId }: Props) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const role = profile?.role ?? '';

  const visibleTabs = TABS.filter((t) => t.roles.includes(role));
  if (visibleTabs.length === 0) return null;

  return (
    <nav
      className="flex overflow-x-auto scrollbar-none bg-white border-t border-gray-100"
      aria-label="Manufacturing tabs"
    >
      {visibleTabs.map(({ label, href, Icon }) => {
        const tabHref = href(projectId);
        const isActive = pathname === tabHref || pathname.startsWith(tabHref + '/');
        return (
          <Link
            key={tabHref}
            href={tabHref}
            className={[
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap',
              'border-b-2 transition-colors flex-shrink-0',
              isActive
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',
            ].join(' ')}
          >
            <Icon size={14} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
