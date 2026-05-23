import type { BreachIntelligence } from '../../types';
import { IntelligenceCard, IntelRow, IntelDivider, IntelNote } from './IntelligenceCard';
import type { CardState } from './IntelligenceCard';

function BreachIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

const fmt = (iso: string | null) => iso
  ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
  : '—';

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

export function BreachIntelligenceCard({ breach }: { breach: BreachIntelligence | null }) {
  if (!breach) {
    return (
      <IntelligenceCard title="Breach Exposure" icon={<BreachIcon />} state="empty">
        <IntelNote>Yalnızca domain asset'lerde kullanılabilir; IP adresleri için veri yok.</IntelNote>
      </IntelligenceCard>
    );
  }

  if (breach.skipped) {
    const skipLabel = SKIP_LABEL[breach.skipReason ?? ''] ?? 'Bu kontrol çalıştırılmadı.';
    return (
      <IntelligenceCard title="Breach Exposure" icon={<BreachIcon />} state="skipped">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold" style={{ color: 'rgba(148,163,184,0.8)' }}>
            Breach Exposure kontrolü çalıştırılmadı.
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.55)' }}>
            Domain ile ilişkili e-posta veya veri sızıntısı sinyallerini kontrol eder. Aktif tarama yapmaz; pasif veri kaynaklarından sinyal toplar.
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

  const sensitiveDataTypes = breach.sensitiveDataTypes ?? [];
  const hasPasswordLeak = sensitiveDataTypes.some(
    t => t === 'password' || t === 'plaintext_password',
  );

  const state: CardState =
    breach.status === 'error' ? 'error' :
    breach.status === 'breached' && hasPasswordLeak ? 'danger' :
    breach.status === 'breached' ? 'warning' :
    'ok';

  return (
    <IntelligenceCard title="Breach Exposure" icon={<BreachIcon />} state={state}>
      {breach.error && <IntelNote variant="error">{breach.error}</IntelNote>}
      <IntelRow label="Durum" value={
        breach.status === 'breached'
          ? <span className={hasPasswordLeak ? 'text-red-400 font-bold' : 'text-amber-400 font-semibold'}>Sızıntı var</span>
          : breach.status === 'error'
          ? <span className="text-red-500">Hata</span>
          : <span className="text-emerald-400 font-semibold">Temiz</span>
      } />
      <IntelRow label="Sağlayıcı" value={breach.provider} />
      <IntelDivider />
      <IntelRow label="Sızıntı sayısı" value={breach.breachCount} />
      <IntelRow label="Etkilenen e-posta" value={breach.exposedEmailsCount} />
      <IntelRow label="Son sızıntı tarihi" value={fmt(breach.latestBreachDate)} />
      {sensitiveDataTypes.length > 0 && (
        <IntelRow label="Hassas veri türü" value={sensitiveDataTypes.slice(0, 3).join(', ')} />
      )}
    </IntelligenceCard>
  );
}
