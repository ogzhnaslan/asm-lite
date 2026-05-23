import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login as apiLogin, register as apiRegister } from '../api/api';
import { motion, AnimatePresence } from 'framer-motion';

const BOOT_LINES = [
  '> INITIALIZING ASM PLATFORM v2.0.0...',
  '> LOADING THREAT INTELLIGENCE MODULES...',
  '> ESTABLISHING SECURE CHANNEL...',
  '> AUTHENTICATION REQUIRED',
];

function BootSequence({ onDone }: { onDone: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    const next = () => {
      if (i < BOOT_LINES.length) {
        setLines(prev => [...prev, BOOT_LINES[i]]);
        i++;
        setTimeout(next, 280);
      } else {
        setTimeout(() => { setDone(true); setTimeout(onDone, 200); }, 300);
      }
    };
    const t = setTimeout(next, 200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="font-mono text-xs space-y-1 min-h-[88px]"
    >
      {lines.map((line, i) => (
        <motion.p
          key={i}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            color: i === lines.length - 1 && done
              ? '#38bdf8'
              : 'rgba(56,189,248,0.45)',
          }}
        >
          {line}
          {i === lines.length - 1 && !done && (
            <span style={{ color: '#38bdf8', marginLeft: 2 }}>█</span>
          )}
        </motion.p>
      ))}
    </motion.div>
  );
}

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [booted, setBooted] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await apiLogin(email, password);
        login(res.token);
      } else {
        const res = await apiRegister(email, password);
        login(res.token);
      }
      navigate('/assets');
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'AUTH_FAILED: Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: '#020617' }}
    >
      {/* Ambient glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.04) 0%, transparent 65%)', transform: 'translate(-30%, -30%)' }} />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(52,211,153,0.03) 0%, transparent 65%)', transform: 'translate(30%, 30%)' }} />
        <div className="absolute top-1/2 left-1/2 w-[600px] h-[600px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.02) 0%, transparent 60%)', transform: 'translate(-50%, -50%)' }} />
      </div>

      {/* Grid texture */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: `
          linear-gradient(rgba(56,189,248,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(56,189,248,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
      }} />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative w-full max-w-sm"
      >
        {/* Corner bracket decorations */}
        <div className="absolute -top-px -left-px w-5 h-5 border-t border-l"
          style={{ borderColor: 'rgba(56,189,248,0.4)' }} />
        <div className="absolute -top-px -right-px w-5 h-5 border-t border-r"
          style={{ borderColor: 'rgba(56,189,248,0.4)' }} />
        <div className="absolute -bottom-px -left-px w-5 h-5 border-b border-l"
          style={{ borderColor: 'rgba(56,189,248,0.4)' }} />
        <div className="absolute -bottom-px -right-px w-5 h-5 border-b border-r"
          style={{ borderColor: 'rgba(56,189,248,0.4)' }} />

        {/* Card */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
            border: '1px solid rgba(56,189,248,0.12)',
            boxShadow: '0 0 0 1px rgba(56,189,248,0.04), 0 24px 64px rgba(0,0,0,0.5)',
          }}
        >
          {/* Top accent line */}
          <div className="h-px w-full" style={{
            background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.6), rgba(52,211,153,0.4), transparent)',
          }} />

          <div className="p-7">
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                {/* Shield icon */}
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'rgba(56,189,248,0.08)',
                    border: '1px solid rgba(56,189,248,0.2)',
                    boxShadow: '0 0 16px rgba(56,189,248,0.1)',
                  }}
                >
                  <svg className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} fill="none" stroke="#38bdf8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                      d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-sm tracking-widest uppercase font-mono"
                    style={{ color: '#38bdf8' }}>
                    ASM_PLATFORM
                  </p>
                  <p className="text-[9px] tracking-widest font-mono"
                    style={{ color: 'rgba(56,189,248,0.35)' }}>
                    ATTACK SURFACE MONITOR // v2.0.0
                  </p>
                </div>
              </div>

              {/* Boot terminal */}
              <div className="p-3 rounded-lg" style={{
                background: 'rgba(2,6,23,0.8)',
                border: '1px solid rgba(56,189,248,0.08)',
              }}>
                <AnimatePresence mode="wait">
                  {!booted ? (
                    <BootSequence key="boot" onDone={() => setBooted(true)} />
                  ) : (
                    <motion.p
                      key="ready"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-[10px] font-mono"
                      style={{ color: '#38bdf8' }}
                    >
                      {'> SYSTEM READY — AUTHENTICATE TO CONTINUE'}
                      <span style={{ color: '#38bdf8', marginLeft: 2 }}>█</span>
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <AnimatePresence>
              {booted && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                >
                  {/* Mode tabs */}
                  <div
                    className="flex mb-5 rounded-xl overflow-hidden"
                    style={{ background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.1)' }}
                  >
                    {(['login', 'register'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => { setMode(m); setError(''); }}
                        className="flex-1 py-2 text-[11px] font-semibold tracking-wider uppercase transition-all duration-150"
                        style={mode === m ? {
                          color: '#38bdf8',
                          background: 'rgba(56,189,248,0.1)',
                          borderBottom: '2px solid rgba(56,189,248,0.6)',
                        } : {
                          color: 'rgba(56,189,248,0.35)',
                          background: 'transparent',
                          borderBottom: '2px solid transparent',
                        }}
                      >
                        {m === 'login' ? 'LOGIN' : 'REGISTER'}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-3.5">
                    <div>
                      <label className="block text-[9px] font-bold mb-1.5 tracking-[0.15em] uppercase font-mono"
                        style={{ color: 'rgba(56,189,248,0.4)' }}>
                        // EMAIL_ADDRESS
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                        autoFocus
                        className="w-full px-3 py-2.5 text-[12px] outline-none transition-all duration-150 rounded-lg font-mono"
                        style={{
                          background: 'rgba(2,6,23,0.7)',
                          border: '1px solid rgba(56,189,248,0.14)',
                          color: '#cbd5e1',
                        }}
                        onFocus={e => {
                          (e.target as HTMLElement).style.borderColor = 'rgba(56,189,248,0.4)';
                          (e.target as HTMLElement).style.boxShadow = '0 0 0 3px rgba(56,189,248,0.06)';
                        }}
                        onBlur={e => {
                          (e.target as HTMLElement).style.borderColor = 'rgba(56,189,248,0.14)';
                          (e.target as HTMLElement).style.boxShadow = 'none';
                        }}
                        placeholder="user@domain.com"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold mb-1.5 tracking-[0.15em] uppercase font-mono"
                        style={{ color: 'rgba(56,189,248,0.4)' }}>
                        // PASSWORD
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        minLength={8}
                        className="w-full px-3 py-2.5 text-[12px] outline-none transition-all duration-150 rounded-lg font-mono"
                        style={{
                          background: 'rgba(2,6,23,0.7)',
                          border: '1px solid rgba(56,189,248,0.14)',
                          color: '#cbd5e1',
                        }}
                        onFocus={e => {
                          (e.target as HTMLElement).style.borderColor = 'rgba(56,189,248,0.4)';
                          (e.target as HTMLElement).style.boxShadow = '0 0 0 3px rgba(56,189,248,0.06)';
                        }}
                        onBlur={e => {
                          (e.target as HTMLElement).style.borderColor = 'rgba(56,189,248,0.14)';
                          (e.target as HTMLElement).style.boxShadow = 'none';
                        }}
                        placeholder="••••••••"
                      />
                      {mode === 'register' && (
                        <p className="text-[9px] mt-1.5 tracking-wide font-mono"
                          style={{ color: 'rgba(56,189,248,0.3)' }}>
                          MIN_LENGTH: 8 CHARS
                        </p>
                      )}
                    </div>

                    <AnimatePresence>
                      {error && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="px-3 py-2.5 text-[11px] rounded-lg font-mono"
                          style={{
                            background: 'rgba(239,68,68,0.06)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            color: '#f87171',
                          }}
                        >
                          <span style={{ color: '#ef4444' }}>[ERR]</span>{' '}{error}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2.5 text-sm font-bold tracking-wide rounded-xl mt-1 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: loading ? 'rgba(52,211,153,0.7)' : '#34d399',
                        color: '#020617',
                        boxShadow: loading ? 'none' : '0 4px 16px rgba(52,211,153,0.25)',
                      }}
                      onMouseEnter={e => {
                        if (!loading) {
                          (e.currentTarget as HTMLElement).style.background = '#6ee7b7';
                          (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(52,211,153,0.35)';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!loading) {
                          (e.currentTarget as HTMLElement).style.background = '#34d399';
                          (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(52,211,153,0.25)';
                        }
                      }}
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <div style={{
                            width: 14, height: 14, borderRadius: '50%',
                            border: '2px solid rgba(2,6,23,0.3)',
                            borderTopColor: '#020617',
                            animation: 'spin 0.7s linear infinite',
                            flexShrink: 0,
                          }} />
                          AUTHENTICATING...
                        </span>
                      ) : mode === 'login' ? 'Authenticate' : 'Create Account'}
                    </button>
                  </form>

                  <p className="text-center text-[9px] mt-5 tracking-[0.2em] uppercase font-mono"
                    style={{ color: 'rgba(56,189,248,0.2)' }}>
                    ENCRYPTED // ZERO-TRUST // MONITORED
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
