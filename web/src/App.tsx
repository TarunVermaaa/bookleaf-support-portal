import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Role } from './api/types';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { AdminTicketPage } from './pages/admin/AdminTicketPage';
import { QueuePage } from './pages/admin/QueuePage';
import { BooksPage } from './pages/author/BooksPage';
import { NewTicketPage } from './pages/author/NewTicketPage';
import { TicketDetailPage } from './pages/author/TicketDetailPage';
import { TicketsPage } from './pages/author/TicketsPage';
import { LoginPage } from './pages/LoginPage';

// UI-level guard for a smooth experience; the API enforces the same rules on every request.
function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/books'} replace />;
  return <>{children}</>;
}

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route path="/books" element={<RequireRole role="author"><BooksPage /></RequireRole>} />
        <Route path="/tickets" element={<RequireRole role="author"><TicketsPage /></RequireRole>} />
        <Route path="/tickets/new" element={<RequireRole role="author"><NewTicketPage /></RequireRole>} />
        <Route path="/tickets/:id" element={<RequireRole role="author"><TicketDetailPage /></RequireRole>} />
        <Route path="/admin" element={<RequireRole role="admin"><QueuePage /></RequireRole>} />
        <Route path="/admin/tickets/:id" element={<RequireRole role="admin"><AdminTicketPage /></RequireRole>} />
      </Route>
      <Route path="*" element={<Navigate to={user ? (user.role === 'admin' ? '/admin' : '/books') : '/login'} replace />} />
    </Routes>
  );
}
