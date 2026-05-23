import * as dns from 'node:dns/promises';

export interface DnsRecord {
  type: string;
  value: string;
}

export interface DnsRecordsCheckResult {
  domain: string;
  records: DnsRecord[];
  dmarcRecord: string | null;
  checkedAt: string;
  errors: Record<string, string>;
  error?: string;
}

type RecordType = 'A' | 'AAAA' | 'MX' | 'NS' | 'TXT' | 'CNAME' | 'SOA' | 'CAA';

// Use public resolvers to bypass the system resolver, which may be unavailable
// or misconfigured (e.g. 127.0.0.1 with no local DNS service running).
// Same pattern as geoip.check.ts.
const DNS_SERVERS = ['1.1.1.1', '8.8.8.8'];

function createResolver(): dns.Resolver {
  const resolver = new dns.Resolver();
  resolver.setServers(DNS_SERVERS);
  return resolver;
}

async function resolveType(
  resolver: dns.Resolver,
  domain: string,
  type: RecordType,
): Promise<{ records: DnsRecord[]; error?: string }> {
  try {
    switch (type) {
      case 'A': {
        const addrs = await resolver.resolve4(domain);
        return { records: addrs.map((v) => ({ type, value: v })) };
      }
      case 'AAAA': {
        const addrs = await resolver.resolve6(domain);
        return { records: addrs.map((v) => ({ type, value: v })) };
      }
      case 'MX': {
        const entries = await resolver.resolveMx(domain);
        return { records: entries.map((e) => ({ type, value: `${e.priority} ${e.exchange}` })) };
      }
      case 'NS': {
        const ns = await resolver.resolveNs(domain);
        return { records: ns.map((v) => ({ type, value: v })) };
      }
      case 'TXT': {
        const chunks = await resolver.resolveTxt(domain);
        return { records: chunks.map((c) => ({ type, value: c.join('') })) };
      }
      case 'CNAME': {
        const cname = await resolver.resolveCname(domain);
        return { records: cname.map((v) => ({ type, value: v })) };
      }
      case 'SOA': {
        const soa = await resolver.resolveSoa(domain);
        const value = `${soa.nsname} ${soa.hostmaster} ${soa.serial} ${soa.refresh} ${soa.retry} ${soa.expire} ${soa.minttl}`;
        return { records: [{ type, value }] };
      }
      case 'CAA': {
        const entries = await resolver.resolveCaa(domain);
        return { records: entries.map((e) => ({ type, value: `${e.critical} ${e.issue ?? e.issuewild ?? e.iodef ?? ''}`.trim() })) };
      }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // ENODATA / ENOTFOUND mean the record type simply doesn't exist — not an error worth surfacing
    if (code === 'ENODATA' || code === 'ENOTFOUND') return { records: [] };
    return { records: [], error: code ?? (err as Error).message };
  }
}

const RECORD_TYPES: RecordType[] = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA', 'CAA'];

async function resolveDmarcRecord(resolver: dns.Resolver, domain: string): Promise<string | null> {
  try {
    const chunks = await resolver.resolveTxt(`_dmarc.${domain}`);
    const record = chunks.map((c) => c.join('')).find((v) => v.startsWith('v=DMARC1'));
    return record ?? null;
  } catch {
    return null;
  }
}

export async function checkDnsRecords(domain: string): Promise<DnsRecordsCheckResult> {
  const resolver = createResolver();

  const [results, dmarcRecord] = await Promise.all([
    Promise.all(RECORD_TYPES.map((type) => resolveType(resolver, domain, type).then((r) => ({ type, ...r })))),
    resolveDmarcRecord(resolver, domain),
  ]);

  const records: DnsRecord[] = [];
  const errors: Record<string, string> = {};

  for (const r of results) {
    records.push(...r.records);
    if (r.error) errors[r.type] = r.error;
  }

  return { domain, records, dmarcRecord, checkedAt: new Date().toISOString(), errors };
}
