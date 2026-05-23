import type { ReactNode } from 'react';

interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({ title, description, action, className }: SectionHeaderProps) {
  return (
    <div className={['flex items-start justify-between gap-4', className].filter(Boolean).join(' ')}>
      <div>
        <h2 className="text-sm font-semibold text-slate-200 tracking-wide">{title}</h2>
        {description && (
          <p className="text-xs mt-0.5" style={{ color: 'rgba(148,163,184,0.6)' }}>{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
