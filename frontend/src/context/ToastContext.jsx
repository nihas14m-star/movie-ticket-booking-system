import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/**
 * Toast notifications.
 *
 * Used for everything the user should notice but that does not deserve a modal:
 * seat conflicts, payment results, admin save confirmations.
 */
const ToastContext = createContext(null);

const ICONS = { success: '✅', error: '⚠️', info: 'ℹ️' };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    ({ title, body, tone = 'info', duration = 5200 }) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((current) => [...current, { id, title, body, tone }]);
      window.setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ pushToast, dismiss }), [pushToast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            <span aria-hidden="true">{ICONS[toast.tone] ?? ICONS.info}</span>
            <div className="grow">
              {toast.title ? <div className="toast-title">{toast.title}</div> : null}
              {toast.body ? <div className="toast-body">{toast.body}</div> : null}
            </div>
            <button
              type="button"
              className="dim small"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

export default ToastContext;
