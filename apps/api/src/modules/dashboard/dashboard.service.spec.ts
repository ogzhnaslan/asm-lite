import { DashboardService } from './dashboard.service';
import { PrismaService } from '../../prisma/prisma.service';

// Sabit "şimdi": 2026-06-01T12:00:00Z → UTC gün ortası 2026-06-01.
const NOW = new Date('2026-06-01T12:00:00.000Z');

function d(iso: string, severity: string) {
  return { severity, createdAt: new Date(iso) };
}

describe('DashboardService.trends', () => {
  let service: DashboardService;
  let prismaFinding: { findMany: jest.Mock; count: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    prismaFinding = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    service = new DashboardService({ finding: prismaFinding } as unknown as PrismaService);
  });

  afterEach(() => jest.useRealTimers());

  it('window varsayılanı 30d → 30 günlük bucket', async () => {
    const res = await service.trends('user-1');
    expect(res.window).toBe('30d');
    expect(res.daily).toHaveLength(30);
    // son bucket bugün (UTC)
    expect(res.daily[res.daily.length - 1].date).toBe('2026-06-01');
    expect(res.daily[0].date).toBe('2026-05-03');
  });

  it('window=7d → 7 günlük bucket', async () => {
    const res = await service.trends('user-1', '7d');
    expect(res.window).toBe('7d');
    expect(res.daily).toHaveLength(7);
    expect(res.daily[0].date).toBe('2026-05-26');
    expect(res.daily[6].date).toBe('2026-06-01');
  });

  it('geçersiz window → 30d fallback', async () => {
    const res = await service.trends('user-1', 'garbage');
    expect(res.window).toBe('30d');
  });

  it('severity bucketlere ve totals\'a doğru dağıtılır', async () => {
    prismaFinding.findMany.mockResolvedValue([
      d('2026-06-01T08:00:00Z', 'CRITICAL'),
      d('2026-05-31T10:00:00Z', 'HIGH'),
      d('2026-05-26T00:00:00Z', 'MEDIUM'),
      d('2026-05-20T00:00:00Z', 'LOW'), // önceki dönem (start 05-26'dan önce)
    ]);
    const res = await service.trends('user-1', '7d');

    expect(res.totals).toEqual({ all: 3, critical: 1, high: 1, medium: 1, low: 0 });
    expect(res.insight.previousTotal).toBe(1);

    const today = res.daily.find(b => b.date === '2026-06-01')!;
    expect(today.critical).toBe(1);
    expect(today.total).toBe(1);
    const first = res.daily.find(b => b.date === '2026-05-26')!;
    expect(first.medium).toBe(1);
  });

  it('trend: current 3 vs previous 1 → up, changePct 200', async () => {
    prismaFinding.findMany.mockResolvedValue([
      d('2026-06-01T08:00:00Z', 'CRITICAL'),
      d('2026-05-31T10:00:00Z', 'HIGH'),
      d('2026-05-30T10:00:00Z', 'MEDIUM'),
      d('2026-05-20T00:00:00Z', 'LOW'), // previous
    ]);
    const res = await service.trends('user-1', '7d');
    expect(res.insight.trend).toBe('up');
    expect(res.insight.changePct).toBe(200);
    expect(res.insight.dominantSeverity).toBe('CRITICAL');
  });

  it('trend: önceki dönem boşken current>0 → up, changePct 100', async () => {
    prismaFinding.findMany.mockResolvedValue([d('2026-06-01T08:00:00Z', 'LOW')]);
    const res = await service.trends('user-1', '7d');
    expect(res.insight.changePct).toBe(100);
    expect(res.insight.trend).toBe('up');
    expect(res.insight.dominantSeverity).toBe('LOW');
  });

  it('busiestDate en yüksek toplam günü gösterir', async () => {
    prismaFinding.findMany.mockResolvedValue([
      d('2026-05-30T08:00:00Z', 'HIGH'),
      d('2026-05-30T09:00:00Z', 'MEDIUM'),
      d('2026-05-30T10:00:00Z', 'LOW'),
      d('2026-06-01T10:00:00Z', 'HIGH'),
    ]);
    const res = await service.trends('user-1', '7d');
    expect(res.insight.busiestDate).toBe('2026-05-30');
    expect(res.insight.busiestCount).toBe(3);
  });

  it('boş veri → text "yeni bulgu üretilmedi"', async () => {
    const res = await service.trends('user-1', '7d');
    expect(res.totals.all).toBe(0);
    expect(res.insight.trend).toBe('flat');
    expect(res.insight.text).toContain('yeni bulgu üretilmedi');
    expect(res.insight.dominantSeverity).toBeNull();
    expect(res.insight.busiestDate).toBeNull();
  });

  it('activeCritical/activeHigh count sorgusundan gelir ve insight\'a yansır', async () => {
    prismaFinding.count.mockImplementation((args: { where: { severity: string } }) =>
      Promise.resolve(args.where.severity === 'CRITICAL' ? 4 : 2),
    );
    const res = await service.trends('user-1', '7d');
    expect(res.insight.activeCritical).toBe(4);
    expect(res.insight.activeHigh).toBe(2);
    // resolvedAt=null + severity filtreleri kullanıldı
    expect(prismaFinding.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ resolvedAt: null, severity: 'CRITICAL' }) }),
    );
  });

  it('findMany önceki dönem dahil (prevStart) ve userId ile sorgulanır', async () => {
    await service.trends('user-1', '7d');
    const arg = prismaFinding.findMany.mock.calls[0][0];
    expect(arg.where.asset).toEqual({ userId: 'user-1' });
    // 7d pencere → prevStart = start - 7g = 2026-05-19
    expect((arg.where.createdAt.gte as Date).toISOString().slice(0, 10)).toBe('2026-05-19');
  });
});
