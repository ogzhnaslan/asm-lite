import { Badge } from './Badge';
import type { BadgeVariant } from './Badge';

interface StatusConfig {
  variant: BadgeVariant;
  label: string;
  extraClass?: string;
}

const statusMap: Record<string, StatusConfig> = {
  VERIFIED: { variant: 'success', label: 'Verified' },
  DONE:     { variant: 'success', label: 'Done' },
  OK:       { variant: 'success', label: 'OK' },
  RESOLVED: { variant: 'success', label: 'Resolved', extraClass: 'opacity-70' },

  PENDING:  { variant: 'info', label: 'Pending', extraClass: 'bg-cyan-950/70 text-cyan-400 border-cyan-800/60' },
  RUNNING:  { variant: 'info', label: 'Running', extraClass: 'bg-cyan-950/70 text-cyan-400 border-cyan-800/60 animate-pulse' },

  SKIPPED:  { variant: 'muted', label: 'Skipped', extraClass: 'bg-yellow-950/40 text-yellow-600 border-yellow-900/40' },

  FAILED:   { variant: 'danger', label: 'Failed' },
  ERROR:    { variant: 'danger', label: 'Error' },

  ACTIVE:   { variant: 'warning', label: 'Active' },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const upper = status?.toUpperCase();
  const cfg = statusMap[upper];

  if (!cfg) {
    return <Badge variant="muted" className={className}>{status}</Badge>;
  }

  return (
    <Badge variant={cfg.variant} className={[cfg.extraClass, className].filter(Boolean).join(' ')}>
      {cfg.label}
    </Badge>
  );
}
