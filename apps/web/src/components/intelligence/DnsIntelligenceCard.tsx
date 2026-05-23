import type { DnsIntelligence } from '../../types';
import { IntelligenceCard, IntelRow, IntelDivider, IntelNote } from './IntelligenceCard';
import type { CardState } from './IntelligenceCard';

function DnsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
    </svg>
  );
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

export function DnsIntelligenceCard({ dns }: { dns: DnsIntelligence | null }) {
  if (!dns) {
    return (
      <IntelligenceCard title="DNS Records" icon={<DnsIcon />} state="empty">
        <IntelNote>Yalnızca domain asset'lerde kullanılabilir; IP adresleri için veri yok.</IntelNote>
      </IntelligenceCard>
    );
  }

  const records = dns.records ?? [];
  const count = (type: string) => records.filter(r => r.type === type).length;

  const hasSpf = records.some(r => r.type === 'TXT' && r.value.includes('v=spf1'));
  const hasCaa = count('CAA') > 0;
  const hasErrors = dns.errors && Object.keys(dns.errors).length > 0;
  const isEmpty = records.length === 0;

  const state: CardState = dns.error ? 'error' : isEmpty ? 'warning' : 'ok';

  return (
    <IntelligenceCard title="DNS Records" icon={<DnsIcon />} state={state}>
      {dns.error && <IntelNote variant="error">{dns.error}</IntelNote>}

      {isEmpty && !dns.error && (
        <IntelNote variant="warning">
          DNS kayıtları alınamadı veya bu taramada kayıt listesi raporlanmadı.
          {!dns.dmarcRecord
            ? ' DMARC kaydı eksik olduğu için uyarı oluşturuldu.'
            : ''}
          {' '}OTX Passive DNS sayısı ise geçmiş gözlemleri gösterir; anlık kayıtlarla aynı değildir.
        </IntelNote>
      )}

      {hasErrors && (
        <IntelNote variant="warning">
          Bazı kayıt tipleri sorgulanamadı: {Object.keys(dns.errors!).join(', ')}
        </IntelNote>
      )}

      <IntelRow label="Toplam kayıt" value={records.length} />

      {!isEmpty && (
        <>
          <IntelDivider />
          {(['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA'] as const).map(type => {
            const n = count(type);
            return n > 0 ? <IntelRow key={type} label={type} value={n} /> : null;
          })}
        </>
      )}

      <IntelDivider />

      <IntelRow label="SPF" value={
        isEmpty
          ? <span style={{ color: 'rgba(148,163,184,0.4)' }}>Bu taramada raporlanmadı</span>
          : hasSpf
          ? <span className="text-emerald-400 font-semibold">Var</span>
          : <span className="text-amber-400 font-semibold">Yok</span>
      } />

      <IntelRow label="DMARC" value={
        dns.dmarcRecord
          ? <span className="text-emerald-400 font-semibold">Var</span>
          : <span className="text-amber-400 font-semibold">Eksik</span>
      } />

      <IntelRow label="CAA" value={
        isEmpty
          ? <span style={{ color: 'rgba(148,163,184,0.4)' }}>Bu taramada raporlanmadı</span>
          : hasCaa
          ? <span className="text-emerald-400 font-semibold">Var</span>
          : <span style={{ color: 'rgba(148,163,184,0.5)' }}>Yok</span>
      } />

      <IntelRow label="Son kontrol" value={fmtDate(dns.checkedAt)} />
    </IntelligenceCard>
  );
}
