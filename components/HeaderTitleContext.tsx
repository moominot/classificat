'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react';

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
  return (
    <HeaderTitleContext.Provider value={{ title, setTitle }}>
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
  useIsomorphicLayoutEffect(() => {
    ctx?.setTitle({ name, id });
    return () => ctx?.setTitle(null);
  }, [ctx, name, id]);
  return null;
}
