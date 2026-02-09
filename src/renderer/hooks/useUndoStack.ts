import { useState, useCallback } from 'react';

interface UndoAction {
  description: string;
  undo: () => Promise<void>;
}

const MAX_STACK_SIZE = 20;

export function useUndoStack() {
  const [stack, setStack] = useState<UndoAction[]>([]);

  const push = useCallback((action: UndoAction) => {
    setStack((prev) => [...prev.slice(-(MAX_STACK_SIZE - 1)), action]);
  }, []);

  const undo = useCallback(async () => {
    const last = stack[stack.length - 1];
    if (!last) return;
    setStack((prev) => prev.slice(0, -1));
    await last.undo();
  }, [stack]);

  const canUndo = stack.length > 0;
  const lastAction = stack.length > 0 ? stack[stack.length - 1] : null;

  return { push, undo, canUndo, lastAction };
}
