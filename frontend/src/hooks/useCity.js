import { useSyncExternalStore } from 'react';

/**
 * Selected city, shared by the whole app without a provider.
 *
 * Implemented with useSyncExternalStore so the navbar selector and any page that
 * cares re-render together, while the choice survives reloads in localStorage.
 */
const STORAGE_KEY = 'cineverse.city';
const listeners = new Set();

function read() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

let current = typeof window === 'undefined' ? '' : read();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setCity(next) {
  current = next ?? '';
  try {
    if (current) window.localStorage.setItem(STORAGE_KEY, current);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — keep it in memory */
  }
  listeners.forEach((listener) => listener());
}

export function useCity() {
  const city = useSyncExternalStore(subscribe, () => current, () => '');
  return [city, setCity];
}

export default useCity;
