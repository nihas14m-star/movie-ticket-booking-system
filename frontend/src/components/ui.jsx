/**
 * Small shared UI primitives.
 * Kept together because each is a handful of lines and they are always used
 * as a set by the pages.
 */

export function Badge({ tone = 'default', children, className = '' }) {
  const toneClass = tone === 'default' ? '' : `badge-${tone}`;
  return <span className={`badge ${toneClass} ${className}`.trim()}>{children}</span>;
}

const STATUS_TONES = {
  CONFIRMED: 'live',
  PENDING: 'warn',
  CANCELLED: 'danger',
  EXPIRED: 'default',
  SUCCESS: 'live',
  FAILED: 'danger',
  REFUNDED: 'soon',
  INITIATED: 'warn',
  scheduled: 'live',
  cancelled: 'danger',
  completed: 'default',
};

export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONES[status] ?? 'default'}>{status}</Badge>;
}

export function Rating({ value, votes, big = false }) {
  if (!value) return <span className="dim small">Not rated yet</span>;
  return (
    <span className={`rating ${big ? 'rating-big' : ''}`}>
      <span className="star" aria-hidden="true">★</span>
      <span className="num">{Number(value).toFixed(1)}</span>
      {votes ? <span className="dim tiny">({votes.toLocaleString('en-IN')})</span> : null}
    </span>
  );
}

export function Loading({ label = 'Loading…', size = 'lg' }) {
  return (
    <div className="loading-block">
      <div className={`spinner ${size === 'lg' ? 'spinner-lg' : ''}`} />
      <p className="small">{label}</p>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="alert alert-error" role="alert">
      <span aria-hidden="true">⚠️</span>
      <div className="grow">
        <strong>{error?.message ?? 'Something went wrong'}</strong>
        {error?.code ? <div className="tiny dim mono" style={{ marginTop: 4 }}>{error.code}</div> : null}
      </div>
      {onRetry ? (
        <button type="button" className="btn btn-sm btn-outline" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ icon = '🎬', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      {children ? <p className="muted small" style={{ marginTop: 8, maxWidth: '46ch', marginInline: 'auto' }}>{children}</p> : null}
      {action ? <div style={{ marginTop: 18 }}>{action}</div> : null}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="movie-card">
      <div className="skeleton skeleton-poster" />
      <div className="movie-card-body">
        <div className="skeleton" style={{ height: 15, width: '82%' }} />
        <div className="skeleton" style={{ height: 12, width: '52%' }} />
        <div className="skeleton" style={{ height: 12, width: '66%' }} />
      </div>
    </div>
  );
}

export function GridSkeleton({ count = 8 }) {
  return (
    <div className="movie-grid">
      {Array.from({ length: count }, (_, index) => (
        <CardSkeleton key={index} />
      ))}
    </div>
  );
}

/** The booking progress indicator (movie → seats → details → ticket). */
export function StepBar({ steps, current }) {
  return (
    <nav className="step-bar" aria-label="Booking progress">
      {steps.map((step, index) => {
        const state = index < current ? 'is-done' : index === current ? 'is-active' : '';
        return (
          <span key={step} className="row gap-8">
            <span className={`step ${state}`}>
              <span className="step-index">{index < current ? '✓' : index + 1}</span>
              {step}
            </span>
            {index < steps.length - 1 ? <span className="step-sep" aria-hidden="true">›</span> : null}
          </span>
        );
      })}
    </nav>
  );
}

export function Field({ label, htmlFor, error, hint, children, className = '' }) {
  return (
    <div className={`field ${className}`.trim()}>
      {label ? <label htmlFor={htmlFor}>{label}</label> : null}
      {children}
      {error ? <span className="field-error">{error}</span> : null}
      {!error && hint ? <span className="tiny dim">{hint}</span> : null}
    </div>
  );
}

export default {
  Badge, StatusBadge, Rating, Loading, ErrorState, EmptyState, CardSkeleton, GridSkeleton, StepBar, Field,
};
