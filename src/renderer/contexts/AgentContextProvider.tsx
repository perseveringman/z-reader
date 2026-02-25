import { createContext, useContext, useState, useCallback, useRef, useMemo, type ReactNode } from 'react';
import type { AgentViewState, AgentCommonViewState, AgentPageSpecificState } from '../../shared/types';

type NavigateHandler = (targetType: string, targetId: string) => void;

interface AgentContextValue {
  viewState: AgentViewState;
  reportContext: (state: { common?: Partial<AgentCommonViewState>; pageState?: AgentPageSpecificState }) => void;
  getViewState: () => AgentViewState;
  /** 触发导航（AgentDrawer 等组件调用） */
  navigate: (targetType: string, targetId: string) => void;
  /** 注册导航处理器（App.tsx 调用） */
  registerNavigator: (handler: NavigateHandler) => void;
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
  navigate: () => {},
  registerNavigator: () => {},
});

export function AgentContextProvider({ children }: { children: ReactNode }) {
  const [viewState, setViewState] = useState<AgentViewState>(defaultViewState);
  const navigatorRef = useRef<NavigateHandler | null>(null);

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

  const navigate = useCallback((targetType: string, targetId: string) => {
    navigatorRef.current?.(targetType, targetId);
  }, []);

  const registerNavigator = useCallback((handler: NavigateHandler) => {
    navigatorRef.current = handler;
  }, []);

  const value = useMemo(
    () => ({ viewState, reportContext, getViewState, navigate, registerNavigator }),
    [viewState, reportContext, getViewState, navigate, registerNavigator],
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgentContext() {
  return useContext(AgentContext);
}
