import { Badge } from './Badge';
import type { BadgeVariant } from './Badge';

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

interface SeverityBadgeProps {
  severity: string;
  className?: string;
}

const severityConfig: Record<Severity, { variant: BadgeVariant; label: string; dot: string }> = {
  CRITICAL: { variant: 'danger',  label: 'Critical', dot: 'bg-red-400' },
  HIGH:     { variant: 'warning', label: 'High',     dot: 'bg-orange-400' },
  MEDIUM:   { variant: 'warning', label: 'Medium',   dot: 'bg-amber-400' },
  LOW:      { variant: 'info',    label: 'Low',       dot: 'bg-sky-400' },
};

// HIGH and MEDIUM share 'warning' but differ in dot/text color — override HIGH's text
const highOverride = 'bg-orange-950/70 text-orange-400 border-orange-800/60';
const mediumOverride = 'bg-amber-950/70 text-amber-400 border-amber-800/60';

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const upper = severity?.toUpperCase() as Severity;
  const cfg = severityConfig[upper];

  if (!cfg) {
    return <Badge variant="muted" className={className}>{severity}</Badge>;
  }

  const extraClass =
    upper === 'HIGH' ? highOverride : upper === 'MEDIUM' ? mediumOverride : undefined;

  return (
    <Badge variant={cfg.variant} className={[extraClass, className].filter(Boolean).join(' ')}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </Badge>
  );
}
