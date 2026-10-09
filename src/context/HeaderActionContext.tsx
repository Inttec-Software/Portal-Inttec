import React, { createContext, useContext, useState, ReactNode } from 'react';

interface HeaderActionContextType {
  headerRight: ReactNode | null;
  setHeaderRight: (action: ReactNode | null) => void;
}

const HeaderActionContext = createContext<HeaderActionContextType>({
  headerRight: null,
  setHeaderRight: () => {},
});

export const HeaderActionProvider = ({ children }: { children: ReactNode }) => {
  const [headerRight, setHeaderRight] = useState<ReactNode | null>(null);

  return (
    <HeaderActionContext.Provider value={{ headerRight, setHeaderRight }}>
      {children}
    </HeaderActionContext.Provider>
  );
};

export const useHeaderAction = () => useContext(HeaderActionContext);
