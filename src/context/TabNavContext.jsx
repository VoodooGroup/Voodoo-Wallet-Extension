import { createContext, useContext } from 'react';

const TabNavContext = createContext(() => {});

export function TabNavProvider({ navigate, children }) {
  return (
    <TabNavContext.Provider value={navigate}>
      {children}
    </TabNavContext.Provider>
  );
}

export function useTabNav() {
  return useContext(TabNavContext);
}