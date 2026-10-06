import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useAsync, useDebouncedValue } from '../../hooks/useAsync.js';
import { useToast } from '../../context/ToastContext.jsx';
import Modal from '../../components/Modal.jsx';
import { ErrorState, Field, Loading, StatusBadge } from '../../components/ui.jsx';

const POSTER_OPTIONS = [
  '/posters/neon-horizon.svg', '/posters/kalari.svg', '/posters/the-last-monsoon.svg',
  '/posters/pixel-pals.svg', '/posters/silent-frequency.svg', '/posters/coastal-run.svg',
  '/posters/zero-gravity.svg', '/posters/the-silk-route.svg', '/posters/echoes-of-tomorrow.svg',
  '/posters/rangoli-nights.svg', '/posters/deep-blue-silence.svg', '/posters/skyforge-legends.svg',
];

const emptyMovie = {
  title: '', synopsis: '', durationMinutes: 120, language: 'English', certificate: 'UA',
  rating: 0, voteCount: 0, director: '', castText: '', posterUrl: POSTER_OPTIONS[0],
  releaseDate: new Date().toISOString().slice(0, 10), status: 'now_showing',
  isFeatured: false, genres: [],
};

export default function AdminMoviesPage() {
  const { pushToast } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const debounced = useDebouncedValue(search, 300);

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyMovie);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const list = useAsync((signal) => api.admin.movies({ search: debounced || undefined, status: status || undefined }, { signal }), [debounced, status]);
  const genres = useAsync((signal) => api.admin.genres({ signal }), []);

  useEffect(() => {
    if (editing) {
      setForm({
        ...emptyMovie,
        ...editing,
        castText: (editing.cast_list ?? '').split(',').map((name) => name.trim()).filter(Boolean).join(', '),
        genres: (editing.genres ?? []).map((genre) => genre.slug ?? genre),
        posterUrl: editing.poster_url ?? editing.posterUrl ?? POSTER_OPTIONS[0],
        releaseDate: String(editing.release_date).slice(0, 10),
        isFeatured: Boolean(editing.is_featured),
      });
    } else {
      setForm(emptyMovie);
    }
    setFormError(null);
  }, [editing]);

  const openCreate = () => setEditing({ id: null });
  const close = () => setEditing(null);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    const payload = {
      title: form.title.trim(),
      synopsis: form.synopsis.trim(),
      durationMinutes: Number(form.durationMinutes),
      language: form.language.trim(),
      certificate: form.certificate,
      rating: Number(form.rating),
      voteCount: Number(form.voteCount),
      director: form.director?.trim() || undefined,
      cast: form.castText.split(',').map((name) => name.trim()).filter(Boolean),
      posterUrl: form.posterUrl,
      backdropUrl: form.posterUrl,
      releaseDate: form.releaseDate,
      status: form.status,
      isFeatured: Boolean(form.isFeatured),
      genres: form.genres,
    };

    try {
      if (editing.id) {
        await api.admin.updateMovie(editing.id, payload);
        pushToast({ tone: 'success', title: 'Movie updated', body: payload.title });
      } else {
        await api.admin.createMovie(payload);
        pushToast({ tone: 'success', title: 'Movie created', body: payload.title });
      }
      close();
      list.reload();
    } catch (error) {
      setFormError(error);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await api.admin.deleteMovie(deleteTarget.id);
      pushToast({ tone: 'success', title: 'Movie deleted', body: deleteTarget.title });
      setDeleteTarget(null);
      list.reload();
    } catch (error) {
      pushToast({ tone: 'error', title: 'Cannot delete this movie', body: error.message });
      setDeleteTarget(null);
    }
  };

  const toggleGenre = (slug) => {
    setForm((current) => ({
      ...current,
      genres: current.genres.includes(slug)
        ? current.genres.filter((item) => item !== slug)
        : [...current.genres, slug],
    }));
  };

  return (
    <div className="stack gap-18">
      <div className="row between wrap gap-12">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1 style={{ marginTop: 6 }}>Movies</h1>
          <p className="muted small">Add, edit and retire films. Movies with screenings cannot be deleted.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>+ Add movie</button>
      </div>

      <div className="toolbar">
        <input
          className="input grow"
          placeholder="Search by title…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search movies"
        />
        <select className="select" style={{ width: 'auto' }} value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="now_showing">Now showing</option>
          <option value="upcoming">Upcoming</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : null}
      {list.loading && !list.data ? <Loading label="Loading movies…" /> : null}

      {list.data ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Movie</th>
                <th>Genres</th>
                <th>Length</th>
                <th>Rating</th>
                <th>Shows</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.data.data.map((movie) => (
                <tr key={movie.id}>
                  <td>
                    <div className="row gap-12">
                      <img src={movie.poster_url} alt="" width="38" height="57" style={{ borderRadius: 7, objectFit: 'cover' }} />
                      <div>
                        <strong>{movie.title}</strong>
                        <div className="tiny dim">
                          {movie.language} · {movie.certificate} · {String(movie.release_date).slice(0, 10)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="tiny dim">{movie.genre_count} linked</td>
                  <td>{movie.duration_minutes} min</td>
                  <td className="num">{Number(movie.rating).toFixed(1)}</td>
                  <td className="num">{movie.show_count}</td>
                  <td><StatusBadge status={movie.status} /></td>
                  <td>
                    <div className="cell-actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={() => api.admin.movie(movie.id).then((response) => setEditing(response.data))}
                      >
                        Edit
                      </button>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(movie)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!list.data.data.length ? (
                <tr><td colSpan="7" className="dim">No movies match your filters.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* ------------------------------------------------------------ editor */}
      <Modal
        open={Boolean(editing)}
        onClose={close}
        title={editing?.id ? `Edit ${editing.title}` : 'Add a movie'}
        width={720}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={close} disabled={saving}>Cancel</button>
            <button type="submit" form="movie-form" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
              {editing?.id ? 'Save changes' : 'Create movie'}
            </button>
          </>
        }
      >
        {formError ? (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            <span aria-hidden="true">⚠️</span>
            <div>
              <strong>{formError.message}</strong>
              {formError.details?.length ? (
                <ul className="tiny" style={{ marginTop: 6 }}>
                  {formError.details.map((issue) => (
                    <li key={issue.field}>{issue.field}: {issue.message}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}

        <form id="movie-form" onSubmit={save} className="form-grid">
          <Field label="Title" htmlFor="m-title" className="full">
            <input id="m-title" className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
          </Field>

          <Field label="Synopsis" htmlFor="m-synopsis" className="full" hint="At least 10 characters">
            <textarea id="m-synopsis" className="textarea" value={form.synopsis} onChange={(event) => setForm({ ...form, synopsis: event.target.value })} required />
          </Field>

          <Field label="Duration (minutes)" htmlFor="m-duration">
            <input id="m-duration" type="number" min="30" max="360" className="input" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })} required />
          </Field>

          <Field label="Language" htmlFor="m-language">
            <input id="m-language" className="input" value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })} required />
          </Field>

          <Field label="Certificate" htmlFor="m-cert">
            <select id="m-cert" className="select" value={form.certificate} onChange={(event) => setForm({ ...form, certificate: event.target.value })}>
              <option value="U">U — universal</option>
              <option value="UA">UA — parental guidance</option>
              <option value="A">A — adults only</option>
            </select>
          </Field>

          <Field label="Rating (0-10)" htmlFor="m-rating">
            <input id="m-rating" type="number" step="0.1" min="0" max="10" className="input" value={form.rating} onChange={(event) => setForm({ ...form, rating: event.target.value })} />
          </Field>

          <Field label="Release date" htmlFor="m-release">
            <input id="m-release" type="date" className="input" value={form.releaseDate} onChange={(event) => setForm({ ...form, releaseDate: event.target.value })} required />
          </Field>

          <Field label="Status" htmlFor="m-status">
            <select id="m-status" className="select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="now_showing">Now showing</option>
              <option value="upcoming">Upcoming</option>
              <option value="archived">Archived</option>
            </select>
          </Field>

          <Field label="Director" htmlFor="m-director">
            <input id="m-director" className="input" value={form.director ?? ''} onChange={(event) => setForm({ ...form, director: event.target.value })} />
          </Field>

          <Field label="Cast" htmlFor="m-cast" hint="Comma separated">
            <input id="m-cast" className="input" value={form.castText} onChange={(event) => setForm({ ...form, castText: event.target.value })} />
          </Field>

          <Field label="Poster" htmlFor="m-poster" className="full" hint="Project posters ship with the app; any URL works too.">
            <select id="m-poster" className="select" value={form.posterUrl} onChange={(event) => setForm({ ...form, posterUrl: event.target.value })}>
              {[...new Set([form.posterUrl, ...POSTER_OPTIONS])].filter(Boolean).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </Field>

          <Field label="Genres" className="full">
            <div className="row gap-8 wrap">
              {(genres.data?.data ?? []).map((genre) => (
                <button
                  key={genre.slug}
                  type="button"
                  className={`chip ${form.genres.includes(genre.slug) ? 'is-active' : ''}`}
                  onClick={() => toggleGenre(genre.slug)}
                  aria-pressed={form.genres.includes(genre.slug)}
                >
                  {genre.name}
                </button>
              ))}
            </div>
          </Field>

          <Field className="full">
            <label className="row gap-8" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={Boolean(form.isFeatured)}
                onChange={(event) => setForm({ ...form, isFeatured: event.target.checked })}
              />
              Feature on the home page hero
            </label>
          </Field>
        </form>
      </Modal>

      {/* ------------------------------------------------------------ delete */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete movie"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>Keep it</button>
            <button type="button" className="btn btn-danger" onClick={confirmDelete}>Delete permanently</button>
          </>
        }
      >
        <p className="small muted">
          Delete <strong>{deleteTarget?.title}</strong> from the catalogue? Movies that already have screenings
          are protected and will be refused by the API.
        </p>
      </Modal>
    </div>
  );
}
