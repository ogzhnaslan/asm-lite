import type { ReactNode } from 'react';

const badgeStyles: Record<string, { bg: string; color: string; border: string }> = {
  blue:   { bg: 'rgba(56,189,248,0.08)',  color: '#38bdf8', border: 'rgba(56,189,248,0.2)' },
  green:  { bg: 'rgba(52,211,153,0.08)',  color: '#34d399', border: 'rgba(52,211,153,0.2)' },
  violet: { bg: 'rgba(167,139,250,0.08)', color: '#a78bfa', border: 'rgba(167,139,250,0.2)' },
  amber:  { bg: 'rgba(251,191,36,0.08)',  color: '#fbbf24', border: 'rgba(251,191,36,0.2)' },
  red:    { bg: 'rgba(248,113,113,0.08)', color: '#f87171', border: 'rgba(248,113,113,0.2)' },
  cyan:   { bg: 'rgba(56,189,248,0.08)',  color: '#38bdf8', border: 'rgba(56,189,248,0.2)' },
  slate:  { bg: 'rgba(100,116,139,0.08)', color: '#94a3b8', border: 'rgba(100,116,139,0.2)' },
  orange: { bg: 'rgba(249,115,22,0.08)',  color: '#fb923c', border: 'rgba(249,115,22,0.2)' },
};

const accentLineColors: Record<string, string> = {
  blue:   'rgba(56,189,248,0.5)',
  green:  'rgba(52,211,153,0.5)',
  violet: 'rgba(167,139,250,0.5)',
  amber:  'rgba(251,191,36,0.5)',
  red:    'rgba(248,113,113,0.5)',
  cyan:   'rgba(56,189,248,0.5)',
  none:   'transparent',
};

interface KnowledgeCardProps {
  title: string;
  description?: string;
  badge?: string;
  badgeColor?: keyof typeof badgeStyles;
  icon?: ReactNode;
  accent?: keyof typeof accentLineColors;
  children?: ReactNode;
}

export function KnowledgeCard({
  title,
  description,
  badge,
  badgeColor = 'blue',
  icon,
  accent = 'none',
  children,
}: KnowledgeCardProps) {
  const bs = badgeStyles[badgeColor] ?? badgeStyles.blue;
  const accentColor = accentLineColors[accent] ?? 'transparent';

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
        border: '1px solid rgba(56,189,248,0.08)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(56,189,248,0.16)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(56,189,248,0.08)'; }}
    >
      {/* Top accent line */}
      {accent !== 'none' && (
        <div className="h-px w-full" style={{
          background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
        }} />
      )}

      <div className="p-5">
        <div className="flex items-start gap-3">
          {icon && (
            <div
              className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
              style={{
                background: 'rgba(56,189,248,0.06)',
                border: '1px solid rgba(56,189,248,0.12)',
                color: '#38bdf8',
              }}
            >
              {icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{title}</h3>
              {badge && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold"
                  style={{ background: bs.bg, color: bs.color, border: `1px solid ${bs.border}` }}
                >
                  {badge}
                </span>
              )}
            </div>
            {description && (
              <p className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.65)' }}>{description}</p>
            )}
            {children && <div className="mt-3">{children}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
