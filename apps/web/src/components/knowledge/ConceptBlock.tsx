const severityStyles = {
  CRITICAL: { dot: '#f87171', badge: 'rgba(248,113,113,0.08)', badgeBorder: 'rgba(248,113,113,0.2)', badgeText: '#f87171' },
  HIGH:     { dot: '#fb923c', badge: 'rgba(249,115,22,0.08)',  badgeBorder: 'rgba(249,115,22,0.2)',  badgeText: '#fb923c' },
  MEDIUM:   { dot: '#fbbf24', badge: 'rgba(251,191,36,0.08)',  badgeBorder: 'rgba(251,191,36,0.2)',  badgeText: '#fbbf24' },
  LOW:      { dot: '#38bdf8', badge: 'rgba(56,189,248,0.08)',  badgeBorder: 'rgba(56,189,248,0.2)',  badgeText: '#38bdf8' },
};

interface ConceptBlockProps {
  term: string;
  definition: string;
  note?: string;
  findingType?: string;
  severity?: keyof typeof severityStyles;
}

export function ConceptBlock({ term, definition, note, findingType, severity }: ConceptBlockProps) {
  const sev = severity ? severityStyles[severity] : null;

  return (
    <div
      className="flex gap-3 py-3 last:border-0"
      style={{ borderBottom: '1px solid rgba(56,189,248,0.06)' }}
    >
      <div
        className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: 'rgba(56,189,248,0.35)' }}
      />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{term}</span>
          {findingType && (
            <code
              className="px-1.5 py-0.5 rounded text-[10px] font-mono"
              style={{
                background: 'rgba(56,189,248,0.06)',
                color: 'rgba(56,189,248,0.7)',
                border: '1px solid rgba(56,189,248,0.12)',
              }}
            >
              {findingType}
            </code>
          )}
          {sev && severity && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold"
              style={{ background: sev.badge, color: sev.badgeText, border: `1px solid ${sev.badgeBorder}` }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: sev.dot }} />
              {severity}
            </span>
          )}
        </div>
        <p className="text-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.65)' }}>{definition}</p>
        {note && (
          <p className="text-[11px] italic leading-relaxed" style={{ color: 'rgba(100,116,139,0.7)' }}>{note}</p>
        )}
      </div>
    </div>
  );
}
