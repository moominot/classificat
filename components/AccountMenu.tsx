'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Role } from '@/db/types';

const ROLE_LABEL: Record<Role, string> = {
  superadmin: 'Superadmin',
  admin: 'Administrador',
  user: 'Jugador',
};

/**
 * Tota la informació i enllaços del compte en un sol desplegable.
 *
 * Abans "Preferències", "Usuaris", "Configuració" i el nom del compte eren
 * elements separats a la barra superior — massa coses a dalt de tot,
 * especialment al mòbil. Ara només hi ha un botó.
 */
export default function AccountMenu({ displayName, role }: { displayName: string | null; role: Role | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setOpen(false);
    router.refresh();
  }

  if (!displayName) {
    return (
      <Link href="/login" className="text-xs text-ink-3 hover:text-accent-ink transition-colors flex-shrink-0">
        Entra
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-7 h-7 rounded-full bg-accent-tint text-accent-ink font-semibold text-xs flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
        aria-label="Menú del compte"
        aria-expanded={open}
      >
        {displayName[0]?.toUpperCase()}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-surface border border-border rounded-xl shadow-lg overflow-hidden z-30">
          <div className="px-3.5 py-2.5 border-b border-border">
            <p className="text-sm font-semibold text-ink truncate">{displayName}</p>
            {role && <p className="text-xs text-ink-3">{ROLE_LABEL[role]}</p>}
          </div>
          <nav className="py-1">
            <Link href="/preferencies" onClick={() => setOpen(false)} className="block px-3.5 py-2 text-sm text-ink-2 hover:bg-surface-2 transition-colors">
              Preferències
            </Link>
            {role === 'superadmin' && (
              <>
                <Link href="/usuaris" onClick={() => setOpen(false)} className="block px-3.5 py-2 text-sm text-ink-2 hover:bg-surface-2 transition-colors">
                  Usuaris
                </Link>
                <Link href="/configuracio" onClick={() => setOpen(false)} className="block px-3.5 py-2 text-sm text-ink-2 hover:bg-surface-2 transition-colors">
                  Configuració
                </Link>
              </>
            )}
          </nav>
          <div className="border-t border-border py-1">
            <button
              onClick={handleLogout}
              className="w-full text-left px-3.5 py-2 text-sm text-loss hover:bg-loss-tint transition-colors cursor-pointer"
            >
              Surt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
