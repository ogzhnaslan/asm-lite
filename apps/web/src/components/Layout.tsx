import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { type ReactNode, useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';

interface NavItem {
  to: string;
  label: string;
  description?: string;
  matchPrefix: string;
  icon: ReactNode;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      {
        to: '/dashboard',
        label: 'Dashboard',
        description: 'Trend & örüntü analizi',
        matchPrefix: '/dashboard',
        icon: (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M3 12h4l3 8 4-16 3 8h4" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      {
        to: '/assets',
        label: 'Verified Assets',
        description: 'Active scan & ownership',
        matchPrefix: '/assets',
        icon: (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      {
        to: '/intelligence/lookup',
        label: 'Passive Lookup',
        description: 'No active scan',
        matchPrefix: '/intelligence/lookup',
        icon: (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        ),
      },
      {
        to: '/visual-analysis',
        label: 'AI Görsel Analiz',
        description: 'Public web intelligence',
        matchPrefix: '/visual-analysis',
        icon: (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ),
      },
      {
        to: '/intelligence/threat',
        label: 'Threat Intel',
        matchPrefix: '/intelligence/threat',
        icon: (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        ),
      },
      {
        to: '/intelligence/reputation',
        label: 'Reputation',
        matchPrefix: '/intelligence/reputation',
        icon: (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Knowledge',
    items: [
      {
        to: '/about',
        label: 'Hakkımızda',
        matchPrefix: '/about',
        icon: (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
      {
        to: '/knowledge/technical',
        label: 'Teknik Bilgiler',
        matchPrefix: '/knowledge/technical',
        icon: (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        ),
      },
      {
        to: '/knowledge/ports',
        label: 'Port Rehberi',
        matchPrefix: '/knowledge/ports',
        icon: (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
          </svg>
        ),
      },
      {
        to: '/knowledge/dns',
        label: 'DNS Güvenliği',
        matchPrefix: '/knowledge/dns',
        icon: (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
          </svg>
        ),
      },
      {
        to: '/knowledge/tls',
        label: 'TLS / SSL',
        matchPrefix: '/knowledge/tls',
        icon: (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        ),
      },
      {
        to: '/knowledge/http-headers',
        label: 'HTTP Headers',
        matchPrefix: '/knowledge/http-headers',
        icon: (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        ),
      },
      {
        to: '/knowledge/risk-scoring',
        label: 'Risk Skoru',
        matchPrefix: '/knowledge/risk-scoring',
        icon: (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
      },
    ],
  },
];

const groupVariants: Variants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.04 } },
};

const itemVariants: Variants = {
  hidden:  { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0 },
};

export function Layout({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [logoError, setLogoError] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#020617' }}>

      {/* ── Sidebar ── */}
      <motion.aside
        initial={{ x: -256, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-64 flex flex-col flex-shrink-0 relative z-10"
        style={{
          background: 'linear-gradient(180deg, #030b1a 0%, #020817 100%)',
          borderRight: '1px solid rgba(56,189,248,0.08)',
        }}
      >
        {/* Logo */}
        <div className="px-5 py-5 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(56,189,248,0.07)' }}>
          <div className="flex items-center gap-3">
            {/* Logo kutusu: 44×44, rounded-xl, overflow-hidden, fallback shield */}
            <div
              className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center transition-all duration-200"
              style={{
                background: 'rgba(6,18,42,0.9)',
                border: '1px solid rgba(56,189,248,0.18)',
                boxShadow: '0 0 18px rgba(56,189,248,0.1), 0 0 6px rgba(52,211,153,0.06)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow =
                  '0 0 24px rgba(56,189,248,0.22), 0 0 10px rgba(52,211,153,0.1)';
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(56,189,248,0.35)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow =
                  '0 0 18px rgba(56,189,248,0.1), 0 0 6px rgba(52,211,153,0.06)';
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(56,189,248,0.18)';
              }}
            >
              {!logoError ? (
                <img
                  src="/asmlogo.png"
                  alt="ASM Platform Logo"
                  className="w-full h-full object-cover"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="#38bdf8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                    d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              )}
            </div>

            <div className="min-w-0">
              <p className="text-[13px] font-bold leading-tight text-slate-100 tracking-wide">ASM Platform</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"
                  style={{ boxShadow: '0 0 5px rgba(52,211,153,0.7)' }} />
                <span className="text-[9px] text-slate-600 tracking-widest uppercase font-medium">Attack Surface Monitor</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <motion.div variants={groupVariants} initial="hidden" animate="visible" className="space-y-5">
            {navGroups.map((group) => (
              <div key={group.label}>
                <p className="px-2 pb-2 text-[10px] font-semibold tracking-widest uppercase"
                  style={{ color: 'rgba(56,189,248,0.35)' }}>
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map(item => {
                    const active = location.pathname.startsWith(item.matchPrefix);
                    return (
                      <motion.div key={item.to} variants={itemVariants}
                        transition={{ duration: 0.18, ease: 'easeOut' }}>
                        <Link
                          to={item.to}
                          className={`
                            flex items-start gap-2.5 px-3 py-2 rounded-xl text-[13px] transition-all duration-150
                            ${active
                              ? 'text-slate-100 border'
                              : 'text-slate-500 border border-transparent hover:text-slate-300 hover:bg-white/[0.03]'
                            }
                          `}
                          style={active ? {
                            background: 'rgba(56,189,248,0.06)',
                            borderColor: 'rgba(56,189,248,0.15)',
                            borderLeftColor: 'rgba(52,211,153,0.6)',
                            borderLeftWidth: '2px',
                          } : undefined}
                        >
                          <span className={`mt-0.5 flex-shrink-0 ${active ? 'text-cyan-400' : 'text-slate-700'}`}>
                            {item.icon}
                          </span>
                          <span className="flex flex-col gap-0 min-w-0">
                            <span className="truncate leading-tight font-medium">{item.label}</span>
                            {item.description && (
                              <span className={`text-[10px] leading-tight truncate font-normal mt-0.5 ${
                                active ? 'text-slate-500' : 'text-slate-700'
                              }`}>
                                {item.description}
                              </span>
                            )}
                          </span>
                          {active && (
                            <span className="ml-auto mt-1.5 flex-shrink-0">
                              <span className="block w-1.5 h-1.5 rounded-full bg-emerald-400"
                                style={{ boxShadow: '0 0 5px rgba(52,211,153,0.7)' }} />
                            </span>
                          )}
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </motion.div>
        </nav>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="px-3 pb-4 pt-3 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(56,189,248,0.07)' }}
        >
          {/* Status pill */}
          <div className="flex items-center gap-2 px-3 py-2 mb-1 rounded-xl"
            style={{
              background: 'rgba(52,211,153,0.04)',
              border: '1px solid rgba(52,211,153,0.1)',
            }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0 animate-pulse"
              style={{ boxShadow: '0 0 5px rgba(52,211,153,0.8)' }} />
            <span className="text-[10px] text-emerald-700 tracking-widest uppercase">Secure · Connected</span>
          </div>

          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px]
              text-slate-600 hover:text-slate-300 hover:bg-white/[0.04] transition-all duration-150"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Çıkış Yap
          </button>
        </motion.div>
      </motion.aside>

      {/* ── Main with page transitions ── */}
      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="flex-1 overflow-auto relative"
          style={{ background: 'transparent' }}
        >
          {children}
        </motion.main>
      </AnimatePresence>
    </div>
  );
}
