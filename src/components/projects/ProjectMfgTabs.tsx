'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { Layers, ClipboardList, Scissors, CheckSquare, Box, ChefHat, Ruler } from 'lucide-react';

interface Props {
  projectId: string;
}

/**
 * ProjectMfgTabs — Manufacturing Intelligence tab strip
 * Renders role-gated navigation tabs for manufacturing sub-pages.
 * Cutting List tab dynamically routes to SAW or CNC based on project.cutting_method.
 */
export default function ProjectMfgTabs({ projectId }: Props) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const role = profile?.role ?? '';
  const [cuttingMethod, setCuttingMethod] = useState<'saw' | 'cnc'>('saw');

  useEffect(() => {
    import('@/lib/supabase/client').then(({ createClient }) => {
      createClient().from('projects').select('cutting_method').eq('id', projectId).single()
        .then(({ data }) => {
          if (data?.cutting_method) setCuttingMethod(data.cutting_method as 'saw' | 'cnc');
        });
    });
  }, [projectId]);

  const TABS = [
    {
      label: 'Kitchen',
      href: `/projects/${projectId}/kitchen-config`,
      Icon: ChefHat,
      roles: ['ceo', 'commercial_manager', 'designer'],
    },
    {
      label: 'Parts',
      href: `/projects/${projectId}/parts`,
      Icon: Box,
      roles: ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker'],
    },
    {
      label: 'Modules',
      href: `/projects/${projectId}/modules`,
      Icon: Layers,
      roles: ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker'],
    },
    {
      label: 'BOM',
      href: `/projects/${projectId}/bom`,
      Icon: ClipboardList,
      roles: ['ceo', 'commercial_manager', 'designer', 'workshop_manager', 'workshop_worker'],
    },
    {
      label: cuttingMethod === 'saw' ? 'SAW Cutting' : 'Cutting List',
      href: cuttingMethod === 'saw'
        ? `/saw/cutting-list/${projectId}`
        : `/projects/${projectId}/cutting-list`,
      Icon: cuttingMethod === 'saw' ? Ruler : Scissors,
      roles: ['ceo', 'workshop_manager', 'workshop_worker'],
    },
    {
      label: 'Workflow',
      href: `/projects/${projectId}/workflow`,
      Icon: CheckSquare,
      roles: ['ceo', 'workshop_manager', 'workshop_worker'],
    },
  ];

  const visibleTabs = TABS.filter((t) => t.roles.includes(role));
  if (visibleTabs.length === 0) return null;

  return (
    <nav
      className="flex overflow-x-auto scrollbar-none bg-white border-t border-gray-100"
      aria-label="Manufacturing tabs"
    >
      {visibleTabs.map(({ label, href, Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
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
