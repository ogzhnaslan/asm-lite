import { PrismaClient, FindingSeverity, Prisma } from '@prisma/client';

export interface UpsertFindingParams {
  assetId: string;
  scanRunId: string;
  key: string;
  type: string;
  severity: string;
  dataJson: Record<string, unknown>;
  aiScore: number;
  aiWhyJson: Record<string, unknown>;
}

export async function upsertFinding(prisma: PrismaClient, params: UpsertFindingParams): Promise<void> {
  const { assetId, scanRunId, key, type, severity, dataJson, aiScore, aiWhyJson } = params;
  const sev = severity as FindingSeverity;
  const data = dataJson as unknown as Prisma.InputJsonValue;
  const why = aiWhyJson as unknown as Prisma.InputJsonValue;

  await prisma.finding.upsert({
    where: { assetId_key: { assetId, key } },
    update: {
      scanRunId, type, severity: sev, dataJson: data, aiScore, aiWhyJson: why,
      isNew: false, lastSeenAt: new Date(), resolvedAt: null,
    },
    create: {
      assetId, scanRunId, key, type, severity: sev, dataJson: data, aiScore, aiWhyJson: why,
      isNew: true, lastSeenAt: new Date(),
    },
  });
}

export async function resolveFinding(
  prisma: PrismaClient,
  { assetId, key }: { assetId: string; key: string },
): Promise<void> {
  await prisma.finding.updateMany({
    where: { assetId, key, resolvedAt: null },
    data: { resolvedAt: new Date(), lastSeenAt: new Date() },
  });
}
