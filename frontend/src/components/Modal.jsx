import { useEffect, useRef } from 'react';
import { useBodyLock, useEscape } from '../hooks/useAsync.js';

/**
 * Accessible modal dialog: Escape closes, body scroll locks, focus moves inside
 * on open and returns to the trigger on close.
 */
export default function Modal({ open, onClose, title, children, footer, width = 560 }) {
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

  useBodyLock(open);
  useEscape(onClose, open);

  useEffect(() => {
    if (!open) return undefined;
    previouslyFocused.current = document.activeElement;
    const timer = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector(
        'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }, 40);
    return () => {
      window.clearTimeout(timer);
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panelRef}
        style={{ maxWidth: width }}
      >
        <header className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="btn-icon btn btn-ghost" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}
