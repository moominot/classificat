'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useIsDirector } from '@/components/DirectorContext';

const tabs = [
  { key: 'jugadors',       label: 'Jugadors' },
  { key: 'grups',          label: 'Grups' },
  { key: 'fases',          label: 'Fases' },
  { key: 'rondes',         label: 'Rondes' },
  { key: 'classificacio',  label: 'Classificació' },
];

const DIRECTOR_TABS = [
  { key: 'preguntes', label: 'Preguntes' },
];

export default function NavTabs({ id, name }: { id: string; name: string }) {
  const pathname = usePathname();
  const isDirector = useIsDirector();
  const allTabs = isDirector ? [...tabs, ...DIRECTOR_TABS] : tabs;

  return (
    <div>
      <h1 className="font-display text-xl font-bold text-ink mb-3">{name}</h1>
      <nav className="flex gap-6 border-b border-border overflow-x-auto">
        {allTabs.map((tab) => {
          const href = `/campionat/${id}/${tab.key}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={tab.key}
              href={href}
              className={`
                py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
                ${active
                  ? 'border-accent text-ink font-semibold'
                  : 'border-transparent text-ink-3 hover:text-ink-2'
                }
              `}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
