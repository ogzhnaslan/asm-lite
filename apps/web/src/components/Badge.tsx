import type { FindingSeverity, AssetStatus, ScanStatus } from '../types';

const severityConfig: Record<FindingSeverity, {
  cls: string; dot: string; label: string;
  bar: string; glow: string; ring: string;
}> = {
  CRITICAL: {
    cls:   'bg-red-500/10 text-red-400 border border-red-500/25',
    dot:   'bg-red-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.8)]',
    label: 'Kritik',
    bar:   'bg-red-500',
    glow:  'rgba(239,68,68,0.5)',
    ring:  '#ef4444',
  },
  HIGH: {
    cls:   'bg-orange-500/10 text-orange-400 border border-orange-500/25',
    dot:   'bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.7)]',
    label: 'Yüksek',
    bar:   'bg-orange-500',
    glow:  'rgba(249,115,22,0.5)',
    ring:  '#f97316',
  },
  MEDIUM: {
    cls:   'bg-amber-500/10 text-amber-400 border border-amber-500/25',
    dot:   'bg-amber-500',
    label: 'Orta',
    bar:   'bg-amber-500',
    glow:  'rgba(245,158,11,0.4)',
    ring:  '#f59e0b',
  },
  LOW: {
    cls:   'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25',
    dot:   'bg-emerald-500',
    label: 'Düşük',
    bar:   'bg-emerald-500',
    glow:  'rgba(34,197,94,0.3)',
    ring:  '#22c55e',
  },
};

export function SeverityBadge({ severity }: { severity: FindingSeverity }) {
  const cfg = severityConfig[severity];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export function getSeverityConfig(severity: FindingSeverity) {
  return severityConfig[severity];
}

const statusConfig: Record<AssetStatus, { cls: string; dot: string; label: string }> = {
  VERIFIED: { cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25', dot: 'bg-emerald-400', label: '✓ Doğrulanmış' },
  PENDING:  { cls: 'bg-amber-500/10 text-amber-400 border border-amber-500/25',       dot: 'bg-amber-400',   label: '⏳ Beklemede' },
};

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  const cfg = statusConfig[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

const scanStatusConfig: Record<ScanStatus, { cls: string; dot: string; label: string }> = {
  DONE:    { cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25', dot: 'bg-emerald-400',                      label: 'Tamamlandı' },
  RUNNING: { cls: 'bg-blue-500/10 text-blue-400 border border-blue-500/25',          dot: 'bg-blue-400 animate-pulse',            label: 'Çalışıyor'  },
  FAILED:  { cls: 'bg-red-500/10 text-red-400 border border-red-500/25',             dot: 'bg-red-400',                           label: 'Başarısız'  },
};

export function ScanStatusBadge({ status }: { status: ScanStatus }) {
  const cfg = scanStatusConfig[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export function TypeBadge({ type }: { type: 'DOMAIN' | 'IP' }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
      type === 'DOMAIN'
        ? 'bg-violet-500/10 text-violet-400 border border-violet-500/25'
        : 'bg-sky-500/10 text-sky-400 border border-sky-500/25'
    }`}>
      {type === 'DOMAIN' ? '🌐 Domain' : '🖧 IP Adresi'}
    </span>
  );
}
