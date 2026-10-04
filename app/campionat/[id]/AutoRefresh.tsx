'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/** Pantalles de configuració: res hi canvia pel seu compte i refrescar-les molestaria. */
const SENSE_REFRESC = ['/fases', '/preguntes', '/etiquetes', '/barruf', '/ajustos'];

/**
 * Perquè qui gestiona la competició vegi els canvis (resultats, presències)
 * sense recarregar: refresca la pàgina cada `segons` mentre la pestanya és
 * visible. `router.refresh()` conserva l'estat dels formularis oberts.
 */
export default function AutoRefresh({ tournamentId, segons = 5 }: { tournamentId: string; segons?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const base = `/campionat/${tournamentId}`;
  const activa = !SENSE_REFRESC.some((s) => pathname.startsWith(base + s));

  useEffect(() => {
    if (!activa) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, segons * 1000);
    return () => clearInterval(timer);
  }, [activa, router, segons]);

  return null;
}
