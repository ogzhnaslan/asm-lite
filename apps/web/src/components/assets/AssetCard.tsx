import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Asset } from '../../types';

interface AssetCardProps {
  asset: Asset;
  onVerify: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
  isDeleting: boolean;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function AssetCard({ asset, onVerify, onDelete, isDeleting }: AssetCardProps) {
  const isDomain   = asset.type === 'DOMAIN';
  const isVerified = asset.status === 'VERIFIED';

  const accentColor  = isDomain ? '#38bdf8' : '#a78bfa';
  const accentRing   = isDomain ? 'rgba(56,189,248,0.2)' : 'rgba(167,139,250,0.2)';
  const accentShadow = isDomain
    ? '0 8px 32px rgba(56,189,248,0.08), 0 2px 8px rgba(0,0,0,0.4)'
    : '0 8px 32px rgba(167,139,250,0.08), 0 2px 8px rgba(0,0,0,0.4)';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      className="group relative flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(145deg, #0e1d35 0%, #0b1628 100%)',
        border: '1px solid rgba(56,189,248,0.08)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = accentRing;
        el.style.boxShadow = accentShadow;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = 'rgba(56,189,248,0.08)';
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      }}
    >
      {/* Top accent stripe */}
      <div className="h-[2px] w-full flex-shrink-0" style={{
        background: `linear-gradient(90deg, transparent 0%, ${accentColor}60 50%, transparent 100%)`,
      }} />

      <div className="flex-1 p-5 space-y-4">

        {/* Badges row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">

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

            {/* Status badge */}
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg ${
              isVerified
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            }`}>
              {isVerified ? (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {isVerified ? 'Verified' : 'Pending'}
            </span>
          </div>

          {asset.critical && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg
              bg-red-500/10 text-red-400 border border-red-500/20 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              Critical
            </span>
          )}
        </div>

        {/* Asset value — primary */}
        <div>
          <p className="text-[17px] font-bold text-slate-100 truncate tracking-tight leading-snug"
            title={asset.value}>
            {asset.value}
          </p>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 text-[11px]" style={{ color: 'rgba(56,189,248,0.35)' }}>
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={1.75} style={{ color: 'rgba(56,189,248,0.25)' }}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {asset.scanInterval}
          </span>
          <span style={{ color: 'rgba(56,189,248,0.2)' }}>·</span>
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={1.75} style={{ color: 'rgba(56,189,248,0.25)' }}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {formatDate(asset.createdAt)}
          </span>
        </div>
      </div>

      {/* Action row */}
      <div className="px-5 pb-5 pt-4 flex items-center gap-2"
        style={{ borderTop: '1px solid rgba(56,189,248,0.06)' }}>

        <Link
          to={`/assets/${asset.id}`}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl
            text-[12px] font-semibold text-slate-300
            transition-all duration-150"
          style={{
            background: 'rgba(56,189,248,0.06)',
            border: '1px solid rgba(56,189,248,0.12)',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(56,189,248,0.1)';
            (e.currentTarget as HTMLElement).style.color = '#e2e8f0';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(56,189,248,0.06)';
            (e.currentTarget as HTMLElement).style.color = '';
          }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          İncele
        </Link>

        {!isVerified && (
          <button
            type="button"
            onClick={() => onVerify(asset)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[12px] font-semibold
              text-amber-400 bg-amber-500/[0.08] border border-amber-500/20
              hover:bg-amber-500/[0.14] hover:border-amber-500/30
              transition-all duration-150"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Doğrula
          </button>
        )}

        <button
          type="button"
          disabled={isDeleting}
          onClick={() => onDelete(asset)}
          title="Sil"
          className="flex items-center justify-center w-9 h-9 rounded-xl
            text-[rgba(56,189,248,0.25)] border border-transparent
            hover:text-red-400 hover:bg-red-500/[0.08] hover:border-red-500/20
            disabled:opacity-40 transition-all duration-150"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}
