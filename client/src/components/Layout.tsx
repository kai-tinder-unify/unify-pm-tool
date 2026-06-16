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
  pulse: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M1.5 8h3l1.5-4 2.5 8 1.5-4h4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  board: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="1.5" y="1.5" width="3.6" height="13" rx="1.1" />
      <rect x="6.2" y="1.5" width="3.6" height="8.5" rx="1.1" />
      <rect x="10.9" y="1.5" width="3.6" height="11" rx="1.1" />
    </svg>
  ),
  analytics: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2.5 13.5v-4M6.5 13.5v-7M10.5 13.5v-5M14 13.5V3" strokeLinecap="round" />
    </svg>
  ),
  capacity: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="5.5" cy="5" r="2.5" />
      <circle cx="11.5" cy="5.5" r="2" />
      <path d="M1 14c0-2.5 2-4.2 4.5-4.2S10 11.5 10 14" strokeLinecap="round" />
      <path d="M11 9.9c2 .1 4 1.6 4 4.1" strokeLinecap="round" />
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

const sections: {
  header: string | null;
  items: { to: string; label: string; icon: string; end?: boolean; adminOnly?: boolean }[];
}[] = [
  { header: null, items: [{ to: '/', label: 'Dashboard', icon: 'dashboard', end: true }] },
  {
    header: 'Work',
    items: [
      { to: '/intake', label: 'New task', icon: 'intake' },
      { to: '/tasks', label: 'Task Board', icon: 'board' },
      { to: '/my-work', label: 'My work', icon: 'mywork' },
    ],
  },
  {
    header: 'Insights',
    items: [
      { to: '/capacity', label: 'Capacity', icon: 'capacity', adminOnly: true },
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
        // Sidebar stays dark navy, so nav items keep white-alpha text.
        // Active item: white text on a faint aqua tint with an aqua left border accent.
        // Inactive: dim white that brightens on hover, with a subtle white-alpha hover fill.
        `group relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors duration-100 ${
          isActive
            ? 'bg-aqua/10 text-white border-l-2 border-aqua'
            : 'text-white/55 hover:text-white/90 hover:bg-white/5'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            // Aqua rail marker for the active item (decorative accent on the dark sidebar).
            <span className="absolute -left-2 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-aqua" />
          )}
          {/* Active icon glows aqua; inactive icons sit in dim white and brighten on hover. */}
          <span className={isActive ? 'text-aqua' : 'text-white/40 group-hover:text-white/70 transition-colors'}>
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
      {/* Sidebar — intentionally stays dark navy in the new light "Command Center" brand. */}
      <aside className="w-60 shrink-0 bg-navy border-r border-line flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
            style={{
              // Brand logo tile: aqua-to-deep-aqua gradient (replaces the old blue gradient).
              backgroundImage: 'linear-gradient(135deg, #1cc4bc, #0a6e6a)',
              // Soft neutral shadow instead of the old blue glow, so it reads on the dark navy sidebar.
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 6px rgba(13,34,56,0.35)',
            }}
          >
            A
          </div>
          <div className="min-w-0">
            {/* Wordmark stays white on the dark navy sidebar. */}
            <div className="text-white font-semibold text-[14px] tracking-[-0.01em] leading-tight">Ascend Hub</div>
            {/* "Unify" eyebrow: aqua-mid tints the brand line without bright small text. */}
            <div className="text-aqua-mid text-[10px] font-semibold tracking-[0.16em] uppercase">Unify</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {sections.map((section, i) => {
            const items = section.items.filter((item) => !item.adminOnly || isAdmin);
            if (items.length === 0) return null;
            return (
              <div key={i}>
                {section.header && (
                  // Sidebar group label: very dim white so it sits quietly under the bright nav items.
                  <div className="micro-title text-white/30 px-2.5 mb-1.5">{section.header}</div>
                )}
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavItem key={item.to} {...item} />
                  ))}
                </div>
              </div>
            );
          })}
          {isAdmin && (
            <div>
              {/* Sidebar group label (dim white) — matches the other section headers. */}
              <div className="micro-title text-white/30 px-2.5 mb-1.5">Admin</div>
              <div className="space-y-0.5">
                <NavItem to="/settings" label="Settings" icon="settings" />
              </div>
            </div>
          )}
        </nav>

        <div className="px-3 py-3 border-t border-white/10 space-y-0.5">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              // Same dark-sidebar treatment as the nav items: white-alpha text, aqua-tint active state.
              `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors duration-100 ${
                isActive ? 'bg-aqua/10 text-white' : 'text-white/55 hover:text-white/90 hover:bg-white/5'
              }`
            }
          >
            {/* Avatar chip: aqua gradient/border/text to match the brand accent on the dark sidebar. */}
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-aqua/40 to-aqua/15 border border-aqua/30 text-aqua flex items-center justify-center text-[10px] font-semibold shrink-0">
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
            // Sign-out sits quietly in dim white and brightens on hover, matching the dark sidebar idiom.
            className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium text-white/50 transition-colors duration-100 hover:text-white hover:bg-white/5"
          >
            <span className="text-white/40">{icons.signout}</span>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top header is LIGHT: translucent white over the paper background, with a hairline divider. */}
        <header className="h-12 shrink-0 sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-line flex items-center gap-2 px-8">
          <span className="text-[13px] text-muted">Unify Ascend Task Hub</span>
          {isAdmin && (
            // Admin pill on the light header: on-brand aqua tint with AA-safe aqua text and an aqua dot.
            <span className="pill bg-aqua-light text-aqua-text border-aqua/30">
              <span className="pill-dot bg-aqua" />
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
