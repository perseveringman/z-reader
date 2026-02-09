import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';

interface ToastMessage {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
  duration: number;
  visible: boolean;
}

interface ToastContextValue {
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void;
}

const noop = () => {
  return;
};
const ToastContext = createContext<ToastContextValue>({ showToast: noop });

export const useToast = () => useContext(ToastContext);

function ToastItem({ toast, onRemove }: { toast: ToastMessage; onRemove: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onRemove]);

  return (
    <div
      className="bg-[#1e1e1e] border border-white/10 rounded-lg px-4 py-2.5 shadow-lg transition-all duration-300 ease-out"
      style={{
        opacity: toast.visible ? 1 : 0,
        transform: toast.visible ? 'translateY(0)' : 'translateY(8px)',
      }}
    >
      <span className="text-sm text-gray-200">{toast.message}</span>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: false } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => {
      const next = [...prev, { id, message, type, duration: 3000, visible: false }];
      return next.slice(-3);
    });
    requestAnimationFrame(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: true } : t)));
    });
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col-reverse items-center gap-2">
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
