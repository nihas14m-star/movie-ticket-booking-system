import { Link } from 'react-router-dom';

const TEAM = ['Nihas', 'Srikanth', 'Vaibhav', 'Varun', 'Ranjith'];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="shell">
        <div className="footer-grid">
          <div>
            <div className="brand" style={{ marginBottom: 12 }}>
              <span className="brand-mark" aria-hidden="true">🎬</span>
              Cineverse
            </div>
            <p className="small dim" style={{ maxWidth: '40ch' }}>
              A movie ticket booking platform built as a college project — React, Express and MySQL,
              with an optional AI layer on top of the catalogue.
            </p>
          </div>

          <div>
            <h4>Browse</h4>
            <ul>
              <li><Link to="/?view=now_showing">Now showing</Link></li>
              <li><Link to="/?view=upcoming">Coming soon</Link></li>
              <li><Link to="/my-bookings">My tickets</Link></li>
            </ul>
          </div>

          <div>
            <h4>Bookings</h4>
            <ul>
              <li><span className="dim">Seats held 10 minutes while you pay</span></li>
              <li><span className="dim">Free cancellation from your ticket</span></li>
              <li><span className="dim">QR ticket, printable</span></li>
            </ul>
          </div>

          <div>
            <h4>Project team</h4>
            <ul>
              {TEAM.map((member) => (
                <li key={member}>{member}</li>
              ))}
            </ul>
          </div>
        </div>

        <hr className="divider" />

        <div className="row between wrap gap-12">
          <p className="tiny dim">
            © {new Date().getFullYear()} Cineverse · Movie Ticket Booking System · Academic project
          </p>
          <p className="tiny dim">
            Payments are a demo simulation — no real money is processed.
          </p>
        </div>
      </div>
    </footer>
  );
}
