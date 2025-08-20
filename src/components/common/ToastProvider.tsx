import React, { createContext, useContext, useMemo, useRef, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  timeoutId?: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  clearToastsByKeyword: (keyword: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const removeToast = (id: string) => {
    const toastElement = containerRef.current?.querySelector(`[data-toast-id="${id}"]`);
    if (toastElement) {
      toastElement.classList.add('removing');
      setTimeout(() => {
        setToasts((prev) => {
          const t = prev.find((x) => x.id === id);
          if (t?.timeoutId) clearTimeout(t.timeoutId);
          return prev.filter((x) => x.id !== id);
        });
      }, 300);
    } else {
      setToasts((prev) => {
        const t = prev.find((x) => x.id === id);
        if (t?.timeoutId) clearTimeout(t.timeoutId);
        return prev.filter((x) => x.id !== id);
      });
    }
  };

  const showToast = (message: string, type: ToastType = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    setToasts((prev) => {
      // cap at 5 items; drop oldest (and clear its timeout)
      let next = prev;
      if (prev.length >= 5) {
        const oldest = prev[0];
        if (oldest.timeoutId) clearTimeout(oldest.timeoutId);
        next = prev.slice(1);
      }
      const timeoutId = window.setTimeout(() => removeToast(id), 3000);
      return [...next, { id, message, type, timeoutId }];
    });
  };

  const clearToastsByKeyword = (keyword: string) => {
    setToasts((prev) => {
      prev.forEach((t) => {
        if (t.message.includes(keyword) && t.timeoutId) clearTimeout(t.timeoutId);
      });
      return prev.filter((t) => !t.message.includes(keyword));
    });
  };

  const value = useMemo(() => ({ showToast, clearToastsByKeyword }), []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts-container" ref={containerRef}>
        {toasts.map((toast, index) => (
          <div
            key={toast.id}
            data-toast-id={toast.id}
            className={`toast toast-${toast.type}`}
            style={{ '--toast-index': index } as React.CSSProperties}
            onClick={() => removeToast(toast.id)}
          >
            <span className="toast-icon">
              {toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}
            </span>
            <span className="toast-message">{toast.message}</span>
            <span className="toast-close">×</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
