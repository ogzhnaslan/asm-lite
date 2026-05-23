import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAssetIntelligence } from '../../api/api';
import { SkeletonCard } from '../ui/Skeleton';
import { ErrorState } from '../ui/ErrorState';
import { DnsIntelligenceCard } from './DnsIntelligenceCard';
import { RdapIntelligenceCard } from './RdapIntelligenceCard';
import { GeoIpIntelligenceCard } from './GeoIpIntelligenceCard';
import { RobotsIntelligenceCard } from './RobotsIntelligenceCard';
import { PhishTankIntelligenceCard } from './PhishTankIntelligenceCard';
import { ReputationIntelligenceCard } from './ReputationIntelligenceCard';
import { BreachIntelligenceCard } from './BreachIntelligenceCard';

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

interface IntelligenceOverviewProps {
  assetId: string;
}

export function IntelligenceOverview({ assetId }: IntelligenceOverviewProps) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['asset-intelligence', assetId],
    queryFn: () => getAssetIntelligence(assetId),
    enabled: !!assetId,
  });

  if (isPending) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 7 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Intelligence data could not be loaded"
        description="Run a scan first — intelligence snapshots are collected during scans."
        retry={() => void refetch()}
      />
    );
  }

  if (!data) {
    return (
      <ErrorState
        title="No intelligence data"
        description="Run a scan to collect intelligence snapshots for this asset."
      />
    );
  }

  return (
    <div className="space-y-4">
      {data.lastUpdatedAt && (
        <p className="text-xs" style={{ color: 'rgba(56,189,248,0.35)' }}>
          Son güncelleme:{' '}
          <span style={{ color: 'rgba(56,189,248,0.5)' }}>{fmtDateTime(data.lastUpdatedAt)}</span>
        </p>
      )}

      {/* Intelligence kartları */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <DnsIntelligenceCard dns={data.dns} />
        <RdapIntelligenceCard rdap={data.rdap} />
        <GeoIpIntelligenceCard geoip={data.geoip} />
        <RobotsIntelligenceCard robots={data.robots} />
        <PhishTankIntelligenceCard phishtank={data.phishtank} />
        <ReputationIntelligenceCard reputation={data.reputation} />
        <BreachIntelligenceCard breach={data.breach} />
      </div>

      {/* Passive Lookup yönlendirme notu */}
      <div
        className="flex items-center gap-2.5 rounded-xl px-4 py-3"
        style={{ background: 'rgba(56,189,248,0.03)', border: '1px solid rgba(56,189,248,0.08)' }}
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(56,189,248,0.4)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(148,163,184,0.45)' }}>
          OTX ve pasif tehdit istihbaratı sorguları{' '}
          <Link
            to="/intelligence/lookup"
            className="underline underline-offset-2 transition-colors"
            style={{ color: 'rgba(56,189,248,0.55)' }}
            onMouseEnter={e => ((e.target as HTMLElement).style.color = 'rgba(56,189,248,0.8)')}
            onMouseLeave={e => ((e.target as HTMLElement).style.color = 'rgba(56,189,248,0.55)')}
          >
            Passive Lookup
          </Link>
          {' '}bölümünde ayrı olarak görüntülenir.
        </p>
      </div>
    </div>
  );
}
