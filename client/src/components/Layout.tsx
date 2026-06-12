import { ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const icons: Record<string, ReactNode> = {
  dashboard: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1.2" />
    </svg>
  ),
  requests: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 4h12M2 8h12M2 12h8" strokeLinecap="round" />
    </svg>
  ),
  intake: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 5.5v5M5.5 8h5" strokeLinecap="round" />
    </svg>
  ),
  mywork: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M5.5 8.2l1.8 1.8 3.4-3.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  analytics: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2.5 13.5v-4M6.5 13.5v-7M10.5 13.5v-5M14 13.5V3" strokeLinecap="round" />
    </svg>
  ),
  briefings: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="1.5" y="3" width="13" height="10" rx="1.5" />
      <path d="M2 4.5l6 4.5 6-4.5" strokeLinejoin="round" />
    </svg>
  ),
  settings: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6L11 5M5 11l-1.4 1.4" strokeLinecap="round" />
    </svg>
  ),
  signout: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M6 14H3.5A1.5 1.5 0 0 1 2 12.5v-9A1.5 1.5 0 0 1 3.5 2H6M10.5 11.5L14 8l-3.5-3.5M14 8H6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

const sections: { header: string | null; items: { to: string; label: string; icon: string; end?: boolean }[] }[] = [
  { header: null, items: [{ to: '/', label: 'Dashboard', icon: 'dashboard', end: true }] },
  {
    header: 'Work',
    items: [
      { to: '/tasks', label: 'Tasks', icon: 'requests' },
      { to: '/intake', label: 'New task', icon: 'intake' },
      { to: '/my-work', label: 'My work', icon: 'mywork' },
    ],
  },
  {
    header: 'Insights',
    items: [
      { to: '/analytics', label: 'Analytics', icon: 'analytics' },
      { to: '/briefings', label: 'Briefings', icon: 'briefings' },
    ],
  },
];

function NavItem({ to, label, icon, end }: { to: string; label: string; icon: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `group relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors duration-100 ${
          isActive ? 'bg-white/[0.06] text-white' : 'text-slate-400 hover:text-ink hover:bg-white/[0.04]'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute -left-2 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-accent" />
          )}
          <span className={isActive ? 'text-accent' : 'text-slate-500 group-hover:text-slate-300 transition-colors'}>
            {icons[icon]}
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}

export default function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 bg-navy-925 border-r border-subtle flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-subtle">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
            style={{
              backgroundImage: 'linear-gradient(135deg, #2F9BEF, #0E6CC2)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 6px rgba(14,108,194,0.4)',
            }}
          >
            A
          </div>
          <div className="min-w-0">
            <div className="text-white font-semibold text-[14px] tracking-[-0.01em] leading-tight">Ascend Hub</div>
            <div className="text-gold/80 text-[10px] font-semibold tracking-[0.16em] uppercase">Unify</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {sections.map((section, i) => (
            <div key={i}>
              {section.header && (
                <div className="micro-title text-slate-600 px-2.5 mb-1.5">{section.header}</div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavItem key={item.to} {...item} />
                ))}
              </div>
            </div>
          ))}
          {isAdmin && (
            <div>
              <div className="micro-title text-slate-600 px-2.5 mb-1.5">Admin</div>
              <div className="space-y-0.5">
                <NavItem to="/settings" label="Settings" icon="settings" />
              </div>
            </div>
          )}
        </nav>

        <div className="px-3 py-3 border-t border-subtle space-y-0.5">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors duration-100 ${
                isActive ? 'bg-white/[0.06] text-white' : 'text-slate-400 hover:text-ink hover:bg-white/[0.04]'
              }`
            }
          >
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-accent/40 to-accent/15 border border-accent/30 text-accent flex items-center justify-center text-[10px] font-semibold shrink-0">
              {user?.name
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')}
            </span>
            <span className="truncate">{user?.name}</span>
          </NavLink>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium text-slate-500 transition-colors duration-100 hover:text-ink hover:bg-white/[0.04]"
          >
            <span className="text-slate-600">{icons.signout}</span>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-12 shrink-0 sticky top-0 z-30 bg-navy-950/80 backdrop-blur border-b border-subtle flex items-center gap-2 px-8">
          <span className="text-[13px] text-slate-500">Unify Ascend Task Hub</span>
          {isAdmin && (
            <span className="pill bg-gold/10 text-gold border-gold/30">
              <span className="pill-dot bg-gold" />
              Admin
            </span>
          )}
        </header>
        <main className="flex-1 px-8 py-7 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
