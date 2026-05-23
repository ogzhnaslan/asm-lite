import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

function DefaultIcon() {
  return (
    <svg style={{ width: 40, height: 40, color: 'rgba(56,189,248,0.3)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0H4" />
    </svg>
  );
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={['flex flex-col items-center justify-center py-16 px-6 text-center', className].filter(Boolean).join(' ')}>
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{
          background: 'rgba(2,6,23,0.7)',
          border: '1px solid rgba(56,189,248,0.1)',
        }}
      >
        {icon ?? <DefaultIcon />}
      </div>
      <p className="text-sm font-semibold mb-1" style={{ color: '#cbd5e1' }}>{title}</p>
      {description && (
        <p className="text-xs max-w-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.6)' }}>{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
