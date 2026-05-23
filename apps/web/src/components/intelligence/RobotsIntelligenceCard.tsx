import type { RobotsIntelligence } from '../../types';
import { IntelligenceCard, IntelRow, IntelDivider, IntelNote } from './IntelligenceCard';
import type { CardState } from './IntelligenceCard';

function RobotsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1-.23 2.188-1.9 2.188H4.698c-1.67 0-2.9-1.188-1.9-2.188L4.2 15.3" />
    </svg>
  );
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

export function RobotsIntelligenceCard({ robots }: { robots: RobotsIntelligence | null }) {
  if (!robots) {
    return (
      <IntelligenceCard title="robots.txt" icon={<RobotsIcon />} state="empty">
        <IntelNote>Yalnızca domain asset'lerde kullanılabilir; IP adresleri için veri yok.</IntelNote>
      </IntelligenceCard>
    );
  }

  const state: CardState =
    robots.error ? 'error' :
    !robots.exists ? 'ok' :
    robots.highSeverityPaths.length > 0 ? 'danger' :
    robots.sensitivePaths.length > 0 ? 'warning' :
    'ok';

  return (
    <IntelligenceCard title="robots.txt" icon={<RobotsIcon />} state={state}>
      {robots.error && <IntelNote variant="error">{robots.error}</IntelNote>}
      <IntelRow label="Dosya mevcut" value={
        robots.exists
          ? <span className="text-emerald-400 font-semibold">Evet</span>
          : <span style={{ color: 'rgba(148,163,184,0.5)' }}>Hayır</span>
      } />
      {robots.exists && (
        <>
          {robots.statusCode != null && <IntelRow label="HTTP durumu" value={robots.statusCode} />}
          <IntelDivider />
          <IntelRow label="Disallow kuralı" value={robots.disallowRules.length} />
          <IntelRow label="Sitemap URL" value={robots.sitemapUrls.length} />
          <IntelRow label="Hassas path" value={
            robots.sensitivePaths.length > 0
              ? <span className="text-amber-400 font-semibold">{robots.sensitivePaths.length}</span>
              : 0
          } />
          {robots.highSeverityPaths.length > 0 && (
            <IntelRow label="Yüksek riskli path" value={
              <span className="text-red-400 font-semibold">{robots.highSeverityPaths.length}</span>
            } />
          )}
        </>
      )}
      <IntelRow label="Son kontrol" value={fmtDate(robots.checkedAt)} />
    </IntelligenceCard>
  );
}
