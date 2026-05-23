import type { ReactNode } from 'react';

const badgeStyles: Record<string, { bg: string; color: string; border: string }> = {
  blue:   { bg: 'rgba(56,189,248,0.08)',  color: '#38bdf8', border: 'rgba(56,189,248,0.2)' },
  green:  { bg: 'rgba(52,211,153,0.08)',  color: '#34d399', border: 'rgba(52,211,153,0.2)' },
  violet: { bg: 'rgba(167,139,250,0.08)', color: '#a78bfa', border: 'rgba(167,139,250,0.2)' },
  amber:  { bg: 'rgba(251,191,36,0.08)',  color: '#fbbf24', border: 'rgba(251,191,36,0.2)' },
  red:    { bg: 'rgba(248,113,113,0.08)', color: '#f87171', border: 'rgba(248,113,113,0.2)' },
  cyan:   { bg: 'rgba(56,189,248,0.08)',  color: '#38bdf8', border: 'rgba(56,189,248,0.2)' },
};

interface KnowledgePageProps {
  title: string;
  description: string;
  badge?: string;
  badgeColor?: keyof typeof badgeStyles;
  children: ReactNode;
}

export function KnowledgePage({ title, description, badge, badgeColor = 'blue', children }: KnowledgePageProps) {
  const bs = badgeStyles[badgeColor] ?? badgeStyles.blue;
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="space-y-2 pb-4" style={{ borderBottom: '1px solid rgba(56,189,248,0.08)' }}>
        {badge && (
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold"
            style={{ background: bs.bg, color: bs.color, border: `1px solid ${bs.border}` }}
          >
            {badge}
          </span>
        )}
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#e2e8f0' }}>{title}</h1>
        <p className="text-sm leading-relaxed max-w-2xl" style={{ color: 'rgba(148,163,184,0.7)' }}>{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
