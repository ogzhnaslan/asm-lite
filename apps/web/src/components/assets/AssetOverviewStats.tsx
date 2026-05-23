import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { animate } from 'framer-motion';

interface AssetOverviewStatsProps {
  total: number;
  verified: number;
  pending: number;
  critical: number;
  domains: number;
  ips: number;
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = value;
    const controls = animate(from, value, {
      duration: 0.8,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [value]);

  return <>{display}</>;
}

interface TileProps {
  label: string;
  sublabel: string;
  value: number;
  accentColor: string;
  ringColor: string;
  bgGradient: string;
  index: number;
  icon: React.ReactNode;
}

function StatTile({ label, sublabel, value, accentColor, ringColor, bgGradient, index, icon }: TileProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2, ease: 'easeOut' }}
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      className="relative flex flex-col p-4 rounded-2xl overflow-hidden"
      style={{
        background: bgGradient,
        border: `1px solid ${ringColor}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accentColor}40, transparent)` }} />

      {/* Icon + value row */}
      <div className="flex items-start justify-between mb-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${accentColor}14`, color: accentColor, border: `1px solid ${accentColor}20` }}>
          {icon}
        </div>
        <span className="text-[28px] font-black tabular-nums leading-none text-slate-100">
          <AnimatedNumber value={value} />
        </span>
      </div>

      {/* Labels */}
      <p className="text-[12px] font-semibold text-slate-300 leading-tight">{label}</p>
      <p className="text-[10px] mt-0.5 leading-tight" style={{ color: `${accentColor}80` }}>{sublabel}</p>
    </motion.div>
  );
}

export function AssetOverviewStats({ total, verified, pending, critical, domains, ips }: AssetOverviewStatsProps) {
  const tiles: Omit<TileProps, 'index'>[] = [
    {
      label: 'Total Assets',
      sublabel: 'Inventory',
      value: total,
      accentColor: '#94a3b8',
      ringColor: 'rgba(148,163,184,0.1)',
      bgGradient: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
        </svg>
      ),
    },
    {
      label: 'Verified',
      sublabel: 'Active Scan',
      value: verified,
      accentColor: '#34d399',
      ringColor: 'rgba(52,211,153,0.15)',
      bgGradient: 'linear-gradient(145deg, rgba(52,211,153,0.07) 0%, rgba(52,211,153,0.03) 100%)',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      label: 'Pending',
      sublabel: 'Awaiting Verify',
      value: pending,
      accentColor: '#fbbf24',
      ringColor: 'rgba(251,191,36,0.15)',
      bgGradient: 'linear-gradient(145deg, rgba(251,191,36,0.07) 0%, rgba(251,191,36,0.03) 100%)',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: 'Critical',
      sublabel: 'Priority Flag',
      value: critical,
      accentColor: '#f87171',
      ringColor: 'rgba(248,113,113,0.15)',
      bgGradient: 'linear-gradient(145deg, rgba(248,113,113,0.07) 0%, rgba(248,113,113,0.03) 100%)',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
        </svg>
      ),
    },
    {
      label: 'Domains',
      sublabel: 'Domain Assets',
      value: domains,
      accentColor: '#38bdf8',
      ringColor: 'rgba(56,189,248,0.15)',
      bgGradient: 'linear-gradient(145deg, rgba(56,189,248,0.07) 0%, rgba(56,189,248,0.03) 100%)',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
        </svg>
      ),
    },
    {
      label: 'IP Addresses',
      sublabel: 'IP Assets',
      value: ips,
      accentColor: '#a78bfa',
      ringColor: 'rgba(167,139,250,0.15)',
      bgGradient: 'linear-gradient(145deg, rgba(167,139,250,0.07) 0%, rgba(167,139,250,0.03) 100%)',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {tiles.map((tile, i) => (
        <StatTile key={tile.label} {...tile} index={i} />
      ))}
    </div>
  );
}
