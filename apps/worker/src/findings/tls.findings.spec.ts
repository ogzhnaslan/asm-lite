import { processTlsFindings } from './tls.findings';
import type { TlsCheckResult } from '../checks/tls.check';

const mockPrisma = {
  finding: {
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

const asset = { id: 'asset-1', value: 'example.com' };
const scanRunId = 'run-1';

function tlsResult(overrides: Partial<TlsCheckResult> = {}): TlsCheckResult {
  return { ok: true, host: 'example.com', port: 443, ...overrides };
}

describe('processTlsFindings', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── CHECK_CRASHED guard (P0 bug fix) ────────────────────────────────────────

  it('CHECK_CRASHED → hiçbir DB çağrısı yapılmaz', async () => {
    await processTlsFindings(mockPrisma as any, {
      asset, scanRunId,
      tlsResult: tlsResult({ ok: false, error: 'CHECK_CRASHED' }),
      prevTlsSnap: null,
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  // ─── TLS_CHECK ───────────────────────────────────────────────────────────────

  it('gerçek TLS hatası (ECONNREFUSED) → TLS_CHECK upsert edilir', async () => {
    await processTlsFindings(mockPrisma as any, {
      asset, scanRunId,
      tlsResult: tlsResult({ ok: false, error: 'ECONNREFUSED' }),
      prevTlsSnap: null,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'TLS_CHECK' }),
      }),
    );
  });

  it('TLS bağlantısı başarılı → TLS_CHECK resolve edilir', async () => {
    await processTlsFindings(mockPrisma as any, {
      asset, scanRunId,
      tlsResult: tlsResult({ ok: true, daysLeft: 60 }),
      prevTlsSnap: null,
    });

    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: 'TLS_CHECK:example.com' }),
      }),
    );
  });

  // ─── TLS_EXPIRING eşikleri ────────────────────────────────────────────────────

  it('daysLeft 5 → TLS_EXPIRING CRITICAL', async () => {
    await processTlsFindings(mockPrisma as any, {
      asset, scanRunId,
      tlsResult: tlsResult({ daysLeft: 5, validTo: '2026-05-15T00:00:00.000Z' }),
      prevTlsSnap: null,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'TLS_EXPIRING', severity: 'CRITICAL' }),
      }),
    );
  });

  it('daysLeft 14 → TLS_EXPIRING HIGH', async () => {
    await processTlsFindings(mockPrisma as any, {
      asset, scanRunId,
      tlsResult: tlsResult({ daysLeft: 14, validTo: '2026-05-24T00:00:00.000Z' }),
      prevTlsSnap: null,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'TLS_EXPIRING', severity: 'HIGH' }),
      }),
    );
  });

  it('daysLeft 25 → TLS_EXPIRING MEDIUM', async () => {
    await processTlsFindings(mockPrisma as any, {
      asset, scanRunId,
      tlsResult: tlsResult({ daysLeft: 25, validTo: '2026-06-04T00:00:00.000Z' }),
      prevTlsSnap: null,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'TLS_EXPIRING', severity: 'MEDIUM' }),
      }),
    );
  });

  it('daysLeft 60 → TLS_EXPIRING resolve edilir', async () => {
    await processTlsFindings(mockPrisma as any, {
      asset, scanRunId,
      tlsResult: tlsResult({ daysLeft: 60, validTo: '2026-07-09T00:00:00.000Z' }),
      prevTlsSnap: null,
    });

    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: 'TLS_EXPIRING:example.com' }),
      }),
    );
  });

  // ─── TLS_CHANGE ──────────────────────────────────────────────────────────────

  it('önceki snapshot yoksa TLS_CHANGE üretilmez', async () => {
    await processTlsFindings(mockPrisma as any, {
      asset, scanRunId,
      tlsResult: tlsResult({ daysLeft: 60, fingerprint256: 'abc123' }),
      prevTlsSnap: null,
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'TLS_CHANGE' }),
      }),
    );
  });

  it('fingerprint değiştiyse TLS_CHANGE HIGH üretilir', async () => {
    await processTlsFindings(mockPrisma as any, {
      asset, scanRunId,
      tlsResult: tlsResult({ daysLeft: 60, fingerprint256: 'new-fp', serialNumber: 'new-serial' }),
      prevTlsSnap: { dataJson: { ok: true, fingerprint256: 'old-fp', serialNumber: 'old-serial' } },
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'TLS_CHANGE', severity: 'HIGH' }),
      }),
    );
  });

  // ─── Sprint 1B — opsiyonel raporlanabilirlik alanları ─────────────────────────

  it('TLS_EXPIRING dataJson içine protocol ve cipher opsiyonel olarak yansır', async () => {
    await processTlsFindings(mockPrisma as any, {
      asset, scanRunId,
      tlsResult: tlsResult({
        daysLeft: 10, validTo: '2026-06-01T00:00:00.000Z',
        protocol: 'TLSv1.3',
        cipher: { name: 'TLS_AES_256_GCM_SHA384', standardName: 'TLS_AES_256_GCM_SHA384', version: 'TLSv1.3', bits: 256 },
      }),
      prevTlsSnap: null,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'TLS_EXPIRING',
          dataJson: expect.objectContaining({
            protocol: 'TLSv1.3',
            cipher: expect.objectContaining({ name: 'TLS_AES_256_GCM_SHA384', bits: 256 }),
          }),
        }),
      }),
    );
  });

  it('TLS_EXPIRING dataJson içine authorized ve authorizationError opsiyonel olarak yansır', async () => {
    await processTlsFindings(mockPrisma as any, {
      asset, scanRunId,
      tlsResult: tlsResult({
        daysLeft: 5, validTo: '2026-05-27T00:00:00.000Z',
        authorized: false,
        authorizationError: 'SELF_SIGNED_CERT_IN_CHAIN',
      }),
      prevTlsSnap: null,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'TLS_EXPIRING',
          dataJson: expect.objectContaining({
            authorized: false,
            authorizationError: 'SELF_SIGNED_CERT_IN_CHAIN',
          }),
        }),
      }),
    );
  });

  it('opsiyonel alanlar yoksa (eski snapshot davranışı) TLS_EXPIRING crash etmez ve dataJson\'da bu alanlar yer almaz', async () => {
    await processTlsFindings(mockPrisma as any, {
      asset, scanRunId,
      tlsResult: tlsResult({ daysLeft: 14, validTo: '2026-06-05T00:00:00.000Z' }),
      prevTlsSnap: null,
    });

    // dataJson içinde mevcut alanlar tam, yeni opsiyonel alanlar yok
    const upsertCall = mockPrisma.finding.upsert.mock.calls[0]![0] as {
      create: { dataJson: Record<string, unknown> };
    };
    expect(upsertCall.create.dataJson).toHaveProperty('daysLeft', 14);
    expect(upsertCall.create.dataJson).not.toHaveProperty('protocol');
    expect(upsertCall.create.dataJson).not.toHaveProperty('cipher');
    expect(upsertCall.create.dataJson).not.toHaveProperty('authorized');
    expect(upsertCall.create.dataJson).not.toHaveProperty('authorizationError');
  });
});
