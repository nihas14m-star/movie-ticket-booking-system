import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatCurrency, formatDateParts, formatTime } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { useCity } from '../hooks/useCity.js';
import { Badge, ErrorState, Loading, Rating, StepBar } from '../components/ui.jsx';

/**
 * Movie details + theatre/show selection.
 *
 * Availability comes from GET /api/movies/:slug/shows, which reports
 * total/booked/available seats per screening from the database view, so the
 * number here always agrees with the seat map on the next page.
 */
export default function MovieDetailsPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [city] = useCity();
  const [date, setDate] = useState(null);

  const movie = useAsync((signal) => api.movie(slug, { signal }), [slug]);
  const showtimes = useAsync(
    (signal) => api.showtimes(slug, { date: date ?? undefined, city: city || undefined }, { signal }),
    [slug, date, city],
  );

  // Default to the first available date once the API tells us what "today" is.
  useEffect(() => {
    if (!date && showtimes.data?.data?.dates?.length) {
      setDate(showtimes.data.data.dates[0].date);
    }
  }, [date, showtimes.data]);

  if (movie.loading) return <div className="shell"><Loading label="Loading movie…" /></div>;
  if (movie.error) {
    return (
      <div className="shell page" style={{ paddingTop: 40 }}>
        <ErrorState error={movie.error} onRetry={movie.reload} />
        <div style={{ marginTop: 18 }}>
          <Link to="/" className="btn btn-outline">← Back to home</Link>
        </div>
      </div>
    );
  }

  const data = movie.data.data;
  const dates = showtimes.data?.data?.dates ?? [];
  const theatres = showtimes.data?.data?.theatres ?? [];
  const isUpcoming = data.status === 'upcoming';

  return (
    <div className="page">
      {/* ------------------------------------------------------------- header */}
      <section className="detail-hero">
        <div className="detail-backdrop">
          <img src={data.backdropUrl ?? data.posterUrl} alt="" />
        </div>

        <div className="shell">
          <nav className="breadcrumbs">
            <Link to="/">Home</Link>
            <span aria-hidden="true">›</span>
            <Link to={isUpcoming ? '/?view=upcoming' : '/?view=now_showing'}>
              {isUpcoming ? 'Coming soon' : 'Now showing'}
            </Link>
            <span aria-hidden="true">›</span>
            <span>{data.title}</span>
          </nav>

          <div className="detail-grid">
            <div className="detail-poster">
              <img src={data.posterUrl} alt={`${data.title} poster`} width="400" height="600" />
            </div>

            <div>
              <div className="row gap-8 wrap">
                <Badge tone={isUpcoming ? 'soon' : 'live'}>
                  {isUpcoming ? 'Coming soon' : 'Now showing'}
                </Badge>
                <Badge tone="cert">{data.certificate}</Badge>
                {data.isFeatured ? <Badge tone="warn">Featured</Badge> : null}
              </div>

              <h1 style={{ marginTop: 14 }}>{data.title}</h1>

              <div className="row gap-12 wrap" style={{ marginTop: 12 }}>
                <Rating value={data.rating} votes={data.voteCount} big />
                <span className="dim">·</span>
                <span className="small muted">{data.durationLabel}</span>
                <span className="dim">·</span>
                <span className="small muted">{data.language}</span>
                <span className="dim">·</span>
                <span className="small muted">
                  {(data.genres ?? []).map((genre) => genre.name).join(', ')}
                </span>
              </div>

              <p className="lead" style={{ marginTop: 16, maxWidth: '68ch' }}>{data.synopsis}</p>

              <dl className="detail-meta-grid">
                <div className="meta-tile">
                  <dt>Director</dt>
                  <dd>{data.director ?? '—'}</dd>
                </div>
                <div className="meta-tile">
                  <dt>Cast</dt>
                  <dd style={{ fontSize: '0.84rem' }}>{(data.cast ?? []).slice(0, 3).join(', ') || '—'}</dd>
                </div>
                <div className="meta-tile">
                  <dt>Released</dt>
                  <dd>{formatDateParts(data.releaseDate).full}</dd>
                </div>
                <div className="meta-tile">
                  <dt>Shows scheduled</dt>
                  <dd>{data.upcomingShowCount ?? 0}</dd>
                </div>
              </dl>

              <div className="row gap-12 wrap" style={{ marginTop: 22 }}>
                <a href="#showtimes" className="btn btn-primary btn-lg">
                  {isUpcoming ? 'View schedule' : '🎟️ Book tickets'}
                </a>
                {data.trailerUrl ? (
                  <a href={data.trailerUrl} target="_blank" rel="noreferrer noopener" className="btn btn-outline btn-lg">
                    ▶ Trailer
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- showtimes */}
      <section className="shell section" id="showtimes">
        <StepBar steps={['Choose movie', 'Theatre & show', 'Seats', 'Payment']} current={1} />

        <div className="section-head">
          <div>
            <p className="eyebrow">Step 2</p>
            <h2 style={{ marginTop: 8 }}>Pick a theatre and show time</h2>
            <p>
              Seats are held for 10 minutes once you start a booking.
              {city ? ` Showing theatres in ${city}.` : ' Showing theatres in all cities.'}
            </p>
          </div>
        </div>

        {isUpcoming && !theatres.length ? (
          <div className="alert alert-info">
            <span aria-hidden="true">ℹ️</span>
            <div>
              <strong>Bookings are not open yet</strong>
              <p className="small" style={{ marginTop: 3 }}>
                {data.title} releases on {formatDateParts(data.releaseDate).full}. Showtimes appear here as soon as the
                theatre schedule is published.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="date-strip" role="tablist" aria-label="Choose a date">
              {dates.map((item) => {
                const parts = formatDateParts(item.date);
                return (
                  <button
                    key={item.date}
                    type="button"
                    role="tab"
                    aria-selected={item.date === date}
                    className={`date-pill ${item.date === date ? 'is-active' : ''}`}
                    onClick={() => setDate(item.date)}
                  >
                    <div className="dow">{item.isToday ? 'Today' : parts.dayOfWeek}</div>
                    <div className="dom">{parts.dayOfMonth}</div>
                    <div className="mon">{parts.month}</div>
                  </button>
                );
              })}
              {!dates.length && showtimes.loading
                ? Array.from({ length: 7 }, (_, index) => (
                  <div key={index} className="skeleton" style={{ width: 74, height: 76, borderRadius: 16, flexShrink: 0 }} />
                ))
                : null}
            </div>

            <div style={{ marginTop: 22 }}>
              {showtimes.loading ? <Loading label="Loading showtimes…" /> : null}
              {showtimes.error ? <ErrorState error={showtimes.error} onRetry={showtimes.reload} /> : null}

              {!showtimes.loading && !showtimes.error && !theatres.length ? (
                <div className="empty">
                  <div className="empty-icon" aria-hidden="true">🏙️</div>
                  <h3>No shows on this date</h3>
                  <p className="muted small" style={{ marginTop: 8 }}>
                    {city
                      ? `No screenings in ${city} for this date. Try another date or switch your city.`
                      : 'Try another date — new screenings are added every week.'}
                  </p>
                </div>
              ) : null}

              {theatres.map((theatre) => (
                <article key={theatre.id} className="theatre-block">
                  <div className="theatre-head">
                    <div>
                      <h3>
                        {theatre.name}{' '}
                        <span className="tiny dim" style={{ fontWeight: 500 }}>· {theatre.city}</span>
                      </h3>
                      <p className="tiny dim" style={{ marginTop: 4 }}>{theatre.address}</p>
                      {theatre.amenities?.length ? (
                        <div className="theatre-amenities">
                          {theatre.amenities.slice(0, 5).map((amenity) => (
                            <span key={amenity} className="amenity">{amenity}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="stack gap-4" style={{ alignItems: 'flex-end' }}>
                      <Rating value={theatre.rating} />
                      <span className="tiny dim">{theatre.screens.join(', ')}</span>
                    </div>
                  </div>

                  <div className="show-grid">
                    {theatre.shows.map((show) => {
                      const soldOut = show.availableSeats === 0;
                      const low = !soldOut && show.availableSeats <= 20;
                      return (
                        <button
                          key={show.id}
                          type="button"
                          className="show-slot"
                          disabled={soldOut}
                          onClick={() => navigate(`/book/${show.id}`)}
                          title={soldOut ? 'Sold out' : `From ${formatCurrency(show.priceFrom)}`}
                        >
                          <div className="show-slot-time">{formatTime(show.startTime)}</div>
                          <div className="show-slot-sub">
                            <span>{show.screenName}</span>
                            <span>·</span>
                            <span>{show.screenType.replace('_', ' ')}</span>
                          </div>
                          <div className="show-slot-sub">
                            <span className="show-price">
                              {show.priceFrom ? formatCurrency(show.priceFrom) : '—'}
                            </span>
                            <span>·</span>
                            <span
                              className={
                                soldOut ? 'seats-left-none' : low ? 'seats-left-low' : 'seats-left-ok'
                              }
                            >
                              {soldOut ? 'Sold out' : `${show.availableSeats} seats`}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
