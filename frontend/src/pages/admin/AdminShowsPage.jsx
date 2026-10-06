import { useEffect, useMemo, useState } from 'react';
import { api, formatDateParts, formatTime } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useToast } from '../../context/ToastContext.jsx';
import Modal from '../../components/Modal.jsx';
import { ErrorState, Field, Loading, StatusBadge } from '../../components/ui.jsx';

const today = () => new Date().toISOString().slice(0, 10);

const emptyShow = () => ({
  movieId: '', screenId: '', showDate: today(), startTime: '18:30',
  priceMultiplier: '', language: '', status: 'scheduled',
});

export default function AdminShowsPage() {
  const { pushToast } = useToast();
  const [filters, setFilters] = useState({ movieId: '', theatreId: '', date: '' });
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const shows = useAsync(
    (signal) => api.admin.shows({
      movieId: filters.movieId || undefined,
      theatreId: filters.theatreId || undefined,
      date: filters.date || undefined,
      limit: 120,
    }, { signal }),
    [filters.movieId, filters.theatreId, filters.date],
  );
  const movies = useAsync((signal) => api.movies({ limit: 50 }, { signal }), []);
  const theatres = useAsync((signal) => api.theatres({ signal }), []);

  useEffect(() => setFormError(null), [form]);

  const screenOptions = useMemo(() => {
    const list = [];
    for (const theatre of theatres.data?.data ?? []) {
      for (const screen of theatre.screens ?? []) {
        list.push({ id: screen.id, label: `${theatre.name} — ${screen.name} (${String(screen.screenType).replace('_', ' ')})` });
      }
    }
    return list;
  }, [theatres.data]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    const payload = {
      movieId: Number(form.movieId),
      screenId: Number(form.screenId),
      showDate: form.showDate,
      startTime: form.startTime.length === 5 ? `${form.startTime}:00` : form.startTime,
      language: form.language?.trim() || undefined,
      priceMultiplier: form.priceMultiplier === '' ? undefined : Number(form.priceMultiplier),
      status: form.status,
    };
    try {
      if (form.id) await api.admin.updateShow(form.id, payload);
      else await api.admin.createShow(payload);
      pushToast({
        tone: 'success',
        title: form.id ? 'Show updated' : 'Show scheduled',
        body: `${formatDateParts(payload.showDate).full} · ${formatTime(payload.startTime)}`,
      });
      setForm(null);
      shows.reload();
    } catch (error) {
      setFormError(error);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (show) => {
    if (!window.confirm(`Delete the ${formatTime(show.start_time)} show of ${show.movie_title}?`)) return;
    try {
      await api.admin.deleteShow(show.id);
      pushToast({ tone: 'success', title: 'Show deleted' });
      shows.reload();
    } catch (error) {
      pushToast({ tone: 'error', title: 'Cannot delete this show', body: error.message });
    }
  };

  const cancelShow = async (show) => {
    if (!window.confirm('Cancel this screening? Seats stop being bookable immediately.')) return;
    try {
      await api.admin.updateShow(show.id, { status: 'cancelled' });
      pushToast({ tone: 'success', title: 'Show cancelled' });
      shows.reload();
    } catch (error) {
      pushToast({ tone: 'error', title: 'Cannot cancel', body: error.message });
    }
  };

  return (
    <div className="stack gap-18">
      <div className="row between wrap gap-12">
        <div>
          <p className="eyebrow">Scheduling</p>
          <h1 style={{ marginTop: 6 }}>Shows</h1>
          <p className="muted small">
            Overlaps on the same screen are rejected by the API — the database also enforces a unique
            (screen, date, start time) key.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setForm(emptyShow())}>+ Schedule show</button>
      </div>

      <div className="toolbar">
        <select className="select grow" value={filters.movieId} onChange={(event) => setFilters({ ...filters, movieId: event.target.value })} aria-label="Filter by movie">
          <option value="">All movies</option>
          {(movies.data?.data ?? []).map((movie) => (
            <option key={movie.id} value={movie.id}>{movie.title}</option>
          ))}
        </select>
        <select className="select grow" value={filters.theatreId} onChange={(event) => setFilters({ ...filters, theatreId: event.target.value })} aria-label="Filter by theatre">
          <option value="">All theatres</option>
          {(theatres.data?.data ?? []).map((theatre) => (
            <option key={theatre.id} value={theatre.id}>{theatre.name} — {theatre.city}</option>
          ))}
        </select>
        <input type="date" className="input" style={{ width: 'auto' }} value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} aria-label="Filter by date" />
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setFilters({ movieId: '', theatreId: '', date: '' })}>Clear</button>
      </div>

      {shows.error ? <ErrorState error={shows.error} onRetry={shows.reload} /> : null}
      {shows.loading && !shows.data ? <Loading label="Loading shows…" /> : null}

      {shows.data ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Movie</th>
                <th>Theatre &amp; screen</th>
                <th>Date</th>
                <th>Time</th>
                <th>Multiplier</th>
                <th>Occupancy</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shows.data.data.map((show) => (
                <tr key={show.id}>
                  <td><strong>{show.movie_title}</strong></td>
                  <td>
                    <div className="small">{show.theatre_name}</div>
                    <div className="tiny dim">{show.screen_name}</div>
                  </td>
                  <td>{formatDateParts(show.show_date).full}</td>
                  <td className="mono">{formatTime(show.start_time)}</td>
                  <td className="num">×{Number(show.price_multiplier).toFixed(2)}</td>
                  <td>
                    <div className="row gap-8">
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{ width: `${show.total_seats ? Math.round((show.booked_seats / show.total_seats) * 100) : 0}%` }}
                        />
                      </div>
                      <span className="tiny dim nowrap">{show.booked_seats}/{show.total_seats}</span>
                    </div>
                  </td>
                  <td><StatusBadge status={show.status} /></td>
                  <td>
                    <div className="cell-actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={() => setForm({
                          id: show.id,
                          movieId: show.movie_id,
                          screenId: show.screen_id,
                          showDate: String(show.show_date).slice(0, 10),
                          startTime: String(show.start_time).slice(0, 5),
                          priceMultiplier: show.price_multiplier,
                          language: show.language,
                          status: show.status,
                        })}
                      >
                        Edit
                      </button>
                      {show.status === 'scheduled' ? (
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => cancelShow(show)}>Cancel</button>
                      ) : null}
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(show)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!shows.data.data.length ? (
                <tr><td colSpan="8" className="dim">No shows match these filters.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? 'Edit show' : 'Schedule a show'}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
            <button type="submit" form="show-form" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null} Save
            </button>
          </>
        }
      >
        {formError ? (
          <div className="alert alert-error" style={{ marginBottom: 14 }}>
            <span aria-hidden="true">⚠️</span>
            <div>
              <strong>{formError.message}</strong>
              {formError.code === 'SHOW_OVERLAP' ? (
                <div className="small">Pick a different start time or screen.</div>
              ) : null}
            </div>
          </div>
        ) : null}

        <form id="show-form" onSubmit={save} className="form-grid">
          <Field label="Movie" htmlFor="sh-movie" className="full">
            <select id="sh-movie" className="select" value={form?.movieId ?? ''} onChange={(event) => setForm({ ...form, movieId: event.target.value })} required>
              <option value="">Select a movie…</option>
              {(movies.data?.data ?? []).map((movie) => (
                <option key={movie.id} value={movie.id}>{movie.title} · {movie.durationMinutes} min</option>
              ))}
            </select>
          </Field>

          <Field label="Screen" htmlFor="sh-screen" className="full">
            <select id="sh-screen" className="select" value={form?.screenId ?? ''} onChange={(event) => setForm({ ...form, screenId: event.target.value })} required>
              <option value="">Select a screen…</option>
              {screenOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Date" htmlFor="sh-date">
            <input id="sh-date" type="date" className="input" value={form?.showDate ?? ''} onChange={(event) => setForm({ ...form, showDate: event.target.value })} required />
          </Field>

          <Field label="Start time" htmlFor="sh-time" hint="End time is derived from the movie length">
            <input id="sh-time" type="time" className="input" value={form?.startTime ?? ''} onChange={(event) => setForm({ ...form, startTime: event.target.value })} required />
          </Field>

          <Field label="Language" htmlFor="sh-language">
            <input id="sh-language" className="input" value={form?.language ?? ''} onChange={(event) => setForm({ ...form, language: event.target.value })} placeholder="Defaults to the movie language" />
          </Field>

          <Field label="Price multiplier" htmlFor="sh-multiplier" hint="Blank = automatic (evening and weekend pricing)">
            <input id="sh-multiplier" type="number" step="0.05" min="1" max="3" className="input" value={form?.priceMultiplier ?? ''} onChange={(event) => setForm({ ...form, priceMultiplier: event.target.value })} />
          </Field>

          <Field label="Status" htmlFor="sh-status" className="full">
            <select id="sh-status" className="select" value={form?.status ?? 'scheduled'} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="scheduled">Scheduled</option>
              <option value="cancelled">Cancelled</option>
              <option value="completed">Completed</option>
            </select>
          </Field>
        </form>
      </Modal>
    </div>
  );
}
