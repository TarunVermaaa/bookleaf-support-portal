import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { BookOpen, Ticket, Plus, Layers, LogOut } from './icons';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-wrapper">
          <div className="brand">
            <div className="brand-logo-icon" title="BookLeaf Publishing">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                <path d="M6 6h10" />
                <path d="M6 10h10" />
                <path d="M12 14c2.5-3 6-3 6 0-3 2-6 2-6 0Z" fill="currentColor" fillOpacity="0.2" />
              </svg>
            </div>
            <div className="brand-title">
              <span className="brand-main-text">BookLeaf</span>
              <span className="brand-sub">{isAdmin ? 'Support Desk' : 'Author Portal'}</span>
            </div>
          </div>
        </div>

        <nav>
          {isAdmin ? (
            <NavLink to="/admin" end>
              <Layers size={16} />
              <span>Ticket queue</span>
            </NavLink>
          ) : (
            <>
              <NavLink to="/books">
                <BookOpen size={16} />
                <span>My Books</span>
              </NavLink>
              <NavLink to="/tickets" end>
                <Ticket size={16} />
                <span>My Tickets</span>
              </NavLink>
              <NavLink to="/tickets/new" className="nav-cta">
                <Plus size={16} />
                <span>New query</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className="user-profile">
          <div className={`user-avatar ${isAdmin ? 'admin' : ''}`}>
            {getInitials(user?.name)}
          </div>
          <div className="user-info">
            <span className="user-name">{user?.name}</span>
            <span className="user-role-badge">
              {isAdmin ? 'Operations Team' : 'Published Author'}
            </span>
          </div>
          <button
            className="secondary small"
            title="Sign out of your session"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            <LogOut size={14} />
            <span>Log out</span>
          </button>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
