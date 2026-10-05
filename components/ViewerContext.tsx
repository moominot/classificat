'use client';

import { createContext, useContext } from 'react';
import type { Role } from '@/db/types';

/**
 * Qui mira la pantalla i què hi pot fer.
 *
 * Substitueix el `DirectorContext` binari: ara hi ha tres rols i, sobretot,
 * la pregunta útil a la interfície no és "és director?" sinó "pot gestionar
 * **aquesta** competició?" (docs/pla-rols.md §7.3).
 */
export interface ViewerInfo {
  role: Role | null;
  canManage: boolean;
  displayName: string | null;
  /** La inscripció del qui mira en aquesta competició, si en té. */
  entryId: string | null;
}

const EMPTY: ViewerInfo = { role: null, canManage: false, displayName: null, entryId: null };

const ViewerContext = createContext<ViewerInfo>(EMPTY);

export function ViewerProvider({
  children,
  viewer,
}: {
  children: React.ReactNode;
  viewer: ViewerInfo;
}) {
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useViewer(): ViewerInfo {
  return useContext(ViewerContext);
}

/** Drecera per als llocs que només pregunten si pot gestionar la competició. */
export function useCanManage(): boolean {
  return useContext(ViewerContext).canManage;
}
