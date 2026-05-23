import type { ReactNode } from 'react';

interface ErrorStateProps {
  title?: string;
  description?: string;
  retry?: () => void;
  className?: string;
  children?: ReactNode;
}

function ErrorIcon() {
  return (
    <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

export function ErrorState({ title = 'Bir hata oluştu', description, retry, className, children }: ErrorStateProps) {
  return (
    <div className={['flex flex-col items-center justify-center py-12 px-6 text-center', className].filter(Boolean).join(' ')}>
      <div className="w-14 h-14 rounded-2xl bg-red-950/40 border border-red-900/50 flex items-center justify-center mb-4">
        <ErrorIcon />
      </div>
      <p className="text-sm font-semibold text-red-400 mb-1">{title}</p>
      {description && (
        <p className="text-xs max-w-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.6)' }}>{description}</p>
      )}
      {children}
      {retry && (
        <button
          onClick={retry}
          className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-colors"
          style={{
            background: 'rgba(14,29,53,0.8)',
            color: '#cbd5e1',
            border: '1px solid rgba(56,189,248,0.18)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(56,189,248,0.35)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(56,189,248,0.18)'; }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Tekrar dene
        </button>
      )}
    </div>
  );
}
