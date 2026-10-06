import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAsync, useDebouncedValue } from '../hooks/useAsync.js';
import { useCity } from '../hooks/useCity.js';
import HeroCarousel from '../components/HeroCarousel.jsx';
import SearchBar from '../components/SearchBar.jsx';
import AiRecommendStrip from '../components/AiRecommendStrip.jsx';
import { MovieGrid } from '../components/MovieCard.jsx';
import { ErrorState, Loading } from '../components/ui.jsx';

const SORTS = [
  { value: 'popular', label: 'Most popular' },
  { value: 'rating', label: 'Top rated' },
  { value: 'newest', label: 'Newest' },
  { value: 'title', label: 'A–Z' },
];

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') === 'upcoming' ? 'upcoming' : 'now_showing';

  const [city] = useCity();
  const [term, setTerm] = useState('');
  const [aiMode, setAiMode] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [genre, setGenre] = useState('');
  const [sort, setSort] = useState('popular');

  const debouncedTerm = useDebouncedValue(term, 380);

  const featured = useAsync((signal) => api.featuredMovies(5, { signal }), []);
  const genres = useAsync((signal) => api.genres({ signal }), []);

  const catalogue = useAsync(
    (signal) =>
      api.movies(
        {
          status: view,
          search: aiResult ? '' : debouncedTerm.trim() || undefined,
          genre: genre || undefined,
          city: city || undefined,
          sort,
          limit: 24,
        },
        { signal },
      ),
    [view, debouncedTerm, genre, city, sort, aiResult],
  );

  const upcoming = useAsync((signal) => api.movies({ status: 'upcoming', limit: 8 }, { signal }), []);

  // Switching section clears anything that belongs to the previous one.
  useEffect(() => {
    setAiResult(null);
    setAiError(null);
  }, [view]);

  const runAiSearch = async (text) => {
    const trimmed = text.trim();
    if (trimmed.length < 2) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const response = await api.aiSearch({ query: trimmed, limit: 24 });
      setAiResult(response.data);
    } catch (error) {
      setAiError(error);
      setAiResult(null);
    } finally {
      setAiBusy(false);
    }
  };

  const movies = aiResult ? aiResult.movies : catalogue.data?.data ?? [];

  return (
    <div className="page">
      <HeroCarousel movies={featured.data?.data ?? []} />

      <div className="shell">
        {/* ---------------------------------------------------- search + filters */}
        <section className="section" style={{ paddingBottom: 8 }}>
          <div className="row between wrap gap-20" style={{ alignItems: 'flex-end' }}>
            <div>
              <p className="eyebrow">Find your next film</p>
              <h1 style={{ marginTop: 8 }}>
                {view === 'upcoming' ? 'Coming soon to Cineverse' : 'Now showing near you'}
              </h1>
            </div>
            <div className="row gap-8 wrap">
              <button
                type="button"
                className={`chip ${view === 'now_showing' ? 'is-active' : ''}`}
                onClick={() => setSearchParams({ view: 'now_showing' })}
              >
                Now showing
              </button>
              <button
                type="button"
                className={`chip ${view === 'upcoming' ? 'is-active' : ''}`}
                onClick={() => setSearchParams({ view: 'upcoming' })}
              >
                Coming soon
              </button>
            </div>
          </div>

          <SearchBar
            value={term}
            onChange={setTerm}
            onSubmit={(text) => (aiMode ? runAiSearch(text) : setTerm(text))}
            aiMode={aiMode}
            onAiModeChange={(next) => {
              setAiMode(next);
              setAiResult(null);
              setAiError(null);
            }}
            busy={aiBusy}
          />

          <div className="filter-bar" style={{ marginTop: 20 }}>
            <button
              type="button"
              className={`chip ${genre === '' ? 'is-active' : ''}`}
              onClick={() => setGenre('')}
            >
              All genres
            </button>
            {(genres.data?.data ?? []).map((item) => (
              <button
                key={item.slug}
                type="button"
                className={`chip ${genre === item.slug ? 'is-active' : ''}`}
                onClick={() => setGenre(item.slug === genre ? '' : item.slug)}
              >
                {item.name}
                <span className="tiny dim">{item.movieCount}</span>
              </button>
            ))}
            <span className="divider-v" />
            <select className="select" style={{ width: 'auto' }} value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort movies">
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {city ? <span className="chip is-active">📍 {city}</span> : null}
          </div>

          {aiResult ? (
            <div className={`alert ${aiResult.source === 'openrouter' ? 'alert-info' : 'alert-warn'}`} style={{ marginBottom: 18 }}>
              <span aria-hidden="true">{aiResult.source === 'openrouter' ? '✨' : 'ℹ️'}</span>
              <div className="grow">
                <div className="row between wrap gap-12">
                  <strong>
                    AI search{aiResult.model ? ` · ${aiResult.model}` : ''} · {aiResult.total} result{aiResult.total === 1 ? '' : 's'}
                  </strong>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => { setAiResult(null); setAiMode(false); }}
                  >
                    Clear
                  </button>
                </div>
                <p className="small" style={{ marginTop: 4 }}>{aiResult.explanation}</p>
                {aiResult.notice ? <p className="tiny" style={{ marginTop: 6, opacity: 0.85 }}>{aiResult.notice}</p> : null}
                <p className="tiny dim" style={{ marginTop: 6 }}>
                  Interpreted as: keyword “{aiResult.filters?.search || '—'}” · genres{' '}
                  {aiResult.filters?.genres?.length ? aiResult.filters.genres.join(', ') : 'any'} ·
                  {' '}{aiResult.filters?.maxDurationMinutes ? `under ${aiResult.filters.maxDurationMinutes} min` : 'any length'}
                </p>
              </div>
            </div>
          ) : null}

          {aiError ? (
            <div className="alert alert-error" style={{ marginBottom: 18 }}>
              <span aria-hidden="true">⚠️</span>
              <div>
                <strong>AI search is unavailable right now</strong>
                <div className="small">{aiError.message} — you can still search and book normally.</div>
              </div>
            </div>
          ) : null}

          {catalogue.error && !aiResult ? (
            <ErrorState error={catalogue.error} onRetry={catalogue.reload} />
          ) : (
            <MovieGrid
              movies={movies}
              loading={(catalogue.loading && !aiResult) || aiBusy}
              emptyMessage={
                view === 'upcoming'
                  ? 'No upcoming movies match those filters yet.'
                  : 'Try a different genre, clear the search box or switch your city.'
              }
            />
          )}
        </section>

        {/* ------------------------------------------------------- AI recommend */}
        <section className="section">
          <AiRecommendStrip />
        </section>

        {/* ---------------------------------------------------------- upcoming */}
        {view === 'now_showing' && (upcoming.data?.data?.length ?? 0) > 0 ? (
          <section className="section">
            <div className="section-head">
              <div>
                <p className="eyebrow">In cinemas soon</p>
                <h2 style={{ marginTop: 8 }}>Coming soon</h2>
                <p>Bookings open closer to the release date — set your reminder by browsing the details.</p>
              </div>
              <Link to="/?view=upcoming" className="btn btn-outline btn-sm">See all</Link>
            </div>
            <div className="upcoming-scroll">
              {upcoming.data.data.map((movie) => (
                <Link key={movie.id} to={`/movies/${movie.slug}`} className="upcoming-card">
                  <img src={movie.posterUrl} alt="" loading="lazy" />
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: '0.94rem' }}>{movie.title}</strong>
                    <div className="tiny dim" style={{ margin: '4px 0 7px' }}>
                      {(movie.genres ?? []).map((item) => item.name).join(' · ')}
                    </div>
                    <div className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {movie.synopsis}
                    </div>
                    <div className="tiny" style={{ marginTop: 8, color: 'var(--accent-2)' }}>
                      Releases {movie.releaseDate}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {featured.loading ? <Loading label="Loading featured movies…" /> : null}
      </div>
    </div>
  );
}
