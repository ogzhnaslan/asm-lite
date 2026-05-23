import type { RdapIntelligence } from '../../types';
import { IntelligenceCard, IntelRow, IntelDivider, IntelNote } from './IntelligenceCard';
import type { CardState } from './IntelligenceCard';

function RdapIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
    </svg>
  );
}

const fmt = (iso: string | null) => iso
  ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—';

export function RdapIntelligenceCard({ rdap }: { rdap: RdapIntelligence | null }) {
  if (!rdap) {
    return (
      <IntelligenceCard title="WHOIS / RDAP" icon={<RdapIcon />} state="empty">
        <IntelNote>Domain assets only — not available for IP addresses.</IntelNote>
      </IntelligenceCard>
    );
  }

  const state: CardState = rdap.error ? 'error' : 'ok';

  return (
    <IntelligenceCard title="WHOIS / RDAP" icon={<RdapIcon />} state={state}>
      {rdap.error && <IntelNote variant="error">{rdap.error}</IntelNote>}
      <IntelRow label="Registrar" value={rdap.registrar ?? '—'} />
      <IntelRow label="Created" value={fmt(rdap.createdDate)} />
      <IntelRow label="Expires" value={fmt(rdap.expiresDate)} />
      <IntelRow label="Updated" value={fmt(rdap.updatedDate)} />
      <IntelDivider />
      <IntelRow label="Nameservers" value={(rdap.nameServers ?? []).length} />
      <IntelRow label="Status flags" value={(rdap.status ?? []).length} />
      <IntelRow label="Source" value={rdap.rawSource} />
    </IntelligenceCard>
  );
}
