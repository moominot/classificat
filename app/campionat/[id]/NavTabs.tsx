'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useCanManage } from '@/components/ViewerContext';
import { CONFIG_LINKS } from './ConfigSidebar';

/** Contingut que es consulta sovint: sempre a dalt, a totes les mides. */
const CONTENT_TABS = [
  { key: 'jugadors', label: 'Jugadors' },
  { key: 'rondes', label: 'Rondes' },
  { key: 'classificacio', label: 'Classificació' },
];

export default function NavTabs({ id }: { id: string }) {
  const pathname = usePathname();
  const canManage = useCanManage();
  // Al mòbil no hi ha panell lateral: la configuració s'afegeix a la mateixa
  // barra, que ja llisca. A partir de `lg` es pot amagar, perquè viu al
  // ConfigSidebar (vegeu campionat/[id]/layout.tsx).
  const tabs = canManage ? [...CONTENT_TABS, ...CONFIG_LINKS] : CONTENT_TABS;
  const configKeys = new Set(CONFIG_LINKS.map((l) => l.key));

  return (
    <nav className="sticky top-12 z-10 bg-bg flex gap-6 border-b border-border overflow-x-auto">
      {tabs.map((tab) => {
        const href = `/campionat/${id}/${tab.key}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={tab.key}
            href={href}
            className={`
              py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
              ${configKeys.has(tab.key) ? 'lg:hidden' : ''}
              ${active ? 'border-accent text-ink font-semibold' : 'border-transparent text-ink-3 hover:text-ink-2'}
            `}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
