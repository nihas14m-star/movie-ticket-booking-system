import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useDebouncedValue } from '../hooks/useAsync.js';

/**
 * Search box with two modes.
 *
 *  Browse — classic keyword search, with a live suggestion dropdown fed by
 *           GET /api/movies?search=
 *  Ask AI — sends the sentence to POST /api/ai/search, which translates it into
 *           structured filters and answers from MySQL. Suggestions are disabled
 *           in this mode because the request is a full sentence, not a prefix.
 */
export default function SearchBar({ value, onChange, onSubmit, aiMode, onAiModeChange, busy = false }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const debounced = useDebouncedValue(value, 300);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (aiMode || debounced.trim().length < 2) {
      setSuggestions([]);
      return undefined;
    }
    const controller = new AbortController();
    api
      .movies({ search: debounced.trim(), limit: 6 }, { signal: controller.signal })
      .then((result) => {
        setSuggestions(result.data ?? []);
        setOpen(true);
        setHighlight(-1);
      })
      .catch(() => setSuggestions([]));
    return () => controller.abort();
  }, [debounced, aiMode]);

  // Close the dropdown when clicking anywhere else.
  useEffect(() => {
    const onClick = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const submit = (event) => {
    event?.preventDefault();
    setOpen(false);
    onSubmit?.(value);
  };

  const onKeyDown = (event) => {
    if (!open || !suggestions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((current) => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === 'Enter' && highlight >= 0) {
      event.preventDefault();
      setOpen(false);
      navigate(`/movies/${suggestions[highlight].slug}`);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="home-search" ref={containerRef}>
      <form className="search-shell" onSubmit={submit} role="search">
        <span aria-hidden="true" className="dim">{aiMode ? '✨' : '🔍'}</span>
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => value.trim().length >= 2 && !aiMode && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={
            aiMode
              ? 'Describe what you feel like watching… e.g. "something funny under 2 hours"'
              : 'Search movies, actors or languages…'
          }
          aria-label={aiMode ? 'Describe what you want to watch' : 'Search movies'}
        />

        <button
          type="button"
          className={`chip ${aiMode ? 'is-active' : ''}`}
          onClick={() => onAiModeChange(!aiMode)}
          aria-pressed={aiMode}
          title="Let AI turn a sentence into a search"
        >
          ✨ Ask AI
        </button>

        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !value.trim()}>
          {busy ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
          {busy ? 'Searching' : 'Search'}
        </button>
      </form>

      {open && suggestions.length ? (
        <div className="search-suggest" role="listbox">
          {suggestions.map((movie, index) => (
            <Link
              key={movie.id}
              to={`/movies/${movie.slug}`}
              className="search-suggest-item"
              role="option"
              aria-selected={index === highlight}
              style={index === highlight ? { background: 'rgba(255,255,255,.06)' } : undefined}
              onClick={() => setOpen(false)}
            >
              <img src={movie.posterUrl} alt="" loading="lazy" />
              <span className="grow" style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 650, fontSize: '.9rem' }}>{movie.title}</span>
                <span className="tiny dim">
                  {(movie.genres ?? []).map((genre) => genre.name).join(' · ')} · {movie.language}
                </span>
              </span>
              <span className="tiny" style={{ color: 'var(--warning)' }}>★ {Number(movie.rating).toFixed(1)}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
