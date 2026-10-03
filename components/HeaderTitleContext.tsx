'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';

// `useLayoutEffect` no fa res al servidor (sense DOM); amb `useEffect` allà
// on sí que hi ha finestra, el títol es fixa abans del primer pintat del
// navegador i s'evita el parpelleig "Classificat" → nom del campionat.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface Title {
  name: string;
  id: string;
}

interface Ctx {
  title: Title | null;
  setTitle: (t: Title | null) => void;
}

const HeaderTitleContext = createContext<Ctx | null>(null);

/**
 * El nom del campionat viu a la capçalera global, no repetit a cada pàgina.
 *
 * Com que la capçalera és al layout arrel i el nom només es coneix dins de
 * `campionat/[id]/layout.tsx`, el fill l'hi passa per context en lloc de
 * repetir-lo com a títol de cada pantalla (docs/pla-rols.md §15.1).
 */
export function HeaderTitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState<Title | null>(null);
  // Memoitzat perquè `setTitle` (estable, de useState) no quedi dins d'un
  // objecte nou a cada render: si no, el canvi de referència retrigeraria
  // l'efecte de `SetHeaderTitle` que acaba de cridar-lo — bucle infinit.
  const value = useMemo(() => ({ title, setTitle }), [title]);
  return (
    <HeaderTitleContext.Provider value={value}>
      {children}
    </HeaderTitleContext.Provider>
  );
}

export function useHeaderTitle(): Title | null {
  const ctx = useContext(HeaderTitleContext);
  return ctx?.title ?? null;
}

/** Fixa el títol de la capçalera mentre aquest component estigui muntat; el treu en desmuntar-se. */
export function SetHeaderTitle({ name, id }: Title) {
  const ctx = useContext(HeaderTitleContext);
  const setTitle = ctx?.setTitle;
  // Depèn només del setter (estable) i de name/id, mai de `ctx` sencer: `ctx`
  // canvia de referència cada cop que `title` canvia, que és precisament el
  // que aquest efecte provoca — dependre'n hi tornaria a entrar en bucle.
  useIsomorphicLayoutEffect(() => {
    setTitle?.({ name, id });
    return () => setTitle?.(null);
  }, [setTitle, name, id]);
  return null;
}
