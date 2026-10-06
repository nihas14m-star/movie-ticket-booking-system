import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="notfound">
      <div>
        <div className="notfound-code">404</div>
        <h1 style={{ marginTop: 12 }}>This screen is missing</h1>
        <p className="lead" style={{ marginTop: 10, maxWidth: '46ch', marginInline: 'auto' }}>
          The page you were looking for is not playing here. It may have been moved, or the link may be
          incomplete.
        </p>
        <div className="row gap-12" style={{ justifyContent: 'center', marginTop: 26 }}>
          <Link to="/" className="btn btn-primary">Back to home</Link>
          <Link to="/my-bookings" className="btn btn-outline">Find my tickets</Link>
        </div>
      </div>
    </div>
  );
}
