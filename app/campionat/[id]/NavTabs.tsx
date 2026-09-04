'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const tabs = [
  { key: 'jugadors',       label: 'Jugadors' },
  { key: 'grups',          label: 'Grups' },
  { key: 'fases',          label: 'Fases' },
  { key: 'rondes',         label: 'Rondes' },
  { key: 'classificacio',  label: 'Classificació' },
];

export default function NavTabs({ id, name }: { id: string; name: string }) {
  const pathname = usePathname();

  return (
    <div>
      <h1 className="font-display text-xl font-bold text-ink mb-3">{name}</h1>
      <nav className="flex gap-6 border-b border-border overflow-x-auto">
        {tabs.map((tab) => {
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
