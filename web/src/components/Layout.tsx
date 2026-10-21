import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">/</span> BookLeaf <span className="brand-sub">{isAdmin ? 'Support Desk' : 'Author Support'}</span>
        </div>
        <nav>
          {isAdmin ? (
            <NavLink to="/admin" end>
              Ticket queue
            </NavLink>
          ) : (
            <>
              <NavLink to="/books">My Books</NavLink>
              <NavLink to="/tickets" end>
                My Tickets
              </NavLink>
              <NavLink to="/tickets/new" className="nav-cta">
                + New query
              </NavLink>
            </>
          )}
        </nav>
        <div className="user">
          <span>{user?.name}</span>
          <button
            className="link"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Log out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
