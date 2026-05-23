import { processPortFindings } from './port.findings';
import type { PortsCheckResult } from '../checks/ports.check';

const mockPrisma = {
  finding: {
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

const asset = { id: 'asset-1', value: 'example.com' };
const scanRunId = 'run-1';

function makePorts(openPorts: number[], error?: string): PortsCheckResult {
  return { checkedPorts: openPorts, results: [], openPorts, error };
}

function prevSnap(openPorts: number[]) {
  return { dataJson: { openPorts } };
}

describe('processPortFindings', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── error guard ─────────────────────────────────────────────────────────────

  it('portsResult.error varsa hiçbir DB çağrısı yapılmaz', async () => {
    await processPortFindings(mockPrisma as any, {
      asset, scanRunId,
      portsResult: makePorts([], 'CHECK_CRASHED'),
      prevPortsSnap: null,
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.finding.updateMany).not.toHaveBeenCalled();
  });

  // ─── PORT_EXPOSED severity ────────────────────────────────────────────────────

  it('kritik port 22 açık → PORT_EXPOSED CRITICAL', async () => {
    await processPortFindings(mockPrisma as any, {
      asset, scanRunId,
      portsResult: makePorts([22]),
      prevPortsSnap: null,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'PORT_EXPOSED', severity: 'CRITICAL' }),
      }),
    );
  });

  it('kritik port 3389 açık → PORT_EXPOSED CRITICAL', async () => {
    await processPortFindings(mockPrisma as any, {
      asset, scanRunId,
      portsResult: makePorts([3389]),
      prevPortsSnap: null,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'PORT_EXPOSED', severity: 'CRITICAL' }),
      }),
    );
  });

  it('riskli ama kritik olmayan port 8080 → PORT_EXPOSED HIGH', async () => {
    await processPortFindings(mockPrisma as any, {
      asset, scanRunId,
      portsResult: makePorts([8080]),
      prevPortsSnap: null,
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'PORT_EXPOSED', severity: 'HIGH' }),
      }),
    );
  });

  it('riskli port yok → PORT_EXPOSED resolve edilir', async () => {
    await processPortFindings(mockPrisma as any, {
      asset, scanRunId,
      portsResult: makePorts([80, 443]),
      prevPortsSnap: null,
    });

    expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: 'PORT_EXPOSED:example.com' }),
      }),
    );
    expect(mockPrisma.finding.upsert).not.toHaveBeenCalled();
  });

  // ─── PORT_CHANGE ──────────────────────────────────────────────────────────────

  it('önceki snapshot yoksa PORT_CHANGE üretilmez', async () => {
    await processPortFindings(mockPrisma as any, {
      asset, scanRunId,
      portsResult: makePorts([22]),
      prevPortsSnap: null,
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'PORT_CHANGE' }),
      }),
    );
  });

  it('yeni port açıldıysa PORT_CHANGE upsert edilir', async () => {
    await processPortFindings(mockPrisma as any, {
      asset, scanRunId,
      portsResult: makePorts([80, 443, 8080]),
      prevPortsSnap: prevSnap([80, 443]),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'PORT_CHANGE' }),
      }),
    );
  });

  it('port kapandıysa PORT_CHANGE upsert edilir', async () => {
    await processPortFindings(mockPrisma as any, {
      asset, scanRunId,
      portsResult: makePorts([80, 443]),
      prevPortsSnap: prevSnap([80, 443, 8080]),
    });

    expect(mockPrisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'PORT_CHANGE' }),
      }),
    );
  });

  it('portlarda değişiklik yoksa PORT_CHANGE upsert edilmez', async () => {
    await processPortFindings(mockPrisma as any, {
      asset, scanRunId,
      portsResult: makePorts([80, 443]),
      prevPortsSnap: prevSnap([80, 443]),
    });

    expect(mockPrisma.finding.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ type: 'PORT_CHANGE' }),
      }),
    );
  });
});
