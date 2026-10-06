import { Link } from 'react-router-dom';
import { formatDuration } from '../api/client.js';
import { GridSkeleton, Rating } from './ui.jsx';

/**
 * Poster card used across the home page, search results and AI recommendations.
 * The whole card is one link, the hover state reveals a Book action.
 */
export default function MovieCard({ movie, showBookAction = true }) {
  const upcoming = movie.status === 'upcoming';
  return (
    <article className="movie-card">
      <Link to={`/movies/${movie.slug}`} aria-label={`${movie.title} — view details`}>
        <div className="movie-poster">
          <div className="movie-poster-badges">
            <span className="movie-rating-pill">
              {movie.rating ? (
                <>
                  <span className="star" aria-hidden="true">★</span>
                  <span className="num">{Number(movie.rating).toFixed(1)}</span>
                </>
              ) : (
                <span className="dim">NEW</span>
              )}
            </span>
            {upcoming ? (
              <span className="movie-rating-pill" style={{ color: '#d9cffd' }}>COMING SOON</span>
            ) : (
              <span className="movie-rating-pill">{movie.certificate}</span>
            )}
          </div>
          <img
            src={movie.posterUrl}
            alt={`${movie.title} poster`}
            loading="lazy"
            width="400"
            height="600"
            onError={(event) => {
              // Never show a broken image: fall back to a generated gradient tile.
              event.currentTarget.style.display = 'none';
            }}
          />
          {showBookAction ? (
            <div className="movie-card-overlay">
              <span
                className={`btn ${upcoming ? 'btn-outline' : 'btn-primary'} btn-sm`}
                style={{ pointerEvents: 'none' }}
              >
                {upcoming ? 'View details' : 'Book tickets'}
              </span>
            </div>
          ) : null}
        </div>

        <div className="movie-card-body">
          <h3 className="movie-card-title">{movie.title}</h3>
          <div className="movie-card-genres">
            {(movie.genres ?? []).slice(0, 3).map((genre) => (
              <span key={genre.slug ?? genre.name} className="genre-tag">{genre.name}</span>
            ))}
          </div>
          <div className="movie-card-foot">
            <span>{movie.durationLabel ?? formatDuration(movie.durationMinutes)}</span>
            <span>{movie.language}</span>
          </div>
          {!upcoming && movie.upcomingShowCount ? (
            <span className="tiny" style={{ color: 'var(--success)' }}>
              {movie.upcomingShowCount} upcoming shows
            </span>
          ) : null}
        </div>
      </Link>
    </article>
  );
}

/** The 2-4 line summary used inside AI recommendation results. */
export function MovieMiniCard({ movie, reason }) {
  return (
    <Link to={`/movies/${movie.slug}`} className="ai-result-card">
      <img src={movie.posterUrl} alt="" width="62" height="93" loading="lazy" />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row between gap-8">
          <strong style={{ fontSize: '0.94rem' }}>{movie.title}</strong>
          <Rating value={movie.rating} />
        </div>
        <div className="tiny dim" style={{ margin: '4px 0 6px' }}>
          {(movie.genres ?? []).map((genre) => genre.name).join(' · ')} · {formatDuration(movie.durationMinutes)}
        </div>
        {reason ? (
          <p className="small muted" style={{ lineHeight: 1.5 }}>{reason}</p>
        ) : (
          <p className="small muted" style={{ lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {movie.synopsis}
          </p>
        )}
        <span className="tiny" style={{ color: 'var(--accent-2)', display: 'inline-block', marginTop: 6 }}>
          View showtimes →
        </span>
      </div>
    </Link>
  );
}

export function MovieGrid({ movies, loading, skeletonCount = 8, emptyMessage }) {
  if (loading) return <GridSkeleton count={skeletonCount} />;
  if (!movies?.length) {
    return (
      <div className="empty">
        <div className="empty-icon" aria-hidden="true">🍿</div>
        <h3>No movies match</h3>
        <p className="muted small" style={{ marginTop: 8 }}>
          {emptyMessage ?? 'Try clearing the search box or picking a different genre.'}
        </p>
      </div>
    );
  }
  return (
    <div className="movie-grid">
      {movies.map((movie) => (
        <MovieCard key={movie.id} movie={movie} />
      ))}
    </div>
  );
}
