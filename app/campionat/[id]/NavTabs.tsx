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
      <h1 className="text-xl font-bold text-gray-900 mb-3">{name}</h1>
      <nav className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map((tab) => {
          const href = `/campionat/${id}/${tab.key}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={tab.key}
              href={href}
              className={`
                px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
                ${active
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
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
