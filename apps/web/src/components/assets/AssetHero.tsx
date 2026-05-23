import { Link } from 'react-router-dom';
import type { Asset } from '../../types';

interface AssetHeroProps {
  asset: Asset;
  onRunScan: () => void;
  isRunScanLoading: boolean;
  onDeleteClick: () => void;
}

export function AssetHero({ asset, onRunScan, isRunScanLoading, onDeleteClick }: AssetHeroProps) {
  const isDomain   = asset.type === 'DOMAIN';
  const isVerified = asset.status === 'VERIFIED';
  const accentColor = isDomain ? '#38bdf8' : '#a78bfa';

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0d1b2e 0%, #0a1628 100%)',
        border: `1px solid rgba(56,189,248,0.12)`,
        boxShadow: '0 0 0 1px rgba(56,189,248,0.04), 0 16px 40px rgba(0,0,0,0.4)',
      }}
    >
      {/* Top accent line */}
      <div className="h-px w-full" style={{
        background: `linear-gradient(90deg, transparent, ${accentColor}60, rgba(52,211,153,0.3), transparent)`,
      }} />

      <div className="p-6">
        {/* Back link */}
        <Link
          to="/assets"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold mb-5 transition-colors"
          style={{ color: 'rgba(56,189,248,0.5)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#38bdf8'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(56,189,248,0.5)'; }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Asset Envanteri
        </Link>

        <div className="flex items-start justify-between gap-6 flex-wrap">
          {/* Left: identity */}
          <div className="min-w-0 flex-1">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: isVerified ? '#34d399' : '#fbbf24', boxShadow: `0 0 6px ${isVerified ? 'rgba(52,211,153,0.8)' : 'rgba(251,191,36,0.6)'}` }} />
              <span className="text-[10px] font-semibold tracking-widest uppercase"
                style={{ color: isVerified ? '#34d399' : '#fbbf24' }}>
                {isVerified ? 'Verified · Active Monitoring' : 'Pending · Awaiting Verification'}
              </span>
            </div>

            {/* Asset value */}
            <h1 className="text-[22px] font-black text-slate-100 font-mono tracking-tight truncate mb-3">
              {asset.value}
            </h1>

            {/* Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Type badge */}
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                style={{
                  background: `${accentColor}12`,
                  color: accentColor,
                  border: `1px solid ${accentColor}25`,
                }}>
                {isDomain ? (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                  </svg>
                )}
                {isDomain ? 'Domain' : 'IP Address'}
              </span>

              {/* Scan interval */}
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                style={{ background: 'rgba(56,189,248,0.06)', color: 'rgba(56,189,248,0.7)', border: '1px solid rgba(56,189,248,0.12)' }}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {asset.scanInterval}
              </span>

              {/* Critical badge */}
              {asset.critical && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg
                  bg-red-500/10 text-red-400 border border-red-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  Critical Priority
                </span>
              )}

              {/* Created date */}
              <span className="text-[11px] font-mono" style={{ color: 'rgba(56,189,248,0.3)' }}>
                {new Date(asset.createdAt).toLocaleDateString('tr-TR', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </span>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              disabled={isRunScanLoading || !isVerified}
              onClick={onRunScan}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold
                text-slate-900 bg-emerald-400 hover:bg-emerald-300
                disabled:opacity-40 disabled:cursor-not-allowed
                shadow-lg shadow-emerald-500/20 transition-all duration-150"
            >
              {isRunScanLoading ? (
                <div style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: '2px solid rgba(0,0,0,0.3)',
                  borderTopColor: '#000',
                  animation: 'spin 0.7s linear infinite',
                }} />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {isRunScanLoading ? 'Başlatılıyor…' : 'Şimdi Tara'}
            </button>

            <button
              type="button"
              onClick={onDeleteClick}
              className="flex items-center justify-center w-9 h-9 rounded-xl
                text-[rgba(56,189,248,0.3)] border border-transparent
                hover:text-red-400 hover:bg-red-500/[0.08] hover:border-red-500/20
                transition-all duration-150"
              title="Asset'i Sil"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
