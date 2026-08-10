'use client';

import { createContext, useContext } from 'react';

const DirectorContext = createContext(false);

export function DirectorProvider({
  children,
  isDirector,
}: {
  children: React.ReactNode;
  isDirector: boolean;
}) {
  return <DirectorContext.Provider value={isDirector}>{children}</DirectorContext.Provider>;
}

export function useIsDirector() {
  return useContext(DirectorContext);
}
