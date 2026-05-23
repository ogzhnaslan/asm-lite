import { processDnsFindings } from './dns.findings';
import type { DnsRecordsCheckResult, DnsRecord } from '../checks/dns-records.check';

const mockPrisma = {
  finding: {
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

const asset = { id: 'asset-1', value: 'example.com' };
const scanRunId = 'run-1';

function makeDns(opts: {
  records?: DnsRecord[];
  dmarcRecord?: string | null;
  error?: string;
  errors?: Record<string, string>;
} = {}): DnsRecordsCheckResult {
  return {
    domain: 'example.com',
    records: opts.records ?? [],
    dmarcRecord: opts.dmarcRecord ?? null,
    checkedAt: new Date().toISOString(),
    errors: opts.errors ?? {},
    error: opts.error,
  };
}

function prevSnap(records: DnsRecord[]) {
  return { dataJson: { records } };
}

describe('processDnsFindings', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── error guard ─────────────────────────────────────────────────────────────

  it('dnsResult.error varsa hiçbir DB çağrısı yapılmaz', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ error: 'CHECK_CRASHED' }),
      prevDnsSnap: null,
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  // ─── DNS_SPF_MISSING ──────────────────────────────────────────────────────────

  it('SPF kaydı yoksa DNS_SPF_MISSING upsert edilir', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ records: [] }),
      prevDnsSnap: null,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'DNS_SPF_MISSING' }),
      }),
    );
  });

  it('SPF kaydı varsa DNS_SPF_MISSING resolve edilir', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({
        records: [{ type: 'TXT', value: 'v=spf1 include:_spf.google.com ~all' }],
      }),
      prevDnsSnap: null,
    });

    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: 'DNS_SPF_MISSING:example.com' }),
      }),
    );
  });

  // ─── DNS_DMARC_MISSING / DNS_DMARC_WEAK_POLICY ──────────────────────────────

  it('DMARC yoksa DNS_DMARC_MISSING upsert, DNS_DMARC_WEAK_POLICY resolve edilir', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ dmarcRecord: null }),
      prevDnsSnap: null,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'DNS_DMARC_MISSING' }),
      }),
    );
    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: 'DNS_DMARC_WEAK_POLICY:example.com' }),
      }),
    );
  });

  it('DMARC p=none ise DNS_DMARC_MISSING resolve, DNS_DMARC_WEAK_POLICY upsert edilir', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ dmarcRecord: 'v=DMARC1; p=none; rua=mailto:dmarc@example.com' }),
      prevDnsSnap: null,
    });

    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: 'DNS_DMARC_MISSING:example.com' }),
      }),
    );
    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'DNS_DMARC_WEAK_POLICY' }),
      }),
    );
  });

  it('DMARC p=reject ise DNS_DMARC_MISSING ve DNS_DMARC_WEAK_POLICY resolve edilir', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ dmarcRecord: 'v=DMARC1; p=reject; rua=mailto:dmarc@example.com' }),
      prevDnsSnap: null,
    });

    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ key: 'DNS_DMARC_MISSING:example.com' }) }),
    );
    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ key: 'DNS_DMARC_WEAK_POLICY:example.com' }) }),
    );
    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ type: 'DNS_DMARC_WEAK_POLICY' }) }),
    );
  });

  // ─── DNS_CAA_MISSING ─────────────────────────────────────────────────────────

  it('CAA kaydı yoksa DNS_CAA_MISSING upsert edilir', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ records: [] }),
      prevDnsSnap: null,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'DNS_CAA_MISSING' }),
      }),
    );
  });

  it('CAA kaydı varsa DNS_CAA_MISSING resolve edilir', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ records: [{ type: 'CAA', value: '0 issue "letsencrypt.org"' }] }),
      prevDnsSnap: null,
    });

    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: 'DNS_CAA_MISSING:example.com' }),
      }),
    );
  });

  // ─── change detection: prev snapshot gereksinimi ─────────────────────────────

  it('önceki snapshot yoksa change finding\'leri üretilmez', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ records: [{ type: 'A', value: '1.1.1.1' }] }),
      prevDnsSnap: null,
    });

    for (const type of ['DNS_RECORD_CHANGE', 'DNS_NS_CHANGE', 'DNS_MX_CHANGE', 'DNS_TXT_CHANGE']) {
      expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ type }) }),
      );
    }
  });

  // ─── DNS_RECORD_CHANGE ───────────────────────────────────────────────────────

  it('A kaydı değiştiyse DNS_RECORD_CHANGE upsert edilir', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ records: [{ type: 'A', value: '2.2.2.2' }] }),
      prevDnsSnap: prevSnap([{ type: 'A', value: '1.1.1.1' }]),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'DNS_RECORD_CHANGE' }),
      }),
    );
  });

  // ─── DNS_NS_CHANGE ───────────────────────────────────────────────────────────

  it('NS değiştiyse DNS_NS_CHANGE HIGH upsert edilir (CRITICAL değil)', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ records: [{ type: 'NS', value: 'ns1.new.com' }] }),
      prevDnsSnap: prevSnap([{ type: 'NS', value: 'ns1.old.com' }]),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'DNS_NS_CHANGE', severity: 'HIGH' }),
      }),
    );
    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'DNS_NS_CHANGE', severity: 'CRITICAL' }),
      }),
    );
  });

  it('NS sorgusu hata verdiyse DNS_NS_CHANGE üretilmez (false positive koruması)', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({
        records: [],
        errors: { NS: 'ETIMEDOUT' },
      }),
      prevDnsSnap: prevSnap([{ type: 'NS', value: 'ns1.old.com' }]),
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ type: 'DNS_NS_CHANGE' }) }),
    );
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ key: 'DNS_NS_CHANGE:example.com' }) }),
    );
  });

  it('current NS boş ama önceki NS dolu ise DNS_NS_CHANGE üretilmez (propagation/resolver false positive koruması)', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ records: [] }), // NS sorgusu hata vermedi ama boş döndü
      prevDnsSnap: prevSnap([{ type: 'NS', value: 'ns1.old.com' }]),
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ type: 'DNS_NS_CHANGE' }) }),
    );
  });

  // ─── DNS_MX_CHANGE ───────────────────────────────────────────────────────────

  it('MX değiştiyse DNS_MX_CHANGE HIGH upsert edilir', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ records: [{ type: 'MX', value: 'mail.new.com' }] }),
      prevDnsSnap: prevSnap([{ type: 'MX', value: 'mail.old.com' }]),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'DNS_MX_CHANGE', severity: 'HIGH' }),
      }),
    );
  });

  // ─── DNS_TXT_CHANGE ──────────────────────────────────────────────────────────

  it('TXT değiştiyse DNS_TXT_CHANGE MEDIUM upsert edilir', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ records: [{ type: 'TXT', value: 'new-token' }] }),
      prevDnsSnap: prevSnap([{ type: 'TXT', value: 'old-token' }]),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'DNS_TXT_CHANGE', severity: 'MEDIUM' }),
      }),
    );
  });

  // ─── değişiklik yoksa change finding'leri üretilmez ─────────────────────────

  it('kayıtlarda değişiklik yoksa change finding\'leri upsert edilmez', async () => {
    const records: DnsRecord[] = [
      { type: 'A', value: '1.1.1.1' },
      { type: 'NS', value: 'ns1.example.com' },
    ];

    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ records }),
      prevDnsSnap: prevSnap(records),
    });

    for (const type of ['DNS_RECORD_CHANGE', 'DNS_NS_CHANGE', 'DNS_MX_CHANGE', 'DNS_TXT_CHANGE']) {
      expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ type }) }),
      );
    }
  });

  // ─── prev snapshot CHECK_CRASHED guard ───────────────────────────────────────

  it('önceki snapshot CHECK_CRASHED hatası içeriyorsa DNS_RECORD_CHANGE üretilmez', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ records: [{ type: 'A', value: '1.2.3.4' }] }),
      prevDnsSnap: { dataJson: { records: [], error: 'CHECK_CRASHED' } },
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ type: 'DNS_RECORD_CHANGE' }) }),
    );
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ key: 'DNS_RECORD_CHANGE:example.com' }) }),
    );
  });

  it('önceki snapshot CHECK_CRASHED hatası içeriyorsa DNS_NS_CHANGE üretilmez', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ records: [{ type: 'NS', value: 'ns1.new.com' }] }),
      prevDnsSnap: { dataJson: { records: [], error: 'CHECK_CRASHED' } },
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ type: 'DNS_NS_CHANGE' }) }),
    );
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ key: 'DNS_NS_CHANGE:example.com' }) }),
    );
  });

  it('önceki snapshot CHECK_CRASHED hatası içeriyorsa DNS_MX_CHANGE üretilmez', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ records: [{ type: 'MX', value: 'mail.new.com' }] }),
      prevDnsSnap: { dataJson: { records: [], error: 'CHECK_CRASHED' } },
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ type: 'DNS_MX_CHANGE' }) }),
    );
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ key: 'DNS_MX_CHANGE:example.com' }) }),
    );
  });

  it('önceki snapshot CHECK_CRASHED hatası içeriyorsa DNS_TXT_CHANGE üretilmez', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ records: [{ type: 'TXT', value: 'v=spf1 include:_spf.google.com ~all' }] }),
      prevDnsSnap: { dataJson: { records: [], error: 'CHECK_CRASHED' } },
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ type: 'DNS_TXT_CHANGE' }) }),
    );
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ key: 'DNS_TXT_CHANGE:example.com' }) }),
    );
  });

  // ─── MX/TXT empty guard ───────────────────────────────────────────────────────

  it('önceki MX dolu, güncel MX boş ise DNS_MX_CHANGE üretilmez (propagation/resolver false positive koruması)', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ records: [] }), // MX sorgusu hata vermedi ama boş döndü
      prevDnsSnap: prevSnap([{ type: 'MX', value: 'mail.old.com' }]),
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ type: 'DNS_MX_CHANGE' }) }),
    );
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ key: 'DNS_MX_CHANGE:example.com' }) }),
    );
  });

  it('önceki TXT dolu, güncel TXT boş ise DNS_TXT_CHANGE üretilmez (propagation/resolver false positive koruması)', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ records: [] }), // TXT sorgusu hata vermedi ama boş döndü
      prevDnsSnap: prevSnap([{ type: 'TXT', value: 'v=spf1 include:_spf.google.com ~all' }]),
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ type: 'DNS_TXT_CHANGE' }) }),
    );
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ key: 'DNS_TXT_CHANGE:example.com' }) }),
    );
  });

  it('gerçek MX değişimi (her iki taraf dolu) hâlâ DNS_MX_CHANGE üretir — empty guard devreye girmez', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ records: [{ type: 'MX', value: 'mail.new.com' }] }),
      prevDnsSnap: prevSnap([{ type: 'MX', value: 'mail.old.com' }]),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'DNS_MX_CHANGE', severity: 'HIGH' }),
      }),
    );
  });

  it('gerçek TXT değişimi (her iki taraf dolu) hâlâ DNS_TXT_CHANGE üretir — empty guard devreye girmez', async () => {
    await processDnsFindings(mockPrisma as any, {
      asset, scanRunId,
      dnsResult: makeDns({ records: [{ type: 'TXT', value: 'new-verification-token' }] }),
      prevDnsSnap: prevSnap([{ type: 'TXT', value: 'old-verification-token' }]),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'DNS_TXT_CHANGE', severity: 'MEDIUM' }),
      }),
    );
  });
});
