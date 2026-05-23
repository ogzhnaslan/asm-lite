import type { ReputationIntelligence } from '../../types';
import { IntelligenceCard, IntelRow, IntelDivider, IntelNote } from './IntelligenceCard';
import type { CardState } from './IntelligenceCard';

function ShieldIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

const SKIP_LABEL: Record<string, string> = {
  DISABLED:           'Entegrasyon kapalı.',
  NO_CREDENTIALS:     'API anahtarı tanımlı değil.',
  UNSUPPORTED_TARGET: 'Bu hedef tipi desteklenmiyor.',
  RATE_LIMITED:       'İstek limiti aşıldı.',
};

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full"
      style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.12)', color: 'rgba(56,189,248,0.6)' }}
    >
      {children}
    </span>
  );
}

export function ReputationIntelligenceCard({ reputation }: { reputation: ReputationIntelligence | null }) {
  if (!reputation) {
    return (
      <IntelligenceCard title="Malicious Reputation" icon={<ShieldIcon />} state="empty">
        <IntelNote>Henüz reputation verisi yok.</IntelNote>
      </IntelligenceCard>
    );
  }

  if (reputation.skipped) {
    const skipLabel = SKIP_LABEL[reputation.skipReason ?? ''] ?? 'Bu kontrol çalıştırılmadı.';
    return (
      <IntelligenceCard title="Malicious Reputation" icon={<ShieldIcon />} state="skipped">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold" style={{ color: 'rgba(148,163,184,0.8)' }}>
            Reputation kontrolü çalıştırılmadı.
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.55)' }}>
            Harici reputation kaynakları üzerinden domain/IP için zararlı veya şüpheli sinyal olup olmadığını kontrol eder.
          </p>
          <IntelNote>{skipLabel}</IntelNote>
          <div className="flex flex-wrap gap-1.5">
            <Pill>Pasif kaynak</Pill>
            <Pill>API anahtarı gerekli</Pill>
            <Pill>Aktif tarama yapmaz</Pill>
          </div>
        </div>
      </IntelligenceCard>
    );
  }

  const ERROR_LABEL: Record<string, string> = {
    URLHAUS_KEY_REQUIRED: 'URLhaus API anahtarı geçersiz veya süresi dolmuş (URLHAUS_API_KEY).',
    ALL_PROVIDERS_FAILED: 'Reputation sağlayıcısı geçici olarak yanıt vermedi.',
    TIMEOUT:              'Sağlayıcı zaman aşımına uğradı.',
    REQUEST_FAILED:       'Sağlayıcıya ağ bağlantısı kurulamadı.',
    HTTP_401:             'AbuseIPDB API anahtarı geçersiz veya yetkisiz (ABUSEIPDB_API_KEY).',
    HTTP_403:             'AbuseIPDB erişimi reddedildi (ABUSEIPDB_API_KEY).',
    HTTP_429:             'AbuseIPDB istek limiti aşıldı. Birkaç dakika sonra tekrar deneyin.',
    INVALID_RESPONSE:     'Sağlayıcıdan geçersiz yanıt alındı.',
  };

  const errorLabel = reputation.error
    ? (ERROR_LABEL[reputation.error] ?? `Sağlayıcı hatası: ${reputation.error}`)
    : null;

  const state: CardState =
    reputation.error ? 'error' :
    reputation.isMalicious ? 'danger' :
    (reputation.maxScore ?? 0) > 0 ? 'warning' :
    'ok';

  const score = reputation.maxScore;
  const scoreColor =
    (score ?? 0) >= 70 ? 'text-red-400 font-bold' :
    (score ?? 0) >= 40 ? 'text-amber-400 font-semibold' :
    'text-slate-300';

  const okProviders = (reputation.providers ?? []).filter((p) => p.status !== 'error');
  const providerNames = okProviders.length > 0
    ? okProviders.map((p) => p.name).join(', ')
    : (reputation.providers ?? []).filter((p) => p.name).map((p) => p.name).join(', ');

  const abuseProvider = okProviders.find((p) => p.name === 'abuseipdb');
  const hasAbuseDetails = abuseProvider && (
    (abuseProvider.reportCount != null && abuseProvider.reportCount > 0) ||
    abuseProvider.lastReportedAt
  );

  return (
    <IntelligenceCard title="Malicious Reputation" icon={<ShieldIcon />} state={state}>
      {errorLabel ? (
        <div className="flex flex-col gap-1.5">
          <IntelNote variant="error">{errorLabel}</IntelNote>
          <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(148,163,184,0.5)' }}>
            Bu durum hedefin zararlı olduğu anlamına gelmez — sadece reputation kontrolü tamamlanamadı.
          </p>
          <IntelRow label="Son kontrol" value={fmtDate(reputation.checkedAt)} />
        </div>
      ) : (
        <>
          <IntelRow label="Zararlı" value={
            reputation.isMalicious
              ? <span className="text-red-400 font-bold">EVET</span>
              : <span className="text-emerald-400 font-semibold">Hayır</span>
          } />
          <IntelRow label="Skor" value={
            score != null && score > 0
              ? <span className={scoreColor}>{score}</span>
              : <span className="text-slate-500">—</span>
          } />
          {hasAbuseDetails && (
            <>
              {abuseProvider!.reportCount != null && abuseProvider!.reportCount > 0 && (
                <IntelRow label="Rapor Sayısı" value={String(abuseProvider!.reportCount)} />
              )}
              {abuseProvider!.lastReportedAt && (
                <IntelRow label="Son Rapor" value={fmtDate(abuseProvider!.lastReportedAt)} />
              )}
            </>
          )}
          <IntelDivider />
          {providerNames && <IntelRow label="Sağlayıcı" value={providerNames} />}
          {(reputation.categories ?? []).length > 0 && (
            <IntelRow label="Kategoriler" value={(reputation.categories ?? []).slice(0, 3).join(', ')} />
          )}
          <IntelRow label="Son kontrol" value={fmtDate(reputation.checkedAt)} />
        </>
      )}
    </IntelligenceCard>
  );
}
