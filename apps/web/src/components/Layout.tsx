import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { ReactNode } from 'react';

const navItems = [{ to: '/assets', label: 'Assets' }];

export function Layout({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <aside className="w-56 bg-slate-900 flex flex-col flex-shrink-0">
        <div className="p-5 border-b border-slate-700">
          <h1 className="text-white font-bold text-lg tracking-tight">ASM</h1>
          <p className="text-slate-400 text-xs mt-0.5">Attack Surface Monitor</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(item => {
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-slate-700 text-white font-medium'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-700">
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Çıkış Yap
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
