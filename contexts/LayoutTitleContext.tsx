'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type LayoutTitleContextType = {
  title: string | null;
  setTitle: (title: string | null) => void;
};

const LayoutTitleContext = createContext<LayoutTitleContextType | undefined>(undefined);

export function LayoutTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitleState] = useState<string | null>(null);
  const setTitle = useCallback((t: string | null) => setTitleState(t), []);
  return (
    <LayoutTitleContext.Provider value={{ title, setTitle }}>
      {children}
    </LayoutTitleContext.Provider>
  );
}

export function useLayoutTitle() {
  const ctx = useContext(LayoutTitleContext);
  if (ctx === undefined) throw new Error('useLayoutTitle must be used within LayoutTitleProvider');
  return ctx;
}
