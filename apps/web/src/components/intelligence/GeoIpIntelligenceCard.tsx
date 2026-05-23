import type { GeoIpIntelligence } from '../../types';
import { IntelligenceCard, IntelRow, IntelDivider, IntelNote } from './IntelligenceCard';
import type { CardState } from './IntelligenceCard';

function GeoIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

const RESOLUTION_ERRORS = new Set([
  'IP_RESOLUTION_FAILED',
  'DNS_RESOLUTION_FAILED',
  'DNS_RECORD_NOT_FOUND',
]);

function ResolutionErrorBody({ assetType }: { assetType: string }) {
  const isDomain = assetType === 'DOMAIN';
  return (
    <div className="flex flex-col gap-3">
      <div
        className="rounded-lg px-3 py-2.5 text-xs leading-relaxed"
        style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)', color: 'rgba(248,113,113,0.85)' }}
      >
        {isDomain
          ? 'Bu domain şu anda bir IP adresine çözümlenemediği için ülke, şehir, ASN ve ISP bilgileri hesaplanamadı.'
          : 'IP adresi bilgisi alınamadı.'}
      </div>

      {isDomain && (
        <div
          className="rounded-lg px-3 py-2.5 flex flex-col gap-1.5"
          style={{ background: 'rgba(56,189,248,0.03)', border: '1px solid rgba(56,189,248,0.08)' }}
        >
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: 'rgba(56,189,248,0.5)' }}
          >
            Olası nedenler ve öneriler
          </span>
          <ul className="flex flex-col gap-1 text-[11px]" style={{ color: 'rgba(148,163,184,0.65)' }}>
            <li>· Domain DNS A veya AAAA kaydı yok — DNS yönetim panelini kontrol edin.</li>
            <li>· Domain yeni eklendiyse DNS yayılımını bekleyin (5–48 saat).</li>
            <li>· Domain park edilmiş veya aktif değil olabilir.</li>
            <li>· Sonraki taramada otomatik tekrar denenecek.</li>
          </ul>
        </div>
      )}
    </div>
  );
}

export function GeoIpIntelligenceCard({ geoip }: { geoip: GeoIpIntelligence | null }) {
  if (!geoip) {
    return (
      <IntelligenceCard title="GeoIP / ASN" icon={<GeoIcon />} state="empty">
        <IntelNote>Henüz GeoIP verisi yok.</IntelNote>
      </IntelligenceCard>
    );
  }

  const state: CardState = geoip.error ? 'error' : 'ok';
  const isResolutionError = geoip.error ? RESOLUTION_ERRORS.has(geoip.error) : false;

  const location = [geoip.city, geoip.region].filter(Boolean).join(', ');
  const countryLabel = geoip.country
    ? `${geoip.country}${geoip.countryCode ? ` (${geoip.countryCode})` : ''}`
    : '—';

  const hasCoords = geoip.latitude != null && geoip.longitude != null;

  return (
    <IntelligenceCard title="GeoIP / ASN" icon={<GeoIcon />} state={state}>
      {geoip.error && (
        isResolutionError
          ? <ResolutionErrorBody assetType={geoip.assetType} />
          : <IntelNote variant="error">{geoip.error}</IntelNote>
      )}

      {!isResolutionError && (
        <>
          {geoip.resolvedIp && (
            <IntelRow label="Resolved IP" value={<span className="font-mono text-sky-300">{geoip.resolvedIp}</span>} />
          )}
          <IntelRow label="Ülke" value={countryLabel} />
          <IntelRow label="Bölge / Şehir" value={location || '—'} />
          {hasCoords && (
            <IntelRow
              label="Koordinat"
              value={
                <span className="font-mono text-xs" style={{ color: 'rgba(148,163,184,0.7)' }}>
                  {geoip.latitude!.toFixed(4)}, {geoip.longitude!.toFixed(4)}
                </span>
              }
            />
          )}
          <IntelDivider />
          <IntelRow label="ASN" value={geoip.asn ?? '—'} />
          <IntelRow label="ISP" value={geoip.isp ?? '—'} />
          <IntelRow label="Organizasyon" value={geoip.organization ?? '—'} />
          <IntelRow label="Sağlayıcı" value={geoip.provider} />
        </>
      )}
    </IntelligenceCard>
  );
}
