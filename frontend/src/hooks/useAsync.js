import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs an async loader and tracks { data, error, loading }, ignoring results from
 * superseded calls so fast typing in a search box never flashes stale data.
 *
 * @param {Function} loader receives an AbortSignal
 * @param {Array} deps
 * @param {{ enabled?: boolean, initialData?: unknown }} options
 */
export function useAsync(loader, deps = [], { enabled = true, initialData = null } = {}) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const controllerRef = useRef(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const result = await loaderRef.current(controller.signal);
      if (!controller.signal.aborted) setData(result);
      return result;
    } catch (caught) {
      if (caught?.name === 'AbortError') return null;
      if (!controller.signal.aborted) setError(caught);
      return null;
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    run();
    return () => controllerRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  return { data, error, loading, reload: run, setData };
}

/** Debounce any rapidly changing value (search input, filters). */
export function useDebouncedValue(value, delay = 320) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Counts down to a timestamp, used for the seat-hold timer at checkout.
 * @returns {{ minutes:number, seconds:number, total:number, expired:boolean }}
 */
export function useCountdown(target) {
  const compute = useCallback(() => {
    if (!target) return 0;
    const ms = new Date(target).getTime() - Date.now();
    return Math.max(0, Math.round(ms / 1000));
  }, [target]);

  const [remaining, setRemaining] = useState(compute);

  useEffect(() => {
    setRemaining(compute());
    const timer = window.setInterval(() => setRemaining(compute()), 1000);
    return () => window.clearInterval(timer);
  }, [compute]);

  return {
    total: remaining,
    minutes: Math.floor(remaining / 60),
    seconds: remaining % 60,
    expired: remaining <= 0,
  };
}

/** Locks body scroll while a modal / drawer is open. */
export function useBodyLock(locked) {
  useEffect(() => {
    if (!locked) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}

/** Escape-to-close for overlays. */
export function useEscape(onEscape, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const handler = (event) => {
      if (event.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onEscape, active]);
}

export default useAsync;
