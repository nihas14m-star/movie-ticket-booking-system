import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDuration } from '../api/client.js';

const ROTATE_MS = 7000;

/**
 * Featured hero. Each featured movie gets a full-bleed backdrop slide, with a
 * compact rail on the right so the whole slate is reachable without scrolling.
 */
export default function HeroCarousel({ movies = [] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || movies.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % movies.length);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [movies.length, paused]);

  useEffect(() => {
    if (index >= movies.length) setIndex(0);
  }, [movies.length, index]);

  if (!movies.length) return null;
  const active = movies[Math.min(index, movies.length - 1)];

  return (
    <section
      className="hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label="Featured movies"
    >
      {movies.map((movie, position) => (
        <div key={movie.id} className={`hero-slide ${position === index ? 'is-active' : ''}`} aria-hidden={position !== index}>
          <img src={movie.backdropUrl ?? movie.posterUrl} alt="" />
        </div>
      ))}

      <div className="shell hero-body">
        <div className="hero-copy fade-up" key={active.id}>
          <div className="row gap-8 wrap">
            <span className="badge badge-live">Now showing</span>
            {active.genres?.slice(0, 3).map((genre) => (
              <span key={genre.slug} className="badge">{genre.name}</span>
            ))}
          </div>

          <h1 className="hero-title">{active.title}</h1>

          <div className="hero-meta small muted">
            <span className="rating rating-big">
              <span className="star" aria-hidden="true">★</span>
              <span className="num">{Number(active.rating).toFixed(1)}</span>
            </span>
            <span>·</span>
            <span>{formatDuration(active.durationMinutes)}</span>
            <span>·</span>
            <span>{active.language}</span>
            <span>·</span>
            <span className="badge badge-cert">{active.certificate}</span>
            {active.upcomingShowCount ? (
              <>
                <span>·</span>
                <span style={{ color: 'var(--success)' }}>{active.upcomingShowCount} shows scheduled</span>
              </>
            ) : null}
          </div>

          <p className="hero-synopsis lead">{active.synopsis}</p>

          <div className="hero-actions">
            <Link to={`/movies/${active.slug}`} className="btn btn-primary btn-lg">
              🎟️ Book tickets
            </Link>
            {active.trailerUrl ? (
              <a
                href={active.trailerUrl}
                className="btn btn-outline btn-lg"
                target="_blank"
                rel="noreferrer noopener"
              >
                ▶ Watch trailer
              </a>
            ) : null}
          </div>

          {movies.length > 1 ? (
            <div className="hero-dots">
              {movies.map((movie, position) => (
                <button
                  key={movie.id}
                  type="button"
                  className={`hero-dot ${position === index ? 'is-active' : ''}`}
                  onClick={() => setIndex(position)}
                  aria-label={`Show ${movie.title}`}
                  aria-current={position === index}
                />
              ))}
            </div>
          ) : null}
        </div>

        {movies.length > 1 ? (
          <div className="hero-rail">
            {movies.map((movie, position) => (
              <button
                key={movie.id}
                type="button"
                className={`hero-rail-item ${position === index ? 'is-active' : ''}`}
                onClick={() => setIndex(position)}
              >
                <img src={movie.posterUrl} alt="" loading="lazy" />
                <span style={{ minWidth: 0 }}>
                  <span className="small" style={{ fontWeight: 650, display: 'block' }}>
                    {movie.title}
                  </span>
                  <span className="tiny dim">
                    ★ {Number(movie.rating).toFixed(1)} · {movie.language}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
