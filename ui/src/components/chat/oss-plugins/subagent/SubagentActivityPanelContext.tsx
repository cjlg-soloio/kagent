import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

function panelStorageKey(contextId: string, toolId: string): string {
  return `${contextId}\u0001${toolId}`;
}

interface SubagentActivityPanelContextValue {
  isPanelOpen: (contextId: string, toolId: string) => boolean;
  setPanelOpen: (contextId: string, toolId: string, open: boolean) => void;
}

const SubagentActivityPanelContext = createContext<SubagentActivityPanelContextValue | null>(null);

export function useSubagentActivityPanel(): SubagentActivityPanelContextValue {
  const ctx = useContext(SubagentActivityPanelContext);
  if (!ctx) {
    throw new Error('useSubagentActivityPanel must be used within SubagentActivityPanelProvider');
  }
  return ctx;
}

/** Persists subagent "activity" expanders across task row remounts (e.g. stream → merged task). */
export function SubagentActivityPanelProvider({
  sessionId,
  children
}: {
  sessionId: string | undefined;
  children: ReactNode;
}) {
  const [openKeys, setOpenKeys] = useState(() => new Set<string>());

  useEffect(() => {
    setOpenKeys(new Set());
  }, [sessionId]);

  const isPanelOpen = useCallback(
    (contextId: string, toolId: string) => openKeys.has(panelStorageKey(contextId, toolId)),
    [openKeys]
  );

  const setPanelOpen = useCallback((contextId: string, toolId: string, open: boolean) => {
    const k = panelStorageKey(contextId, toolId);
    setOpenKeys(prev => {
      const next = new Set(prev);
      if (open) {
        next.add(k);
      } else {
        next.delete(k);
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      isPanelOpen,
      setPanelOpen
    }),
    [isPanelOpen, setPanelOpen]
  );

  return (
    <SubagentActivityPanelContext.Provider value={value}>{children}</SubagentActivityPanelContext.Provider>
  );
}
