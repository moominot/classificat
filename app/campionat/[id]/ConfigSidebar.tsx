'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

/** Seccions de configuració: es toquen un cop i prou, no cal que ocupin la barra de dalt a l'escriptori. */
export const CONFIG_LINKS = [
  { key: 'etiquetes', label: 'Etiquetes' },
  { key: 'fases', label: 'Fases' },
  { key: 'preguntes', label: 'Preguntes' },
  { key: 'barruf', label: 'BARRUF' },
];

export default function ConfigSidebar({ id }: { id: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:block w-44 flex-shrink-0 sticky top-16 self-start">
      <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide px-2.5 mb-2">Configuració</p>
      <nav className="space-y-0.5">
        {CONFIG_LINKS.map((link) => {
          const href = `/campionat/${id}/${link.key}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={link.key}
              href={href}
              className={`block px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                active ? 'bg-accent-tint text-accent-ink font-medium' : 'text-ink-2 hover:bg-surface-2'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
