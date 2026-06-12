import { createContext, useCallback, useContext, useState, ReactNode } from 'react';

type ToastKind = 'success' | 'error';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi>({ success: () => {}, error: () => {} });

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const api: ToastApi = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-in flex items-start gap-2.5 rounded-lg px-4 py-3 text-[13px] text-ink bg-navy-800 border shadow-modal ${
              t.kind === 'success' ? 'border-emerald-500/30' : 'border-red-500/30'
            }`}
          >
            <span
              className={`mt-[5px] w-1.5 h-1.5 rounded-full shrink-0 ${
                t.kind === 'success' ? 'bg-emerald-400' : 'bg-red-400'
              }`}
            />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
