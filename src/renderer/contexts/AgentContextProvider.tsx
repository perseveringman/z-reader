import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import type { AgentViewState, AgentCommonViewState, AgentPageSpecificState } from '../../shared/types';

interface AgentContextValue {
  viewState: AgentViewState;
  reportContext: (state: { common?: Partial<AgentCommonViewState>; pageState?: AgentPageSpecificState }) => void;
  getViewState: () => AgentViewState;
}

const defaultViewState: AgentViewState = {
  common: {
    currentPage: 'library-articles',
    readerMode: false,
    selectedText: null,
    timestamp: Date.now(),
  },
  pageState: { page: 'library-articles', selectedArticleId: null, listFilters: {}, visibleCount: 0 },
};

const AgentContext = createContext<AgentContextValue>({
  viewState: defaultViewState,
  reportContext: () => {},
  getViewState: () => defaultViewState,
});

export function AgentContextProvider({ children }: { children: ReactNode }) {
  const [viewState, setViewState] = useState<AgentViewState>(defaultViewState);

  const reportContext = useCallback((state: { common?: Partial<AgentCommonViewState>; pageState?: AgentPageSpecificState }) => {
    setViewState((prev) => ({
      common: {
        ...prev.common,
        ...state.common,
        timestamp: Date.now(),
      },
      pageState: state.pageState ?? prev.pageState,
    }));
  }, []);

  const getViewState = useCallback(() => viewState, [viewState]);

  const value = useMemo(
    () => ({ viewState, reportContext, getViewState }),
    [viewState, reportContext, getViewState],
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgentContext() {
  return useContext(AgentContext);
}
