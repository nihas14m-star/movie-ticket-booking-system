import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import AiAssistant from './components/AiAssistant.jsx';

import HomePage from './pages/HomePage.jsx';
import MovieDetailsPage from './pages/MovieDetailsPage.jsx';
import SeatSelectionPage from './pages/SeatSelectionPage.jsx';
import CheckoutPage from './pages/CheckoutPage.jsx';
import ConfirmationPage from './pages/ConfirmationPage.jsx';
import MyBookingsPage from './pages/MyBookingsPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

import AdminLoginPage from './pages/admin/AdminLoginPage.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import AdminDashboardPage from './pages/admin/AdminDashboardPage.jsx';
import AdminMoviesPage from './pages/admin/AdminMoviesPage.jsx';
import AdminTheatresPage from './pages/admin/AdminTheatresPage.jsx';
import AdminShowsPage from './pages/admin/AdminShowsPage.jsx';
import AdminBookingsPage from './pages/admin/AdminBookingsPage.jsx';
import AdminCustomersPage from './pages/admin/AdminCustomersPage.jsx';

/** Every navigation starts at the top of the new page. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

export default function App() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin');

  return (
    <>
      <ScrollToTop />
      <Navbar />

      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/movies/:slug" element={<MovieDetailsPage />} />
          <Route path="/book/:showId" element={<SeatSelectionPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/ticket/:reference" element={<ConfirmationPage />} />
          <Route path="/my-bookings" element={<MyBookingsPage />} />

          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboardPage />} />
            <Route path="movies" element={<AdminMoviesPage />} />
            <Route path="theatres" element={<AdminTheatresPage />} />
            <Route path="shows" element={<AdminShowsPage />} />
            <Route path="bookings" element={<AdminBookingsPage />} />
            <Route path="customers" element={<AdminCustomersPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      {!isAdmin ? <Footer /> : null}
      {/* The assistant is available everywhere except the admin console. */}
      {!isAdmin ? <AiAssistant /> : null}
    </>
  );
}
