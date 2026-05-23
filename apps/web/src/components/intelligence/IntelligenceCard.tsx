import type { ReactNode } from 'react';

export type CardState = 'ok' | 'warning' | 'danger' | 'skipped' | 'error' | 'empty';

const STATE_CFG: Record<CardState, {
  border: string; dot: string; dotColor: string; label: string; labelColor: string;
}> = {
  ok:      { border: 'rgba(52,211,153,0.25)',  dot: '#34d399',             dotColor: '', label: 'OK',      labelColor: '#34d399' },
  warning: { border: 'rgba(251,191,36,0.25)',  dot: '#fbbf24',             dotColor: '', label: 'Warning', labelColor: '#fbbf24' },
  danger:  { border: 'rgba(248,113,113,0.35)', dot: '#f87171',             dotColor: '', label: 'Alert',   labelColor: '#f87171' },
  skipped: { border: 'rgba(56,189,248,0.08)',  dot: 'rgba(56,189,248,0.35)', dotColor: '', label: 'Skipped', labelColor: 'rgba(56,189,248,0.5)' },
  error:   { border: 'rgba(248,113,113,0.25)', dot: '#ef4444',             dotColor: '', label: 'Error',   labelColor: '#f87171' },
  empty:   { border: 'rgba(56,189,248,0.08)',  dot: 'rgba(56,189,248,0.2)', dotColor: '', label: 'No Data', labelColor: 'rgba(56,189,248,0.35)' },
};

interface IntelligenceCardProps {
  title: string;
  icon: ReactNode;
  state: CardState;
  children: ReactNode;
}

export function IntelligenceCard({ title, icon, state, children }: IntelligenceCardProps) {
  const cfg = STATE_CFG[state];
  const isPulse = state === 'danger';
  return (
    <div
      className="rounded-2xl flex flex-col gap-3 p-5"
      style={{
        background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
        border: `1px solid ${cfg.border}`,
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.12)', color: '#38bdf8' }}
          >
            {icon}
          </div>
          <span className="text-sm font-bold" style={{ color: '#e2e8f0' }}>{title}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span
            className={`w-1.5 h-1.5 rounded-full${isPulse ? ' animate-pulse' : ''}`}
            style={{ background: cfg.dot }}
          />
          <span className="text-[11px] font-semibold" style={{ color: cfg.labelColor }}>{cfg.label}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

export function IntelRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs flex-shrink-0" style={{ color: 'rgba(148,163,184,0.6)' }}>{label}</span>
      <span className="text-xs text-right font-medium break-all" style={{ color: '#cbd5e1' }}>
        {value ?? '—'}
      </span>
    </div>
  );
}

export function IntelDivider() {
  return <div style={{ borderTop: '1px solid rgba(56,189,248,0.06)' }} />;
}

export function IntelNote({ children, variant = 'muted' }: {
  children: ReactNode;
  variant?: 'muted' | 'error' | 'warning';
}) {
  const style =
    variant === 'error'
      ? { color: '#f87171', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }
      : variant === 'warning'
      ? { color: '#fbbf24', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }
      : { color: 'rgba(148,163,184,0.6)', background: 'rgba(56,189,248,0.03)', border: '1px solid rgba(56,189,248,0.08)' };
  return (
    <div className="text-xs rounded-lg px-3 py-2" style={style}>{children}</div>
  );
}
