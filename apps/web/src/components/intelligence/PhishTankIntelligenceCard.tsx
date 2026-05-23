import type { PhishTankIntelligence, PhishTankMatchedUrl } from '../../types';
import { IntelligenceCard, IntelRow, IntelDivider, IntelNote } from './IntelligenceCard';
import type { CardState } from './IntelligenceCard';

function PhishIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  );
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

const SKIP_LABEL: Record<string, string> = {
  DISABLED:           'Entegrasyon kapalı.',
  NO_CREDENTIALS:     'Feed URL veya API anahtarı tanımlı değil.',
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

function MatchUrlItem({ match }: { match: PhishTankMatchedUrl }) {
  return (
    <div className="flex flex-col gap-0.5 py-1 border-b last:border-b-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
      <span className="text-xs break-all" style={{ color: 'rgba(248,113,113,0.85)' }}>
        {match.url}
      </span>
      <div className="flex items-center gap-2 flex-wrap">
        {match.verified && (
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: 'rgba(248,113,113,0.8)' }}>
            Doğrulanmış
          </span>
        )}
        {match.online && (
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(234,179,8,0.1)', color: 'rgba(234,179,8,0.8)' }}>
            Aktif
          </span>
        )}
        {match.detailUrl && (
          <a
            href={match.detailUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] underline"
            style={{ color: 'rgba(56,189,248,0.7)' }}
          >
            PhishTank detay →
          </a>
        )}
      </div>
    </div>
  );
}

export function PhishTankIntelligenceCard({ phishtank }: { phishtank: PhishTankIntelligence | null }) {
  if (!phishtank) {
    return (
      <IntelligenceCard title="PhishTank" icon={<PhishIcon />} state="empty">
        <IntelNote>Yalnızca domain asset'lerde kullanılabilir; IP adresleri için veri yok.</IntelNote>
      </IntelligenceCard>
    );
  }

  if (phishtank.skipped) {
    const skipLabel = SKIP_LABEL[phishtank.skipReason ?? ''] ?? 'Bu kontrol çalıştırılmadı.';
    return (
      <IntelligenceCard title="PhishTank" icon={<PhishIcon />} state="skipped">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold" style={{ color: 'rgba(148,163,184,0.8)' }}>
            PhishTank kontrolü çalıştırılmadı.
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.55)' }}>
            PhishTank, domain veya URL'nin bilinen phishing kampanyalarında geçip geçmediğini kontrol eder.
          </p>
          <IntelNote>{skipLabel}</IntelNote>
          <div className="flex flex-wrap gap-1.5">
            <Pill>Pasif kaynak</Pill>
            <Pill>Aktif tarama yapmaz</Pill>
          </div>
        </div>
      </IntelligenceCard>
    );
  }

  const state: CardState =
    phishtank.error ? 'error' :
    phishtank.isListed ? 'danger' :
    'ok';

  const matchUrls = phishtank.matchedUrls ?? [];
  const providerLabel = phishtank.provider === 'phishtank-feed' ? 'PhishTank Feed' : phishtank.provider;

  return (
    <IntelligenceCard title="PhishTank" icon={<PhishIcon />} state={state}>
      {phishtank.error && <IntelNote variant="error">{phishtank.error}</IntelNote>}
      <IntelRow label="Sağlayıcı" value={providerLabel} />
      <IntelRow label="Durum" value={
        phishtank.isListed
          ? <span className="text-red-400 font-bold">Phishing tespit edildi</span>
          : <span className="text-emerald-400 font-semibold">Temiz</span>
      } />
      <IntelDivider />
      <IntelRow label="Doğrulanmış eşleşme" value={phishtank.verifiedMatches} />
      <IntelRow label="Aktif eşleşme" value={phishtank.onlineMatches} />
      {matchUrls.length > 0 && (
        <IntelRow label="Eşleşen URL sayısı" value={matchUrls.length} />
      )}
      <IntelRow label="Son kontrol" value={fmtDate(phishtank.checkedAt)} />

      {matchUrls.length === 0 && !phishtank.error && (
        <>
          <IntelDivider />
          <IntelNote>
            PhishTank online-valid feed içinde bu hedefe ait aktif doğrulanmış phishing kaydı bulunmadı.
          </IntelNote>
        </>
      )}

      {matchUrls.length > 0 && (
        <>
          <IntelDivider />
          <p className="text-[11px] mb-1.5" style={{ color: 'rgba(148,163,184,0.6)' }}>
            Eşleşen URL'ler (ilk {Math.min(matchUrls.length, 5)} / {matchUrls.length})
          </p>
          <div className="flex flex-col">
            {matchUrls.slice(0, 5).map((m, i) => (
              <MatchUrlItem key={i} match={m} />
            ))}
          </div>
        </>
      )}
    </IntelligenceCard>
  );
}
