import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useToast } from '../../context/ToastContext.jsx';
import Modal from '../../components/Modal.jsx';
import { ErrorState, Field, Loading } from '../../components/ui.jsx';

const SCREEN_TYPES = [
  { value: '2D', label: '2D' },
  { value: '3D', label: '3D' },
  { value: 'IMAX', label: 'IMAX' },
  { value: '4DX', label: '4DX' },
  { value: 'DOLBY_ATMOS', label: 'Dolby Atmos' },
];

const emptyTheatre = { name: '', city: 'Hyderabad', address: '', phone: '', amenitiesText: 'Recliner seating, Dolby Atmos', rating: 4.5 };
const emptyScreen = { theatreId: '', name: '', screenType: '2D', totalRows: 10, seatsPerRow: 14 };

export default function AdminTheatresPage() {
  const { pushToast } = useToast();
  const [theatreForm, setTheatreForm] = useState(null);
  const [screenForm, setScreenForm] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const theatres = useAsync((signal) => api.admin.theatres({ signal }), []);
  const screens = useAsync((signal) => api.admin.screens(undefined, { signal }), []);

  useEffect(() => setFormError(null), [theatreForm, screenForm]);

  const reloadAll = () => {
    theatres.reload();
    screens.reload();
  };

  const saveTheatre = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    const payload = {
      name: theatreForm.name.trim(),
      city: theatreForm.city.trim(),
      address: theatreForm.address.trim(),
      phone: theatreForm.phone?.trim() || undefined,
      amenities: theatreForm.amenitiesText.split(',').map((item) => item.trim()).filter(Boolean),
      rating: Number(theatreForm.rating),
    };
    try {
      if (theatreForm.id) await api.admin.updateTheatre(theatreForm.id, payload);
      else await api.admin.createTheatre(payload);
      pushToast({ tone: 'success', title: theatreForm.id ? 'Theatre updated' : 'Theatre added', body: payload.name });
      setTheatreForm(null);
      reloadAll();
    } catch (error) {
      setFormError(error);
    } finally {
      setSaving(false);
    }
  };

  const saveScreen = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    const payload = {
      theatreId: Number(screenForm.theatreId),
      name: screenForm.name.trim(),
      screenType: screenForm.screenType,
      totalRows: Number(screenForm.totalRows),
      seatsPerRow: Number(screenForm.seatsPerRow),
    };
    const seatTotal = payload.totalRows * payload.seatsPerRow;
    try {
      if (screenForm.id) {
        await api.admin.updateScreen(screenForm.id, payload);
      } else {
        await api.admin.createScreen(payload);
      }
      pushToast({
        tone: 'success',
        title: screenForm.id ? 'Screen updated' : 'Screen created',
        body: screenForm.id
          ? payload.name
          : `${payload.name} created with ${seatTotal} seats across ${payload.totalRows} rows.`,
      });
      setScreenForm(null);
      reloadAll();
    } catch (error) {
      setFormError(error);
    } finally {
      setSaving(false);
    }
  };

  const removeTheatre = async (theatre) => {
    if (!window.confirm(`Delete ${theatre.name}? Theatres with bookings are protected.`)) return;
    try {
      await api.admin.deleteTheatre(theatre.id);
      pushToast({ tone: 'success', title: 'Theatre deleted', body: theatre.name });
      reloadAll();
    } catch (error) {
      pushToast({ tone: 'error', title: 'Cannot delete theatre', body: error.message });
    }
  };

  const removeScreen = async (screen) => {
    if (!window.confirm(`Delete ${screen.name}? This removes its seats and rows.`)) return;
    try {
      await api.admin.deleteScreen(screen.id);
      pushToast({ tone: 'success', title: 'Screen deleted', body: screen.name });
      reloadAll();
    } catch (error) {
      pushToast({ tone: 'error', title: 'Cannot delete screen', body: error.message });
    }
  };

  const rebuildLayout = async (screen) => {
    if (!window.confirm(`Rebuild the seat layout for ${screen.name}? Existing rows and seats are regenerated.`)) return;
    try {
      await api.admin.updateScreen(screen.id, { rebuildLayout: true });
      pushToast({ tone: 'success', title: 'Seat layout rebuilt', body: `${screen.name} · ${screen.total_rows}×${screen.seats_per_row}` });
      reloadAll();
    } catch (error) {
      pushToast({ tone: 'error', title: 'Could not rebuild layout', body: error.message });
    }
  };

  const seatPreview = Number(screenForm?.totalRows || 0) * Number(screenForm?.seatsPerRow || 0);

  return (
    <div className="stack gap-18">
      <div className="row between wrap gap-12">
        <div>
          <p className="eyebrow">Venues</p>
          <h1 style={{ marginTop: 6 }}>Theatres &amp; screens</h1>
          <p className="muted small">
            Creating a screen generates its pricing tiers, row blueprint and seat grid automatically.
          </p>
        </div>
        <div className="row gap-8">
          <button type="button" className="btn btn-outline" onClick={() => setScreenForm({ ...emptyScreen, theatreId: theatres.data?.data?.[0]?.id ?? '' })}>
            + Add screen
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setTheatreForm({ ...emptyTheatre })}>
            + Add theatre
          </button>
        </div>
      </div>

      {theatres.error ? <ErrorState error={theatres.error} onRetry={theatres.reload} /> : null}
      {theatres.loading && !theatres.data ? <Loading label="Loading theatres…" /> : null}

      {theatres.data ? (
        <div className="admin-cards">
          {theatres.data.data.map((theatre) => (
            <section key={theatre.id} className="panel">
              <header className="panel-head">
                <div>
                  <h3>{theatre.name}</h3>
                  <p className="tiny dim">{theatre.city} · {theatre.address}</p>
                </div>
                <div className="cell-actions">
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => setTheatreForm({ ...theatre, amenitiesText: theatre.amenities ?? '' })}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => removeTheatre(theatre)}>Delete</button>
                </div>
              </header>
              <div className="panel-body">
                <div className="row gap-8 wrap" style={{ marginBottom: 14 }}>
                  <span className="badge badge-live">★ {Number(theatre.rating).toFixed(1)}</span>
                  <span className="badge">{theatre.screen_count} screens</span>
                  <span className="badge">{theatre.upcoming_show_count} upcoming shows</span>
                </div>

                <div className="row-list">
                  {(screens.data?.data ?? []).filter((screen) => screen.theatre_id === theatre.id).map((screen) => (
                    <div key={screen.id} className="row-item">
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="small" style={{ fontWeight: 650 }}>
                          {screen.name}{' '}
                          <span className="tiny dim">{String(screen.screen_type).replace('_', ' ')}</span>
                        </div>
                        <div className="tiny dim">
                          {screen.total_rows} rows × {screen.seats_per_row} · {screen.seat_count} seats ·{' '}
                          {screen.upcoming_shows} upcoming shows
                        </div>
                      </div>
                      <div className="cell-actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => setScreenForm({
                            id: screen.id,
                            theatreId: screen.theatre_id,
                            name: screen.name,
                            screenType: screen.screen_type,
                            totalRows: screen.total_rows,
                            seatsPerRow: screen.seats_per_row,
                          })}
                        >
                          Edit
                        </button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => rebuildLayout(screen)} title="Regenerate rows and seats">
                          ↻ Seats
                        </button>
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => removeScreen(screen)}>Delete</button>
                      </div>
                    </div>
                  ))}
                  {!(screens.data?.data ?? []).some((screen) => screen.theatre_id === theatre.id) ? (
                    <p className="small dim">No screens yet — add one to start scheduling shows.</p>
                  ) : null}
                </div>
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {/* ------------------------------------------------------- theatre form */}
      <Modal
        open={Boolean(theatreForm)}
        onClose={() => setTheatreForm(null)}
        title={theatreForm?.id ? `Edit ${theatreForm.name}` : 'Add a theatre'}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setTheatreForm(null)} disabled={saving}>Cancel</button>
            <button type="submit" form="theatre-form" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null} Save
            </button>
          </>
        }
      >
        {formError ? <div className="alert alert-error" style={{ marginBottom: 14 }}>{formError.message}</div> : null}
        <form id="theatre-form" onSubmit={saveTheatre} className="form-grid">
          <Field label="Name" htmlFor="t-name" className="full">
            <input id="t-name" className="input" value={theatreForm?.name ?? ''} onChange={(event) => setTheatreForm({ ...theatreForm, name: event.target.value })} required />
          </Field>
          <Field label="City" htmlFor="t-city">
            <input id="t-city" className="input" value={theatreForm?.city ?? ''} onChange={(event) => setTheatreForm({ ...theatreForm, city: event.target.value })} required />
          </Field>
          <Field label="Phone" htmlFor="t-phone">
            <input id="t-phone" className="input" value={theatreForm?.phone ?? ''} onChange={(event) => setTheatreForm({ ...theatreForm, phone: event.target.value })} />
          </Field>
          <Field label="Address" htmlFor="t-address" className="full">
            <input id="t-address" className="input" value={theatreForm?.address ?? ''} onChange={(event) => setTheatreForm({ ...theatreForm, address: event.target.value })} required />
          </Field>
          <Field label="Amenities" htmlFor="t-amenities" className="full" hint="Comma separated, shown as chips on the booking page">
            <input id="t-amenities" className="input" value={theatreForm?.amenitiesText ?? ''} onChange={(event) => setTheatreForm({ ...theatreForm, amenitiesText: event.target.value })} />
          </Field>
          <Field label="Rating (0-5)" htmlFor="t-rating">
            <input id="t-rating" type="number" step="0.1" min="0" max="5" className="input" value={theatreForm?.rating ?? 4} onChange={(event) => setTheatreForm({ ...theatreForm, rating: event.target.value })} />
          </Field>
        </form>
      </Modal>

      {/* -------------------------------------------------------- screen form */}
      <Modal
        open={Boolean(screenForm)}
        onClose={() => setScreenForm(null)}
        title={screenForm?.id ? `Edit ${screenForm.name}` : 'Add a screen'}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setScreenForm(null)} disabled={saving}>Cancel</button>
            <button type="submit" form="screen-form" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
              {screenForm?.id ? 'Save' : `Create with ${seatPreview} seats`}
            </button>
          </>
        }
      >
        {formError ? <div className="alert alert-error" style={{ marginBottom: 14 }}>{formError.message}</div> : null}
        <form id="screen-form" onSubmit={saveScreen} className="form-grid">
          <Field label="Theatre" htmlFor="s-theatre" className="full">
            <select
              id="s-theatre"
              className="select"
              value={screenForm?.theatreId ?? ''}
              onChange={(event) => setScreenForm({ ...screenForm, theatreId: event.target.value })}
              required
            >
              <option value="">Select a theatre…</option>
              {(theatres.data?.data ?? []).map((theatre) => (
                <option key={theatre.id} value={theatre.id}>{theatre.name} — {theatre.city}</option>
              ))}
            </select>
          </Field>

          <Field label="Screen name" htmlFor="s-name">
            <input id="s-name" className="input" value={screenForm?.name ?? ''} onChange={(event) => setScreenForm({ ...screenForm, name: event.target.value })} placeholder="Audi 1" required />
          </Field>

          <Field label="Screen type" htmlFor="s-type" hint="Determines base ticket prices">
            <select id="s-type" className="select" value={screenForm?.screenType ?? '2D'} onChange={(event) => setScreenForm({ ...screenForm, screenType: event.target.value })}>
              {SCREEN_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Rows (A, B, C…)" htmlFor="s-rows">
            <input id="s-rows" type="number" min="1" max="26" className="input" value={screenForm?.totalRows ?? 10} onChange={(event) => setScreenForm({ ...screenForm, totalRows: event.target.value })} required />
          </Field>

          <Field label="Seats per row" htmlFor="s-cols">
            <input id="s-cols" type="number" min="1" max="40" className="input" value={screenForm?.seatsPerRow ?? 14} onChange={(event) => setScreenForm({ ...screenForm, seatsPerRow: event.target.value })} required />
          </Field>

          <div className="alert alert-info full">
            <span aria-hidden="true">💺</span>
            <div>
              <strong>{seatPreview} seats will be generated</strong>
              <div className="small">
                Front third becomes Classic, the last two rows Recliner, everything between Premium —
                priced from the screen type. Rebuilding is blocked while the screen has bookings.
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
