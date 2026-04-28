import type { FindingSeverity, AssetStatus, ScanStatus } from '../types';

const severityStyle: Record<FindingSeverity, string> = {
  CRITICAL: 'bg-red-100 text-red-700 border border-red-200',
  HIGH: 'bg-orange-100 text-orange-700 border border-orange-200',
  MEDIUM: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  LOW: 'bg-green-100 text-green-700 border border-green-200',
};

export function SeverityBadge({ severity }: { severity: FindingSeverity }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${severityStyle[severity]}`}>
      {severity}
    </span>
  );
}

const statusStyle: Record<AssetStatus, string> = {
  VERIFIED: 'bg-emerald-100 text-emerald-700',
  PENDING: 'bg-amber-100 text-amber-700',
};

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${statusStyle[status]}`}>
      {status}
    </span>
  );
}

const scanStatusStyle: Record<ScanStatus, string> = {
  DONE: 'bg-emerald-100 text-emerald-700',
  RUNNING: 'bg-blue-100 text-blue-700',
  FAILED: 'bg-red-100 text-red-700',
};

export function ScanStatusBadge({ status }: { status: ScanStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${scanStatusStyle[status]}`}>
      {status}
    </span>
  );
}

export function TypeBadge({ type }: { type: 'DOMAIN' | 'IP' }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-600">
      {type}
    </span>
  );
}
