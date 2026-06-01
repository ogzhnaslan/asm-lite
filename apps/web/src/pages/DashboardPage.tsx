import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDashboardTrends } from '../api/api';
import type { DashboardWindow, DashboardDailyBucket } from '../types';

// Severity renkleri — FindingCard bar renkleriyle tutarlı.
const SEV = {
  critical: { color: '#ef4444', label: 'Kritik' },
  high: { color: '#f97316', label: 'Yüksek' },
  medium: { color: '#f59e0b', label: 'Orta' },
  low: { color: '#22c55e', label: 'Düşük' },
} as const;

const SEV_ORDER = ['critical', 'high', 'medium', 'low'] as const;

function fmtDate(iso: string): string {
  // 'YYYY-MM-DD' → 'DD.MM'
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

function TrendBadge({ trend, changePct }: { trend: 'up' | 'down' | 'flat'; changePct: number }) {
  const cfg =
    trend === 'up'
      ? { color: '#f87171', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)', arrow: '▲', label: `+${Math.abs(changePct)}%` }
      : trend === 'down'
        ? { color: '#4ade80', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.25)', arrow: '▼', label: `-${Math.abs(changePct)}%` }
        : { color: '#94a3b8', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.1)', arrow: '→', label: 'sabit' };
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
    >
      <span>{cfg.arrow}</span>
      {cfg.label}
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div
      className="rounded-2xl px-4 py-3.5"
      style={{ background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)', border: '1px solid rgba(56,189,248,0.08)' }}
    >
      <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: color ?? '#e2e8f0' }}>{value}</p>
    </div>
  );
}

function StackedBarChart({ daily }: { daily: DashboardDailyBucket[] }) {
  const max = Math.max(1, ...daily.map(b => b.total));
  // Eksen etiketleri: ilk, orta, son.
  const labelIdx = new Set([0, Math.floor(daily.length / 2), daily.length - 1]);

  return (
    <div>
      <div className="flex items-end gap-[3px] h-56" style={{ minHeight: '14rem' }}>
        {daily.map((b) => (
          <div
            key={b.date}
            className="flex-1 flex flex-col justify-end group relative"
            title={`${b.date} — ${b.total} bulgu (K${b.critical} Y${b.high} O${b.medium} D${b.low})`}
          >
            {b.total === 0 ? (
              <div className="w-full rounded-sm" style={{ height: '2px', background: 'rgba(255,255,255,0.05)' }} />
            ) : (
              SEV_ORDER.map((sev) => {
                const v = b[sev];
                if (v === 0) return null;
                return (
                  <div
                    key={sev}
                    className="w-full transition-opacity group-hover:opacity-80"
                    style={{ height: `${(v / max) * 100}%`, background: SEV[sev].color, minHeight: '2px' }}
                  />
                );
              })
            )}
          </div>
        ))}
      </div>
      {/* X ekseni */}
      <div className="flex gap-[3px] mt-1.5">
        {daily.map((b, i) => (
          <div key={b.date} className="flex-1 text-center">
            {labelIdx.has(i) && (
              <span className="text-[9px] text-slate-600 tabular-nums">{fmtDate(b.date)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const [window, setWindow] = useState<DashboardWindow>('30d');

  const q = useQuery({
    queryKey: ['dashboard-trends', window],
    queryFn: () => getDashboardTrends(window),
    staleTime: 60_000,
  });

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Tüm varlıklar — bulgu trendi ve örüntü analizi</p>
        </div>
        {/* Pencere toggle */}
        <div className="inline-flex rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {(['7d', '30d'] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindow(w)}
              className="text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-all"
              style={
                window === w
                  ? { background: 'rgba(56,189,248,0.14)', color: '#67e8f9', border: '1px solid rgba(56,189,248,0.25)' }
                  : { color: '#64748b', border: '1px solid transparent' }
              }
            >
              {w === '7d' ? 'Son 7 Gün' : 'Son 30 Gün'}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading && (
        <div className="rounded-2xl px-6 py-16 text-center text-slate-500"
          style={{ background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)', border: '1px solid rgba(56,189,248,0.08)' }}>
          Yükleniyor…
        </div>
      )}

      {q.isError && (
        <div className="rounded-2xl px-6 py-10 text-center text-red-400"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
          Veriler yüklenemedi. Lütfen tekrar deneyin.
        </div>
      )}

      {q.data && (
        <div className="space-y-5">
          {/* Insight / örüntü kutusu */}
          <div
            className="rounded-2xl px-5 py-4"
            style={{ background: 'linear-gradient(145deg, #0c1a30 0%, #0a1424 100%)', border: '1px solid rgba(56,189,248,0.14)' }}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-[11px] uppercase tracking-widest font-bold" style={{ color: 'rgba(56,189,248,0.7)' }}>
                Örüntü Analizi
              </span>
              <TrendBadge trend={q.data.insight.trend} changePct={q.data.insight.changePct} />
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{q.data.insight.text}</p>
          </div>

          {/* Özet kartlar */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Yeni (toplam)" value={q.data.totals.all} />
            <StatCard label="Kritik" value={q.data.totals.critical} color={SEV.critical.color} />
            <StatCard label="Yüksek" value={q.data.totals.high} color={SEV.high.color} />
            <StatCard label="Orta" value={q.data.totals.medium} color={SEV.medium.color} />
            <StatCard label="Düşük" value={q.data.totals.low} color={SEV.low.color} />
            <StatCard label="Açık Kritik+Yüksek" value={q.data.insight.activeCritical + q.data.insight.activeHigh} color="#fb923c" />
          </div>

          {/* Trend grafiği */}
          <div
            className="rounded-2xl px-5 py-5"
            style={{ background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)', border: '1px solid rgba(56,189,248,0.08)' }}
          >
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="text-sm font-semibold text-slate-300">
                Günlük yeni bulgular ({window === '7d' ? 'son 7 gün' : 'son 30 gün'})
              </h2>
              {/* Legend */}
              <div className="flex items-center gap-3 flex-wrap">
                {SEV_ORDER.map((sev) => (
                  <span key={sev} className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: SEV[sev].color }} />
                    {SEV[sev].label}
                  </span>
                ))}
              </div>
            </div>
            {q.data.totals.all === 0 ? (
              <div className="h-56 flex items-center justify-center text-sm text-slate-600">
                Bu dönemde yeni bulgu yok.
              </div>
            ) : (
              <StackedBarChart daily={q.data.daily} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
