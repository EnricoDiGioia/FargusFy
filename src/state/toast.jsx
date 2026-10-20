import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const show = useCallback((text, opts = {}) => {
    clearTimeout(timer.current);
    setToast({ text, kind: opts.kind || 'info', id: Date.now() });
    timer.current = setTimeout(() => setToast(null), opts.ms || 2600);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-zone" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast toast--${toast.kind}`} role="status">
            {toast.text}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
